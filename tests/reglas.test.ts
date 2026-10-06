import { describe, expect, it } from 'vitest';
import { armarEstado, bufferDias, calcularMaquina, esFechaISO, habilesEntre, sumarHabiles } from '../shared/reglas.ts';
import type { MaquinaConfig, Operacion } from '../shared/tipos.ts';

const SIN_FERIADOS = new Set<string>();
// 2026-10-05 es lunes. 2026-12-01 (martes) es feriado en CR.
const FERIADOS = new Set(['2026-12-01']);

const maquina: MaquinaConfig = {
  id: 'm1', nombre: 'Haas VF-2', taller: 'taller-1', proceso: 'Fresado CNC', zoho_nombre: 'VF-2',
  capacidad_horas_dia: 8, es_centro_mecanizado: true, activa: true,
};
let n = 0;
const op = (o: Partial<Operacion>): Operacion => ({
  id: `op-${++n}`, so: `SO-${n}`, proyecto_id: `p-${n}`, cliente: 'Cliente', descripcion: 'H.Fresado',
  maquina_id: 'm1', maquina_zoho: 'VF-2', fase: 'Producción', estado_cola: 'en_cola',
  horas_totales: 8, horas_pendientes: 8, fecha_entrega: '2026-10-30',
  requiere_servicio_externo: false, requiere_ensamble: false, ...o,
});

describe('esFechaISO', () => {
  it('acepta solo fechas reales yyyy-mm-dd', () => {
    expect(esFechaISO('2026-10-06')).toBe(true);
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('2026-10-6')).toBe(false);
    expect(esFechaISO('10-06-2026')).toBe(false);
    expect(esFechaISO('')).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
  });
});

describe('días hábiles', () => {
  it('salta fines de semana', () => {
    expect(sumarHabiles('2026-10-09', 1, SIN_FERIADOS)).toBe('2026-10-12'); // viernes → lunes
    expect(sumarHabiles('2026-10-12', -1, SIN_FERIADOS)).toBe('2026-10-09');
    expect(sumarHabiles('2026-10-06', 0, SIN_FERIADOS)).toBe('2026-10-06');
  });
  it('salta feriados', () => {
    expect(sumarHabiles('2026-11-30', 1, FERIADOS)).toBe('2026-12-02');
    expect(sumarHabiles('2026-12-02', -1, FERIADOS)).toBe('2026-11-30');
  });
  it('cuenta en ambos sentidos', () => {
    expect(habilesEntre('2026-10-05', '2026-10-12', SIN_FERIADOS)).toBe(5);
    expect(habilesEntre('2026-10-12', '2026-10-05', SIN_FERIADOS)).toBe(-5);
    expect(habilesEntre('2026-10-06', '2026-10-06', SIN_FERIADOS)).toBe(0);
    expect(habilesEntre('2026-11-30', '2026-12-02', FERIADOS)).toBe(1);
  });
  it('rechaza fechas inválidas en vez de colgarse', () => {
    expect(() => habilesEntre('2026-10-06', '2026-10-6', SIN_FERIADOS)).toThrow(RangeError);
    expect(() => sumarHabiles('', 2, SIN_FERIADOS)).toThrow(RangeError);
  });
});

describe('buffer', () => {
  it('2 / 5 / 6 días hábiles', () => {
    expect(bufferDias({ requiere_servicio_externo: false, requiere_ensamble: false })).toBe(2);
    expect(bufferDias({ requiere_servicio_externo: false, requiere_ensamble: true })).toBe(2);
    expect(bufferDias({ requiere_servicio_externo: true, requiere_ensamble: false })).toBe(5);
    expect(bufferDias({ requiere_servicio_externo: true, requiere_ensamble: true })).toBe(6);
  });
  it('el límite de producción descuenta el buffer en días hábiles', () => {
    const m = calcularMaquina(maquina, [
      op({ fecha_entrega: '2026-10-14' }),
      op({ fecha_entrega: '2026-12-03', requiere_servicio_externo: true, requiere_ensamble: true }),
    ], '2026-10-05', FERIADOS);
    expect(m.cola[0].fecha_limite_produccion).toBe('2026-10-12');
    expect(m.cola[1].fecha_limite_produccion).toBe('2026-11-24'); // 6 hábiles atrás saltando el 1-dic
  });
});

describe('cola y semáforo', () => {
  const hoy = '2026-10-05';
  it('proyecta el fin por capacidad y ordena la cola por límite', () => {
    const m = calcularMaquina(maquina, [
      op({ so: 'SO-B', fecha_entrega: '2026-10-30', horas_pendientes: 16 }),
      op({ so: 'SO-A', fecha_entrega: '2026-10-20', horas_pendientes: 8 }),
      op({ so: 'SO-P', estado_cola: 'en_proceso', horas_pendientes: 4, fecha_entrega: '2026-11-30' }),
    ], hoy, SIN_FERIADOS);
    expect(m.en_proceso.map(o => [o.so, o.posicion, o.fin_proyectado])).toEqual([['SO-P', 0, '2026-10-05']]);
    expect(m.cola.map(o => [o.so, o.posicion, o.fin_proyectado])).toEqual([
      ['SO-A', 1, '2026-10-06'], // 4 + 8 = 12 h → día 2
      ['SO-B', 2, '2026-10-08'], // 28 h → día 4
    ]);
    expect(m.horas_cola).toBe(28);
    expect(m.dias_carga).toBe(3.5);
  });
  it('rojo si el límite ya pasó o la cola lo hace llegar tarde; amarillo con holgura ≤ 1', () => {
    const m = calcularMaquina(maquina, [
      op({ so: 'VENCIDA', fecha_entrega: '2026-10-06' }),           // límite 2026-10-02 < hoy
      op({ so: 'JUSTA', fecha_entrega: '2026-10-09', horas_pendientes: 8 }), // límite 10-07, fin 10-06 → holgura 1
      op({ so: 'TARDE', fecha_entrega: '2026-10-12', horas_pendientes: 40 }), // límite 10-08, fin 10-12
      op({ so: 'HOLGADA', fecha_entrega: '2026-11-30' }),
    ], hoy, SIN_FERIADOS);
    const sem = Object.fromEntries(m.cola.map(o => [o.so, o.semaforo]));
    expect(sem).toEqual({ VENCIDA: 'rojo', JUSTA: 'amarillo', TARDE: 'rojo', HOLGADA: 'verde' });
    expect(m.semaforo).toBe('rojo');
  });
  it('máquina sin operaciones activas queda libre', () => {
    const m = calcularMaquina(maquina, [op({ estado_cola: 'por_liberar', fase: 'Pend. material' })], hoy, SIN_FERIADOS);
    expect(m.semaforo).toBe('libre');
    expect(m.por_liberar[0].fin_proyectado).toBeUndefined();
  });
  it('no modifica las operaciones de entrada', () => {
    const entrada = [op({})];
    calcularMaquina(maquina, entrada, hoy, SIN_FERIADOS);
    expect(entrada[0].semaforo).toBeUndefined();
    expect(entrada[0].fecha_limite_produccion).toBeUndefined();
  });
});

describe('armarEstado', () => {
  it('aparta operaciones sin máquina o sin fecha válida sin romper el resto', () => {
    const e = armarEstado([maquina], [
      op({ so: 'SO-OK' }),
      op({ so: 'SO-SINFECHA', fecha_entrega: '' }),
      op({ so: 'SO-RARA', fecha_entrega: '10-30-2026' }),
      op({ so: 'SO-SINMAQ', maquina_id: null }),
    ], 'zoho', '2026-10-05', SIN_FERIADOS);
    expect(e.maquinas[0].cola.map(o => o.so)).toEqual(['SO-OK']);
    expect(e.sin_maquina.map(o => o.so).sort()).toEqual(['SO-RARA', 'SO-SINFECHA', 'SO-SINMAQ']);
    expect(e.kpis.so_abiertos).toBe(1);
    expect(e.avisos.some(a => a.includes('sin máquina'))).toBe(true);
    expect(e.avisos.some(a => a.includes('SO-SINFECHA') && a.includes('SO-RARA'))).toBe(true);
  });
});
