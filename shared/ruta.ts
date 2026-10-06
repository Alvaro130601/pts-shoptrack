// De lo que viene de Zoho (proyectos, listas, tareas) a SO → ítems → ruta de operaciones, con el estado de cada
// paso calculado según la ruta. Puro: sin red ni I/O. Ver docs/PROCESO.md.
import type {
  CentroConfig, Etapa, EstadoOp, EstadoTarea, Item, ListaCruda, Operacion, ProyectoCrudo, ReglasLectura, SO,
  TareaCruda, TipoPaso,
} from './tipos.ts';
import { ETAPAS } from './tipos.ts';

/** Para comparar nombres: sin tildes, minúsculas, espacios simples. */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** "H. Fresado CNC" → "fresado cnc" */
const sinH = (nombre: string) => norm(nombre).replace(/^h\s*\.\s*/, '');
/** "H. Fresado CNC" → "Fresado CNC" */
export const nombreCorto = (nombre: string) => nombre.replace(/^\s*H\s*\.\s*/i, '').trim();

export interface ResultadoLectura { sos: SO[]; estados_desconocidos: string[] }

export function normalizarProyectos(proyectos: ProyectoCrudo[], reglas: ReglasLectura, centros: CentroConfig[]): ResultadoLectura {
  const lector = crearLector(reglas, centros);
  const sos = proyectos.map(p => lector.proyecto(p));
  return { sos, estados_desconocidos: [...lector.desconocidos] };
}

/** De qué pasos anteriores de la ruta depende un paso para poder empezar.
 *  - Material y planos son condiciones: no esperan a nada.
 *  - La programación solo necesita los planos (puede hacerse mientras llega el material).
 *  - Máquina, servicio externo y cierre esperan a todo lo anterior. */
export function depende(tipo: TipoPaso, previo: TipoPaso): boolean {
  if (tipo === 'material' || tipo === 'planos') return false;
  if (tipo === 'programacion') return previo === 'planos';
  return true;
}

const esCondicion = (t: TipoPaso) => t === 'material' || t === 'planos';

function crearLector(reglas: ReglasLectura, centros: CentroConfig[]) {
  const re = (p: string) => new RegExp(p, 'i');
  const R = {
    item: re(reglas.item_regex), cierre: re(reglas.cierre_regex),
    programacion: re(reglas.tareas.programacion), set_up: re(reglas.tareas.set_up),
    material: re(reglas.tareas.material), planos: re(reglas.tareas.planos),
    ensamble: re(reglas.tareas.ensamble), calidad: re(reglas.tareas.calidad), envio: re(reglas.tareas.envio),
  };
  const porEquipo = new Map<string, CentroConfig>();
  for (const c of centros) for (const e of c.equipos_zoho) porEquipo.set(norm(e), c);
  const programacion = centros.find(c => c.tipo === 'programacion') ?? null;
  const desconocidos = new Set<string>();
  const est = {
    cerrada: reglas.estados.cerrada.map(norm), en_proceso: reglas.estados.en_proceso.map(norm),
    material: reglas.estados.material_pendiente.map(norm), pendiente: reglas.estados.pendiente.map(norm),
  };

  /** Estado de Zoho → pendiente / en proceso / cerrada. Los estados viejos tipo "Material Pendiente" marcan
   *  que al ítem le falta material. Se compara por prefijo ("Pendiente Op…" entra en "Pendiente"). */
  function estadoTarea(crudo: string): { estado: EstadoTarea; falta_material: boolean } {
    const n = norm(crudo);
    const en = (lista: string[]) => lista.some(x => x && n.startsWith(x));
    if (en(est.cerrada)) return { estado: 'cerrada', falta_material: false };
    if (en(est.en_proceso)) return { estado: 'en_proceso', falta_material: false };
    if (en(est.material)) return { estado: 'pendiente', falta_material: true };
    if (!en(est.pendiente) && crudo.trim()) desconocidos.add(crudo.trim());
    return { estado: 'pendiente', falta_material: false };
  }

  function clasificar(t: TareaCruda, enCierre: boolean): { tipo: TipoPaso; centro: CentroConfig | null } {
    const n = sinH(t.nombre);
    if (R.material.test(n)) return { tipo: 'material', centro: null };
    if (R.planos.test(n)) return { tipo: 'planos', centro: null };
    if (R.programacion.test(n)) return { tipo: 'programacion', centro: programacion };
    if (enCierre || R.ensamble.test(n) || R.calidad.test(n) || R.envio.test(n)) return { tipo: 'cierre', centro: null };
    const centro = t.equipo ? porEquipo.get(norm(t.equipo)) ?? null : null;
    if (centro?.tipo === 'externo') return { tipo: 'externo', centro };
    if (centro?.tipo === 'programacion') return { tipo: 'programacion', centro };
    return { tipo: 'maquina', centro };
  }

  function proyecto(p: ProyectoCrudo): SO {
    const so = (p.nombre.match(/^\s*SO-\d+/i)?.[0] ?? p.nombre.split(/\s/)[0]).trim().toUpperCase();
    const base = { so, proyecto: p.nombre, proyecto_id: p.id, cliente: p.cliente, fecha_entrega: p.fecha_entrega, url: p.url };
    const items: Item[] = [];
    let cierre: Operacion[] = [];
    for (const lista of p.listas) {
      if (R.cierre.test(norm(lista.nombre))) cierre = pasos(lista, base, true, lista.id, 'Cierre', null);
      else items.push(item(lista, base));
    }
    const todas = [...items.flatMap(i => i.ruta), ...cierre];
    const requiere_ensamble = p.listas.some(l => l.tareas.some(t => R.ensamble.test(sinH(t.nombre))));
    const requiere_servicio_externo = todas.some(o => o.tipo === 'externo');
    if (cierre.length) estadosRuta(cierre, items.flatMap(i => i.ruta));
    return {
      id: p.id, so, nombre: p.nombre, cliente: p.cliente, fecha_entrega: p.fecha_entrega, estado_zoho: p.estado,
      requiere_servicio_externo, requiere_ensamble, etapa: etapaSO(items, cierre), items, cierre, url_zoho: p.url,
    };
  }

  type Base = { so: string; proyecto: string; proyecto_id: string; cliente: string; fecha_entrega: string; url?: string };

  function item(lista: ListaCruda, base: Base): Item {
    const m = lista.nombre.match(R.item);
    const linea = m?.[1]?.trim();
    const nombre = linea ? `Ítem ${linea}` : lista.nombre.trim();
    const cantidad = m?.[2] ? Number(m[2]) : null;
    const ruta = pasos(lista, base, false, lista.id, nombre, cantidad);
    estadosRuta(ruta, []);
    const it: Item = {
      id: lista.id, nombre, lista: lista.nombre, cantidad, so: base.so, proyecto_id: base.proyecto_id,
      estado: 'pendiente', etapa: 'Producción', ruta, actual: null, situacion: '',
    };
    resumirItem(it);
    return it;
  }

  /** Tareas de una lista → operaciones. Une "H. Set Up" con el mecanizado siguiente del mismo centro y, si algún
   *  estado viejo dice "Material Pendiente" y no hay tarea Material, agrega un paso Material al inicio. */
  function pasos(lista: ListaCruda, base: Base, enCierre: boolean, itemId: string, itemNombre: string, cantidad: number | null): Operacion[] {
    let faltaMaterial = false;
    const crudas = lista.tareas.map(t => {
      const e = estadoTarea(t.estado);
      faltaMaterial ||= e.falta_material;
      const c = clasificar(t, enCierre);
      return { t, estado: e.estado, tipo: c.tipo, centro: c.centro };
    });
    const ops: Operacion[] = [];
    const nueva = (x: (typeof crudas)[number]): Operacion => {
      const pend = horasPendientes(x.t.horas_estimadas, x.t.horas_registradas, x.estado);
      return {
        id: x.t.id, tareas: [x.t.id], nombre: x.t.nombre.trim(), tipo: x.tipo,
        proceso: nombreProceso(x.tipo, x.centro?.nombre, x.t), centro_id: x.centro?.id ?? null, equipo_zoho: x.t.equipo,
        estado_tarea: x.estado, estado: 'pendiente', secuencia: 0,
        horas_totales: x.t.horas_estimadas, horas_registradas: x.t.horas_registradas, horas_pendientes: pend,
        so: base.so, proyecto: base.proyecto, proyecto_id: base.proyecto_id, cliente: base.cliente,
        item_id: itemId, item: itemNombre, cantidad, fecha_entrega: base.fecha_entrega, url_zoho: x.t.url ?? base.url,
      };
    };
    for (let i = 0; i < crudas.length; i++) {
      const x = crudas[i], sig = crudas[i + 1];
      const esSetUp = x.tipo === 'maquina' && R.set_up.test(sinH(x.t.nombre));
      if (esSetUp && sig && sig.tipo === 'maquina' && sig.centro && sig.centro.id === x.centro?.id) {
        ops.push(unir(nueva(x), nueva(sig)));
        i++;
      } else ops.push(nueva(x));
    }
    if (faltaMaterial && !ops.some(o => o.tipo === 'material')) {
      const t: TareaCruda = { id: `${itemId}-material`, nombre: 'Material', equipo: null, estado: '', horas_estimadas: 0, horas_registradas: 0 };
      const v = nueva({ t, estado: 'pendiente', tipo: 'material', centro: null });
      v.tareas = [];
      v.nombre = 'Material (según el estado "Material Pendiente")';
      ops.unshift(v);
    }
    ops.forEach((o, i) => { o.secuencia = i + 1; });
    return ops;
  }

  return { proyecto, desconocidos };
}

function nombreProceso(tipo: TipoPaso, centro: string | undefined, t: TareaCruda): string {
  if (tipo === 'material') return 'Material';
  if (tipo === 'planos') return 'Planos';
  if (tipo === 'programacion') return centro ?? 'Programación';
  if (tipo === 'cierre') return nombreCorto(t.nombre);
  return centro ?? t.equipo?.trim() ?? 'Sin equipo';
}

/** Horas que faltan: estimadas − registradas. Si está en proceso y ya se pasó de lo estimado, se deja media hora. */
export function horasPendientes(estimadas: number, registradas: number, estado: EstadoTarea): number {
  if (estado === 'cerrada') return 0;
  const resto = Math.round((estimadas - registradas) * 10) / 10;
  if (estado === 'en_proceso') return Math.max(resto, Math.min(0.5, estimadas || 0.5));
  return Math.max(resto, 0);
}

/** Set Up + mecanizado = una sola visita a la máquina. */
function unir(setUp: Operacion, mec: Operacion): Operacion {
  const estado_tarea: EstadoTarea =
    setUp.estado_tarea === 'cerrada' && mec.estado_tarea === 'cerrada' ? 'cerrada'
      : setUp.estado_tarea === 'en_proceso' || mec.estado_tarea === 'en_proceso' || setUp.estado_tarea === 'cerrada' ? 'en_proceso'
        : 'pendiente';
  return {
    ...mec,
    tareas: [setUp.id, mec.id],
    nombre: `${setUp.nombre} + ${mec.nombre}`,
    estado_tarea,
    horas_totales: setUp.horas_totales + mec.horas_totales,
    horas_registradas: setUp.horas_registradas + mec.horas_registradas,
    horas_pendientes: Math.round((setUp.horas_pendientes + mec.horas_pendientes) * 10) / 10,
  };
}

/** Estado de cada paso según la ruta. `antes` son pasos que van antes de toda la ruta (para el cierre: los ítems). */
export function estadosRuta(ruta: Operacion[], antes: Operacion[]): void {
  ruta.forEach((op, i) => {
    op.espera = undefined;
    if (op.estado_tarea === 'cerrada') { op.estado = 'hecha'; return; }
    if (esCondicion(op.tipo)) {
      op.estado = 'pendiente';
      op.espera = op.tipo === 'material' ? 'Llegada del material' : 'Planos';
      return;
    }
    if (op.estado_tarea === 'en_proceso') { op.estado = 'en_proceso'; return; }
    const previos = ruta.slice(0, i).filter(p => p.estado !== 'hecha' && depende(op.tipo, p.tipo));
    const items = antes.filter(p => p.estado !== 'hecha');
    if (!previos.length && !items.length) { op.estado = 'en_cola'; return; }
    if (op.tipo === 'cierre') {
      op.estado = 'en_camino';
      op.espera = items.length ? 'Ítems sin terminar' : previos[previos.length - 1].proceso;
      return;
    }
    const abiertos = [...items, ...previos];
    const condicion = abiertos.find(p => esCondicion(p.tipo));
    const programa = abiertos.find(p => p.tipo === 'programacion');
    if (condicion) { op.estado = 'bloqueada'; op.espera = condicion.tipo === 'material' ? 'Material' : 'Planos'; }
    else if (programa) { op.estado = 'bloqueada'; op.espera = 'Programación'; }
    else { op.estado = 'en_camino'; op.espera = abiertos[abiertos.length - 1].proceso; }
  });
}

/** Estado del ítem, dónde está la pieza y en qué etapa va. */
export function resumirItem(it: Item): void {
  const trabajo = it.ruta.filter(o => !esCondicion(o.tipo));
  const terminado = trabajo.length > 0 && trabajo.every(o => o.estado === 'hecha');
  const empezado = trabajo.some(o => o.estado === 'hecha' || o.estado === 'en_proceso');
  it.estado = terminado ? 'cerrado' : empezado ? 'en_proceso' : 'pendiente';
  const actual = trabajo.find(o => o.estado === 'en_proceso') ?? trabajo.find(o => o.estado !== 'hecha') ?? null;
  it.actual = actual?.id ?? null;
  it.situacion = situacion(it, actual, terminado);
  it.etapa = etapaItem(it, actual, terminado);
}

function situacion(it: Item, a: Operacion | null, terminado: boolean): string {
  if (terminado) return 'Terminado';
  if (!a) return it.ruta.some(o => o.tipo === 'material' && o.estado !== 'hecha') ? 'Esperando material' : 'Sin pasos de trabajo';
  const que = a.tipo === 'programacion' ? 'programación' : a.tipo === 'externo' ? `proveedor (${nombreCorto(a.nombre)})` : a.proceso;
  switch (a.estado) {
    case 'en_proceso': return `En ${que}`;
    case 'en_cola': return a.tipo === 'externo' ? `Listo para enviar al ${que}` : `En cola de ${que}`;
    case 'bloqueada': return `Esperando ${a.espera === 'Programación' ? 'programación' : (a.espera ?? '').toLowerCase()}`;
    case 'en_camino': return `Esperando ${a.espera}`;
    default: return `Pendiente: ${que}`;
  }
}

function etapaItem(it: Item, a: Operacion | null, terminado: boolean): Etapa {
  if (terminado) return 'Terminado';
  if (it.ruta.some(o => o.tipo === 'planos' && o.estado !== 'hecha')) return 'Planos';
  const faltaMaterial = it.ruta.some(o => o.tipo === 'material' && o.estado !== 'hecha');
  if (!a) return faltaMaterial ? 'Material' : 'Producción';
  if (a.estado === 'bloqueada' && a.espera === 'Material') return 'Material';
  if (a.tipo === 'programacion' || (a.estado === 'bloqueada' && a.espera === 'Programación')) return 'Programación';
  if (a.tipo === 'externo') return 'Servicio externo';
  return 'Producción';
}

/** La etapa del SO es la del ítem más atrasado en el flujo. */
export function etapaSO(items: Item[], cierre: Operacion[]): Etapa {
  const abiertos = items.filter(i => i.etapa !== 'Terminado');
  if (abiertos.length) return abiertos.reduce<Etapa>((e, i) => ETAPAS.indexOf(i.etapa) < ETAPAS.indexOf(e) ? i.etapa : e, 'Terminado');
  return cierre.some(o => o.estado !== 'hecha') ? 'Cierre' : 'Terminado';
}

/** Para los estados de la UI: qué operaciones cuentan como "en cola real" y cuáles como "por llegar". */
export const PROXIMA: EstadoOp[] = ['en_camino', 'bloqueada'];
