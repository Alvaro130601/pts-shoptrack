import type { EstadoOp, Operacion } from '../../shared/tipos';
import { nombreCorto } from '../../shared/ruta';

/** "2026-10-14" → "14 oct" */
export const fecha = (s?: string) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) : '—';

/** Reemplaza las fechas ISO de los mensajes del semáforo por fechas cortas ("2026-09-25" → "25 sept"). */
export const legible = (texto?: string) => texto?.replace(/\d{4}-\d{2}-\d{2}/g, f => fecha(f)) ?? '';

export const tallerNombre = (t: string | null) => t?.replace('taller-', 'Taller #') ?? 'Fuera de talleres';

export const ESTADO_OP: Record<EstadoOp, string> = {
  hecha: 'Hecha', en_proceso: 'En proceso', en_cola: 'En cola', en_camino: 'En camino', bloqueada: 'Bloqueada', pendiente: 'Pendiente',
};

/** Estado con lo que espera: "Bloqueada: falta material", "En camino desde Torno CNC". */
export function estadoLargo(o: Operacion): string {
  if (o.estado === 'bloqueada') return `Bloqueada: falta ${o.espera === 'Programación' ? 'programa' : (o.espera ?? '').toLowerCase()}`;
  if (o.estado === 'en_camino') return o.espera === 'Ítems sin terminar' ? 'Esperando los ítems' : `En camino desde ${o.espera}`;
  if (o.estado === 'pendiente' && o.tipo === 'material') return 'Material por llegar';
  if (o.estado === 'en_proceso' && o.tipo === 'externo') return 'En el proveedor';
  return ESTADO_OP[o.estado];
}

/** Nombre corto de un paso de la ruta: el proceso para máquina, "Programación", "Anodizado", "Material"… */
export function etiquetaPaso(o: Operacion): string {
  if (o.tipo === 'maquina') return o.proceso;
  if (o.tipo === 'programacion') return 'Programación';
  if (o.tipo === 'material') return 'Material';
  if (o.tipo === 'planos') return 'Planos';
  return nombreCorto(o.nombre);
}

/** "Ítem 23 · 3 u" */
export const itemCorto = (o: { item: string; cantidad: number | null }) =>
  o.cantidad ? `${o.item} · ${o.cantidad} u` : o.item;
