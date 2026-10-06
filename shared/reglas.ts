// Reglas de negocio de PTS (ver CLAUDE.md). Puras: sin red ni I/O, para poder testearlas.
import type { EstadoMaquina, EstadoPlanta, MaquinaConfig, Operacion, Semaforo } from './tipos.ts';

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

// ---------- buffer antes de la entrega ----------
/** Servicio externo + Ensamble → 6 · solo Servicio externo → 5 · flujo estándar → 2 (días hábiles) */
export function bufferDias(op: Pick<Operacion, 'requiere_servicio_externo' | 'requiere_ensamble'>) {
  if (op.requiere_servicio_externo && op.requiere_ensamble) return 6;
  if (op.requiere_servicio_externo) return 5;
  return 2;
}

// ---------- cola y semáforo por máquina ----------
const RANGO: Record<Semaforo, number> = { verde: 0, amarillo: 1, rojo: 2 };

export function ordenarCola(ops: Operacion[]) {
  return [...ops].sort((a, b) =>
    (a.fecha_limite_produccion ?? '').localeCompare(b.fecha_limite_produccion ?? '') ||
    a.fecha_entrega.localeCompare(b.fecha_entrega) ||
    a.so.localeCompare(b.so));
}

export function calcularMaquina(cfg: MaquinaConfig, entrada: Operacion[], hoy: string, feriados: Set<string>): EstadoMaquina {
  // Copias: no se modifican las operaciones recibidas.
  const ops = entrada.map(o => ({ ...o }));
  for (const op of ops) op.fecha_limite_produccion = sumarHabiles(op.fecha_entrega, -bufferDias(op), feriados);
  const enProceso = ordenarCola(ops.filter(o => o.estado_cola === 'en_proceso'));
  const cola = ordenarCola(ops.filter(o => o.estado_cola === 'en_cola'));
  const porLiberar = ordenarCola(ops.filter(o => o.estado_cola === 'por_liberar'));

  // Proyección: la máquina trabaja la secuencia en_proceso → cola a capacidad_horas_dia.
  const cap = Math.max(cfg.capacidad_horas_dia, 0.1);
  let acumulado = 0;
  [...enProceso, ...cola].forEach((op, i) => {
    acumulado += op.horas_pendientes;
    const dias = Math.ceil(acumulado / cap);
    op.posicion = op.estado_cola === 'en_proceso' ? 0 : i - enProceso.length + 1;
    op.fin_proyectado = sumarHabiles(hoy, Math.max(dias - 1, 0), feriados);
    evaluar(op, hoy, feriados);
  });
  // Por liberar: solo se evalúa contra el límite (aún no consume máquina).
  for (const op of porLiberar) {
    op.fin_proyectado = undefined;
    const margen = habilesEntre(hoy, op.fecha_limite_produccion!, feriados);
    op.holgura_dias = margen;
    if (margen < 0) { op.semaforo = 'rojo'; op.motivo = 'Límite de producción vencido y aún no se libera'; }
    else if (margen <= 2) { op.semaforo = 'amarillo'; op.motivo = `Faltan ${margen} días hábiles al límite y sigue en ${op.fase}`; }
    else { op.semaforo = 'verde'; op.motivo = 'En tiempo'; }
  }

  const activas = [...enProceso, ...cola];
  const horas = activas.reduce((s, o) => s + o.horas_pendientes, 0);
  const peor = activas.reduce<Semaforo | 'libre'>((p, o) =>
    p === 'libre' || RANGO[o.semaforo!] > RANGO[p as Semaforo] ? o.semaforo! : p, 'libre');
  return { ...cfg, en_proceso: enProceso, cola, por_liberar: porLiberar,
    horas_cola: round1(horas), dias_carga: round1(horas / cap), semaforo: peor };
}

function evaluar(op: Operacion, hoy: string, feriados: Set<string>) {
  const lim = op.fecha_limite_produccion!;
  op.holgura_dias = habilesEntre(op.fin_proyectado!, lim, feriados);
  if (lim < hoy) { op.semaforo = 'rojo'; op.motivo = `Límite de producción ${lim} ya pasó`; }
  else if (op.holgura_dias < 0) { op.semaforo = 'rojo'; op.motivo = `Con la cola actual termina ${-op.holgura_dias} días hábiles tarde`; }
  else if (op.holgura_dias <= 1) { op.semaforo = 'amarillo'; op.motivo = `Holgura de ${op.holgura_dias} día(s) hábil(es)`; }
  else { op.semaforo = 'verde'; op.motivo = `Holgura de ${op.holgura_dias} días hábiles`; }
}
const round1 = (n: number) => Math.round(n * 10) / 10;

export function armarEstado(
  maquinas: MaquinaConfig[], ops: Operacion[], fuente: EstadoPlanta['fuente'],
  hoy: string, feriados: Set<string>, avisos: string[] = []): EstadoPlanta {
  const activas = maquinas.filter(m => m.activa);
  const ids = new Set(activas.map(m => m.id));
  // Una fecha de entrega inválida no debe tumbar todo el tablero: esa operación se aparta con aviso.
  const sinFecha = ops.filter(o => !esFechaISO(o.fecha_entrega));
  const validas = ops.filter(o => esFechaISO(o.fecha_entrega));
  const estados = activas.map(m => calcularMaquina(m, validas.filter(o => o.maquina_id === m.id), hoy, feriados));
  const sinMaquina = validas.filter(o => !o.maquina_id || !ids.has(o.maquina_id));
  const todas = estados.flatMap(m => [...m.en_proceso, ...m.cola, ...m.por_liberar]);
  const avisosFinal = [...avisos];
  if (sinMaquina.length) avisosFinal.push(`${sinMaquina.length} operaciones abiertas sin máquina reconocida (revisar config/maquinas.json → zoho_nombre)`);
  if (sinFecha.length) avisosFinal.push(`${sinFecha.length} operaciones sin fecha de entrega válida, no se incluyen: ${[...new Set(sinFecha.map(o => o.so))].slice(0, 5).join(', ')}${sinFecha.length > 5 ? '…' : ''}`);
  return {
    actualizado: new Date().toISOString(), fuente, hoy,
    maquinas: estados, sin_maquina: [...sinMaquina, ...sinFecha],
    kpis: {
      so_abiertos: new Set(todas.map(o => o.so)).size,
      en_proceso: todas.filter(o => o.estado_cola === 'en_proceso').length,
      en_cola: todas.filter(o => o.estado_cola === 'en_cola').length,
      por_liberar: todas.filter(o => o.estado_cola === 'por_liberar').length,
      atrasadas: todas.filter(o => o.semaforo === 'rojo').length,
      en_riesgo: todas.filter(o => o.semaforo === 'amarillo').length,
      horas_cola: round1(estados.reduce((s, m) => s + m.horas_cola, 0)),
    },
    avisos: avisosFinal,
  };
}
