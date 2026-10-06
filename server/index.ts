import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import type { Contexto } from '../shared/asistente.ts';
import { armarEstado } from '../shared/plan.ts';
import type { Ajuste, EstadoPlanta, ProyectoCrudo } from '../shared/tipos.ts';
import { MODELO, SIN_CREDENCIALES, conversar, hayCredenciales, mensajeDeError } from './asistente.ts';
import { cargarAjustes, guardarAjustes } from './ajustes.ts';
import { cargarCentros, cargarFeriados, cargarMaquinas, cargarReglasLectura, hoyCR, rutaRaiz } from './config.ts';
import { leerExportacion } from './fuentes/exportacion.ts';
import { generarSeed } from './fuentes/seed.ts';
import { leerZoho } from './fuentes/zoho.ts';

const FUENTES = ['seed', 'zoho', 'excel'] as const;
const FUENTE = (process.env.DATA_SOURCE ?? 'seed') as EstadoPlanta['fuente'];
if (!FUENTES.includes(FUENTE)) throw new Error(`DATA_SOURCE=${FUENTE} no existe: usa ${FUENTES.join(', ')}`);
// DATA_SOURCE=excel: el .xlsx más reciente de esta carpeta (o este archivo).
const EXPORTACION = process.env.EXPORT_PATH ?? rutaRaiz + 'data/exportaciones';
const TTL = Number(process.env.ZOHO_REFRESH_SECONDS ?? 300) * 1000;
const app = express();

const REINTENTO_MS = 60_000; // tras un fallo, no volver a leer Zoho antes de esto

interface Lectura { proyectos: ProyectoCrudo[]; avisos: string[]; datos_de?: string; hoy: string; feriados: Set<string> }
let lectura: { datos: Lectura; t: number } | null = null;   // último dato crudo leído de la fuente
let cache: EstadoPlanta | null = null;                      // plan armado con los ajustes vigentes
let ajustes: Ajuste[] = cargarAjustes();
let ultimoError: { mensaje: string; t: number } | null = null;
let enCurso: Promise<void> | null = null;

async function leerFuente(hoy: string, feriados: Set<string>): Promise<{ proyectos: ProyectoCrudo[]; avisos: string[]; datos_de?: string }> {
  if (FUENTE === 'zoho') return leerZoho();
  if (FUENTE === 'excel') return leerExportacion(EXPORTACION, cargarReglasLectura(), cargarCentros());
  return { proyectos: generarSeed(hoy, feriados), avisos: ['Datos simulados (DATA_SOURCE=seed)'] };
}

/** Plan con unos ajustes dados, sobre la última lectura (sin volver a leer la fuente). */
function armar(con: Ajuste[]): EstadoPlanta {
  if (!lectura) throw new Error('Sin datos todavía');
  const d = lectura.datos;
  return armarEstado({
    proyectos: d.proyectos, maquinas: cargarMaquinas(), centros: cargarCentros(), reglas: cargarReglasLectura(),
    fuente: FUENTE, hoy: d.hoy, feriados: d.feriados, avisos: d.avisos, datos_de: d.datos_de, ajustes: con,
  });
}

async function refrescar() {
  const feriados = cargarFeriados(), hoy = hoyCR();
  try {
    const leido = await leerFuente(hoy, feriados);
    lectura = { datos: { ...leido, hoy, feriados }, t: Date.now() };
    cache = armar(ajustes);
    ultimoError = null;
  } catch (e) {
    ultimoError = { mensaje: (e as Error).message, t: Date.now() };
    console.error('[estado]', ultimoError.mensaje);
  }
}

async function asegurarLectura() {
  const ttl = FUENTE === 'zoho' ? TTL : 30_000;   // simulados y exportación: releer es barato
  const vencido = !lectura || Date.now() - lectura.t >= ttl;
  const enEspera = ultimoError && Date.now() - ultimoError.t < REINTENTO_MS;
  // Una sola lectura a la vez: las peticiones concurrentes esperan la misma promesa.
  if (vencido && !enEspera) await (enCurso ??= refrescar().finally(() => { enCurso = null; }));
  if (!cache) throw new Error(ultimoError?.mensaje ?? 'Sin datos todavía');
}

async function estado(): Promise<EstadoPlanta> {
  await asegurarLectura();
  if (!ultimoError) return cache!;
  return { ...cache!, avisos: [...cache!.avisos,
    `Último intento de leer ${FUENTE === 'excel' ? 'la exportación' : 'Zoho'} falló: ${ultimoError.mensaje}. Mostrando datos de ${cache!.actualizado}`] };
}

/** Guarda los ajustes y rearma el plan al momento: los cambios se ven sin esperar a la próxima lectura. */
async function cambiarAjustes(nuevos: Ajuste[]) {
  guardarAjustes(nuevos);
  ajustes = nuevos;
  cache = armar(ajustes);
}

app.use(express.json({ limit: '32kb' }));

app.get('/api/estado', async (_req, res) => {
  try { res.json(await estado()); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});
app.get('/api/layout', (_req, res) => {
  res.type('json').send(readFileSync(rutaRaiz + 'data/layout/planta_pts.json', 'utf8'));
});
app.get('/api/salud', (_req, res) => res.json({
  fuente: FUENTE, ultimoError: ultimoError?.mensaje ?? null, cacheado: cache?.actualizado ?? null,
  asistente: hayCredenciales(), modelo: MODELO, ajustes: ajustes.length,
}));

app.get('/api/ajustes', (_req, res) => res.json(ajustes));
app.delete('/api/ajustes/:id', async (req, res) => {
  try {
    await asegurarLectura();
    if (!ajustes.some(a => a.id === req.params.id)) { res.status(404).json({ error: 'Ese ajuste ya no existe' }); return; }
    await cambiarAjustes(ajustes.filter(a => a.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// Asistente: responde con eventos en NDJSON (una línea JSON por evento) mientras Claude trabaja.
let cliente: Anthropic | null = null;
app.post('/api/asistente', async (req, res) => {
  const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim().slice(0, 4000) : '';
  if (!mensaje) { res.status(400).json({ error: 'Escribe un mensaje' }); return; }
  if (!hayCredenciales()) { res.status(503).json({ error: SIN_CREDENCIALES }); return; }
  try { await asegurarLectura(); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); return; }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  const corte = new AbortController();
  res.on('close', () => { if (!res.writableEnded) corte.abort(); });
  const emitir = (e: object) => { if (!res.writableEnded) res.write(JSON.stringify(e) + '\n'); };
  try {
    cliente ??= new Anthropic();
    await conversar({
      cliente, mensaje, conversacion: typeof req.body.conversacion === 'string' ? req.body.conversacion : undefined,
      contexto: (): Contexto => ({ estado: cache!, ajustes, replanificar: armar }),
      guardar: cambiarAjustes, emitir, signal: corte.signal,
    });
  } catch (e) {
    console.error('[asistente]', e);
    emitir({ tipo: 'error', mensaje: mensajeDeError(e) });
  }
  res.end();
});

if (process.argv.includes('--prod') && existsSync(rutaRaiz + 'dist')) {
  app.use(express.static(rutaRaiz + 'dist'));
}
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API en http://localhost:${port} · fuente=${FUENTE} · asistente ${hayCredenciales() ? `con ${MODELO}` : 'sin clave de Claude'}`));
