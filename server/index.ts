import 'dotenv/config';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { armarEstado } from '../shared/plan.ts';
import type { EstadoPlanta } from '../shared/tipos.ts';
import { cargarCentros, cargarFeriados, cargarMaquinas, cargarReglasLectura, hoyCR, rutaRaiz } from './config.ts';
import { generarSeed } from './fuentes/seed.ts';
import { leerZoho } from './fuentes/zoho.ts';

const FUENTE = (process.env.DATA_SOURCE ?? 'seed') as 'seed' | 'zoho';
const TTL = Number(process.env.ZOHO_REFRESH_SECONDS ?? 300) * 1000;
const app = express();

const REINTENTO_MS = 60_000; // tras un fallo, no volver a leer Zoho antes de esto

let cache: { estado: EstadoPlanta; t: number } | null = null;
let ultimoError: { mensaje: string; t: number } | null = null;
let enCurso: Promise<void> | null = null;

async function refrescar() {
  const feriados = cargarFeriados(), hoy = hoyCR();
  try {
    const { proyectos, avisos } = FUENTE === 'zoho'
      ? await leerZoho()
      : { proyectos: generarSeed(hoy, feriados), avisos: ['Datos simulados (DATA_SOURCE=seed)'] };
    const estado = armarEstado({
      proyectos, maquinas: cargarMaquinas(), centros: cargarCentros(), reglas: cargarReglasLectura(),
      fuente: FUENTE, hoy, feriados, avisos,
    });
    cache = { estado, t: Date.now() };
    ultimoError = null;
  } catch (e) {
    ultimoError = { mensaje: (e as Error).message, t: Date.now() };
    console.error('[estado]', ultimoError.mensaje);
  }
}

async function estado(): Promise<EstadoPlanta> {
  const ttl = FUENTE === 'seed' ? 30_000 : TTL;
  const vencido = !cache || Date.now() - cache.t >= ttl;
  const enEspera = ultimoError && Date.now() - ultimoError.t < REINTENTO_MS;
  // Una sola lectura a la vez: las peticiones concurrentes esperan la misma promesa.
  if (vencido && !enEspera) await (enCurso ??= refrescar().finally(() => { enCurso = null; }));
  if (!cache) throw new Error(ultimoError?.mensaje ?? 'Sin datos todavía');
  if (!ultimoError) return cache.estado;
  return { ...cache.estado, avisos: [...cache.estado.avisos,
    `Último intento de leer Zoho falló: ${ultimoError.mensaje}. Mostrando datos de ${cache.estado.actualizado}`] };
}

app.get('/api/estado', async (_req, res) => {
  try { res.json(await estado()); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});
app.get('/api/layout', (_req, res) => {
  res.type('json').send(readFileSync(rutaRaiz + 'data/layout/planta_pts.json', 'utf8'));
});
app.get('/api/salud', (_req, res) => res.json({ fuente: FUENTE, ultimoError: ultimoError?.mensaje ?? null, cacheado: cache?.estado.actualizado ?? null }));

if (process.argv.includes('--prod') && existsSync(rutaRaiz + 'dist')) {
  app.use(express.static(rutaRaiz + 'dist'));
}
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API en http://localhost:${port} · fuente=${FUENTE}`));
