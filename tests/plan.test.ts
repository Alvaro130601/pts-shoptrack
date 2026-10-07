import { describe, expect, it } from 'vitest';
import mapeo from '../config/zoho-mapeo.json';
import { armarEstado, hueco } from '../shared/plan.ts';
import type { CentroConfig, ListaCruda, MaquinaConfig, Operacion, ProyectoCrudo, ReglasLectura, TareaCruda } from '../shared/tipos.ts';

const reglas = mapeo.lectura as ReglasLectura;
const HOY = '2026-10-05'; // lunes
const SIN_FERIADOS = new Set<string>();

const maquina = (id: string): MaquinaConfig =>
  ({ id, nombre: id.toUpperCase(), taller: null, proceso: null, capacidad_horas_dia: 8, es_centro_mecanizado: true, activa: true });
const MAQUINAS = ['m1', 'm2', 't1', 'e1'].map(maquina);
const CENTROS: CentroConfig[] = [
  { id: 'cnc', nombre: 'Fresado CNC', tipo: 'maquina', equipos_zoho: ['Fresado CNC'], maquinas: ['m1', 'm2'] },
  { id: 'torno', nombre: 'Torno CNC', tipo: 'maquina', equipos_zoho: ['Torno CNC'], maquinas: ['t1'] },
  { id: 'ero', nombre: 'Erosionado', tipo: 'maquina', equipos_zoho: ['Erosionado'], maquinas: ['e1'] },
  { id: 'prog', nombre: 'Programación', tipo: 'programacion', equipos_zoho: [], personas: 1, horas_dia: 8 },
  { id: 'ext', nombre: 'Servicio externo', tipo: 'externo', equipos_zoho: ['No Requiere'], dias: 3 },
];

let n = 0;
const t = (nombre: string, equipo: string | null, estado = 'Pendiente', horas = 8): TareaCruda =>
  ({ id: `t${++n}`, nombre, equipo, estado, horas_estimadas: horas, horas_registradas: 0 });
const MATERIAL_OK = () => t('Material', null, 'Cerrada', 0);
const item = (...tareas: TareaCruda[]): ListaCruda => ({ id: `l${++n}`, nombre: `Ítem ${n} (1 unidad)`, tareas });
const so = (nombre: string, entrega: string, ...listas: ListaCruda[]): ProyectoCrudo =>
  ({ id: `p${++n}`, nombre, estado: 'Activo', cliente: 'Cliente', fecha_entrega: entrega, listas });
const plan = (...proyectos: ProyectoCrudo[]) => armarEstado({
  proyectos, maquinas: MAQUINAS, centros: CENTROS, reglas, fuente: 'seed', hoy: HOY, feriados: SIN_FERIADOS,
});
const ops = (e: ReturnType<typeof plan>, so: string): Operacion[] =>
  e.sos.find(s => s.nombre === so)!.items.flatMap(i => i.ruta).filter(o => o.tipo !== 'material');

describe('hueco', () => {
  it('encuentra el primer espacio libre que alcanza', () => {
    const ocupado: [number, number][] = [[0, 1], [1.5, 3]];
    expect(hueco(ocupado, 0, 0.5)).toBe(1);   // cabe entre 1 y 1.5
    expect(hueco(ocupado, 0, 1)).toBe(3);     // no cabe en el hueco de medio día
    expect(hueco(ocupado, 4, 1)).toBe(4);
  });
});

describe('plan sugerido', () => {
  it('respeta el orden de la ruta: el hilo empieza cuando termina el torno', () => {
    const e = plan(so('SO-1-A', '2026-10-30', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC'), t('H. Erosionado', 'Erosionado'))));
    const [torno, hilo] = ops(e, 'SO-1-A');
    expect([torno.maquina_id, torno.inicio_proyectado, torno.fin_proyectado]).toEqual(['t1', '2026-10-05', '2026-10-05']);
    expect([hilo.maquina_id, hilo.inicio_proyectado, hilo.fin_proyectado]).toEqual(['e1', '2026-10-06', '2026-10-06']);
  });

  it('reparte entre las máquinas del centro y respeta su capacidad', () => {
    const e = plan(so('SO-2-B', '2026-10-30',
      item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC')),
      item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC')),
      item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))));
    const [a, b, c] = ops(e, 'SO-2-B');
    expect(new Set([a.maquina_id, b.maquina_id])).toEqual(new Set(['m1', 'm2']));
    expect([a.fin_proyectado, b.fin_proyectado, c.fin_proyectado]).toEqual(['2026-10-05', '2026-10-05', '2026-10-06']);
    const m1 = e.maquinas.find(m => m.id === 'm1')!;
    expect(m1.cola.length + m1.en_proceso.length).toBeGreaterThan(0);
    expect(e.centros.find(c => c.id === 'cnc')).toMatchObject({ en_cola: 3, horas_cola: 24, capacidad_horas_dia: 16, dias_carga: 1.5 });
  });

  it('la fecha de entrega manda la prioridad; lo que ya está en proceso sigue primero', () => {
    const tarde = so('SO-3-TARDE', '2026-10-30', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC')));
    const urgente = so('SO-3-URGENTE', '2026-10-12', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC')));
    let e = plan(tarde, urgente);
    expect(ops(e, 'SO-3-URGENTE')[0].fin_proyectado).toBe('2026-10-05');
    expect(ops(e, 'SO-3-TARDE')[0].fin_proyectado).toBe('2026-10-06');

    const enCurso = so('SO-3-ENCURSO', '2026-10-30', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC', 'En proceso', 4)));
    e = plan(enCurso, urgente);
    expect(ops(e, 'SO-3-ENCURSO')[0]).toMatchObject({ posicion: 0, fin_proyectado: '2026-10-05' });
    expect(ops(e, 'SO-3-URGENTE')[0]).toMatchObject({ posicion: 1, fin_proyectado: '2026-10-06' });
  });

  it('programa mientras llega el material; la máquina empieza cuando hay material y programa', () => {
    const e = plan(so('SO-4-M', '2026-10-30', item(
      t('Material', null), t('H. Programación', 'Fresado CNC'), t('H. Fresado CNC', 'Fresado CNC'))));
    const [prog, maq] = ops(e, 'SO-4-M');
    expect([prog.maquina_id, prog.inicio_proyectado]).toEqual(['prog-1', '2026-10-05']);
    expect(maq.inicio_proyectado).toBe('2026-10-08'); // material: 3 días hábiles (SLA)
  });

  it('el servicio externo dura sus días de proveedor', () => {
    const e = plan(so('SO-5-SE', '2026-10-30', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC'), t('H. Anodizado', 'No Requiere', 'Pendiente', 0))));
    const [, anod] = ops(e, 'SO-5-SE');
    expect([anod.inicio_proyectado, anod.fin_proyectado]).toEqual(['2026-10-06', '2026-10-08']);
  });
});

describe('límites desde la entrega', () => {
  const entrega = '2026-10-30'; // viernes
  it('flujo estándar: la ruta termina 2 días hábiles antes', () => {
    const e = plan(so('SO-6-STD', entrega, item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))));
    expect(ops(e, 'SO-6-STD')[0].limite).toBe('2026-10-28');
  });
  it('con servicio externo al final, la producción termina 5 días antes (buffer 5)', () => {
    const e = plan(so('SO-6-SE', entrega, item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'), t('H. Anodizado', 'No Requiere', 'Pendiente', 0))));
    const [maq, anod] = ops(e, 'SO-6-SE');
    expect(anod.limite).toBe('2026-10-28');
    expect(maq.limite).toBe('2026-10-23');
  });
  it('con servicio externo y lista de cierre con ensamble, 6 días antes (buffer 6)', () => {
    const p = so('SO-6-ENS', entrega, item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'), t('H. Anodizado', 'No Requiere', 'Pendiente', 0)));
    p.listas.push({ id: 'cierre', nombre: 'Cierre', tareas: [t('Ensamble', null), t('Calidad', null), t('Envío', null)] });
    const e = plan(p);
    expect(ops(e, 'SO-6-ENS')[0].limite).toBe('2026-10-22');
    expect(e.sos[0].cierre.map(o => o.limite)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });
  it('semáforo: rojo si no llega, verde con holgura; el ítem y el SO toman el peor', () => {
    const e = plan(
      so('SO-7-TARDE', '2026-10-06', item(MATERIAL_OK(), t('H. Torno CNC', 'Torno CNC', 'Pendiente', 16))),
      so('SO-7-BIEN', '2026-10-30', item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))),
    );
    const tarde = e.sos.find(s => s.nombre === 'SO-7-TARDE')!;
    expect(tarde.items[0].ruta[1].semaforo).toBe('rojo');
    expect(tarde.items[0].semaforo).toBe('rojo');
    expect(tarde.semaforo).toBe('rojo');
    expect(e.sos.find(s => s.nombre === 'SO-7-BIEN')!.semaforo).toBe('verde');
    expect(e.kpis.atrasados).toBe(1);
  });
});

describe('estado de la planta', () => {
  it('aparta equipos desconocidos y SO sin fecha sin romper el resto', () => {
    const e = plan(
      so('SO-8-OK', '2026-10-30', item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))),
      so('SO-8-LAP', '2026-10-30', item(MATERIAL_OK(), t('H. Lapeado', 'Lapeado'))),
      so('SO-8-SINFECHA', '', item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))),
    );
    expect(e.sin_centro.map(o => o.equipo_zoho)).toEqual(['Lapeado']);
    expect(e.avisos.some(a => a.includes('Lapeado'))).toBe(true);
    expect(e.avisos.some(a => a.includes('SO-8-SINFECHA'))).toBe(true);
    const sinFecha = ops(e, 'SO-8-SINFECHA')[0];
    expect(sinFecha.maquina_id).toBeTruthy();       // igual ocupa capacidad
    expect(sinFecha.semaforo).toBeUndefined();
    expect(ops(e, 'SO-8-OK')[0].fin_proyectado).toBe('2026-10-05'); // va antes que el SO sin fecha
  });

  it('cuenta ítems esperando material y operaciones listas', () => {
    const e = plan(so('SO-9', '2026-10-30',
      item(t('Material', null), t('H. Fresado CNC', 'Fresado CNC')),
      item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC'))));
    expect(e.kpis).toMatchObject({ esperando_material: 1, en_cola: 1, items_abiertos: 2 });
    const proximas = e.maquinas.flatMap(m => m.proximas);
    expect(proximas.map(o => o.estado)).toEqual(['bloqueada']);
  });

  it('el servicio externo en el proveedor no cuenta como trabajo en proceso de la planta ni carga máquinas', () => {
    const e = plan(so('SO-10', '2026-10-30', item(MATERIAL_OK(), t('H. Fresado CNC', 'Fresado CNC', 'Cerrada'),
      t('H. Anodizado', 'No Requiere', 'Servicio Externo', 0.5), t('H. Torno CNC', 'Torno CNC'))));
    expect(e.kpis).toMatchObject({ en_proceso: 0, en_proveedor: 1, en_cola: 0, horas_cola: 0 });
    expect(e.centros.find(c => c.id === 'ext')).toMatchObject({ en_proceso: 1 });
    expect(e.maquinas.find(m => m.id === 't1')).toMatchObject({ horas_cola: 0, proximas: [expect.objectContaining({ estado: 'en_camino' })] });
  });

  it('cada máquina toma el grupo de color de su proceso', () => {
    const centros: CentroConfig[] = CENTROS.map(c =>
      c.id === 'cnc' ? { ...c, grupo: 'fresado' } : c.id === 'torno' ? { ...c, grupo: 'torno', convencional: true } : c);
    const e = armarEstado({ proyectos: [], maquinas: [...MAQUINAS, maquina('x1')], centros, reglas, fuente: 'seed', hoy: HOY,
      feriados: SIN_FERIADOS });
    const de = (id: string) => e.maquinas.find(m => m.id === id)!;
    expect(de('m2')).toMatchObject({ grupo: 'fresado' });
    expect(de('m2').convencional).toBeUndefined();
    expect(de('t1')).toMatchObject({ grupo: 'torno', convencional: true });
    expect(de('e1').grupo).toBeNull();   // proceso sin grupo
    expect(de('x1').grupo).toBeNull();   // máquina sin proceso
  });
});
