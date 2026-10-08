// Ajustes del supervisor guardados en data/ajustes.json (no se sube al repositorio: nombra SO reales).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Ajuste } from '../shared/tipos.ts';
import { rutaRaiz } from './config.ts';

const ARCHIVO = process.env.AJUSTES_PATH ?? rutaRaiz + 'data/ajustes.json';

export function cargarAjustes(): Ajuste[] {
  if (!existsSync(ARCHIVO)) return [];
  try {
    const j = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
    return Array.isArray(j.ajustes) ? j.ajustes : [];
  } catch (e) {
    console.error(`[ajustes] no se pudo leer ${ARCHIVO}: ${(e as Error).message}`);
    return [];
  }
}

/** Escribe a un temporal y lo renombra: un corte a medio guardar no deja el archivo roto. */
export function guardarAjustes(ajustes: Ajuste[]) {
  const tmp = ARCHIVO + '.tmp';
  writeFileSync(tmp, JSON.stringify({ actualizado: new Date().toISOString(), ajustes }, null, 1) + '\n');
  renameSync(tmp, ARCHIVO);
}
