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
/** Nombre para reconocer el proceso: sin "H.", sin el número de operación "(#2)" y sin "Retrabajo".
 *  "H. Retrabajo Erosionado (#2)" → "erosionado" */
export const baseTarea = (nombre: string) =>
  sinH(nombre).replace(/\s*\(#\d+\)\s*$/, '').replace(/^retrabajo\s+(de\s+)?/, '').trim();
/** "H. Fresado CNC" → "Fresado CNC" */
export const nombreCorto = (nombre: string) => nombre.replace(/^\s*H\s*\.\s*/i, '').trim();
/** Código del cliente en el nombre del proyecto: "SO-11338-SMT-1" → "SMT". */
export const clienteDe = (proyecto: string) => proyecto.match(/^\s*SO-\d+-([^-\s]+)/i)?.[1]?.toUpperCase() ?? '';

/** Nombre corto de un paso de la ruta: el de la tarea de máquina ("Revenido", "Rectificado (Balony)"; con Set Up,
 *  el del mecanizado), "Programación", "Material", "Anodizado"… */
export function etiquetaPaso(o: Pick<Operacion, 'tipo' | 'nombre' | 'proceso'>): string {
  if (o.tipo === 'maquina') return nombreCorto(o.nombre.split(' + ').at(-1) ?? '') || o.proceso;
  if (o.tipo === 'programacion') return 'Programación';
  if (o.tipo === 'material') return 'Material';
  if (o.tipo === 'planos') return 'Planos';
  return nombreCorto(o.nombre);
}

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

const re = (p: string) => new RegExp(p, 'i');

/** Expresiones de config/zoho-mapeo.json → lectura, ya compiladas. */
function expresiones(reglas: ReglasLectura) {
  return {
    item: re(reglas.item_regex), cierre: re(reglas.cierre_regex),
    programacion: re(reglas.tareas.programacion), set_up: re(reglas.tareas.set_up),
    material: re(reglas.tareas.material), planos: re(reglas.tareas.planos),
    ensamble: re(reglas.tareas.ensamble), calidad: re(reglas.tareas.calidad), envio: re(reglas.tareas.envio),
  };
}

/** Estado de Zoho → pendiente / en proceso / cerrada. Los estados viejos tipo "Material Pendiente" marcan que al
 *  ítem le falta material. Se compara por prefijo ("Pendiente Op…" entra en "Pendiente"). `conocido` = false si
 *  no está en ninguna lista (se trata como pendiente). */
export function leerEstado(crudo: string, estados: ReglasLectura['estados']): { estado: EstadoTarea; falta_material: boolean; conocido: boolean; con_proveedor?: boolean } {
  const n = norm(crudo);
  const en = (lista: string[]) => lista.some(x => norm(x) && n.startsWith(norm(x)));
  if (en(estados.cerrada)) return { estado: 'cerrada', falta_material: false, conocido: true };
  // "Servicio Externo": la pieza está en un proveedor, aunque la tarea sea de un proceso nuestro (mecanizado afuera).
  if (en(estados.proveedor ?? [])) return { estado: 'en_proceso', falta_material: false, conocido: true, con_proveedor: true };
  if (en(estados.en_proceso)) return { estado: 'en_proceso', falta_material: false, conocido: true };
  if (en(estados.material_pendiente)) return { estado: 'pendiente', falta_material: true, conocido: true };
  return { estado: 'pendiente', falta_material: false, conocido: en(estados.pendiente) || !crudo.trim() };
}

/** Qué paso es una tarea y a qué centro va: por el equipo asignado o, si no trae (p. ej. en una exportación a
 *  Excel), por su nombre (`tareas_zoho` de config/centros.json). `enCierre`: la tarea está en la lista Cierre. */
export function crearClasificador(reglas: ReglasLectura, centros: CentroConfig[]) {
  const R = expresiones(reglas);
  const porEquipo = new Map<string, CentroConfig>();
  for (const c of centros) for (const e of c.equipos_zoho) porEquipo.set(norm(e), c);
  const porNombre = centros.flatMap(c => (c.tareas_zoho ?? []).map(p => ({ re: re(p), centro: c })));
  const programacion = centros.find(c => c.tipo === 'programacion') ?? null;
  return (t: Pick<TareaCruda, 'nombre' | 'equipo'>, enCierre = false): { tipo: TipoPaso; centro: CentroConfig | null } => {
    const n = baseTarea(t.nombre);
    if (R.material.test(n)) return { tipo: 'material', centro: null };
    if (R.planos.test(n)) return { tipo: 'planos', centro: null };
    if (R.programacion.test(n)) return { tipo: 'programacion', centro: programacion };
    if (enCierre || R.ensamble.test(n) || R.calidad.test(n) || R.envio.test(n)) return { tipo: 'cierre', centro: null };
    const centro = (t.equipo ? porEquipo.get(norm(t.equipo)) : undefined) ?? porNombre.find(x => x.re.test(n))?.centro ?? null;
    if (centro?.tipo === 'externo') return { tipo: 'externo', centro };
    if (centro?.tipo === 'programacion') return { tipo: 'programacion', centro };
    return { tipo: 'maquina', centro };
  };
}

function crearLector(reglas: ReglasLectura, centros: CentroConfig[]) {
  const R = expresiones(reglas);
  const externo = centros.find(c => c.tipo === 'externo') ?? null;
  const clasificar = crearClasificador(reglas, centros);
  const desconocidos = new Set<string>();
  const estadoTarea = (crudo: string) => {
    const e = leerEstado(crudo, reglas.estados);
    if (!e.conocido) desconocidos.add(crudo.trim());
    return e;
  };

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
    const requiere_ensamble = p.listas.some(l => l.tareas.some(t => R.ensamble.test(baseTarea(t.nombre))));
    const requiere_servicio_externo = todas.some(o => o.tipo === 'externo');
    if (cierre.length) estadosRuta(cierre, items.flatMap(i => i.ruta));
    return {
      id: p.id, so, nombre: p.nombre, cliente: p.cliente, fecha_entrega: p.fecha_entrega, estado_zoho: p.estado,
      requiere_servicio_externo, requiere_ensamble, etapa: etapaSO(items, cierre), items, cierre, url_zoho: p.url,
      ...(p.prioridad != null && { prioridad: p.prioridad }), ...(p.ajustes?.length && { ajustes: p.ajustes }),
    };
  }

  type Base = { so: string; proyecto: string; proyecto_id: string; cliente: string; fecha_entrega: string; url?: string };

  function item(lista: ListaCruda, base: Base): Item {
    const m = lista.nombre.match(R.item);
    const linea = m?.[1]?.trim();
    // "Ítem 23 (3 unidades)" → "Ítem 23"; "PZA-0018-C (6 und)" → "PZA-0018-C"
    const nombre = !linea ? lista.nombre.trim() : /^\s*[ÍIíi]tem\b/.test(lista.nombre) ? `Ítem ${linea}` : linea;
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
      // Con el proveedor: no es trabajo de la planta aunque el equipo sea una máquina (p. ej. Fresado CNC hecho afuera).
      if (e.con_proveedor && (c.tipo === 'maquina' || c.tipo === 'programacion')) return { t, estado: e.estado, tipo: 'externo' as const, centro: externo };
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
        ...(x.t.maquina && { maquina_fija: x.t.maquina }), ...(x.t.ajustes?.length && { ajustes: x.t.ajustes }),
      };
    };
    for (let i = 0; i < crudas.length; i++) {
      const x = crudas[i], sig = crudas[i + 1];
      const esSetUp = x.tipo === 'maquina' && R.set_up.test(baseTarea(x.t.nombre));
      // Un Set Up sin equipo es la preparación de la máquina del paso siguiente.
      if (esSetUp && !x.centro && sig?.tipo === 'maquina') x.centro = sig.centro;
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
  // Pendiente pero con horas registradas por encima de lo estimado: ya se trabajó y no se cerró.
  if (registradas > 0 && resto <= 0) return Math.min(0.5, estimadas || 0.5);
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
    ...((mec.maquina_fija ?? setUp.maquina_fija) && { maquina_fija: mec.maquina_fija ?? setUp.maquina_fija }),
    ...((setUp.ajustes || mec.ajustes) && { ajustes: [...new Set([...(setUp.ajustes ?? []), ...(mec.ajustes ?? [])])] }),
  };
}

/** Estado de cada paso según la ruta. `antes` son pasos que van antes de toda la ruta (para el cierre: los ítems). */
export function estadosRuta(ruta: Operacion[], antes: Operacion[]): void {
  // Si la pieza ya está en un proveedor, lo anterior de su ruta ya se hizo aunque no se haya cerrado en Zoho.
  let enProveedor = -1;
  ruta.forEach((o, i) => { if (o.tipo === 'externo' && o.estado_tarea === 'en_proceso') enProveedor = i; });
  ruta.forEach((op, i) => {
    op.espera = undefined;
    if (op.estado_tarea === 'cerrada') { op.estado = 'hecha'; return; }
    if (i < enProveedor && op.tipo !== 'cierre') { op.estado = 'hecha'; op.espera = 'Sin cerrar en Zoho: la pieza ya está en el proveedor'; return; }
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
