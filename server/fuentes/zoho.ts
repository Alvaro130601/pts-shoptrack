// Lectura de Zoho Projects desde el servidor (OAuth con Self Client): la vista "Carga de trabajo" del portal
// ptsportal388. La selección y la conversión están en shared/zoho.ts (las mismas que usa la página publicada con
// el conector de claude.ai); aquí solo va la llamada HTTP. Ver docs/ZOHO.md.
import { leerZohoCon, type HerramientaZoho, type LecturaZoho } from '../../shared/zoho.ts';
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

async function get(ruta: string, params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(ruta, env('ZOHO_PROJECTS_API'));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` } });
  if (res.status === 204) return {};
  if (!res.ok) throw new Error(`Zoho ${res.status} en ${url.pathname}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function leerZoho(): Promise<LecturaZoho> {
  const mapeo = cargarMapeoZoho();
  const portal = process.env.ZOHO_PORTAL_ID || mapeo.portal.id;
  // Las mismas operaciones que las herramientas del conector. Probadas por el conector; por OAuth, VERIFICAR en la
  // primera conexión que la ruta de tareas de todo el portal sea esta.
  const rutas: Record<HerramientaZoho, string> = {
    get_projects_list: `/api/v3/portal/${portal}/projects`,
    get_tasks_by_portal: `/api/v3/portal/${portal}/tasks`,
  };
  return leerZohoCon((h, consulta) => get(rutas[h], consulta), mapeo);
}
