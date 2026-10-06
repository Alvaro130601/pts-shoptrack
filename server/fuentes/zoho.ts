// Lectura de Zoho Projects (portal ptsportal388): proyectos SO-… → listas de tareas (ítems) → tareas (ruta).
// Devuelve los datos crudos; la interpretación (ítems, Set Up, estados, centros) está en shared/ruta.ts.
// Los nombres de endpoints/campos marcados con VERIFICAR se confirman con datos reales (docs/ZOHO.md).
import type { ListaCruda, ProyectoCrudo, TareaCruda } from '../../shared/tipos.ts';
import { esFechaISO } from '../../shared/reglas.ts';
import { cargarMapeoZoho } from '../config.ts';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable ${k} en .env`);
  return v;
};

let token: { valor: string; vence: number } | null = null;
let tokenEnCurso: Promise<string> | null = null;

/** Zoho limita cuántos access tokens se generan por minuto: una sola renovación a la vez. */
function accessToken(): Promise<string> {
  if (token && Date.now() < token.vence - 60_000) return Promise.resolve(token.valor);
  return tokenEnCurso ??= renovarToken().finally(() => { tokenEnCurso = null; });
}

async function renovarToken(): Promise<string> {
  const url = new URL('/oauth/v2/token', env('ZOHO_ACCOUNTS_URL'));
  url.search = new URLSearchParams({
    refresh_token: env('ZOHO_REFRESH_TOKEN'), client_id: env('ZOHO_CLIENT_ID'),
    client_secret: env('ZOHO_CLIENT_SECRET'), grant_type: 'refresh_token',
  }).toString();
  const res = await fetch(url, { method: 'POST' });
  const j = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) throw new Error(`Zoho OAuth falló: ${j.error ?? res.status}`);
  token = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.valor;
}

async function get<T = any>(ruta: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(ruta, env('ZOHO_PROJECTS_API'));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` } });
  if (res.status === 204) return {} as T;
  if (!res.ok) throw new Error(`Zoho ${res.status} en ${url.pathname}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Paginación genérica. VERIFICAR nombre de la colección en la respuesta v3 ("projects", "tasks"). */
async function todas<T = any>(ruta: string, clave: string, porPagina = 100): Promise<T[]> {
  const MAX_PAGINAS = 200;
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const j = await get<any>(ruta, { page, per_page: porPagina });
    const lote: T[] = j[clave] ?? [];
    out.push(...lote);
    // Si la respuesta trae page_info se usa; si no, una página incompleta es la última.
    const hayMas = j.page_info?.has_next_page ?? lote.length >= porPagina;
    if (!hayMas || !lote.length) break;
    if (page >= MAX_PAGINAS) throw new Error(`Más de ${MAX_PAGINAS} páginas en ${ruta}: revisar la paginación`);
  }
  return out;
}

/** Aplica fn a cada elemento con a lo sumo `limite` llamadas simultáneas, conservando el orden. */
async function enParalelo<T, R>(items: T[], limite: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const trabajador = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return out;
}

/** Normaliza fechas de Zoho a yyyy-mm-dd. Acepta ISO (con o sin hora), MM-DD-YYYY y milisegundos.
 *  VERIFICAR el formato real de end_date en v3 (depende del formato de fecha del portal). */
export function fechaZoho(p: any): string | null {
  const s = String(p.end_date ?? '').trim();
  const iso = s.slice(0, 10);
  if (esFechaISO(iso)) return iso;
  const mdy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (mdy) { const f = `${mdy[3]}-${mdy[1]}-${mdy[2]}`; if (esFechaISO(f)) return f; }
  // Último recurso: milisegundos, interpretados en hora de Costa Rica (UTC−6). VERIFICAR.
  const largo = Number(p.end_date_long);
  if (Number.isFinite(largo) && largo > 0) return new Date(largo - 6 * 3600_000).toISOString().slice(0, 10);
  return null;
}

export async function leerZoho(): Promise<{ proyectos: ProyectoCrudo[]; avisos: string[] }> {
  const mapeo = cargarMapeoZoho();
  const portal = env('ZOHO_PORTAL_ID');
  const avisos: string[] = [];

  // VERIFICAR rutas v3: /projects, /projects/{id}/tasklists y /projects/{id}/tasks (¿incluye tareas cerradas?)
  const proyectos = (await todas<any>(`/api/v3/portal/${portal}/projects`, 'projects'))
    .filter(p => String(p.name ?? '').startsWith(mapeo.proyectos.prefijo))
    .filter(p => !mapeo.proyectos.excluir_estados.includes(estadoProyecto(p)));
  const datos = await enParalelo(proyectos, 5, async p => ({
    listas: await todas<any>(`/api/v3/portal/${portal}/projects/${p.id}/tasklists`, 'tasklists'),
    tareas: await todas<any>(`/api/v3/portal/${portal}/projects/${p.id}/tasks`, 'tasks'),
  }));
  const crudos = proyectos.map((p, i) => aProyecto(p, datos[i].listas, datos[i].tareas, mapeo));
  for (const p of crudos) {
    if (!p.fecha_entrega) console.warn(`[zoho] ${p.nombre}: fecha final no reconocida`);
  }
  return { proyectos: crudos, avisos };
}

function aProyecto(p: any, listas: any[], tareas: any[], mapeo: any): ProyectoCrudo {
  const porLista = new Map<string, any[]>();
  for (const t of tareas) {
    if (t.parent_task_id || t.parental_info?.parent_task_id) continue; // VERIFICAR: subtareas fuera de la ruta
    const id = String(t.tasklist?.id ?? t.tasklist_id ?? 'sin-lista');
    porLista.set(id, [...(porLista.get(id) ?? []), t]);
  }
  const nombres = new Map<string, string>(listas.map(l => [String(l.id), String(l.name ?? '')]));
  for (const t of tareas) {
    const id = String(t.tasklist?.id ?? t.tasklist_id ?? 'sin-lista');
    if (!nombres.has(id)) nombres.set(id, String(t.tasklist?.name ?? 'Sin lista'));
  }
  const resultado: ListaCruda[] = [...nombres].filter(([id]) => porLista.has(id)).map(([id, nombre]) => ({
    id, nombre, tareas: (porLista.get(id) ?? []).sort((a, b) => ordenTarea(a) - ordenTarea(b)).map(t => aTarea(t, mapeo)),
  }));
  return {
    id: String(p.id), nombre: String(p.name), estado: estadoProyecto(p), cliente: campo(p, mapeo.cliente.campo) ?? '',
    fecha_entrega: fechaZoho(p) ?? '', url: p.link?.web?.url, listas: resultado,
  };
}

function aTarea(t: any, mapeo: any): TareaCruda {
  return {
    id: String(t.id), clave: t.key ? String(t.key) : undefined, nombre: String(t.name ?? ''),
    equipo: equipoDe(t, mapeo.equipo.campo),
    estado: String(t.status?.name ?? t.status ?? ''),
    horas_estimadas: horas(t.owners_and_work?.total_work),                 // VERIFICAR: total de la tarea, no por persona
    horas_registradas: horas(t.log_hours?.total_hours ?? t.log_hours?.total ?? 0), // VERIFICAR nombre del campo
    url: t.link?.web?.url,
  };
}

/** Orden dentro de la lista: secuencia de Zoho si viene; si no, el número de la clave (A52Y-T37 → 37). VERIFICAR. */
function ordenTarea(t: any): number {
  const sec = Number(t.sequence ?? t.order_sequence ?? t.order);
  if (Number.isFinite(sec)) return sec;
  const n = String(t.key ?? '').match(/-T(\d+)$/i);
  return n ? Number(n[1]) : Number.MAX_SAFE_INTEGER;
}

/** "Equipo asignado": equipos de Zoho o campo personalizado con ese nombre. VERIFICAR. */
function equipoDe(t: any, nombreCampo: string): string | null {
  const equipo = t.teams?.[0]?.name ?? t.associated_teams?.[0]?.name;
  return equipo ? String(equipo) : campo(t, nombreCampo);
}

function campo(x: any, nombre: string): string | null {
  const cf = x.custom_fields ?? x.custom_fields_values ?? [];
  const hit = Array.isArray(cf) ? cf.find((c: any) => c.label_name === nombre || c.name === nombre || c.display_name === nombre) : cf[nombre];
  const v = hit?.value ?? (typeof hit === 'string' ? hit : null);
  return v == null || v === '' ? null : String(Array.isArray(v) ? v[0] : v);
}

/** Horas: número, "12", "12.5" o "12:30". */
export function horas(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim();
  const hm = s.match(/^(\d+):(\d{1,2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function estadoProyecto(p: any): string {
  return String(p.status?.name ?? p.custom_status_name ?? p.status ?? '');
}
