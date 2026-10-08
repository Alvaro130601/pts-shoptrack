// Arma la app como página estática para publicarla en claude.ai (sin servidor): el plan se calcula en el navegador
// con los datos de la fuente configurada (DATA_SOURCE), los ajustes van a la base compartida de la página y el
// asistente usa la cuenta de Claude de quien la abre. Uso: npm run build && DATA_SOURCE=excel npm run pagina
// Con PAGINA_ZOHO=1 la página lee Zoho en vivo con el conector Zoho Projects de quien la abre (capacidad mcp) y los
// datos de DATA_SOURCE quedan de respaldo mientras llega o si no se puede leer.
// DATA_SOURCE=zoho-copia: el respaldo sale de una copia de la API de Zoho guardada en data/zoho-copia/ (proyectos.json y
// tareas.json, tal como los devuelve la API), con los mismos filtros de la vista que la lectura en vivo.
// Sale en dist-pagina/ (no se sube: con DATA_SOURCE=excel, zoho o zoho-copia lleva datos reales).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cargarCentros, cargarFeriados, cargarMapeoZoho, cargarMaquinas, cargarReglasLectura, hoyCR, rutaRaiz } from '../server/config.ts';
import { leerExportacion } from '../server/fuentes/exportacion.ts';
import { generarSeed } from '../server/fuentes/seed.ts';
import { leerZoho } from '../server/fuentes/zoho.ts';
import { proyectosDeZoho } from '../shared/zoho.ts';
import type { ProyectoCrudo } from '../shared/tipos.ts';

const pedida = process.env.DATA_SOURCE ?? 'seed';
const fuente = (pedida === 'zoho-copia' ? 'zoho' : pedida) as 'seed' | 'zoho' | 'excel';
const zohoEnVivo = !!process.env.PAGINA_ZOHO;
const dist = join(rutaRaiz, 'dist'), salida = join(rutaRaiz, 'dist-pagina');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Falta dist/: corre primero npm run build');

const feriados = cargarFeriados(), hoy = hoyCR(), reglas = cargarReglasLectura(), centros = cargarCentros();
/** Copia guardada de la API de Zoho → mismos proyectos que la lectura en vivo (respeta el estado del proyecto). */
function leerCopiaZoho(dir: string) {
  const archivo = (n: string) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
  const l = proyectosDeZoho(archivo('proyectos.json'), archivo('tareas.json'), cargarMapeoZoho());
  return { proyectos: l.proyectos, avisos: l.avisos.map(x => x.replace(/^Zoho en vivo:/, 'Copia de Zoho:')),
    datos_de: process.env.ZOHO_COPIA_FECHA ?? statSync(join(dir, 'tareas.json')).mtime.toISOString() };
}
const leido: { proyectos: ProyectoCrudo[]; avisos: string[]; datos_de?: string } = pedida === 'zoho-copia' ? leerCopiaZoho(process.env.ZOHO_COPIA ?? join(rutaRaiz, 'data/zoho-copia'))
  : fuente === 'zoho' ? await leerZoho()
  : fuente === 'excel' ? await leerExportacion(process.env.EXPORT_PATH ?? join(rutaRaiz, 'data/exportaciones'), reglas, centros)
    : { proyectos: generarSeed(hoy, feriados), avisos: ['Demo con datos simulados (clientes y SO ficticios)'] };

rmSync(salida, { recursive: true, force: true });
mkdirSync(join(salida, 'demo'), { recursive: true });
cpSync(join(dist, 'assets'), join(salida, 'assets'), { recursive: true, filter: f => !f.endsWith('.css') });
writeFileSync(join(salida, 'demo/datos.json'), JSON.stringify({
  ...leido, maquinas: cargarMaquinas(), centros, reglas, fuente, hoy, feriados: [...feriados],
  ...(zohoEnVivo && { zoho: (({ portal, proyectos, vista }) => ({ portal, proyectos, vista }))(cargarMapeoZoho()) }),
}));
cpSync(join(rutaRaiz, 'data/layout/planta_pts.json'), join(salida, 'demo/layout.json'));

// index.html con el CSS adentro (la página publicada no carga hojas de estilo propias) y la configuración.
// En ASCII puro (escapes CSS): así el CSS se lee igual aunque el HTML llegue sin charset.
const css = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.css')).map(f => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n')
  .replace(/[^\x00-\x7f]/gu, c => `\\${c.codePointAt(0)!.toString(16)} `);
const js = readdirSync(join(dist, 'assets')).find(f => /^index-.*\.js$/.test(f));
const titulo = zohoEnVivo ? 'ShopTrack Zoho en vivo' : fuente === 'seed' ? 'PTS ShopTrack' : `ShopTrack ${fuente === 'excel' ? 'exportación' : 'Zoho'} ${new Date(String(leido.datos_de ?? hoy)).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '')}`;
writeFileSync(join(salida, 'index.html'), `<title>${titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
/* Misma apariencia clara que la app (un solo tema, pensado para PC de supervisión). */
:root { --fondo: #eef1f8; color-scheme: light; }
html, body { height: 100%; }
body { background: var(--fondo); }
${css}
</style>
<script>window.SHOPTRACK_PAGINA = { datos: 'demo/datos.json', layout: 'demo/layout.json'${zohoEnVivo ? ', zoho: true' : ''} };</script>
<div id="root"></div>
<script type="module" src="assets/${js}"></script>
`);
console.log(`Página en ${salida} · fuente=${fuente}${zohoEnVivo ? ' (respaldo) · Zoho en vivo con el conector' : ''} · ${leido.proyectos.length} proyectos`);
