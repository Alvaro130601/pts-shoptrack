// Reglas de negocio de PTS (ver CLAUDE.md). Puras: sin red ni I/O, para poder testearlas.
// El modelo de ruta está en shared/ruta.ts y el plan (capacidad, máquina sugerida, semáforo) en shared/plan.ts.
import type { Semaforo } from './tipos.ts';

// ---------- días hábiles ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => {
  if (!esFechaISO(s)) throw new RangeError(`Fecha inválida: "${s}" (se espera yyyy-mm-dd)`);
  return new Date(s + 'T12:00:00Z');
};

/** true si s es una fecha real en formato yyyy-mm-dd */
export function esFechaISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && iso(d) === s;
}

export function esHabil(d: Date, feriados: Set<string>) {
  const w = d.getUTCDay();
  return w !== 0 && w !== 6 && !feriados.has(iso(d));
}
export function sumarHabiles(desde: string, n: number, feriados: Set<string>): string {
  const d = parse(desde);
  const paso = n >= 0 ? 1 : -1;
  let k = Math.abs(n);
  while (k > 0) {
    d.setUTCDate(d.getUTCDate() + paso);
    if (esHabil(d, feriados)) k--;
  }
  return iso(d);
}
/** días hábiles de a → b (negativo si b < a) */
export function habilesEntre(a: string, b: string, feriados: Set<string>): number {
  const d = parse(a), fin = parse(b).getTime();
  const signo = fin > d.getTime() ? 1 : -1;
  let n = 0;
  while (d.getTime() !== fin) {
    d.setUTCDate(d.getUTCDate() + signo);
    if (esHabil(d, feriados)) n += signo;
  }
  return n;
}
/** La misma fecha si es hábil; si no, el siguiente día hábil (p. ej. un sábado → lunes). */
export function primerHabil(fecha: string, feriados: Set<string>): string {
  return esHabil(parse(fecha), feriados) ? fecha : sumarHabiles(fecha, 1, feriados);
}

// ---------- SLA y buffer antes de la entrega ----------
/** SLA en días hábiles (CLAUDE.md). Se usan como duración estimada de los pasos sin horas. */
export const SLA = { programacion: 1, planos: 5, material: 3, calidad: 1, envio: 1, ensamble: 1, servicio_externo: 3 } as const;

/** Servicio externo + Ensamble → 6 · solo Servicio externo → 5 · flujo estándar → 2 (días hábiles) */
export function bufferDias(so: { requiere_servicio_externo: boolean; requiere_ensamble: boolean }) {
  if (so.requiere_servicio_externo && so.requiere_ensamble) return 6;
  if (so.requiere_servicio_externo) return 5;
  return 2;
}

/** Días hábiles que quedan entre el fin de las rutas de los ítems y la entrega (calidad, envío y ensamble).
 *  Es el buffer sin el servicio externo, porque ahora el servicio externo es un paso dentro de la ruta.
 *  Con el servicio externo al final de la ruta, la producción vuelve a quedar 2/5/6 días antes de la entrega. */
export function diasDeCierre(so: { requiere_servicio_externo: boolean; requiere_ensamble: boolean }) {
  return bufferDias(so) - (so.requiere_servicio_externo ? SLA.servicio_externo : 0);
}

// ---------- semáforo ----------
export const RANGO: Record<Semaforo, number> = { verde: 0, amarillo: 1, rojo: 2 };
export const peorSemaforo = (a: Semaforo | undefined, b: Semaforo | undefined): Semaforo | undefined =>
  !a ? b : !b ? a : RANGO[b] > RANGO[a] ? b : a;

/** Rojo si el límite ya pasó o el fin proyectado cae después del límite; amarillo si la holgura ≤ 1 día hábil. */
export function evaluarSemaforo(fin: string, limite: string, hoy: string, feriados: Set<string>):
  { semaforo: Semaforo; holgura: number; motivo: string } {
  const holgura = habilesEntre(fin, limite, feriados);
  if (limite < hoy) return { semaforo: 'rojo', holgura, motivo: `Límite ${limite} ya pasó` };
  if (holgura < 0) return { semaforo: 'rojo', holgura, motivo: `Con el plan actual termina ${-holgura} día(s) hábil(es) tarde` };
  if (holgura <= 1) return { semaforo: 'amarillo', holgura, motivo: `Holgura de ${holgura} día(s) hábil(es)` };
  return { semaforo: 'verde', holgura, motivo: `Holgura de ${holgura} días hábiles` };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
