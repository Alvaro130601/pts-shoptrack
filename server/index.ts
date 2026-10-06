import 'dotenv/config';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { armarEstado } from '../shared/reglas.ts';
import type { EstadoPlanta } from '../shared/tipos.ts';
import { cargarFeriados, cargarMaquinas, hoyCR, rutaRaiz } from './config.ts';
import { generarSeed } from './fuentes/seed.ts';
import { leerZoho } from './fuentes/zoho.ts';

const FUENTE = (process.env.DATA_SOURCE ?? 'seed') as 'seed' | 'zoho';
const TTL = Number(process.env.ZOHO_REFRESH_SECONDS ?? 300) * 1000;
const app = express();

let cache: { estado: EstadoPlanta; t: number } | null = null;
let ultimoError: string | null = null;

async function estado(): Promise<EstadoPlanta> {
  if (cache && Date.now() - cache.t < (FUENTE === 'seed' ? 30_000 : TTL)) return cache.estado;
  const maquinas = cargarMaquinas(), feriados = cargarFeriados(), hoy = hoyCR();
  try {
    const { ops, avisos } = FUENTE === 'zoho'
      ? await leerZoho(maquinas)
      : { ops: generarSeed(maquinas, hoy, feriados), avisos: ['Datos simulados (DATA_SOURCE=seed)'] };
    cache = { estado: armarEstado(maquinas, ops, FUENTE, hoy, feriados, avisos), t: Date.now() };
    ultimoError = null;
  } catch (e) {
    ultimoError = (e as Error).message;
    console.error('[estado]', ultimoError);
    if (!cache) throw e; // sin datos previos no hay qué mostrar
    cache.estado.avisos = [`Último intento de leer Zoho falló: ${ultimoError}. Mostrando datos de ${cache.estado.actualizado}`];
  }
  return cache.estado;
}

app.get('/api/estado', async (_req, res) => {
  try { res.json(await estado()); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});
app.get('/api/layout', (_req, res) => {
  res.type('json').send(readFileSync(rutaRaiz + 'data/layout/planta_pts.json', 'utf8'));
});
app.get('/api/salud', (_req, res) => res.json({ fuente: FUENTE, ultimoError, cacheado: cache?.estado.actualizado ?? null }));

if (process.argv.includes('--prod') && existsSync(rutaRaiz + 'dist')) {
  app.use(express.static(rutaRaiz + 'dist'));
}
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API en http://localhost:${port} · fuente=${FUENTE}`));
