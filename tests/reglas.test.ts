import { describe, expect, it } from 'vitest';
import {
  bufferDias, diasDeCierre, esFechaISO, evaluarSemaforo, habilesEntre, primerHabil, sumarHabiles,
} from '../shared/reglas.ts';

const SIN_FERIADOS = new Set<string>();
// 2026-10-05 es lunes. 2026-12-01 (martes) es feriado en CR.
const FERIADOS = new Set(['2026-12-01']);

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
  it('lleva un sábado o feriado al siguiente día hábil', () => {
    expect(primerHabil('2026-10-10', SIN_FERIADOS)).toBe('2026-10-12');
    expect(primerHabil('2026-12-01', FERIADOS)).toBe('2026-12-02');
    expect(primerHabil('2026-10-06', SIN_FERIADOS)).toBe('2026-10-06');
  });
  it('rechaza fechas inválidas en vez de colgarse', () => {
    expect(() => habilesEntre('2026-10-06', '2026-10-6', SIN_FERIADOS)).toThrow(RangeError);
    expect(() => sumarHabiles('', 2, SIN_FERIADOS)).toThrow(RangeError);
  });
});

describe('buffer', () => {
  const caso = (se: boolean, ens: boolean) => ({ requiere_servicio_externo: se, requiere_ensamble: ens });
  it('2 / 5 / 6 días hábiles', () => {
    expect(bufferDias(caso(false, false))).toBe(2);
    expect(bufferDias(caso(false, true))).toBe(2);
    expect(bufferDias(caso(true, false))).toBe(5);
    expect(bufferDias(caso(true, true))).toBe(6);
  });
  it('los días de cierre son el buffer sin el servicio externo, que ahora va dentro de la ruta', () => {
    expect(diasDeCierre(caso(false, false))).toBe(2);
    expect(diasDeCierre(caso(true, false))).toBe(2);
    expect(diasDeCierre(caso(true, true))).toBe(3);
  });
});

describe('semáforo', () => {
  const hoy = '2026-10-05';
  it('rojo si el límite ya pasó o termina después del límite; amarillo con holgura ≤ 1', () => {
    expect(evaluarSemaforo('2026-10-05', '2026-10-02', hoy, SIN_FERIADOS).semaforo).toBe('rojo');
    expect(evaluarSemaforo('2026-10-09', '2026-10-07', hoy, SIN_FERIADOS)).toMatchObject({ semaforo: 'rojo', holgura: -2 });
    expect(evaluarSemaforo('2026-10-06', '2026-10-07', hoy, SIN_FERIADOS)).toMatchObject({ semaforo: 'amarillo', holgura: 1 });
    expect(evaluarSemaforo('2026-10-06', '2026-10-16', hoy, SIN_FERIADOS)).toMatchObject({ semaforo: 'verde', holgura: 8 });
  });
});
