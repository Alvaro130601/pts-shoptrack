// Filtros de la planta: qué máquinas se resaltan (las demás se atenúan). Dentro de una sección basta con cumplir una
// de las opciones marcadas; entre secciones hay que cumplirlas todas. Sin opciones marcadas, la sección no filtra.
import type { EstadoMaquina, Semaforo } from '../../shared/tipos';

export type EstadoMaq = 'trabajando' | 'sin_trabajo' | 'fuera';
export interface Filtros { semaforos: Semaforo[]; estados: EstadoMaq[]; procesos: string[] }
export type Seccion = keyof Filtros;

export const SIN_FILTROS: Filtros = { semaforos: [], estados: [], procesos: [] };
export const activos = (f: Filtros) => f.semaforos.length + f.estados.length + f.procesos.length;

/** Prioridad = semáforo de las órdenes que la máquina tiene en proceso, en cola o por llegar. */
export const SEMAFOROS: { id: Semaforo; nombre: string }[] = [
  { id: 'rojo', nombre: 'Atrasadas' }, { id: 'amarillo', nombre: 'En riesgo' }, { id: 'verde', nombre: 'A tiempo' },
];
export const ESTADOS: { id: EstadoMaq; nombre: string }[] = [
  { id: 'trabajando', nombre: 'Trabajando' }, { id: 'sin_trabajo', nombre: 'Sin trabajo' }, { id: 'fuera', nombre: 'Fuera de servicio' },
];

const plan = (m: EstadoMaquina) => [...m.en_proceso, ...m.cola, ...m.proximas];

export function tieneEstado(m: EstadoMaquina, e: EstadoMaq): boolean {
  if (e === 'fuera') return !!m.fuera_de_servicio;
  if (e === 'trabajando') return m.en_proceso.length > 0;
  return !m.fuera_de_servicio && plan(m).length === 0;
}

export function cumple(m: EstadoMaquina, f: Filtros): boolean {
  if (f.procesos.length && !f.procesos.includes(m.centro_id ?? '')) return false;
  if (f.estados.length && !f.estados.some(e => tieneEstado(m, e))) return false;
  if (f.semaforos.length) {
    const ops = plan(m);
    if (!f.semaforos.some(s => ops.some(o => o.semaforo === s))) return false;
  }
  return true;
}

/** Marca o desmarca una opción de una sección. */
export function alternar(f: Filtros, seccion: Seccion, id: string): Filtros {
  const xs = f[seccion] as string[];
  return { ...f, [seccion]: xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id] };
}
