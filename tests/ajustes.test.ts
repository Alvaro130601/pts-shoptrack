import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import { armarEstado } from '../shared/plan.ts';
import type { Ajuste, CentroConfig, ListaCruda, MaquinaConfig, Operacion, ProyectoCrudo, ReglasLectura, TareaCruda } from '../shared/tipos.ts';

const reglas = mapeo.lectura as ReglasLectura;
const HOY = '2026-10-05'; // lunes
const maquina = (id: string): MaquinaConfig =>
  ({ id, nombre: id.toUpperCase(), taller: null, proceso: null, capacidad_horas_dia: 8, es_centro_mecanizado: true, activa: true });
const MAQUINAS = ['m1', 'm2', 't1'].map(maquina);
const CENTROS: CentroConfig[] = [
  { id: 'cnc', nombre: 'Fresado CNC', tipo: 'maquina', equipos_zoho: ['Fresado CNC'], maquinas: ['m1', 'm2'] },
  { id: 'torno', nombre: 'Torno CNC', tipo: 'maquina', equipos_zoho: ['Torno CNC'], maquinas: ['t1'] },
];

let n = 0;
const t = (nombre: string, equipo: string | null, estado = 'Pendiente', horas = 8): TareaCruda =>
  ({ id: `t${++n}`, nombre, equipo, estado, horas_estimadas: horas, horas_registradas: 0 });
const item = (...tareas: TareaCruda[]): ListaCruda => ({ id: `l${++n}`, nombre: `Ítem ${n} (1 unidad)`, tareas });
const so = (nombre: string, entrega: string, ...listas: ListaCruda[]): ProyectoCrudo =>
  ({ id: nombre, nombre, estado: 'Activo', cliente: 'Cliente', fecha_entrega: entrega, listas });
const base = { creado: '2026-10-05T14:00:00.000Z', descripcion: 'prueba' };
const plan = (proyectos: ProyectoCrudo[], ajustes: Ajuste[] = []) => armarEstado({
  proyectos, maquinas: MAQUINAS, centros: CENTROS, reglas, fuente: 'seed', hoy: HOY, feriados: new Set(), ajustes,
});
const ruta = (e: ReturnType<typeof plan>, nombre: string): Operacion[] => e.sos.find(s => s.nombre === nombre)!.items[0].ruta;

describe('ajustes del supervisor', () => {
  it('cambia el estado de una tarea: cerrada pasa a hecha y la siguiente queda en cola', () => {
    const a = t('H. Torno CNC', 'Torno CNC'), b = t('H. Fresado CNC', 'Fresado CNC');
    const ps = [so('SO-1-AAA-1', '2026-10-30', item(a, b))];
    expect(ruta(plan(ps), 'SO-1-AAA-1').map(o => o.estado)).toEqual(['en_cola', 'en_camino']);
    const e = plan(ps, [{ ...base, id: 'aj1', tipo: 'estado', proyecto_id: 'SO-1-AAA-1', tareas: [a.id], estado: 'cerrada' }]);
    const r = ruta(e, 'SO-1-AAA-1');
    expect(r.map(o => o.estado)).toEqual(['hecha', 'en_cola']);
    expect(r[0].ajustes).toEqual(['aj1']);
    expect(e.ajustes).toEqual([expect.objectContaining({ id: 'aj1', aplicado: true })]);
    expect(ps[0].listas[0].tareas[0].estado).toBe('Pendiente'); // no modifica los datos de entrada
  });

  it('marca que llegó el material: quita el paso Material del estado viejo y desbloquea la ruta', () => {
    const a = t('H. Fresado CNC', 'Fresado CNC', 'Material Pendiente');
    const ps = [so('SO-2-AAA-1', '2026-10-30', item(a))];
    expect(ruta(plan(ps), 'SO-2-AAA-1').map(o => [o.tipo, o.estado])).toEqual([['material', 'pendiente'], ['maquina', 'bloqueada']]);
    const e = plan(ps, [{ ...base, id: 'aj2', tipo: 'material', proyecto_id: 'SO-2-AAA-1', tareas: [a.id] }]);
    expect(ruta(e, 'SO-2-AAA-1').map(o => [o.tipo, o.estado])).toEqual([['maquina', 'en_cola']]);
  });

  it('la prioridad del supervisor manda sobre la fecha de entrega', () => {
    const ps = [
      so('SO-3-AAA-1', '2026-10-09', item(t('H. Torno CNC', 'Torno CNC', 'Pendiente', 16))),
      so('SO-3-BBB-1', '2026-10-30', item(t('H. Torno CNC', 'Torno CNC', 'Pendiente', 16))),
    ];
    const antes = plan(ps);
    expect(ruta(antes, 'SO-3-AAA-1')[0].inicio_proyectado).toBe('2026-10-05');
    const e = plan(ps, [{ ...base, id: 'aj3', tipo: 'prioridad', proyecto_id: 'SO-3-BBB-1', prioridad: 1 }]);
    expect(ruta(e, 'SO-3-BBB-1')[0].inicio_proyectado).toBe('2026-10-05');
    expect(ruta(e, 'SO-3-AAA-1')[0].inicio_proyectado).toBe('2026-10-07');
    expect(e.sos.find(s => s.nombre === 'SO-3-BBB-1')!.prioridad).toBe(1);
  });

  it('una fecha de entrega fijada da semáforo a un SO que no traía fecha', () => {
    const ps = [so('SO-4-AAA-1', '', item(t('H. Fresado CNC', 'Fresado CNC')))];
    expect(ruta(plan(ps), 'SO-4-AAA-1')[0].semaforo).toBeUndefined();
    const e = plan(ps, [{ ...base, id: 'aj4', tipo: 'entrega', proyecto_id: 'SO-4-AAA-1', fecha: '2026-10-20' }]);
    expect(ruta(e, 'SO-4-AAA-1')[0].semaforo).toBe('verde');
    expect(e.kpis.items_con_fecha).toBe(1);
  });

  it('fija la máquina de una operación, aunque sea de otro proceso', () => {
    const a = t('H. Fresado CNC', 'Fresado CNC');
    const ps = [so('SO-5-AAA-1', '2026-10-30', item(a))];
    expect(ruta(plan(ps), 'SO-5-AAA-1')[0].maquina_id).toBe('m1');
    const e = plan(ps, [{ ...base, id: 'aj5', tipo: 'maquina', proyecto_id: 'SO-5-AAA-1', tareas: [a.id], maquina_id: 'm2' }]);
    expect(ruta(e, 'SO-5-AAA-1')[0]).toMatchObject({ maquina_id: 'm2', maquina_fija: 'm2' });
    const otra = plan(ps, [{ ...base, id: 'aj6', tipo: 'maquina', proyecto_id: 'SO-5-AAA-1', tareas: [a.id], maquina_id: 't1' }]);
    expect(ruta(otra, 'SO-5-AAA-1')[0].maquina_id).toBe('t1');
  });

  it('una máquina fuera de servicio no recibe trabajo y avisa si el proceso se queda sin máquinas', () => {
    const ps = [so('SO-6-AAA-1', '2026-10-30', item(t('H. Fresado CNC', 'Fresado CNC')), item(t('H. Torno CNC', 'Torno CNC')))];
    const e = plan(ps, [
      { ...base, id: 'aj7', tipo: 'fuera_servicio', maquina_id: 'm1', motivo: 'Mantenimiento' },
      { ...base, id: 'aj8', tipo: 'fuera_servicio', maquina_id: 't1', motivo: 'Husillo dañado' },
    ]);
    const m1 = e.maquinas.find(m => m.id === 'm1')!;
    expect(m1.fuera_de_servicio).toBe('Mantenimiento');
    expect([...m1.cola, ...m1.en_proceso, ...m1.proximas]).toEqual([]);
    expect(e.sos[0].items[0].ruta[0].maquina_id).toBe('m2');
    expect(e.avisos.some(a => a.includes('Torno CNC: ninguna máquina disponible (T1 fuera de servicio)'))).toBe(true);
  });

  it('deja sin aplicar lo que ya no corresponde y lo explica', () => {
    const ps = [so('SO-7-AAA-1', '2026-10-30', item(t('H. Fresado CNC', 'Fresado CNC')))];
    const e = plan(ps, [
      { ...base, id: 'a1', tipo: 'estado', proyecto_id: 'SO-7-AAA-1', tareas: ['no-existe'], estado: 'cerrada' },
      { ...base, id: 'a2', tipo: 'prioridad', proyecto_id: 'SO-9-ZZZ-1', prioridad: 1 },
      { ...base, id: 'a3', tipo: 'fuera_servicio', maquina_id: 'm1', motivo: 'Mantenimiento', hasta: '2026-10-02' },
    ]);
    expect(e.ajustes.map(a => [a.id, a.aplicado])).toEqual([['a1', false], ['a2', false], ['a3', false]]);
    expect(e.ajustes[2].motivo).toBe('Venció el 2026-10-02');
    expect(e.maquinas.find(m => m.id === 'm1')!.fuera_de_servicio).toBeUndefined();
    expect(e.avisos.some(a => a.includes('3 ajustes del supervisor, 3 sin aplicar'))).toBe(true);
  });
});
