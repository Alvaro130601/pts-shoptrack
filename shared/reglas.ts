// Reglas de negocio de PTS (ver CLAUDE.md). Puras: sin red ni I/O, para poder testearlas.
import type { EstadoMaquina, EstadoPlanta, MaquinaConfig, Operacion, Semaforo } from './tipos.ts';

// ---------- días hábiles ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + 'T12:00:00Z');

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
  if (a === b) return 0;
  const signo = b > a ? 1 : -1;
  const d = parse(a);
  let n = 0;
  while (iso(d) !== b) {
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

export function calcularMaquina(cfg: MaquinaConfig, ops: Operacion[], hoy: string, feriados: Set<string>): EstadoMaquina {
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
  const estados = activas.map(m => calcularMaquina(m, ops.filter(o => o.maquina_id === m.id), hoy, feriados));
  const sinMaquina = ops.filter(o => !o.maquina_id || !ids.has(o.maquina_id));
  const todas = estados.flatMap(m => [...m.en_proceso, ...m.cola, ...m.por_liberar]);
  return {
    actualizado: new Date().toISOString(), fuente, hoy,
    maquinas: estados, sin_maquina: sinMaquina,
    kpis: {
      so_abiertos: new Set(ops.map(o => o.so)).size,
      en_proceso: todas.filter(o => o.estado_cola === 'en_proceso').length,
      en_cola: todas.filter(o => o.estado_cola === 'en_cola').length,
      por_liberar: todas.filter(o => o.estado_cola === 'por_liberar').length,
      atrasadas: todas.filter(o => o.semaforo === 'rojo').length,
      en_riesgo: todas.filter(o => o.semaforo === 'amarillo').length,
      horas_cola: round1(estados.reduce((s, m) => s + m.horas_cola, 0)),
    },
    avisos: sinMaquina.length ? [...avisos, `${sinMaquina.length} operaciones abiertas sin máquina reconocida (revisar config/maquinas.json → zoho_nombre)`] : avisos,
  };
}
