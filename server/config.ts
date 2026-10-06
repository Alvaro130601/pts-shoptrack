import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MaquinaConfig } from '../shared/tipos.ts';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const leer = (p: string) => JSON.parse(readFileSync(raiz + p, 'utf8'));

export const cargarMaquinas = (): MaquinaConfig[] => leer('config/maquinas.json').maquinas;
export const cargarFeriados = (): Set<string> => new Set(leer('config/feriados.json').fechas);
export const cargarMapeoZoho = () => leer('config/zoho-mapeo.json');
export const rutaRaiz = raiz;

export function hoyCR(): string {
  // Fecha local de Costa Rica (UTC−6, sin horario de verano)
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}
