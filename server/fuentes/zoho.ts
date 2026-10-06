// Lectura de Zoho Projects (portal ptsportal388). ESTADO: esqueleto.
// Los nombres de endpoints/campos marcados con VERIFICAR se confirman en la sesión 1 (docs/ZOHO.md).
import type { MaquinaConfig, Operacion, Fase, EstadoCola } from '../../shared/tipos.ts';
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

export async function leerZoho(maquinas: MaquinaConfig[]): Promise<{ ops: Operacion[]; avisos: string[] }> {
  const mapeo = cargarMapeoZoho();
  const portal = env('ZOHO_PORTAL_ID');
  const avisos: string[] = [];
  const porNombre = new Map(maquinas.filter(m => m.zoho_nombre).map(m => [norm(m.zoho_nombre!), m.id]));
  if (!porNombre.size) avisos.push('Ninguna máquina tiene zoho_nombre en config/maquinas.json');

  // VERIFICAR rutas v3: /api/v3/portal/{portal}/projects y /api/v3/portal/{portal}/projects/{id}/tasks
  const proyectos = (await todas<any>(`/api/v3/portal/${portal}/projects`, 'projects'))
    .filter(p => String(p.name ?? '').startsWith('SO-'))
    .filter(p => !mapeo.fase.excluir_estados.includes(estadoProyecto(p)));

  const tareasPorProyecto = await enParalelo(proyectos, 5,
    p => todas<any>(`/api/v3/portal/${portal}/projects/${p.id}/tasks`, 'tasks'));

  const ops: Operacion[] = [];
  proyectos.forEach((p, ip) => {
    const fase = estadoProyecto(p) as Fase;
    const tareas = tareasPorProyecto[ip];
    const fechaEntrega = fechaZoho(p);
    if (!fechaEntrega) console.warn(`[zoho] ${p.name}: fecha final no reconocida`, { end_date: p.end_date, end_date_long: p.end_date_long });
    const texto = JSON.stringify(tareas.map(t => [t.name, t.tasklist?.name]));
    const ext = texto.includes(mapeo.flags_proyecto.servicio_externo.texto);
    const ens = texto.includes(mapeo.flags_proyecto.ensamble.texto);
    for (const t of tareas) {
      if (!String(t.name ?? '').startsWith(mapeo.tareas_horas.prefijo)) continue;
      const estTarea = String(t.status?.name ?? t.status ?? '');
      if (mapeo.estado_tarea.terminada.includes(estTarea)) continue;
      const crudo = maquinaDeTarea(t, mapeo);
      const horas = Number(t.owners_and_work?.total_work ?? 0) || 0; // VERIFICAR formato ("12:30" vs número)
      const estado: EstadoCola = fase !== 'Producción' ? 'por_liberar'
        : mapeo.estado_tarea.en_proceso.includes(estTarea) ? 'en_proceso' : 'en_cola';
      if (!['Producción', 'Pend. programación', 'Pend. planos', 'Pend. material'].includes(fase)) continue;
      ops.push({
        id: String(t.id), so: String(p.name).split(/\s/)[0], proyecto_id: String(p.id),
        cliente: String(p.custom_fields?.[mapeo.cliente.campo] ?? ''), descripcion: String(t.name),
        maquina_id: crudo ? porNombre.get(norm(crudo)) ?? null : null, maquina_zoho: crudo,
        fase, estado_cola: estado, horas_totales: horas,
        horas_pendientes: horas, // VERIFICAR: ¿Zoho da horas registradas/avance para restar?
        fecha_entrega: fechaEntrega ?? '', // vacía → armarEstado la aparta con aviso
        requiere_servicio_externo: ext, requiere_ensamble: ens,
        url_zoho: p.link?.web?.url,
      });
    }
  });
  return { ops, avisos };
}

function estadoProyecto(p: any): string {
  return String(p.status?.name ?? p.custom_status_name ?? p.status ?? '');
}
function maquinaDeTarea(t: any, mapeo: any): string | null {
  const m = mapeo.maquina;
  switch (m.fuente) {
    case 'campo_personalizado': {
      const cf = t.custom_fields ?? t.custom_fields_values ?? [];
      const hit = Array.isArray(cf) ? cf.find((c: any) => c.label_name === m.campo || c.name === m.campo) : cf[m.campo];
      return hit ? String(hit.value ?? hit) : null;
    }
    case 'etiqueta': return t.tags?.[0]?.name ?? null;
    case 'nombre_tarea': return String(t.name).match(new RegExp(m.regex_nombre_tarea))?.[1] ?? null;
    case 'lista_tareas': return t.tasklist?.name ?? null;
    default: return null;
  }
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
