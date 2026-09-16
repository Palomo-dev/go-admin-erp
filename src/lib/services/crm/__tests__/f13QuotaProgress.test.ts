/// <reference types="jest" />
/**
 * F13 — lógica pura de progreso de cuota (`quotaProgress.ts`).
 * Todo sobre días calendario (`YYYY-MM-DD`): sin `Date` local ni `toISOString`,
 * para que el resultado sea el mismo en TZ=UTC y TZ=America/Bogota.
 */
import {
  addDaysPlain,
  computeQuotaProgress,
  daysBetweenPlain,
  isWithinPeriod,
  periodBoundsFor,
  quotaStatusLabel,
  validateQuotaInput,
} from '../quotaProgress';

describe('periodBoundsFor', () => {
  it('mensual: primer y último día del mes del día dado', () => {
    expect(periodBoundsFor('monthly', '2026-02-10')).toEqual({ period_start: '2026-02-01', period_end: '2026-02-28' });
    expect(periodBoundsFor('monthly', '2028-02-10')).toEqual({ period_start: '2028-02-01', period_end: '2028-02-29' });
  });
  it('trimestral: el trimestre natural', () => {
    expect(periodBoundsFor('quarterly', '2026-09-15')).toEqual({ period_start: '2026-07-01', period_end: '2026-09-30' });
    expect(periodBoundsFor('quarterly', '2026-12-31')).toEqual({ period_start: '2026-10-01', period_end: '2026-12-31' });
  });
  it('anual: el año natural', () => {
    expect(periodBoundsFor('yearly', '2026-09-15')).toEqual({ period_start: '2026-01-01', period_end: '2026-12-31' });
  });
});

describe('daysBetweenPlain / addDaysPlain / isWithinPeriod', () => {
  it('cuenta días calendario sin efectos de zona horaria', () => {
    expect(daysBetweenPlain('2026-09-01', '2026-09-30')).toBe(29);
    expect(daysBetweenPlain('2026-03-07', '2026-03-09')).toBe(2); // cambio de hora en EE. UU.: sigue siendo 2
    expect(addDaysPlain('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysPlain('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('isWithinPeriod incluye ambos extremos', () => {
    expect(isWithinPeriod('2026-09-01', '2026-09-01', '2026-09-30')).toBe(true);
    expect(isWithinPeriod('2026-09-30', '2026-09-01', '2026-09-30')).toBe(true);
    expect(isWithinPeriod('2026-10-01', '2026-09-01', '2026-09-30')).toBe(false);
  });
});

describe('computeQuotaProgress', () => {
  const base = { target_amount: 5_000_000, period_start: '2026-09-01', period_end: '2026-09-30' };

  it('84 % con 7 días restantes y el ritmo diario necesario para cerrar', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: 4_200_000, today: '2026-09-24' });
    expect(p.pct).toBe(84);
    expect(p.remaining).toBe(800_000);
    expect(p.days_remaining).toBe(7); // 24..30 inclusive
    expect(p.days_total).toBe(30);
    expect(p.needed_per_day).toBe(Math.ceil(800_000 / 7));
    expect(p.status).toBe('en_ritmo'); // 84 % logrado con 77 % del tiempo transcurrido
  });

  it('acota el porcentaje visible a 100 y conserva el real', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: 7_500_000, today: '2026-09-10' });
    expect(p.pct).toBe(100);
    expect(p.raw_pct).toBe(150);
    expect(p.remaining).toBe(0);
    expect(p.needed_per_day).toBe(0);
    expect(p.status).toBe('cumplida');
  });

  it('atrasado cuando el avance va por detrás del tiempo transcurrido', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: 1_000_000, today: '2026-09-24' });
    expect(p.pct).toBe(20);
    expect(p.status).toBe('atrasado');
  });

  it('periodo vencido: 0 días restantes, estado según el resultado', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: 1_000_000, today: '2026-10-15' });
    expect(p.days_remaining).toBe(0);
    expect(p.status).toBe('vencida');
    const ok = computeQuotaProgress({ ...base, achieved_amount: 5_000_000, today: '2026-10-15' });
    expect(ok.status).toBe('cumplida');
  });

  it('antes de empezar el periodo: 0 % transcurrido y todos los días por delante', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: 0, today: '2026-08-20' });
    expect(p.days_remaining).toBe(30);
    expect(p.time_pct).toBe(0);
    expect(p.status).toBe('en_ritmo');
  });

  it('cuota 0 o negativa nunca divide por cero', () => {
    const p = computeQuotaProgress({ ...base, target_amount: 0, achieved_amount: 10, today: '2026-09-10' });
    expect(p.pct).toBe(0);
    expect(p.raw_pct).toBe(0);
    expect(Number.isFinite(p.needed_per_day)).toBe(true);
  });

  it('redondea el porcentaje a entero y nunca lo deja negativo', () => {
    const p = computeQuotaProgress({ ...base, achieved_amount: -5, today: '2026-09-10' });
    expect(p.pct).toBe(0);
    expect(computeQuotaProgress({ ...base, achieved_amount: 1_234_567, today: '2026-09-10' }).pct).toBe(25);
  });
});

describe('quotaStatusLabel', () => {
  it('cada estado tiene texto (nunca solo color)', () => {
    for (const s of ['en_ritmo', 'atrasado', 'cumplida', 'vencida'] as const) {
      expect(quotaStatusLabel(s).length).toBeGreaterThan(3);
    }
  });
});

describe('validateQuotaInput', () => {
  const ok = { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 100, target_type: 'revenue', target_currency: 'COP' };
  it('acepta un input correcto', () => {
    expect(validateQuotaInput(ok)).toEqual({ ok: true, value: ok });
  });
  it('rechaza periodo, tipo, monto y fechas inválidos con el campo señalado', () => {
    expect(validateQuotaInput({ ...ok, period: 'weekly' })).toMatchObject({ ok: false, field: 'period' });
    expect(validateQuotaInput({ ...ok, target_type: 'points' })).toMatchObject({ ok: false, field: 'target_type' });
    expect(validateQuotaInput({ ...ok, target_amount: 0 })).toMatchObject({ ok: false, field: 'target_amount' });
    expect(validateQuotaInput({ ...ok, target_amount: 'abc' })).toMatchObject({ ok: false, field: 'target_amount' });
    expect(validateQuotaInput({ ...ok, period_end: '2026-08-30' })).toMatchObject({ ok: false, field: 'period_end' });
    expect(validateQuotaInput({ ...ok, period_start: '2026/09/01' })).toMatchObject({ ok: false, field: 'period_start' });
    expect(validateQuotaInput({ ...ok, target_currency: 'pesos' })).toMatchObject({ ok: false, field: 'target_currency' });
  });
  it('los conteos (deals, activities, calls) deben ser enteros', () => {
    expect(validateQuotaInput({ ...ok, target_type: 'deals', target_amount: 2.5 })).toMatchObject({ ok: false, field: 'target_amount' });
    expect(validateQuotaInput({ ...ok, target_type: 'deals', target_amount: 3 })).toMatchObject({ ok: true });
  });
});
