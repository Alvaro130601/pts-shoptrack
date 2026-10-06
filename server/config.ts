import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CentroConfig, MaquinaConfig, ReglasLectura } from '../shared/tipos.ts';
import type { MapeoZoho } from '../shared/zoho.ts';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const leer = (p: string) => JSON.parse(readFileSync(raiz + p, 'utf8'));

export const cargarMaquinas = (): MaquinaConfig[] => leer('config/maquinas.json').maquinas;
export const cargarCentros = (): CentroConfig[] => leer('config/centros.json').centros;
export const cargarFeriados = (): Set<string> => new Set(leer('config/feriados.json').fechas);
export const cargarMapeoZoho = (): MapeoZoho & { lectura: ReglasLectura } => leer('config/zoho-mapeo.json');
export const cargarReglasLectura = (): ReglasLectura => cargarMapeoZoho().lectura;
export const rutaRaiz = raiz;

export function hoyCR(): string {
  // Fecha local de Costa Rica (UTC−6, sin horario de verano)
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}
