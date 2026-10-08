// Ajustes del supervisor sobre los datos crudos, antes de planificar: estados de tareas, material que llegó,
// prioridad y fecha de entrega de un SO, máquina fija para una operación y máquinas fuera de servicio.
// Puro: sin I/O. No se escribe nada en Zoho; los ajustes viven en ShopTrack hasta que el supervisor los quita.
import type { Ajuste, AjusteEstado, MaquinaConfig, ProyectoCrudo, ReglasLectura, TareaCruda } from './tipos.ts';
import { esFechaISO } from './reglas.ts';
import { baseTarea, leerEstado } from './ruta.ts';

export interface ConAjustes {
  proyectos: ProyectoCrudo[];
  maquinas: MaquinaConfig[];
  estado: AjusteEstado[];
}

/** Aplica los ajustes en orden (el más nuevo manda sobre el mismo dato). No modifica las entradas. */
export function aplicarAjustes(
  proyectos: ProyectoCrudo[], maquinas: MaquinaConfig[], ajustes: Ajuste[], reglas: ReglasLectura, hoy: string,
): ConAjustes {
  if (!ajustes.length) return { proyectos, maquinas, estado: [] };
  const ps: ProyectoCrudo[] = structuredClone(proyectos);
  const ms: MaquinaConfig[] = maquinas.map(m => ({ ...m }));
  const proyecto = new Map(ps.map(p => [p.id, p]));
  const tareas = new Map<string, TareaCruda>();
  for (const p of ps) for (const l of p.listas) for (const t of l.tareas) tareas.set(t.id, t);
  const maquina = new Map(ms.map(m => [m.id, m]));
  const esMaterial = new RegExp(reglas.tareas.material, 'i');
  const canonico = {
    pendiente: reglas.estados.pendiente[0] ?? 'Pendiente',
    en_proceso: reglas.estados.en_proceso[0] ?? 'En proceso',
    cerrada: reglas.estados.cerrada[0] ?? 'Cerrada',
  };
  const marcar = (x: { ajustes?: string[] }, id: string) => { x.ajustes = [...(x.ajustes ?? []), id]; };

  // Primero las máquinas fuera de servicio: una máquina fija solo vale si la máquina está disponible.
  const orden = [...ajustes.filter(a => a.tipo === 'fuera_servicio'), ...ajustes.filter(a => a.tipo !== 'fuera_servicio')];
  const resultado = new Map<string, AjusteEstado>();
  for (const a of orden) {
    const r: AjusteEstado = { id: a.id, tipo: a.tipo, creado: a.creado, descripcion: a.descripcion, nota: a.nota, aplicado: true };
    resultado.set(a.id, r);
    const no = (motivo: string) => { r.aplicado = false; r.motivo = motivo; };

    if (a.tipo === 'fuera_servicio') {
      const m = maquina.get(a.maquina_id);
      if (!m) no('La máquina ya no está en la configuración');
      else if (a.hasta && esFechaISO(a.hasta) && a.hasta < hoy) no(`Venció el ${a.hasta}`);
      else m.fuera_de_servicio = a.motivo || 'Fuera de servicio';
      continue;
    }
    const p = proyecto.get(a.proyecto_id);
    if (!p) { no('El SO ya no está en los datos (¿se completó?)'); continue; }

    if (a.tipo === 'prioridad') { p.prioridad = a.prioridad; marcar(p, a.id); continue; }
    if (a.tipo === 'entrega') {
      if (esFechaISO(a.fecha)) { p.fecha_entrega = a.fecha; marcar(p, a.id); } else no(`Fecha no válida: ${a.fecha}`);
      continue;
    }

    const suyas = a.tareas.map(id => tareas.get(id)).filter((t): t is TareaCruda => !!t);
    if (!suyas.length) { no('Las tareas ya no están en los datos (¿se cerraron en Zoho?)'); continue; }
    if (a.tipo === 'maquina') {
      const m = maquina.get(a.maquina_id);
      if (!m || !m.activa) { no('La máquina no existe o no está activa'); continue; }
      if (m.fuera_de_servicio) { no(`${m.nombre} está fuera de servicio`); continue; }
    }
    for (const t of suyas) {
      if (a.tipo === 'estado') t.estado = canonico[a.estado];
      else if (a.tipo === 'maquina') t.maquina = a.maquina_id;
      else if (esMaterial.test(baseTarea(t.nombre))) t.estado = canonico.cerrada;          // tarea Material
      else if (leerEstado(t.estado, reglas.estados).falta_material) t.estado = canonico.pendiente; // estado viejo
      marcar(t, a.id);
    }
  }
  // En el orden en que se crearon, para mostrarlos.
  return { proyectos: ps, maquinas: ms, estado: ajustes.map(a => resultado.get(a.id)!) };
}

/** Id corto y único para un ajuste nuevo. */
export const nuevoIdAjuste = (ahora = Date.now()) =>
  `aj-${ahora.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
