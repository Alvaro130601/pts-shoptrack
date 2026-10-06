import { describe, expect, it } from 'vitest';
import { fechaZoho } from '../server/fuentes/zoho.ts';

describe('fechaZoho', () => {
  it('normaliza los formatos posibles de end_date', () => {
    expect(fechaZoho({ end_date: '2026-10-30' })).toBe('2026-10-30');
    expect(fechaZoho({ end_date: '2026-10-30T00:00:00-06:00' })).toBe('2026-10-30');
    expect(fechaZoho({ end_date: '10-30-2026' })).toBe('2026-10-30');
    expect(fechaZoho({ end_date: '10/30/2026' })).toBe('2026-10-30');
  });
  it('devuelve null si no se reconoce', () => {
    expect(fechaZoho({})).toBeNull();
    expect(fechaZoho({ end_date: '' })).toBeNull();
    expect(fechaZoho({ end_date: '30-10-2026' })).toBeNull(); // dd-mm ambiguo: no adivinar
  });
});
