import { describe, expect, it } from 'vitest';
import type { EstadoMaquina, Operacion, Semaforo } from '../shared/tipos.ts';
import { SIN_FILTROS, activos, alternar, cumple, tieneEstado, type Filtros } from '../web/src/filtros.ts';

const op = (semaforo?: Semaforo) => ({ id: Math.random().toString(36), semaforo }) as Operacion;
const maquina = (id: string, centro: string | null, x: Partial<EstadoMaquina> = {}): EstadoMaquina => ({
  id, nombre: id, taller: null, proceso: null, capacidad_horas_dia: 16, es_centro_mecanizado: true, activa: true,
  centro_id: centro, en_proceso: [], cola: [], proximas: [], horas_cola: 0, dias_carga: 0, semaforo: 'libre', ...x,
});

const hyundai = maquina('torno-hyundai', 'torno-cnc', { en_proceso: [op('verde')], cola: [op('rojo'), op('amarillo')] });
const vf2 = maquina('haas-vf-2', 'fresado-cnc', { cola: [op('verde')] });
const syl = maquina('syl', 'fresado-cnc', { fuera_de_servicio: 'mantenimiento' });
const libre = maquina('fresadora-1', 'fresado');
const todas = [hyundai, vf2, syl, libre];
const ids = (f: Filtros) => todas.filter(m => cumple(m, f)).map(m => m.id);

describe('filtros de la planta', () => {
  it('sin filtros pasan todas', () => {
    expect(activos(SIN_FILTROS)).toBe(0);
    expect(ids(SIN_FILTROS)).toEqual(todas.map(m => m.id));
  });

  it('prioridad: el semáforo de cualquier orden de la máquina (en proceso, en cola o por llegar)', () => {
    expect(ids({ ...SIN_FILTROS, semaforos: ['rojo'] })).toEqual(['torno-hyundai']);
    expect(ids({ ...SIN_FILTROS, semaforos: ['verde'] })).toEqual(['torno-hyundai', 'haas-vf-2']);
    expect(ids({ ...SIN_FILTROS, semaforos: ['rojo', 'amarillo'] })).toEqual(['torno-hyundai']);
  });

  it('estado de la máquina: trabajando, sin trabajo y fuera de servicio', () => {
    expect(tieneEstado(syl, 'fuera')).toBe(true);
    expect(tieneEstado(syl, 'sin_trabajo')).toBe(false);   // fuera de servicio no cuenta como libre
    expect(ids({ ...SIN_FILTROS, estados: ['fuera'] })).toEqual(['syl']);
    expect(ids({ ...SIN_FILTROS, estados: ['trabajando'] })).toEqual(['torno-hyundai']);
    expect(ids({ ...SIN_FILTROS, estados: ['sin_trabajo'] })).toEqual(['fresadora-1']);
    expect(ids({ ...SIN_FILTROS, estados: ['trabajando', 'fuera'] })).toEqual(['torno-hyundai', 'syl']);
  });

  it('las secciones se combinan: hay que cumplir todas', () => {
    expect(ids({ semaforos: ['verde'], estados: [], procesos: ['fresado-cnc'] })).toEqual(['haas-vf-2']);
    expect(ids({ semaforos: [], estados: ['fuera'], procesos: ['torno-cnc'] })).toEqual([]);
  });

  it('alternar marca y desmarca una opción', () => {
    const f = alternar(SIN_FILTROS, 'estados', 'fuera');
    expect(f.estados).toEqual(['fuera']);
    expect(activos(f)).toBe(1);
    expect(alternar(f, 'estados', 'fuera').estados).toEqual([]);
    expect(SIN_FILTROS.estados).toEqual([]);   // no cambia el original
  });
});
