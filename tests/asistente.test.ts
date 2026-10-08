import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import { armarEstado } from '../shared/plan.ts';
import { ErrorHerramienta, HERRAMIENTAS, contextoPlanta, ejecutarHerramienta, type Contexto } from '../shared/asistente.ts';
import type { Ajuste, CentroConfig, ListaCruda, MaquinaConfig, ProyectoCrudo, ReglasLectura, TareaCruda } from '../shared/tipos.ts';

const reglas = mapeo.lectura as ReglasLectura;
const maquina = (id: string, nombre: string): MaquinaConfig =>
  ({ id, nombre, taller: null, proceso: null, capacidad_horas_dia: 8, es_centro_mecanizado: true, activa: true });
const MAQUINAS = [maquina('haas-1', 'Haas #1'), maquina('haas-2', 'Haas #2'), maquina('torno', 'Torno Hyundai')];
const CENTROS: CentroConfig[] = [
  { id: 'cnc', nombre: 'Fresado CNC', tipo: 'maquina', equipos_zoho: ['Fresado CNC'], maquinas: ['haas-1', 'haas-2'] },
  { id: 'torno-cnc', nombre: 'Torno CNC', tipo: 'maquina', equipos_zoho: ['Torno CNC'], maquinas: ['torno'] },
];
let n = 0;
const t = (nombre: string, equipo: string | null, estado = 'Pendiente', horas = 8): TareaCruda =>
  ({ id: `t${++n}`, nombre, equipo, estado, horas_estimadas: horas, horas_registradas: 0 });
const lista = (nombre: string, ...tareas: TareaCruda[]): ListaCruda => ({ id: `l${++n}`, nombre, tareas });
const so = (nombre: string, ...listas: ListaCruda[]): ProyectoCrudo =>
  ({ id: `p-${nombre}`, nombre, estado: 'Activo', cliente: nombre.split('-')[2], fecha_entrega: '', listas });

const PROYECTOS = [
  so('SO-500-ABC-1', lista('Ítem 1 (2 unidades)', t('H. Torno CNC', 'Torno CNC'), t('H. Fresado CNC', 'Fresado CNC'))),
  so('SO-500-ABC-2', lista('Ítem 3 (1 unidad)', t('H. Fresado CNC', 'Fresado CNC', 'Material Pendiente'))),
  so('SO-501-XYZ-1', lista('Ítem 1 (4 unidades)', t('H. Fresado CNC', 'Fresado CNC', 'Pendiente', 16))),
];
const replanificar = (ajustes: Ajuste[]) => armarEstado({
  proyectos: PROYECTOS, maquinas: MAQUINAS, centros: CENTROS, reglas, fuente: 'excel', hoy: '2026-10-05', feriados: new Set(), ajustes,
});
const ctx = (ajustes: Ajuste[] = []): Contexto => ({ estado: replanificar(ajustes), ajustes, replanificar, ahora: new Date('2026-10-05T15:00:00Z') });
const usar = (nombre: string, input: unknown, c = ctx()) => ejecutarHerramienta(nombre, input, c);
const opId = (proyecto: string, k = 0) => replanificar([]).sos.find(s => s.nombre === proyecto)!.items[0].ruta.filter(o => o.tipo !== 'material')[k].id;

describe('herramientas del asistente', () => {
  it('declara 8 herramientas con esquemas cerrados', () => {
    expect(HERRAMIENTAS.map(h => h.name)).toEqual(['buscar_so', 'ver_maquina', 'cambiar_estado', 'llego_material', 'ajustar_so', 'asignar_maquina', 'marcar_maquina', 'quitar_ajustes']);
    for (const h of HERRAMIENTAS) expect(h.input_schema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('busca SO por número y devuelve ítems con la ruta y sus ids', () => {
    const r = usar('buscar_so', { texto: '500' }).resultado as { encontrados: number; sos: { proyecto: string; items: { item_id: string; ruta: { op_id: string; paso: string; estado: string; maquina: string | null }[] }[] }[] };
    expect(r.encontrados).toBe(2);
    expect(r.sos[0].proyecto).toBe('SO-500-ABC-1');
    expect(r.sos[0].items[0].ruta.map(o => [o.paso, o.estado, o.maquina])).toEqual([['Torno CNC', 'en_cola', 'Torno Hyundai'], ['Fresado CNC', 'en_camino', 'Haas #1']]);
  });

  it('ve la cola de una máquina por un nombre aproximado y pide aclarar si es ambiguo', () => {
    const r = usar('ver_maquina', { maquina: 'hyundai' });
    expect(r.resultado).toMatchObject({ maquina: 'Torno Hyundai', proceso: 'Torno CNC' });
    expect(() => usar('ver_maquina', { maquina: 'haas' })).toThrow(/varias máquinas: Haas #1, Haas #2/);
  });

  it('cierra una operación, informa qué sigue y no duplica ajustes si se repite', () => {
    const id = opId('SO-500-ABC-1');
    const r = usar('cambiar_estado', { op_ids: [id], estado: 'cerrada', nota: 'ya salió del torno' });
    expect(r.ajustes).toHaveLength(1);
    expect(r.ajustes![0]).toMatchObject({ tipo: 'estado', estado: 'cerrada', descripcion: 'SO-500-ABC-1 · Ítem 1 · Torno CNC → Cerrada', nota: 'ya salió del torno' });
    expect(r.resultado).toMatchObject({ ok: true, efecto: [{ estado: 'hecha', siguiente: 'Fresado CNC: en_cola en Haas #1' }] });
    const otra = usar('cambiar_estado', { op_ids: [id], estado: 'en_proceso' }, ctx(r.ajustes));
    expect(otra.ajustes!.map(a => a.descripcion)).toEqual(['SO-500-ABC-1 · Ítem 1 · Torno CNC → En proceso']);
  });

  it('rechaza ids inventados con una pista para buscarlos', () => {
    expect(() => usar('cambiar_estado', { op_ids: ['t999'], estado: 'cerrada' })).toThrow(ErrorHerramienta);
    expect(() => usar('cambiar_estado', { op_ids: ['t999'], estado: 'cerrada' })).toThrow(/Busca los op_id con buscar_so/);
    expect(() => usar('cambiar_estado', { op_ids: [opId('SO-501-XYZ-1')], estado: 'lista' })).toThrow(/pendiente, en_proceso o cerrada/);
  });

  it('marca la llegada del material de un ítem', () => {
    const item = replanificar([]).sos.find(s => s.nombre === 'SO-500-ABC-2')!.items[0];
    expect(item.situacion).toBe('Esperando material');
    const r = usar('llego_material', { item_ids: [item.id] });
    expect(r.resultado).toMatchObject({ efecto: [{ situacion: 'En cola de Fresado CNC' }] });
  });

  it('prioriza un SO y luego quita la prioridad', () => {
    const r = usar('ajustar_so', { proyecto: 'SO-501-XYZ-1', prioridad: 1 });
    expect(r.estado!.sos.find(s => s.nombre === 'SO-501-XYZ-1')!.prioridad).toBe(1);
    expect(r.resultado).toMatchObject({ ok: true, cambios: ['prioridad 1'] });
    const sin = usar('ajustar_so', { proyecto: 'so-501-xyz-1', prioridad: null }, ctx(r.ajustes));
    expect(sin.ajustes).toEqual([]);
    expect(() => usar('ajustar_so', { proyecto: 'SO-500' })).toThrow(/varios SO: SO-500-ABC-1, SO-500-ABC-2/);
  });

  it('fija una fecha de entrega y vuelve el semáforo para ese SO', () => {
    const r = usar('ajustar_so', { proyecto: 'SO-501-XYZ-1', entrega: '2026-10-20' });
    expect(r.resultado).toMatchObject({ semaforo: 'verde' });
    expect(() => usar('ajustar_so', { proyecto: 'SO-501-XYZ-1', entrega: '20/10/2026' })).toThrow(/YYYY-MM-DD/);
  });

  it('asigna una máquina, avisa si es de otro proceso y la devuelve al plan con null', () => {
    const id = opId('SO-501-XYZ-1');
    const r = usar('asignar_maquina', { op_id: id, maquina: 'Haas #2' });
    expect(r.resultado).toMatchObject({ maquina: 'Haas #2' });
    const otra = usar('asignar_maquina', { op_id: id, maquina: 'Torno Hyundai' });
    expect(otra.resultado).toMatchObject({ maquina: 'Torno Hyundai', aviso: 'Torno Hyundai no es de Fresado CNC' });
    expect(usar('asignar_maquina', { op_id: id, maquina: null }, ctx(r.ajustes)).ajustes).toEqual([]);
  });

  it('saca una máquina del plan, reparte su trabajo y la devuelve', () => {
    const r = usar('marcar_maquina', { maquina: 'Haas #1', fuera_de_servicio: true, motivo: 'Mantenimiento', hasta: '2026-10-07' });
    expect(r.estado!.maquinas.find(m => m.id === 'haas-1')!.fuera_de_servicio).toBe('Mantenimiento');
    expect(r.resultado).toMatchObject({ ok: true, recursos_disponibles: 'Haas #2' });
    expect(contextoPlanta(r.estado!)).toContain('Máquinas fuera de servicio: Haas #1 (Mantenimiento)');
    expect(() => usar('asignar_maquina', { op_id: opId('SO-501-XYZ-1'), maquina: 'Haas #1' }, ctx(r.ajustes))).toThrow(/fuera de servicio/);
    expect(usar('marcar_maquina', { maquina: 'haas #1', fuera_de_servicio: false }, ctx(r.ajustes)).ajustes).toEqual([]);
  });

  it('quita ajustes por id y el contexto los lista', () => {
    const r = usar('ajustar_so', { proyecto: 'SO-501-XYZ-1', prioridad: 2 });
    const id = r.ajustes![0].id;
    expect(contextoPlanta(r.estado!)).toContain(`- ${id}: SO-501-XYZ-1 · prioridad 2`);
    const q = usar('quitar_ajustes', { ids: [id] }, ctx(r.ajustes));
    expect(q.resultado).toEqual({ ok: true, quitados: ['SO-501-XYZ-1 · prioridad 2'] });
    expect(() => usar('quitar_ajustes', { ids: ['aj-x'] })).toThrow(/No hay ajustes con esos ids/);
  });

  it('el contexto resume fecha, fuente, carga y la falta de fechas de entrega', () => {
    const c = contextoPlanta(replanificar([]));
    expect(c).toContain('Hoy: 2026-10-05 (lunes). Datos: exportación de Zoho del');
    expect(c).toContain('Ningún ítem tiene fecha de entrega: no hay semáforo.');
    expect(c).toMatch(/- Fresado CNC: \d+(\.\d)? h · \d+(\.\d)? h · [\d.]+ d · Haas #1, Haas #2/);
    expect(c).toContain('Ajustes vigentes:\n- ninguno');
  });
});
