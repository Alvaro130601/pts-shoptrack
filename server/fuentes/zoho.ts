// Lectura de Zoho Projects (portal ptsportal388). ESTADO: esqueleto.
// Los nombres de endpoints/campos marcados con VERIFICAR se confirman en la sesión 1 (docs/ZOHO.md).
import type { MaquinaConfig, Operacion, Fase, EstadoCola } from '../../shared/tipos.ts';
import { cargarMapeoZoho } from '../config.ts';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable ${k} en .env`);
  return v;
};

let token: { valor: string; vence: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.vence - 60_000) return token.valor;
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
  const out: T[] = [];
  for (let page = 1; page < 200; page++) {
    const j = await get<any>(ruta, { page, per_page: porPagina });
    const lote: T[] = j[clave] ?? [];
    out.push(...lote);
    if (lote.length < porPagina) break;
  }
  return out;
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

  const ops: Operacion[] = [];
  for (const p of proyectos) {
    const fase = estadoProyecto(p) as Fase;
    const tareas = await todas<any>(`/api/v3/portal/${portal}/projects/${p.id}/tasks`, 'tasks');
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
        fecha_entrega: String(p.end_date ?? '').slice(0, 10),
        requiere_servicio_externo: ext, requiere_ensamble: ens,
        url_zoho: p.link?.web?.url,
      });
    }
  }
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
