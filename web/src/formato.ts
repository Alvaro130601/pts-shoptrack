/** "2026-10-14" → "14 oct" */
export const fecha = (s?: string) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) : '—';

/** Reemplaza las fechas ISO de los mensajes del semáforo por fechas cortas ("2026-09-25" → "25 sept"). */
export const legible = (texto?: string) => texto?.replace(/\d{4}-\d{2}-\d{2}/g, f => fecha(f)) ?? '';

export const tallerNombre = (t: string | null) => t?.replace('taller-', 'Taller #') ?? 'Fuera de talleres';

export const ESTADO_COLA = { en_proceso: 'En proceso', en_cola: 'En cola', por_liberar: 'Por liberar' } as const;
