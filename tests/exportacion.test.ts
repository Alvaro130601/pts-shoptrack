import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import centrosJson from '../config/centros.json';
import maquinasJson from '../config/maquinas.json';
import { armarEstado } from '../shared/plan.ts';
import { normalizarProyectos } from '../shared/ruta.ts';
import type { CentroConfig, MaquinaConfig, ProyectoCrudo, ReglasLectura } from '../shared/tipos.ts';
import { clienteDe, horasExport, proyectosDesdeFilas } from '../server/fuentes/exportacion.ts';

const reglas = mapeo.lectura as ReglasLectura;
const centros = centrosJson.centros as CentroConfig[];
const TITULOS = ['Nombre de Tarea', 'Horas de trabajo', 'Estado personalizado', 'Diferencia', 'Nombre del proyecto'];
const PO = 'Pendiente Operación', MP = 'Material Pendiente';

/** Filas como las de la exportación de Zoho: [tarea, horas, estado, diferencia]. */
const hoja = (proyecto: string, ...tareas: (string | [string, string?, string?, string?])[]) =>
  tareas.map(x => {
    const [nombre, horas = '02:00', estado = PO, dif] = typeof x === 'string' ? [x] : x;
    return [nombre, horas, estado, dif ?? `(+) ${horas}`, proyecto];
  });
const leer = (...filas: unknown[][]) => proyectosDesdeFilas([TITULOS, ...filas], reglas, centros);
const grupos = (p: ProyectoCrudo) => p.listas.map(l => [l.nombre, l.tareas.map(t => t.nombre.replace(/^H\. /, ''))]);

describe('horasExport', () => {
  it('lee hh:mm con signo, decimales y celdas con formato de hora', () => {
    expect(horasExport('09:00')).toBe(9);
    expect(horasExport('00:45')).toBe(0.75);
    expect(horasExport('(+) 01:45')).toBe(1.75);
    expect(horasExport('(-) 04:30')).toBe(-4.5);
    expect(horasExport('00:00')).toBe(0);
    expect(horasExport(2.5)).toBe(2.5);
    expect(horasExport('2,5')).toBe(2.5);
    expect(horasExport(new Date(Date.UTC(1899, 11, 31, 6)))).toBe(30); // 30:00 guardado como 1,25 días
    expect(horasExport('')).toBeNull();
    expect(horasExport('mucho')).toBeNull();
  });
  it('saca el cliente del nombre del proyecto', () => {
    expect(clienteDe('SO-1001-ABC-1')).toBe('ABC');
    expect(clienteDe('SO-1002-A&B-2')).toBe('A&B');
    expect(clienteDe('Mantenimiento')).toBe('');
  });
});

describe('proyectosDesdeFilas', () => {
  it('agrupa por proyecto, ignora lo que no es SO y calcula las horas registradas con la diferencia', () => {
    const { proyectos, avisos } = leer(
      ...hoja('SO-1001-ABC-1', ['H. Erosionado', '02:30', PO, '(-) 04:30'], ['H. Grabado', '00:30']),
      ['H. Fresado', '01:00', PO, '(+) 01:00', 'Mantenimiento planta'],
      ...hoja('SO-1002-XYZ-1', ['H. Torno CNC', '09:00', 'En Producción', '(+) 06:00']),
    );
    expect(proyectos.map(p => [p.nombre, p.cliente, p.fecha_entrega])).toEqual([['SO-1001-ABC-1', 'ABC', ''], ['SO-1002-XYZ-1', 'XYZ', '']]);
    const [ero] = proyectos[0].listas[0].tareas;
    expect([ero.horas_estimadas, ero.horas_registradas, ero.estado, ero.equipo]).toEqual([2.5, 7, PO, null]);
    expect(proyectos[1].listas[0].tareas[0].horas_registradas).toBe(3);
    expect(avisos.some(a => a.includes('1 tareas de proyectos que no son SO-'))).toBe(true);
    expect(avisos.some(a => a.includes('no trae la lista de tareas ni el equipo asignado'))).toBe(true);
  });

  it('da ids estables: proyecto + nombre + repetición, no el número de fila', () => {
    const a = leer(...hoja('SO-1001-ABC-1', 'H. Grabado', 'H. Fresado CNC (#1)', 'H. Grabado')).proyectos[0];
    const b = leer(['H. Otra', '01:00', PO, '(+) 01:00', 'SO-0999-XYZ-1'],
      ...hoja('SO-1001-ABC-1', 'H. Grabado', 'H. Fresado CNC (#1)', 'H. Grabado')).proyectos[1];
    const ids = (p: ProyectoCrudo) => p.listas.flatMap(l => l.tareas.map(t => t.id));
    expect(ids(a)).toEqual(['SO-1001-ABC-1/grabado/1', 'SO-1001-ABC-1/fresado-cnc-(#1)/1', 'SO-1001-ABC-1/grabado/2']);
    expect(ids(b)).toEqual(ids(a));
  });

  it('usa la lista de tareas y el equipo si la exportación los trae', () => {
    const { proyectos, avisos } = proyectosDesdeFilas([
      ['Nombre del proyecto', 'Lista de tareas', 'Nombre de Tarea', 'Equipo asignado', 'Estado', 'Horas de trabajo'],
      ['SO-1003-ABC-1', 'Ítem 2 (4 unidades)', 'H. Fresado CNC', 'Fresado CNC', 'Pendiente', '03:00'],
      ['SO-1003-ABC-1', 'Ítem 5 (1 unidad)', 'H. Fresado CNC', 'Fresado CNC', 'Pendiente', '01:00'],
      ['SO-1003-ABC-1', 'Ítem 2 (4 unidades)', 'H. Anodizado', 'No Requiere', 'Pendiente', '00:30'],
    ], reglas, centros);
    expect(grupos(proyectos[0])).toEqual([['Ítem 2 (4 unidades)', ['Fresado CNC', 'Anodizado']], ['Ítem 5 (1 unidad)', ['Fresado CNC']]]);
    expect(proyectos[0].listas[0].tareas[0].equipo).toBe('Fresado CNC');
    expect(avisos.some(a => a.includes('lista de tareas') || a.includes('equipo asignado'))).toBe(false);
    expect(avisos.some(a => a.includes('no trae horas registradas'))).toBe(true);
  });

  it('avisa qué columnas faltan', () => {
    expect(() => proyectosDesdeFilas([['Tarea x', 'Horas']], reglas, centros)).toThrow(/Nombre de Tarea/);
  });
});

describe('ítems deducidos sin la lista de tareas', () => {
  it('una tarea repetida empieza otro ítem; los números (#1), (#2) son pasos de la misma ruta', () => {
    const [a, b] = leer(
      ...hoja('SO-1001-ABC-1', 'H. Programación', 'H. Set Up', 'H. Fresado CNC', 'H. Programación', 'H. Set Up', 'H. Fresado CNC'),
      ...hoja('SO-1002-ABC-1', 'H. Erosionado (#1)', 'H. Programación', 'H. Set Up', 'H. Fresado CNC', 'H. Erosionado (#2)', 'H. Flash Chrome', 'H. Grabado'),
    ).proyectos;
    expect(grupos(a)).toEqual([
      ['Grupo 1', ['Programación', 'Set Up', 'Fresado CNC']],
      ['Grupo 2', ['Programación', 'Set Up', 'Fresado CNC']],
    ]);
    expect(grupos(b)).toEqual([['Grupo 1', ['Erosionado (#1)', 'Programación', 'Set Up', 'Fresado CNC', 'Erosionado (#2)', 'Flash Chrome', 'Grabado']]]);
  });

  it('después de un acabado (servicio externo, grabado) el trabajo de máquina es de otro ítem', () => {
    const [p] = leer(...hoja('SO-1001-ABC-1', 'H. Grabado', 'H. Retrabajo set Up', 'H. Retrabajo fresado CNC', 'H. Anodizado', 'H. Grabado',
      'H. Tratamiento térmico', 'H. Revenido', 'H. Rectificado (Balony)', 'H. Erosionado', 'H. Flash Chrome', 'H. Grabado')).proyectos;
    expect(grupos(p)).toEqual([
      ['Grupo 1', ['Grabado']],
      ['Grupo 2', ['Retrabajo set Up', 'Retrabajo fresado CNC', 'Anodizado', 'Grabado']],
      ['Grupo 3', ['Tratamiento térmico', 'Revenido', 'Rectificado (Balony)', 'Erosionado', 'Flash Chrome', 'Grabado']],
    ]);
  });

  it('el Set Up se va con la operación que prepara y "Material Pendiente" separa ítems', () => {
    const [p] = leer(...hoja('SO-1001-ABC-1', 'H. Fresado CNC', 'H. Torno CNC', 'H. Set Up', 'H. Fresado CNC',
      ['H. Torno', '02:00', MP], ['H. Electroless nykel', '00:30', MP], 'H. Fresado')).proyectos;
    expect(grupos(p)).toEqual([
      ['Grupo 1', ['Fresado CNC', 'Torno CNC']],
      ['Grupo 2', ['Set Up', 'Fresado CNC']],
      ['Grupo 3', ['Torno', 'Electroless nykel']],
      ['Grupo 4', ['Fresado']],
    ]);
  });

  it('ensamble y calidad van a la lista Cierre del SO', () => {
    const [p] = leer(...hoja('SO-1001-ABC-1', 'H. Calidad', 'H. Fresado', 'H. Corte y soldadura', 'H. Ensamble')).proyectos;
    expect(grupos(p)).toEqual([['Grupo 1', ['Fresado', 'Corte y soldadura']], ['Cierre', ['Calidad', 'Ensamble']]]);
    const { sos } = normalizarProyectos([p], reglas, centros);
    expect(sos[0].cierre.map(o => o.tipo)).toEqual(['cierre', 'cierre']);
    expect(sos[0].requiere_ensamble).toBe(true);
  });
});

describe('procesos por el nombre de la tarea (sin equipo asignado)', () => {
  it('reconoce los nombres que usa PTS', () => {
    const nombres = [
      'H. Fresado CNC (Dowels)', 'H. Fresado', 'H. Torno CNC', 'H. Torno', 'H. Torno Suizo', 'H. Erosionado (#2)',
      'H. Retrabajo Erosionado', 'H. Rectificado (Balony)', 'H. Rectificadora (Centerless)', 'H. Tratamiento térmico',
      'H. Revenido', 'H. Doblado', 'H. Soldadura', 'H. Corte y soldadura', 'H. Grabado',
      'H. Limpieza y medición', 'H. Rebabeo', 'H. Flash Chrome', 'H. Anodizado', 'H. Electroless nykel', 'H. Black Oxide',
      'H. Erosionado por penetración', 'H. Hole Popper',
    ];
    // Cada tarea en su propio SO para que el orden no mezcle ítems.
    const filas = nombres.flatMap((x, k) => hoja(`SO-${2000 + k}-ABC-1`, x));
    const { sos } = normalizarProyectos(leer(...filas).proyectos, reglas, centros);
    expect(sos.map(s => s.items[0].ruta[0].centro_id)).toEqual([
      'fresado-cnc', 'fresado', 'torno-cnc', 'torno', 'torno-suizo', 'erosionado',
      'erosionado', 'rectificado', 'rectificado', 'tratamiento',
      'tratamiento', 'doblado', 'soldadura', 'soldadura', 'grabado',
      'limpieza', 'limpieza', 'externo', 'externo', 'externo', 'externo',
      'externo', 'externo',
    ]);
  });

  it('planifica todo con la configuración real: rectificado en las dos rectificadoras y grabado en su puesto', () => {
    const { proyectos } = leer(
      ...hoja('SO-1001-ABC-1', ['H. Rectificado', '08:00'], 'H. Grabado'),
      ...hoja('SO-1002-ABC-1', ['H. Rectificadora (Centerless)', '08:00'], 'H. Grabado'),
      ...hoja('SO-1003-ABC-1', ['H. Retrabajo set Up', '00:30'], ['H. Retrabajo fresado CNC', '03:00']),
    );
    const e = armarEstado({
      proyectos, maquinas: maquinasJson.maquinas as MaquinaConfig[], centros, reglas, fuente: 'excel',
      datos_de: '2026-10-06T19:27:00.000Z', hoy: '2026-10-05', feriados: new Set(),
    });
    expect(e.sin_centro).toEqual([]);
    expect(e.datos_de).toBe('2026-10-06T19:27:00.000Z');
    const rect = e.maquinas.filter(m => m.centro_id === 'rectificado');
    expect(rect.map(m => [m.id, m.taller, m.cola.length])).toEqual([['rectificadora-1', 'taller-1', 1], ['rectificadora-2', 'taller-1', 1]]);
    const grabado = e.centros.find(c => c.id === 'grabado')!;
    expect(grabado.tipo).toBe('puesto');
    expect(grabado.ops.every(o => o.maquina_id === 'grabado-1')).toBe(true);
    const cnc = e.sos.find(s => s.nombre === 'SO-1003-ABC-1')!.items[0].ruta;
    expect(cnc.map(o => [o.nombre, o.centro_id, o.horas_pendientes])).toEqual([['H. Retrabajo set Up + H. Retrabajo fresado CNC', 'fresado-cnc', 3.5]]);
    expect(e.kpis.items_con_fecha).toBe(0);
    expect(e.avisos.some(a => a.includes('Ningún SO trae fecha de entrega'))).toBe(true);
  });
});
