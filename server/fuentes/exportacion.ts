// Lectura de una exportación de tareas de Zoho Projects a Excel (.xlsx): proyectos SO-… → listas → tareas.
// La exportación de "Todos los proyectos" trae Nombre de Tarea, Horas de trabajo, Estado personalizado,
// Diferencia y Nombre del proyecto; si además trae la lista de tareas o el equipo asignado, se usan.
// Sin la lista de tareas los ítems se deducen del orden de las tareas (deducirListas). Ver docs/ZOHO.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readSheet } from 'read-excel-file/universal';
import { baseTarea, crearClasificador, leerEstado, norm } from '../../shared/ruta.ts';
import type { CentroConfig, ListaCruda, ProyectoCrudo, ReglasLectura, TareaCruda } from '../../shared/tipos.ts';

export interface Exportacion { proyectos: ProyectoCrudo[]; avisos: string[] }

/** Títulos de columna que se reconocen (sin tildes ni mayúsculas). */
const COLUMNAS = {
  tarea: ['nombre de tarea', 'nombre de la tarea', 'tarea'],
  proyecto: ['nombre del proyecto', 'proyecto'],
  estado: ['estado personalizado', 'estado'],          // el personalizado manda si vienen los dos
  horas: ['horas de trabajo', 'trabajo', 'horas estimadas'],
  diferencia: ['diferencia'],
  registradas: ['horas registradas', 'registros de tiempo'],
  lista: ['lista de tareas', 'nombre de la lista de tareas', 'lista'],
  equipo: ['equipo asignado', 'equipo'],
} as const;
type Columna = keyof typeof COLUMNAS;

const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/** Horas de una celda: "09:00" → 9 · "(-) 04:30" → −4.5 · "(+) 01:45" → 1.75 · 2.5 → 2.5. null si no se entiende. */
export function horasExport(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return (v.getTime() - EPOCA_EXCEL) / 3_600_000;  // celda con formato de hora
  const s = String(v).trim();
  const hm = s.match(/^(?:\(\s*([+-])\s*\)|([+-]))?\s*(\d+):([0-5]\d)$/);
  if (hm) {
    const h = Number(hm[3]) + Number(hm[4]) / 60;
    return (hm[1] ?? hm[2]) === '-' ? -h : h;
  }
  const dec = s.replace(',', '.').match(/^([+-])?\s*(\d+(?:\.\d+)?)$/);
  return dec ? Number(dec[2]) * (dec[1] === '-' ? -1 : 1) : null;
}

const texto = (v: unknown) => (v == null ? '' : String(v).trim());
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Código del cliente en el nombre del proyecto: "SO-11338-SMT-1" → "SMT". */
export const clienteDe = (proyecto: string) => proyecto.match(/^\s*SO-\d+-([^-\s]+)/i)?.[1]?.toUpperCase() ?? '';

/** Filas de la hoja (la primera con los títulos) → proyectos con sus listas y tareas, en el orden de la hoja. */
export function proyectosDesdeFilas(filas: unknown[][], reglas: ReglasLectura, centros: CentroConfig[]): Exportacion {
  const iTitulos = filas.slice(0, 10).findIndex(f => f.some(c => COLUMNAS.tarea.includes(norm(texto(c)) as never)));
  const titulos = (filas[iTitulos] ?? []).map(c => norm(texto(c)));
  const col = (k: Columna) => {
    for (const nombre of COLUMNAS[k]) { const i = titulos.indexOf(nombre); if (i >= 0) return i; }
    return -1;
  };
  const c = Object.fromEntries((Object.keys(COLUMNAS) as Columna[]).map(k => [k, col(k)])) as Record<Columna, number>;
  if (c.tarea < 0 || c.proyecto < 0) {
    throw new Error(`La exportación no trae las columnas "Nombre de Tarea" y "Nombre del proyecto" (títulos: ${titulos.filter(Boolean).join(', ') || 'ninguno'})`);
  }

  const porProyecto = new Map<string, { lista: string; t: TareaCruda }[]>();
  let otras = 0;
  filas.slice(iTitulos + 1).forEach((f, k) => {
    const proyecto = texto(f[c.proyecto]), nombre = texto(f[c.tarea]);
    if (!proyecto || !nombre) return;
    if (!/^\s*SO-/i.test(proyecto)) { otras++; return; }
    const estimadas = Math.max(horasExport(f[c.horas]) ?? 0, 0);
    const registradas = c.registradas >= 0 ? horasExport(f[c.registradas]) ?? 0
      : c.diferencia >= 0 ? estimadas - (horasExport(f[c.diferencia]) ?? estimadas) : 0;   // diferencia = estimadas − registradas
    const t: TareaCruda = {
      id: `fila-${iTitulos + k + 2}`,   // número de fila en Excel
      nombre, equipo: c.equipo >= 0 ? texto(f[c.equipo]) || null : null,
      estado: c.estado >= 0 ? texto(f[c.estado]) : '',
      horas_estimadas: r2(estimadas), horas_registradas: r2(Math.max(registradas, 0)),
    };
    const lista = c.lista >= 0 ? texto(f[c.lista]) : '';
    porProyecto.set(proyecto, [...(porProyecto.get(proyecto) ?? []), { lista, t }]);
  });

  const proyectos: ProyectoCrudo[] = [...porProyecto].map(([nombre, filasP]) => ({
    id: nombre, nombre, estado: '', cliente: clienteDe(nombre), fecha_entrega: '',
    listas: c.lista >= 0 ? agruparPorLista(nombre, filasP) : deducirListas(nombre, filasP.map(x => x.t), reglas, centros),
  }));

  const tareas = proyectos.reduce((s, p) => s + p.listas.reduce((n, l) => n + l.tareas.length, 0), 0);
  const avisos = [`Exportación de Zoho: ${tareas} tareas de ${proyectos.length} SO (solo lo que trae el archivo)`];
  const faltan = [c.lista < 0 && 'la lista de tareas', c.equipo < 0 && 'el equipo asignado'].filter(Boolean);
  if (faltan.length) {
    avisos.push(`La exportación no trae ${faltan.join(' ni ')}: ${c.lista < 0 ? 'los ítems se dedujeron del orden de las tareas ("Grupo 1, 2…")' : ''}${faltan.length === 2 ? ' y ' : ''}${c.equipo < 0 ? 'el proceso, del nombre de la tarea' : ''}`);
  }
  if (c.registradas < 0 && c.diferencia < 0) avisos.push('La exportación no trae horas registradas ni la diferencia: se toma todo lo estimado como pendiente');
  if (otras) avisos.push(`${otras} tareas de proyectos que no son SO- (ignoradas)`);
  return { proyectos, avisos };
}

/** Con la columna de lista de tareas: una lista por nombre, en el orden en que aparecen. */
function agruparPorLista(proyecto: string, filas: { lista: string; t: TareaCruda }[]): ListaCruda[] {
  const listas = new Map<string, ListaCruda>();
  for (const { lista, t } of filas) {
    const nombre = lista || 'Sin lista';
    if (!listas.has(nombre)) listas.set(nombre, { id: `${proyecto}-l${listas.size + 1}`, nombre, tareas: [] });
    listas.get(nombre)!.tareas.push(t);
  }
  return [...listas.values()];
}

/** Sin la lista de tareas: agrupa las tareas de un SO en ítems ("Grupo 1, 2…") según su orden en la hoja.
 *  Empieza un grupo nuevo cuando:
 *  1. se repite una tarea con el mismo nombre ("Erosionado (#1)" y "(#2)" son distintas: van en la misma ruta);
 *  2. después de un acabado (servicio externo o puesto manual, como grabado) viene trabajo de máquina o programación;
 *  3. cambia el estado viejo "Material Pendiente" (Zoho lo ponía en todas las tareas de un ítem).
 *  Programación y Set Up se van con la operación que preparan. Ensamble, calidad y envío van a la lista Cierre. */
export function deducirListas(proyecto: string, tareas: TareaCruda[], reglas: ReglasLectura, centros: CentroConfig[]): ListaCruda[] {
  const clasificar = crearClasificador(reglas, centros);
  const setUp = new RegExp(reglas.tareas.set_up, 'i');
  type Paso = { t: TareaCruda; prepara: boolean; acabado: boolean };
  type Grupo = { pasos: Paso[]; nombres: Set<string>; material: boolean };
  const grupos: Grupo[] = [];
  const cierre: TareaCruda[] = [];

  for (const t of tareas) {
    const { tipo, centro } = clasificar(t);
    if (tipo === 'cierre') { cierre.push(t); continue; }
    const paso: Paso = {
      t,
      prepara: tipo === 'programacion' || (tipo === 'maquina' && setUp.test(baseTarea(t.nombre))),
      acabado: tipo === 'externo' || centro?.tipo === 'puesto',
    };
    const material = leerEstado(t.estado, reglas.estados).falta_material;
    const clave = norm(t.nombre);
    const g = grupos.at(-1);
    let arrastre: Paso[] = [];
    let nuevo = !g;
    if (g) {
      if (g.nombres.has(clave)) {
        nuevo = true;
        // La programación o el Set Up que quedaron al final del grupo preparan esta operación: se van con ella.
        let k = g.pasos.length;
        while (k > 1 && g.pasos[k - 1].prepara) k--;
        arrastre = g.pasos.splice(k);
      } else if (!paso.acabado && g.pasos.at(-1)!.acabado) nuevo = true;
      else if (material !== g.material) nuevo = true;
    }
    if (nuevo) {
      const pasos = [...arrastre, paso];
      grupos.push({ pasos, nombres: new Set(pasos.map(p => norm(p.t.nombre))), material });
    } else {
      g!.pasos.push(paso);
      g!.nombres.add(clave);
    }
  }

  const listas: ListaCruda[] = grupos.map((g, k) => ({ id: `${proyecto}-g${k + 1}`, nombre: `Grupo ${k + 1}`, tareas: g.pasos.map(p => p.t) }));
  if (cierre.length) listas.push({ id: `${proyecto}-cierre`, nombre: 'Cierre', tareas: cierre });
  return listas;
}

/** El .xlsx más reciente de una carpeta (o el archivo indicado). */
export function buscarExportacion(ruta: string): { archivo: string; fecha: Date } {
  let st;
  try { st = statSync(ruta); } catch { throw new Error(`No existe ${ruta}: guarda ahí la exportación de tareas de Zoho (.xlsx)`); }
  if (st.isFile()) return { archivo: ruta, fecha: st.mtime };
  const xs = readdirSync(ruta)
    .filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$'))   // ~$… = archivo temporal de Excel abierto
    .map(f => ({ archivo: join(ruta, f), fecha: statSync(join(ruta, f)).mtime }))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  if (!xs.length) throw new Error(`No hay ninguna exportación (.xlsx) en ${ruta}`);
  return xs[0];
}

export async function leerExportacion(ruta: string, reglas: ReglasLectura, centros: CentroConfig[]): Promise<Exportacion & { datos_de: string }> {
  const { archivo, fecha } = buscarExportacion(ruta);
  const b = readFileSync(archivo);
  // La versión /node no abre los .xlsx de Zoho (falla al descomprimir); la universal con un ArrayBuffer sí.
  const filas = await readSheet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const r = proyectosDesdeFilas(filas as unknown[][], reglas, centros);
  r.avisos[0] += ` · archivo ${basename(archivo)}`;
  return { ...r, datos_de: fecha.toISOString() };
}
