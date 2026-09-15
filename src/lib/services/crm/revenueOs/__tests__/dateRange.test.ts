/// <reference types="jest" />
/**
 * F14 — rango de fechas de las rutas (`dateRange.ts`): por defecto los últimos
 * 12 meses en la zona de la organización; validación de formato, orden y tope
 * de 36 meses.
 */
import { resolveDateRange, DateRangeError, defaultRange } from '../dateRange';

describe('defaultRange(today)', () => {
  it('12 meses hacia atrás desde el primer día del mes de hoy; fin = primer día del mes siguiente (exclusivo)', () => {
    expect(defaultRange('2026-09-15')).toEqual({ start: '2025-10-01', end: '2026-10-01' });
  });
  it('cambio de año', () => {
    expect(defaultRange('2026-01-03')).toEqual({ start: '2025-02-01', end: '2026-02-01' });
  });
});

describe('resolveDateRange(start, end, today)', () => {
  it('sin parámetros → rango por defecto', () => {
    expect(resolveDateRange(null, null, '2026-09-15')).toEqual({ start: '2025-10-01', end: '2026-10-01' });
  });
  it('acepta YYYY-MM-DD válidos', () => {
    expect(resolveDateRange('2026-01-01', '2026-06-30', '2026-09-15')).toEqual({ start: '2026-01-01', end: '2026-06-30' });
  });
  it('formato inválido → DateRangeError 400', () => {
    expect(() => resolveDateRange('01/01/2026', null, '2026-09-15')).toThrow(DateRangeError);
    expect(() => resolveDateRange('2026-13-01', null, '2026-09-15')).toThrow(DateRangeError);
    expect(() => resolveDateRange('2026-02-30', null, '2026-09-15')).toThrow(/inválida/);
    expect(() => resolveDateRange(null, "2026-01-01' or 1=1", '2026-09-15')).toThrow(DateRangeError);
  });
  it('end < start → 400', () => {
    expect(() => resolveDateRange('2026-06-01', '2026-01-01', '2026-09-15')).toThrow(/posterior o igual/);
  });
  it('más de 36 meses → 400', () => {
    expect(() => resolveDateRange('2020-01-01', '2026-01-02', '2026-09-15')).toThrow(/36 meses/);
    expect(resolveDateRange('2023-01-01', '2026-01-01', '2026-09-15')).toEqual({ start: '2023-01-01', end: '2026-01-01' });
  });
  it('solo start → end por defecto; solo end → start = end − 12 meses', () => {
    expect(resolveDateRange('2026-05-01', null, '2026-09-15')).toEqual({ start: '2026-05-01', end: '2026-10-01' });
    expect(resolveDateRange(null, '2026-05-01', '2026-09-15')).toEqual({ start: '2025-05-01', end: '2026-05-01' });
  });
  it('el error lleva statusCode 400', () => {
    try {
      resolveDateRange('x', null, '2026-09-15');
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(DateRangeError);
      expect((e as DateRangeError).statusCode).toBe(400);
    }
  });
});
