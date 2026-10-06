// Plan sugerido: reparte las operaciones abiertas entre las máquinas (y programadores) de cada centro, respetando
// la ruta de cada ítem y la capacidad de cada recurso; calcula el límite de cada paso hacia atrás desde la entrega
// y el semáforo. Puro: sin red ni I/O. Es una sugerencia: el supervisor decide. Ver docs/PROCESO.md.
import type {
  Ajuste, CentroConfig, EstadoCentro, EstadoMaquina, EstadoPlanta, Item, MaquinaConfig, Operacion, ProyectoCrudo,
  ReglasLectura, Semaforo, SO,
} from './tipos.ts';
import { aplicarAjustes } from './ajustes.ts';
import { depende, norm, normalizarProyectos } from './ruta.ts';
import { RANGO, SLA, diasDeCierre, esFechaISO, evaluarSemaforo, peorSemaforo, primerHabil, round1, sumarHabiles } from './reglas.ts';

const EPS = 1e-9;

/** Un recurso que hace trabajo: una máquina o un programador. Tiempos en días hábiles desde hoy. */
interface Recurso { id: string; cap: number; ocupado: [number, number][]; carga: number }

/** Primer momento ≥ `desde` en que cabe un trabajo de `d` días sin chocar con lo ya ocupado (intervalos ordenados). */
export function hueco(ocupado: [number, number][], desde: number, d: number): number {
  let t = desde;
  for (const [s, e] of ocupado) {
    if (e <= t + EPS) continue;
    if (s >= t + d - EPS) break;
    t = Math.max(t, e);
  }
  return t;
}

function reservar(r: Recurso, s: number, e: number) {
  if (e - s <= EPS) return;
  const i = r.ocupado.findIndex(([a]) => a > s);
  r.ocupado.splice(i < 0 ? r.ocupado.length : i, 0, [s, e]);
  r.carga += e - s;
}

export interface DatosPlanta {
  proyectos: ProyectoCrudo[];
  maquinas: MaquinaConfig[];
  centros: CentroConfig[];
  reglas: ReglasLectura;
  fuente: EstadoPlanta['fuente'];
  datos_de?: string;          // fecha del archivo exportado (excel) o de la lectura de Zoho
  nota_fuente?: string;
  hoy: string;
  feriados: Set<string>;
  avisos?: string[];
  ajustes?: Ajuste[];         // del supervisor: se aplican antes de planificar (shared/ajustes.ts)
}

export function armarEstado(datos: DatosPlanta): EstadoPlanta {
  const aj = aplicarAjustes(datos.proyectos, datos.maquinas, datos.ajustes ?? [], datos.reglas, datos.hoy);
  const d = { ...datos, proyectos: aj.proyectos, maquinas: aj.maquinas };
  const { sos, estados_desconocidos } = normalizarProyectos(d.proyectos, d.reglas, d.centros);
  const plan = planificar(sos, d.centros, d.maquinas, d.hoy, d.feriados);
  const abiertas = (so: SO) => [...so.items.flatMap(i => i.ruta), ...so.cierre].filter(o => o.estado !== 'hecha');
  const ops = sos.flatMap(abiertas);

  // ---- por máquina ----
  const centroDe = new Map<string, string>();
  for (const c of d.centros) for (const m of c.maquinas ?? []) if (!centroDe.has(m)) centroDe.set(m, c.id);
  const porRecurso = agrupar(ops.filter(o => o.maquina_id), o => o.maquina_id!);
  const maquinas: EstadoMaquina[] = d.maquinas.filter(m => m.activa).map(m => {
    const suyas = [...(porRecurso.get(m.id) ?? [])].sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
    const en_proceso = suyas.filter(o => o.estado === 'en_proceso');
    const cola = suyas.filter(o => o.estado === 'en_cola');
    const proximas = suyas.filter(o => o.estado === 'en_camino' || o.estado === 'bloqueada');
    const horas = [...en_proceso, ...cola].reduce((s, o) => s + o.horas_pendientes, 0);
    return {
      ...m, centro_id: centroDe.get(m.id) ?? null, en_proceso, cola, proximas,
      horas_cola: round1(horas), dias_carga: round1(horas / Math.max(m.capacidad_horas_dia, 0.1)),
      semaforo: peor([...en_proceso, ...cola]),
    };
  });

  // ---- por centro ----
  const centros: EstadoCentro[] = d.centros.map(c => {
    const suyas = ops.filter(o => o.centro_id === c.id).sort((a, b) => plan.inicio(a) - plan.inicio(b));
    const enCurso = suyas.filter(o => o.estado === 'en_proceso' || o.estado === 'en_cola');
    const horas = enCurso.reduce((s, o) => s + o.horas_pendientes, 0);
    const recursos = plan.recursosDe(c.id);
    const capacidad = recursos.reduce((s, r) => s + r.cap, 0);
    return {
      id: c.id, nombre: c.nombre, tipo: c.tipo, recursos: recursos.map(r => r.id), capacidad_horas_dia: capacidad,
      en_proceso: suyas.filter(o => o.estado === 'en_proceso').length,
      en_cola: suyas.filter(o => o.estado === 'en_cola').length,
      en_camino: suyas.filter(o => o.estado === 'en_camino' || o.estado === 'bloqueada').length,
      horas_cola: round1(horas), horas_total: round1(suyas.reduce((s, o) => s + o.horas_pendientes, 0)),
      dias_carga: capacidad ? round1(horas / capacidad) : 0,
      semaforo: peor(suyas), ops: suyas,
    };
  });

  // ---- KPIs y avisos ----
  const items = sos.flatMap(s => s.items).filter(i => i.estado !== 'cerrado');
  const sin_centro = ops.filter(o => o.tipo === 'maquina' && !o.centro_id);
  const avisos = [...(d.avisos ?? [])];
  if (sin_centro.length) {
    const equipos = [...new Set(sin_centro.map(o => o.equipo_zoho ?? '(sin equipo)'))];
    avisos.push(`${sin_centro.length} operaciones con un equipo que no corresponde a ningún centro: ${equipos.slice(0, 5).join(', ')}${equipos.length > 5 ? '…' : ''} (revisar config/centros.json)`);
  }
  const sinFecha = sos.filter(s => !esFechaISO(s.fecha_entrega)).map(s => s.nombre);
  if (sinFecha.length === sos.length && sos.length) avisos.push('Ningún SO trae fecha de entrega: el plan reparte la carga por número de SO (el más viejo primero) y no hay semáforo');
  else if (sinFecha.length) avisos.push(`${sinFecha.length} SO sin fecha de entrega válida, se planifican al final y sin semáforo: ${sinFecha.slice(0, 5).join(', ')}${sinFecha.length > 5 ? '…' : ''}`);
  if (estados_desconocidos.length) avisos.push(`Estados de tarea no reconocidos (se tratan como Pendiente): ${estados_desconocidos.join(', ')}`);
  for (const c of centros) {
    if (c.tipo !== 'externo' && c.recursos.length && c.en_proceso > c.recursos.length) {
      const quien = c.tipo === 'programacion' ? 'programador(es)' : c.tipo === 'puesto' ? 'puesto(s)' : 'máquina(s)';
      avisos.push(`${c.nombre}: ${c.en_proceso} operaciones en proceso y solo ${c.recursos.length} ${quien}; revisar estados en Zoho`);
    }
  }
  const sinHoras = ops.filter(o => (o.tipo === 'maquina' || o.tipo === 'programacion') && o.horas_totales <= 0).length;
  if (sinHoras) avisos.push(`${sinHoras} operaciones sin horas estimadas: el plan las cuenta como 0 h`);
  for (const c of centros) {
    const fuera = (d.centros.find(x => x.id === c.id)?.maquinas ?? []).filter(id => d.maquinas.find(m => m.id === id)?.fuera_de_servicio);
    if (c.tipo === 'maquina' && fuera.length && !c.recursos.length && c.ops.length) {
      avisos.push(`${c.nombre}: ninguna máquina disponible (${fuera.map(id => d.maquinas.find(m => m.id === id)!.nombre).join(', ')} fuera de servicio)`);
    }
  }
  const sinAplicar = aj.estado.filter(a => !a.aplicado).length;
  if (aj.estado.length) avisos.push(`${aj.estado.length} ajustes del supervisor${sinAplicar ? `, ${sinAplicar} sin aplicar` : ''} (ver Asistente)`);

  return {
    actualizado: new Date().toISOString(), fuente: d.fuente, datos_de: d.datos_de, hoy: d.hoy,
    ...(d.nota_fuente && { nota_fuente: d.nota_fuente }),
    centros, maquinas, sos, sin_centro,
    kpis: {
      so_abiertos: sos.filter(s => s.etapa !== 'Terminado').length,
      items_abiertos: items.length,
      en_proceso: ops.filter(o => o.estado === 'en_proceso' && (o.tipo === 'maquina' || o.tipo === 'programacion' || o.tipo === 'externo')).length,
      en_cola: ops.filter(o => o.estado === 'en_cola' && o.tipo === 'maquina').length,
      esperando_material: items.filter(i => i.ruta.some(o => o.tipo === 'material' && o.estado !== 'hecha')).length,
      atrasados: items.filter(i => i.semaforo === 'rojo').length,
      en_riesgo: items.filter(i => i.semaforo === 'amarillo').length,
      items_con_fecha: items.filter(i => i.limite).length,
      horas_cola: round1(centros.filter(c => c.tipo === 'maquina').reduce((s, c) => s + c.horas_cola, 0)),
    },
    avisos,
    ajustes: aj.estado,
  };
}

/** Reparte el trabajo y calcula fechas, límites y semáforos. Modifica las operaciones de `sos` (recién creadas). */
export function planificar(sos: SO[], centros: CentroConfig[], maquinas: MaquinaConfig[], hoy: string, feriados: Set<string>) {
  const base = primerHabil(hoy, feriados);
  // Fuera de servicio (ajuste del supervisor): se sigue dibujando, pero el plan no le reparte trabajo.
  const activas = new Map(maquinas.filter(m => m.activa && !m.fuera_de_servicio).map(m => [m.id, m]));
  const porId = new Map<string, Recurso>();
  const recursos = new Map<string, Recurso[]>();
  for (const c of centros) {
    if (c.tipo === 'maquina') {
      recursos.set(c.id, (c.maquinas ?? []).filter(id => activas.has(id)).map(id => {
        let r = porId.get(id);   // una máquina en dos centros comparte su capacidad
        if (!r) porId.set(id, r = { id, cap: Math.max(activas.get(id)!.capacidad_horas_dia, 0.1), ocupado: [], carga: 0 });
        return r;
      }));
    } else if (c.tipo === 'programacion' || c.tipo === 'puesto') {
      recursos.set(c.id, Array.from({ length: Math.max(c.personas ?? 1, 1) }, (_, k) => {
        const r: Recurso = { id: `${c.id}-${k + 1}`, cap: Math.max(c.horas_dia ?? 8, 0.1), ocupado: [], carga: 0 };
        porId.set(r.id, r);
        return r;
      }));
    }
  }
  const centroPorId = new Map(centros.map(c => [c.id, c]));

  /** Duración en días hábiles. Máquina, puesto y programación: horas ÷ capacidad diaria del recurso (8 h si no hay
   *  centro). Servicio externo, material y planos: su SLA. Cierre (ensamble, calidad, envío): 1 día, o sus horas
   *  a 8 h por día si son más. */
  const dias = (op: Operacion, r?: Recurso): number => {
    switch (op.tipo) {
      case 'maquina': case 'programacion': return op.horas_pendientes / (r?.cap ?? 8);
      case 'externo': return centroPorId.get(op.centro_id ?? '')?.dias ?? SLA.servicio_externo;
      case 'material': return SLA.material;
      case 'planos': return SLA.planos;
      case 'cierre': return Math.max(1, op.horas_pendientes / 8);
    }
  };

  // Prioridad: primero los SO que el supervisor priorizó (1, 2, …); luego la fecha en que deben terminar sus
  // rutas (entrega − cierre): la fecha final manda; sin fecha, por número de SO.
  const finRutas = new Map(sos.map(s => [s.id, esFechaISO(s.fecha_entrega) ? sumarHabiles(s.fecha_entrega, -diasDeCierre(s), feriados) : '9999-12-31']));
  const orden = [...sos].sort((a, b) => (a.prioridad ?? Infinity) - (b.prioridad ?? Infinity) ||
    finRutas.get(a.id)!.localeCompare(finRutas.get(b.id)!) || a.fecha_entrega.localeCompare(b.fecha_entrega) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

  /** Máquina que fijó el supervisor, aunque no sea de su proceso, si está disponible. */
  const recursoFijo = (id: string): Recurso | undefined => {
    const m = activas.get(id);
    if (!m) return undefined;
    let r = porId.get(id);
    if (!r) porId.set(id, r = { id, cap: Math.max(m.capacidad_horas_dia, 0.1), ocupado: [], carga: 0 });
    return r;
  };
  const t = new Map<string, [number, number]>();
  const colocar = (op: Operacion, desde: number) => {
    const fijo = op.tipo === 'maquina' && op.maquina_fija ? recursoFijo(op.maquina_fija) : undefined;
    const recs = fijo ? [fijo] : op.centro_id ? recursos.get(op.centro_id) : undefined;
    if ((op.tipo === 'maquina' || op.tipo === 'programacion') && recs?.length) {
      let mejor: { r: Recurso; s: number; e: number } | null = null;
      for (const r of recs) {
        const dur = dias(op, r), s = hueco(r.ocupado, desde, dur), e = s + dur;
        if (!mejor || e < mejor.e - EPS || (Math.abs(e - mejor.e) <= EPS && r.carga < mejor.r.carga)) mejor = { r, s, e };
      }
      reservar(mejor!.r, mejor!.s, mejor!.e);
      op.maquina_id = mejor!.r.id;
      t.set(op.id, [mejor!.s, mejor!.e]);
    } else {
      op.maquina_id = null;
      t.set(op.id, [desde, desde + dias(op)]);
    }
  };
  const ocupaRecurso = (o: Operacion) => o.tipo === 'maquina' || o.tipo === 'programacion';

  // 1) Lo que ya está en proceso ocupa su máquina o programador desde hoy.
  for (const so of orden) for (const op of [...so.items.flatMap(i => i.ruta), ...so.cierre]) {
    if (op.estado === 'en_proceso' && ocupaRecurso(op)) colocar(op, 0);
  }
  // 2) El resto: SO por prioridad, ítem por ítem, en el orden de su ruta.
  for (const so of orden) {
    for (const it of so.items) {
      it.ruta.forEach((op, i) => {
        if (op.estado === 'hecha') { t.set(op.id, [0, 0]); return; }
        if (t.has(op.id)) return;
        if (op.estado === 'en_proceso' || op.tipo === 'material' || op.tipo === 'planos') { colocar(op, 0); return; }
        const previos = it.ruta.slice(0, i).filter(p => depende(op.tipo, p.tipo)).map(p => t.get(p.id)?.[1] ?? 0);
        colocar(op, Math.max(0, ...previos));
      });
    }
    let tc = Math.max(0, ...so.items.flatMap(it => it.ruta.map(o => t.get(o.id)?.[1] ?? 0)));
    for (const op of so.cierre) {
      if (op.estado === 'hecha') { t.set(op.id, [0, 0]); continue; }
      colocar(op, op.estado === 'en_proceso' ? 0 : tc);
      tc = t.get(op.id)![1];
    }
  }

  // Fechas: el día 0 es hoy (o el siguiente hábil). Un trabajo que termina justo al final de un día cuenta en ese día.
  const diaInicio = (x: number) => sumarHabiles(base, Math.floor(x + EPS), feriados);
  const diaFin = (x: number) => sumarHabiles(base, Math.max(Math.ceil(x - EPS) - 1, 0), feriados);
  const recursoDe = (op: Operacion) => (op.maquina_id ? porId.get(op.maquina_id) : undefined);
  const durLimite = (op: Operacion) => dias(op, recursoDe(op));

  for (const so of sos) {
    const todas = [...so.items.flatMap(i => i.ruta), ...so.cierre];
    for (const op of todas) {
      if (op.estado === 'hecha') continue;
      const [s, e] = t.get(op.id)!;
      op.inicio_proyectado = diaInicio(s);
      op.fin_proyectado = diaFin(e);
    }
    // Límites hacia atrás desde la entrega: cada paso debe terminar a tiempo para que los que dependen de él
    // quepan antes de su propio límite. Sin lista de cierre, las rutas terminan diasDeCierre() antes de la entrega.
    if (esFechaISO(so.fecha_entrega)) {
      const entrega = so.fecha_entrega;
      const lfCierre = ultimosFines(so.cierre, durLimite);
      for (const op of so.cierre) if (lfCierre.has(op.id)) op.limite = desplazar(entrega, lfCierre.get(op.id)!, feriados);
      const abiertasCierre = so.cierre.filter(o => o.estado !== 'hecha');
      const finRuta = abiertasCierre.length
        ? desplazar(entrega, Math.min(...abiertasCierre.map(o => lfCierre.get(o.id)! - durLimite(o))), feriados)
        : so.cierre.length ? entrega : sumarHabiles(entrega, -diasDeCierre({
          requiere_servicio_externo: so.requiere_servicio_externo,
          // Si el ensamble ya es un paso de alguna ruta, su día no se vuelve a reservar al final.
          requiere_ensamble: so.requiere_ensamble && !so.items.some(i => i.ruta.some(o => o.tipo === 'cierre' && norm(o.proceso).startsWith('ensambl'))),
        }), feriados);
      for (const it of so.items) {
        const lf = ultimosFines(it.ruta, durLimite);
        for (const op of it.ruta) if (lf.has(op.id)) op.limite = desplazar(finRuta, lf.get(op.id)!, feriados);
        it.limite = finRuta;
      }
    }
    for (const op of todas) {
      if (op.estado === 'hecha') continue;
      if (!op.limite || !op.fin_proyectado) { op.semaforo = undefined; op.motivo = 'Sin fecha de entrega válida'; continue; }
      const r = evaluarSemaforo(op.fin_proyectado, op.limite, hoy, feriados);
      op.semaforo = r.semaforo; op.holgura_dias = r.holgura; op.motivo = r.motivo;
    }
    for (const it of so.items) resumirPlanItem(it);
    resumirPlanSO(so);
  }

  // Posición en el plan de cada recurso: 0 = en proceso; luego en orden de inicio.
  const porRecurso = agrupar(sos.flatMap(s => [...s.items.flatMap(i => i.ruta), ...s.cierre])
    .filter(o => o.estado !== 'hecha' && o.maquina_id), o => o.maquina_id!);
  for (const lista of porRecurso.values()) {
    lista.sort((a, b) => t.get(a.id)![0] - t.get(b.id)![0]);
    let k = 0;
    for (const o of lista) o.posicion = o.estado === 'en_proceso' ? 0 : ++k;
  }

  return {
    inicio: (op: Operacion) => t.get(op.id)?.[0] ?? 0,
    recursosDe: (centroId: string) => recursos.get(centroId) ?? [],
  };
}

/** Último fin permitido de cada paso abierto, en días (≤ 0) relativos al fin de la cadena (CPM hacia atrás). */
function ultimosFines(ruta: Operacion[], dur: (o: Operacion) => number): Map<string, number> {
  const lf = new Map<string, number>();
  for (let i = ruta.length - 1; i >= 0; i--) {
    const op = ruta[i];
    if (op.estado === 'hecha') continue;
    let v = 0;
    for (const s of ruta.slice(i + 1)) {
      if (s.estado !== 'hecha' && depende(s.tipo, op.tipo)) v = Math.min(v, lf.get(s.id)! - dur(s));
    }
    lf.set(op.id, v);
  }
  return lf;
}

/** Fecha `cero` corrida `off` días hábiles hacia atrás (off ≤ 0). Medio día antes sigue siendo el mismo día. */
const desplazar = (cero: string, off: number, feriados: Set<string>) =>
  sumarHabiles(cero, -Math.floor(-off + EPS), feriados);

function resumirPlanItem(it: Item) {
  const abiertas = it.ruta.filter(o => o.estado !== 'hecha');
  it.fin_proyectado = abiertas.reduce<string | undefined>((m, o) => (!m || (o.fin_proyectado ?? '') > m ? o.fin_proyectado : m), undefined);
  const critica = masCritica(abiertas);
  it.semaforo = critica?.semaforo;
  it.motivo = critica ? `${critica.proceso}: ${critica.motivo}` : undefined;
}

function resumirPlanSO(so: SO) {
  const fines = [...so.items.map(i => i.fin_proyectado), ...so.cierre.map(o => o.fin_proyectado)].filter((x): x is string => !!x);
  so.fin_proyectado = fines.sort().at(-1);
  so.semaforo = [...so.items.map(i => i.semaforo), ...so.cierre.filter(o => o.estado !== 'hecha').map(o => o.semaforo)]
    .reduce<Semaforo | undefined>((a, b) => peorSemaforo(a, b), undefined);
  const peorItem = so.items.filter(i => i.semaforo === so.semaforo && i.motivo)[0];
  so.motivo = peorItem ? `${peorItem.nombre} · ${peorItem.motivo}` : undefined;
}

/** La operación con peor semáforo y, entre esas, la de menos holgura. */
function masCritica(ops: Operacion[]): Operacion | undefined {
  return ops.filter(o => o.semaforo).sort((a, b) =>
    RANGO[b.semaforo!] - RANGO[a.semaforo!] || (a.holgura_dias ?? 0) - (b.holgura_dias ?? 0))[0];
}

function peor(ops: Operacion[]): Semaforo | 'libre' {
  return ops.reduce<Semaforo | undefined>((a, o) => peorSemaforo(a, o.semaforo), undefined) ?? 'libre';
}

function agrupar<T>(xs: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = clave(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}
