/**
 * `DateRangeButton`: días calendario puros, sin zona horaria (la pone la
 * pantalla con `getToday()` / `toInstant`).
 */
import { esFechaPlana, etiquetaRango, inicioDeMes, normalizarRango, presetDe, presetsRango } from '../rangoFechas';

describe('etiquetaRango (formato del botón en Figma 680:407222)', () => {
  it('mismo mes', () => {
    expect(etiquetaRango({ desde: '2026-09-01', hasta: '2026-09-22' })).toBe('1 – 22 sep 2026');
  });
  it('un solo día', () => {
    expect(etiquetaRango({ desde: '2026-09-22', hasta: '2026-09-22' })).toBe('22 sep 2026');
  });
  it('meses distintos del mismo año', () => {
    expect(etiquetaRango({ desde: '2026-08-28', hasta: '2026-09-03' })).toBe('28 ago – 3 sep 2026');
  });
  it('años distintos', () => {
    expect(etiquetaRango({ desde: '2025-12-28', hasta: '2026-01-03' })).toBe('28 dic 2025 – 3 ene 2026');
  });
  it('extremos al revés se ordenan', () => {
    expect(normalizarRango({ desde: '2026-09-22', hasta: '2026-09-01' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-22' });
    expect(etiquetaRango({ desde: '2026-09-22', hasta: '2026-09-01' })).toBe('1 – 22 sep 2026');
  });
});

describe('presetsRango', () => {
  const hoy = '2026-09-22';

  it('calcula los atajos sobre el «hoy» recibido', () => {
    const p = Object.fromEntries(presetsRango(hoy).map((x) => [x.id, x.rango]));
    expect(p.hoy).toEqual({ desde: hoy, hasta: hoy });
    expect(p.ayer).toEqual({ desde: '2026-09-21', hasta: '2026-09-21' });
    expect(p['7d']).toEqual({ desde: '2026-09-16', hasta: hoy });
    expect(p['30d']).toEqual({ desde: '2026-08-24', hasta: hoy });
    expect(p.mes).toEqual({ desde: '2026-09-01', hasta: hoy });
    expect(p.mesPasado).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
  });

  it('mes pasado cruza el año en enero', () => {
    const p = presetsRango('2026-01-10').find((x) => x.id === 'mesPasado');
    expect(p?.rango).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });

  it('presetDe reconoce el atajo activo', () => {
    expect(presetDe({ desde: '2026-09-01', hasta: hoy }, hoy)).toBe('mes');
    expect(presetDe({ desde: '2026-09-02', hasta: hoy }, hoy)).toBeNull();
  });
});

describe('esFechaPlana / inicioDeMes', () => {
  it('valida días reales', () => {
    expect(esFechaPlana('2026-02-28')).toBe(true);
    expect(esFechaPlana('2026-02-30')).toBe(false);
    expect(esFechaPlana('2026-9-1')).toBe(false);
    expect(esFechaPlana(undefined)).toBe(false);
  });
  it('inicioDeMes', () => {
    expect(inicioDeMes('2026-09-22')).toBe('2026-09-01');
  });
});
