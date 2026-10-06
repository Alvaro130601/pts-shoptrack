// Lectura de Zoho Projects (API v3): los proyectos y las tareas de la vista "Carga de trabajo" → ProyectoCrudo.
// La usan el servidor (OAuth, server/fuentes/zoho.ts) y la página publicada en claude.ai (el conector Zoho Projects
// de quien la abre). Sin red: quien la usa dice cómo llamar a la API (`LlamarZoho`). Ver docs/ZOHO.md.
import { esFechaISO } from './reglas.ts';
import { baseTarea, clienteDe, norm } from './ruta.ts';
import type { ListaCruda, ProyectoCrudo, TareaCruda } from './tipos.ts';

/** Qué se lee: lo mismo que la vista "Carga de trabajo" de Tareas en Zoho (config/zoho-mapeo.json → vista). */
export interface VistaZoho {
  grupos: string[];                          // grupos de proyectos
  estados_proyecto: Record<string, string>;  // nombre → id en el portal (el filtro de la API pide ids)
  tarea_contiene: string;                    // "H."
  estados_tarea: string[];                   // estados de tarea que entran
}

/** Lo que hace falta de config/zoho-mapeo.json para leer Zoho. */
export interface MapeoZoho {
  portal: { nombre: string; id: string };
  proyectos: { prefijo: string; excluir_estados: string[] };
  vista: VistaZoho;
}

/** Herramientas del conector de claude.ai; el servidor llama a la ruta REST equivalente. */
export type HerramientaZoho = 'get_projects_list' | 'get_tasks_by_portal';
/** Una llamada a la API con sus parámetros de consulta. Devuelve la respuesta tal cual llega. */
export type LlamarZoho = (herramienta: HerramientaZoho, consulta: Record<string, string | number>) => Promise<unknown>;

export interface LecturaZoho { proyectos: ProyectoCrudo[]; avisos: string[] }

const POR_PAGINA = 200;   // máximo de la API
const MAX_PAGINAS = 50;

const texto = (v: unknown) => (v == null ? '' : String(v).trim());
/** Nombre del estado: viene como { id, name } y a veces con espacios de más ("Pendiente de Planos "). */
const estadoDe = (x: any) => texto(x?.status?.name ?? x?.custom_status_name ?? x?.status);

/** Los elementos de una respuesta. La API REST devuelve { tasks: [...] } o, para proyectos, un arreglo; el
 *  conector de claude.ai la envuelve en { status, data: { tasks | result } }. */
export function elementos(resp: unknown, clave: string): any[] {
  let r: any = resp;
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    if (r.status === 'error' || r.error) throw new Error(`Zoho respondió con un error: ${texto(r.error?.title ?? r.error?.message ?? r.message ?? JSON.stringify(r.error ?? r)).slice(0, 300)}`);
    if (r.data && typeof r.data === 'object') r = r.data;
  }
  if (Array.isArray(r)) return r;
  const v = r?.[clave] ?? r?.result;
  return Array.isArray(v) ? v : [];
}

/** Todas las páginas. Si la respuesta trae page_info se usa; si no (proyectos), se sigue hasta una página vacía:
 *  no se supone el tamaño de página, que la API puede recortar. */
async function todas(llamar: LlamarZoho, herramienta: HerramientaZoho, clave: string, filtro: string): Promise<any[]> {
  const out: any[] = [];
  let primeroAnterior: unknown;
  for (let page = 1; ; page++) {
    const resp: any = await llamar(herramienta, { filter: filtro, page, per_page: POR_PAGINA });
    const lote = elementos(resp, clave);
    if (!lote.length || lote[0]?.id === primeroAnterior) break;   // vacía, o la API repite la misma página
    out.push(...lote);
    const masSegun = (resp?.data ?? resp)?.page_info?.has_next_page;
    if (masSegun === false) break;
    if (page >= MAX_PAGINAS) throw new Error(`Más de ${MAX_PAGINAS} páginas de ${clave} en Zoho: revisar la paginación`);
    primeroAnterior = lote[0]?.id;
  }
  return out;
}

/** Filtro de la API para los proyectos: los estados de la vista (por id). */
export const filtroProyectos = (v: VistaZoho) => JSON.stringify({
  criteria: [{ field_name: 'status', criteria_condition: 'is', value: Object.values(v.estados_proyecto) }],
  pattern: '1',
});
/** Filtro de la API para las tareas: nombre con "H." y abiertas. Los estados exactos de la vista se aplican después. */
export const filtroTareas = (v: VistaZoho) => JSON.stringify({
  criteria: [
    { field_name: 'name', criteria_condition: 'contains', value: [v.tarea_contiene] },
    { field_name: 'status', criteria_condition: 'is', value: ['${all_open}'] },
  ],
  pattern: '1 AND 2',
});

/** Lee la vista: primero los proyectos y después las tareas abiertas de todo el portal (unas 5 llamadas). */
export async function leerZohoCon(llamar: LlamarZoho, mapeo: MapeoZoho): Promise<LecturaZoho> {
  const proyectos = await todas(llamar, 'get_projects_list', 'projects', filtroProyectos(mapeo.vista));
  // Sin proyectos lo más probable es que cambiaron los estados del portal: mejor avisar que mostrar la planta vacía.
  if (!proyectos.length) throw new Error('Zoho no devolvió proyectos en los estados de la vista "Carga de trabajo" (revisar config/zoho-mapeo.json → vista)');
  const tareas = await todas(llamar, 'get_tasks_by_portal', 'tasks', filtroTareas(mapeo.vista));
  return proyectosDeZoho(proyectos, tareas, mapeo);
}

/** Proyectos y tareas de la API → proyectos crudos con sus ítems (listas de tareas) en el orden de la ruta. */
export function proyectosDeZoho(proyectos: any[], tareas: any[], mapeo: MapeoZoho): LecturaZoho {
  const v = mapeo.vista;
  const grupos = new Set(v.grupos.map(norm));
  const estadosProyecto = new Set(Object.keys(v.estados_proyecto).map(norm));
  const excluidos = new Set(mapeo.proyectos.excluir_estados.map(norm));
  const estadosTarea = new Set(v.estados_tarea.map(norm));
  const contiene = norm(v.tarea_contiene);

  const elegidos = new Map<string, any>();
  for (const p of proyectos) {
    const estado = norm(estadoDe(p));
    if (texto(p.name).startsWith(mapeo.proyectos.prefijo) && grupos.has(norm(texto(p.project_group?.name)))
      && estadosProyecto.has(estado) && !excluidos.has(estado)) elegidos.set(texto(p.id), p);
  }

  const porProyecto = new Map<string, any[]>();
  const fuera = new Map<string, number>();   // tareas de estos proyectos que la vista no cuenta, por estado
  let subtareas = 0;
  for (const t of tareas) {
    const pid = texto(t.project?.id ?? t.project_id);
    if (!elegidos.has(pid) || !norm(texto(t.name)).includes(contiene)) continue;
    if (Number(t.depth) > 0 || t.parent_task_id || t.parental_info?.parent_task_id) { subtareas++; continue; }
    const estado = estadoDe(t);
    if (!estadosTarea.has(norm(estado))) { fuera.set(estado, (fuera.get(estado) ?? 0) + 1); continue; }
    porProyecto.set(pid, [...(porProyecto.get(pid) ?? []), t]);
  }

  const crudos = [...elegidos.values()].filter(p => porProyecto.has(texto(p.id))).map(p => aProyecto(p, porProyecto.get(texto(p.id))!));
  const n = crudos.reduce((s, p) => s + p.listas.reduce((k, l) => k + l.tareas.length, 0), 0);
  const avisos = [`Zoho en vivo: ${n} tareas de ${crudos.length} SO (vista "Carga de trabajo")`];
  if (fuera.size) {
    const total = [...fuera.values()].reduce((s, k) => s + k, 0);
    avisos.push(`${total} tareas abiertas no entran por su estado (${[...fuera].map(([e, k]) => `${e || 'sin estado'}: ${k}`).join(', ')}), igual que en la vista de Zoho`);
  }
  if (subtareas) avisos.push(`${subtareas} subtareas no se cuentan en la ruta`);
  return { proyectos: crudos, avisos };
}

/** Una lista de tareas = un ítem. Las listas van por nombre ("Ítem 2" antes que "Ítem 10"); las tareas, en su orden. */
function aProyecto(p: any, tareas: any[]): ProyectoCrudo {
  const porLista = new Map<string, { nombre: string; tareas: any[] }>();
  for (const t of tareas) {
    const id = texto(t.tasklist?.id ?? t.tasklist_id) || 'sin-lista';
    if (!porLista.has(id)) porLista.set(id, { nombre: texto(t.tasklist?.name) || 'Sin lista', tareas: [] });
    porLista.get(id)!.tareas.push(t);
  }
  const listas: ListaCruda[] = [...porLista]
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
    .map(([id, l]) => ({ id, nombre: l.nombre, tareas: l.tareas.sort((a, b) => orden(a) - orden(b) || orden2(a) - orden2(b)).map(aTarea) }));
  const nombre = texto(p.name);
  return { id: texto(p.id), nombre, estado: estadoDe(p), cliente: clienteDe(nombre), fecha_entrega: fechaZoho(p) ?? '', listas };
}

function aTarea(t: any): TareaCruda {
  const clave = texto(t.prefix ?? t.key);
  return {
    id: texto(t.id), ...(clave && { clave }), nombre: texto(t.name), equipo: equipoDe(t), estado: estadoDe(t),
    horas_estimadas: horas(t.owners_and_work?.total_work),     // total de la tarea (las horas van a un propietario)
    horas_registradas: horas(t.log_hours?.total_hours),
  };
}

/** Orden dentro de la lista: la secuencia de Zoho ({ sequence: 3 }); si no viene, el número de la clave (A52Y-T37). */
function orden(t: any): number {
  const s = Number(t.sequence?.sequence ?? t.sequence);
  return Number.isFinite(s) ? s : orden2(t);
}
function orden2(t: any): number {
  const n = texto(t.prefix ?? t.key).match(/-T(\d+)$/i);
  return n ? Number(n[1]) : Number.MAX_SAFE_INTEGER;
}

/** Equipo asociado (equipos de Zoho). Puede haber varios: se toma el que coincide con el nombre de la tarea
 *  ("Torno CNC" para "H. Torno CNC" con Torno CNC y Torno) y, si ninguno coincide, el primero. */
function equipoDe(t: any): string | null {
  const equipos: string[] = (Array.isArray(t.teams) ? t.teams : Array.isArray(t.associated_teams) ? t.associated_teams : [])
    .map((e: any) => texto(e?.name)).filter(Boolean);
  if (!equipos.length) return null;
  const base = baseTarea(texto(t.name));
  return equipos.filter(e => base.startsWith(norm(e))).sort((a, b) => b.length - a.length)[0] ?? equipos[0];
}

/** Horas de Zoho: número, "12", "12.5" o "12:30". */
export function horas(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = texto(v);
  const hm = s.match(/^(\d+):(\d{1,2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Fecha final del proyecto (end_date) en yyyy-mm-dd. La API v3 la da como "2026-10-20"; se aceptan también
 *  fecha con hora, MM-DD-YYYY y milisegundos (end_date_long, en hora de Costa Rica). */
export function fechaZoho(p: any): string | null {
  const s = texto(p?.end_date);
  const iso = s.slice(0, 10);
  if (esFechaISO(iso)) return iso;
  const mdy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (mdy) { const f = `${mdy[3]}-${mdy[1]}-${mdy[2]}`; if (esFechaISO(f)) return f; }
  const largo = Number(p?.end_date_long);
  if (Number.isFinite(largo) && largo > 0) return new Date(largo - 6 * 3600_000).toISOString().slice(0, 10);
  return null;
}
