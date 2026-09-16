/// <reference types="jest" />
/**
 * F13 — modelo puro del editor de cuotas (`quotaForm.ts`).
 */
import { defaultQuotaForm, formToPayload, periodLabelFor, validateQuotaForm } from '../quotaForm';

describe('defaultQuotaForm', () => {
  it('parte del mes de hoy (día calendario de la organización) en ingresos y moneda de la org', () => {
    const f = defaultQuotaForm('2026-09-15', 'COP');
    expect(f).toEqual({ period: 'monthly', anchor: '2026-09-15', target_type: 'revenue', target_amount: '', target_currency: 'COP' });
  });
});

describe('formToPayload', () => {
  it('deriva period_start/period_end del periodo y la fecha ancla; la meta se convierte a número', () => {
    expect(formToPayload({ period: 'quarterly', anchor: '2026-08-02', target_type: 'revenue', target_amount: '2.500.000', target_currency: 'COP' })).toEqual({
      period: 'quarterly',
      period_start: '2026-07-01',
      period_end: '2026-09-30',
      target_type: 'revenue',
      target_amount: 2500000,
      target_currency: 'COP',
    });
    expect(formToPayload({ period: 'monthly', anchor: '2026-09-15', target_type: 'calls', target_amount: '40', target_currency: 'COP' }).target_amount).toBe(40);
  });
  it('acepta coma decimal para ingresos', () => {
    expect(formToPayload({ period: 'monthly', anchor: '2026-09-15', target_type: 'revenue', target_amount: '1.234,5', target_currency: 'COP' }).target_amount).toBe(1234.5);
  });
});

describe('validateQuotaForm', () => {
  const ok = { period: 'monthly', anchor: '2026-09-15', target_type: 'revenue', target_amount: '100', target_currency: 'COP' } as const;
  it('sin errores con un formulario correcto', () => {
    expect(validateQuotaForm(ok)).toEqual([]);
  });
  it('meta vacía o cero → error en target_amount; ancla vacía → error en anchor; conteo decimal → error', () => {
    expect(validateQuotaForm({ ...ok, target_amount: '' })).toEqual([{ field: 'target_amount', message: expect.stringMatching(/meta/i) }]);
    expect(validateQuotaForm({ ...ok, target_amount: '0' })[0].field).toBe('target_amount');
    expect(validateQuotaForm({ ...ok, anchor: '' })[0].field).toBe('anchor');
    expect(validateQuotaForm({ ...ok, target_type: 'deals', target_amount: '2,5' })[0].field).toBe('target_amount');
  });
});

describe('periodLabelFor', () => {
  it('describe el periodo en español, sin desplazar el día', () => {
    expect(periodLabelFor('monthly', '2026-09-01', '2026-09-30')).toBe('Septiembre 2026');
    expect(periodLabelFor('quarterly', '2026-07-01', '2026-09-30')).toBe('3.er trimestre 2026');
    expect(periodLabelFor('yearly', '2026-01-01', '2026-12-31')).toBe('Año 2026');
  });
});
