import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerEstado, normalizarProyectos } from '../shared/ruta.ts';
import type { CentroConfig, ReglasLectura } from '../shared/tipos.ts';
import {
  elementos, fechaZoho, filtroProyectos, filtroTareas, horas, leerZohoCon, proyectosDeZoho, type MapeoZoho,
} from '../shared/zoho.ts';

const mapeo = JSON.parse(readFileSync(new URL('../config/zoho-mapeo.json', import.meta.url), 'utf8')) as MapeoZoho & { lectura: ReglasLectura };
const centros: CentroConfig[] = JSON.parse(readFileSync(new URL('../config/centros.json', import.meta.url), 'utf8')).centros;
const reglas = mapeo.lectura;
const ID = mapeo.vista.estados_proyecto;

// Datos ficticios con la forma que devuelve la API v3 (vista por el conector el 6-oct-2026).
const proyecto = (id: string, name: string, estado: string, extra: Record<string, unknown> = {}) => ({
  id, key: `PTS-${id}`, name, status: { id: ID[estado.trim()] ?? '999', name: estado, is_closed_type: false },
  project_group: { id: '1', name: 'Producción' }, start_date: '2026-10-01', end_date: '2026-10-20', ...extra,
});
let sec = 0;
const tarea = (pid: string, lista: [string, string], name: string, estado: string, extra: Record<string, unknown> = {}) => ({
  project: { id: pid, name: `proyecto ${pid}` }, tasklist: { id: lista[0], name: lista[1] },
  id: `${pid}-${++sec}`, prefix: `A1-T${sec}`, name, status: { id: 'x', name: estado, is_closed_type: false },
  teams: [{ id: 't', name: 'Fresado CNC' }], sequence: { sequence: sec },
  owners_and_work: { total_work: '04:30', owners: [{ work_values: '04:30' }, { work_values: '0' }] },
  log_hours: { total_hours: '01:15' }, depth: 0, ...extra,
});

describe('respuestas de Zoho', () => {
  it('saca los elementos con o sin el envoltorio del conector', () => {
    expect(elementos({ status: 'success', data: { page_info: {}, tasks: [1, 2] } }, 'tasks')).toEqual([1, 2]);
    expect(elementos({ status: 'success', data: { result: [3] } }, 'projects')).toEqual([3]);
    expect(elementos({ tasks: [4] }, 'tasks')).toEqual([4]);
    expect(elementos([5], 'projects')).toEqual([5]);
    expect(elementos({}, 'tasks')).toEqual([]);
    expect(() => elementos({ error: { title: 'INVALID_OAUTHTOKEN' } }, 'tasks')).toThrow(/INVALID_OAUTHTOKEN/);
  });

  it('horas en hh:mm y fechas de la API v3', () => {
    expect(horas('45:00')).toBe(45);
    expect(horas('00:30')).toBe(0.5);
    expect(horas('8:11')).toBeCloseTo(8.183, 2);
    expect(horas(undefined)).toBe(0);
    expect(fechaZoho({ end_date: '2026-10-20' })).toBe('2026-10-20');
    expect(fechaZoho({ end_date: '2025-10-09T23:00:00.000Z' })).toBe('2025-10-09');
    expect(fechaZoho({ end_date: '10/30/2026' })).toBe('2026-10-30');
    expect(fechaZoho({})).toBeNull();
    expect(fechaZoho({ end_date: '30-10-2026' })).toBeNull(); // dd-mm ambiguo: no adivinar
  });

  it('filtra en la API como la vista "Carga de trabajo"', () => {
    expect(JSON.parse(filtroProyectos(mapeo.vista)).criteria[0].value).toHaveLength(5);
    const t = JSON.parse(filtroTareas(mapeo.vista));
    expect(t.criteria).toEqual([
      { field_name: 'name', criteria_condition: 'contains', value: ['H.'] },
      { field_name: 'status', criteria_condition: 'is', value: ['${all_open}'] },
    ]);
    expect(t.pattern).toBe('1 AND 2');
  });

  it('estados de la vista', () => {
    expect(leerEstado('En Curso', reglas.estados)).toMatchObject({ estado: 'en_proceso', conocido: true });
    expect(leerEstado('En Producción', reglas.estados)).toMatchObject({ estado: 'en_proceso', conocido: true });
    expect(leerEstado('Pendiente de Operación', reglas.estados)).toMatchObject({ estado: 'pendiente', conocido: true });
    expect(leerEstado('Pendiente Operación', reglas.estados)).toMatchObject({ estado: 'pendiente', conocido: true });
    expect(leerEstado('Material Pendiente', reglas.estados)).toMatchObject({ estado: 'pendiente', falta_material: true });
  });
});

describe('proyectos y tareas de Zoho → SO', () => {
  const proyectos = [
    proyecto('1', 'SO-2001-ABC-1', 'En Producción'),
    proyecto('2', 'SO-2002-XYZ-1', 'Pendiente de Planos ', { end_date: undefined }),     // con espacio de más, sin fecha
    proyecto('3', 'SO-2003-ABC-2', 'Grabado'),                                          // estado fuera de la vista
    proyecto('4', 'Misceláneos - Calidad', 'En Calidad', { project_group: { name: 'Miscelaneos' } }),
    proyecto('5', 'SO-2005-QRS-1', 'En Calidad', { project_group: { name: 'Mantenimiento' } }),
    proyecto('6', 'SO-2006-AUT-1', 'Pendiente de Compra', { project_group: { name: 'Automatizacion' } }),
    proyecto('7', 'SO-2007-ABC-1', 'En Producción'),                                    // sin tareas en la vista
  ];
  const L1: [string, string] = ['l1', 'Ítem 1 (19 unidades)'], L2: [string, string] = ['l2', 'PZA-0018-C (6 und)'];
  const L10: [string, string] = ['l10', 'Ítem 10 (1 und)'];
  sec = 0;
  const tareas = [
    tarea('1', L10, 'H. Fresado', 'Pendiente Operación', { teams: [{ name: 'Fresado' }] }),
    tarea('1', L1, 'H. Torno CNC', 'En Producción', { sequence: { sequence: 3 }, teams: [{ name: 'Torno' }, { name: 'Torno CNC' }] }),
    tarea('1', L1, 'H. Programación', 'Pendiente Operación', { sequence: { sequence: 1 } }),
    tarea('1', L1, 'H. Set Up', 'Pendiente Operación', { sequence: { sequence: 2 }, teams: [{ name: 'Torno CNC' }] }),
    tarea('1', L1, 'H. Grabado', 'Pendiente Operación', { sequence: { sequence: 4 }, teams: [{ name: 'Equipo de Diseño' }] }),
    tarea('1', L1, 'H. Anodizado', 'Servicio Externo', { teams: [{ name: 'No Requiere Equipo' }] }),  // fuera de la vista
    tarea('1', L1, 'H. Rebabeo', 'Pendiente Operación', { depth: 1 }),                               // subtarea
    tarea('2', L2, 'H. Erosionado por penetración', 'Material Pendiente', { teams: [{ name: 'No Requiere Equipo' }] }),
    tarea('2', L2, 'H. Rectificado (#2)', 'Pausado', { teams: [{ name: 'Rectificado' }] }),           // fuera de la vista
    tarea('3', L1, 'H. Grabado', 'Pendiente Operación'),
    tarea('5', L1, 'H. Fresado CNC', 'Pendiente Operación'),
    tarea('6', L1, 'H. Fresado CNC', 'En Curso'),
    tarea('9', L1, 'H. Fresado CNC', 'Pendiente Operación'),                                         // proyecto que no se leyó
  ];
  const { proyectos: crudos, avisos } = proyectosDeZoho(proyectos, tareas, mapeo);

  it('toma los proyectos SO- de los grupos y estados de la vista que tienen tareas', () => {
    expect(crudos.map(p => p.nombre)).toEqual(['SO-2001-ABC-1', 'SO-2002-XYZ-1', 'SO-2006-AUT-1']);
    expect(crudos[0]).toMatchObject({ id: '1', cliente: 'ABC', estado: 'En Producción', fecha_entrega: '2026-10-20' });
    expect(crudos[1]).toMatchObject({ estado: 'Pendiente de Planos', fecha_entrega: '' });
  });

  it('agrupa por lista de tareas, ordena por secuencia y lee horas y equipo', () => {
    const so = crudos[0];
    expect(so.listas.map(l => l.nombre)).toEqual(['Ítem 1 (19 unidades)', 'Ítem 10 (1 und)']);
    expect(so.listas[0].tareas.map(t => t.nombre)).toEqual(['H. Programación', 'H. Set Up', 'H. Torno CNC', 'H. Grabado']);
    const torno = so.listas[0].tareas[2];
    expect(torno).toMatchObject({ equipo: 'Torno CNC', estado: 'En Producción', horas_estimadas: 4.5, horas_registradas: 1.25 });
    expect(torno.clave).toMatch(/^A1-T\d+$/);
  });

  it('avisa lo que la vista deja fuera', () => {
    expect(avisos[0]).toBe('Zoho en vivo: 7 tareas de 3 SO (vista "Carga de trabajo")');
    expect(avisos[1]).toMatch(/^2 tareas abiertas no entran por su estado \(Servicio Externo: 1, Pausado: 1\)/);
    expect(avisos[2]).toBe('1 subtareas no se cuentan en la ruta');
  });

  it('arma la ruta: programación aparte, Set Up con su torno, grabado por nombre y "No Requiere Equipo" afuera', () => {
    const { sos, estados_desconocidos } = normalizarProyectos(crudos, reglas, centros);
    expect(estados_desconocidos).toEqual([]);
    const [item1, item10] = sos[0].items;
    expect(item1).toMatchObject({ nombre: 'Ítem 1', cantidad: 19 });
    expect(item10).toMatchObject({ nombre: 'Ítem 10', cantidad: 1 });
    expect(item1.ruta.map(o => [o.tipo, o.centro_id])).toEqual([
      ['programacion', 'programacion'], ['maquina', 'torno-cnc'], ['maquina', 'grabado'],
    ]);
    expect(item1.ruta[1].nombre).toBe('H. Set Up + H. Torno CNC');
    const uvrs = sos[1].items[0];
    expect(uvrs).toMatchObject({ nombre: 'PZA-0018-C', cantidad: 6 });
    expect(uvrs.ruta.map(o => [o.tipo, o.centro_id])).toEqual([['material', null], ['externo', 'externo']]);
    expect(sos[2].items[0].ruta[0].estado_tarea).toBe('en_proceso');   // "En Curso"
  });
});

describe('leerZohoCon', () => {
  it('pide todas las páginas: tareas según page_info, proyectos hasta una página vacía', async () => {
    const llamadas: string[] = [];
    const pagProy = [[proyecto('1', 'SO-2001-ABC-1', 'En Producción')], [proyecto('8', 'SO-2008-ABC-1', 'En Calidad')], []];
    sec = 0;
    const pagTareas = [
      [tarea('1', ['l1', 'Ítem 1 (2 unidades)'], 'H. Fresado CNC', 'Pendiente Operación')],
      [tarea('8', ['l2', 'Ítem 1 (1 unidad)'], 'H. Torno CNC', 'En Producción', { teams: [{ name: 'Torno CNC' }] })],
    ];
    const r = await leerZohoCon(async (h, q) => {
      llamadas.push(`${h}:${q.page}`);
      expect(q.per_page).toBe(200);
      const i = Number(q.page) - 1;
      if (h === 'get_projects_list') return { status: 'success', data: { result: pagProy[i] } };
      return { status: 'success', data: { page_info: { page: q.page, has_next_page: i < pagTareas.length - 1 }, tasks: pagTareas[i] } };
    }, mapeo);
    expect(llamadas).toEqual(['get_projects_list:1', 'get_projects_list:2', 'get_projects_list:3', 'get_tasks_by_portal:1', 'get_tasks_by_portal:2']);
    expect(r.proyectos.map(p => p.nombre)).toEqual(['SO-2001-ABC-1', 'SO-2008-ABC-1']);
  });

  it('no se queda dando vueltas si la API repite la misma página', async () => {
    let n = 0;
    await leerZohoCon(async h => { n++; return h === 'get_projects_list' ? [proyecto('1', 'SO-1-A-1', 'En Producción')] : { tasks: [] }; }, mapeo);
    expect(n).toBe(3);   // proyectos: página 1 y la 2 repetida; tareas: una vacía
  });
});
