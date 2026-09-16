/// <reference types="jest" />
/**
 * F13 — ronda 2, modelos puros: resumen por moneda (nunca sumas cruzadas),
 * validación de cuotas (periodo natural, fecha real, PATCH contra la fila
 * existente) y helper compartido de la regla dura 5.
 */

import { summarizeCommissions, summarizeCommissionsByCurrency } from '../commissionTransitions';
import { summarizeMonthCommissions, summarizeMonthCommissionsByCurrency } from '../sellerDashboardModel';
import { isRealPlainDate, validateQuotaInput, validateQuotaPatch } from '../quotaProgress';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { foreignOrganizationInBody as fromVoices } from '@/lib/services/crm/voiceLibrary';

const cop = (n: number, status = 'accrued') => ({ status, commission_amount: n, currency: 'COP', metadata: null });
const org113 = [...Array.from({ length: 18 }, (_, i) => cop(41653.59, i < 3 ? 'paid' : 'accrued')), { status: 'accrued', commission_amount: 11344.54, currency: 'USD', metadata: null }];

describe('resumen por moneda (dato real: org 113 tiene 18 COP + 1 USD de 11.344,54)', () => {
  it('summarizeCommissionsByCurrency: la base como principal, la USD aparte; ninguna cifra cruza monedas', () => {
    const s = summarizeCommissionsByCurrency(org113, 'COP');
    expect(s.primary.currency).toBe('COP');
    expect(s.primary.count).toBe(18);
    expect(s.primary.accrued_total).toBe(749764.62);
    expect(s.primary.paid_total).toBe(124960.77);
    expect(s.others).toEqual([expect.objectContaining({ currency: 'USD', count: 1, accrued_total: 11344.54, pending_total: 11344.54, paid_total: 0 })]);
    // La suma ingenua (lo que hacía la ronda 1) NO aparece en ningún sitio.
    const naive = summarizeCommissions(org113).accrued_total;
    expect(naive).toBe(761109.16);
    expect([s.primary.accrued_total, ...s.others.map((o) => o.accrued_total)]).not.toContain(naive);
  });
  it('sin filas de la base: la principal queda a cero (y cuenta 0) pero la moneda sigue siendo la base', () => {
    const s = summarizeCommissionsByCurrency([{ status: 'paid', commission_amount: 5, currency: 'USD', metadata: null }], 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', count: 0, accrued_total: 0 });
    expect(s.others).toEqual([expect.objectContaining({ currency: 'USD', paid_total: 5 })]);
  });
  it('currency nula o vacía cuenta como moneda base; las otras se ordenan por código', () => {
    const s = summarizeCommissionsByCurrency(
      [{ status: 'accrued', commission_amount: 1, currency: null, metadata: null }, { ...cop(2), currency: '' }, { ...cop(3), currency: 'USD' }, { ...cop(4), currency: 'EUR' }],
      'COP'
    );
    expect(s.primary.pending_total).toBe(3);
    expect(s.others.map((o) => o.currency)).toEqual(['EUR', 'USD']);
  });
  it('summarizeMonthCommissionsByCurrency (widget): base y otras; la de un solo bloque no cambia', () => {
    const m = summarizeMonthCommissionsByCurrency(org113, 'COP');
    expect(m.primary).toEqual({ currency: 'COP', accrued: 624803.85, paid: 124960.77, total: 749764.62, count: 18 });
    expect(m.others).toEqual([{ currency: 'USD', accrued: 11344.54, paid: 0, total: 11344.54, count: 1 }]);
    expect(summarizeMonthCommissions(org113.slice(0, 18))).toEqual({ accrued: 624803.85, paid: 124960.77, total: 749764.62, count: 18 });
  });
});

describe('validateQuotaInput — periodo natural y fecha real', () => {
  const base = { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_currency: 'COP' };
  it('mensual de 45 días → 400 en period_end (el periodo es el mes natural completo)', () => {
    const v = validateQuotaInput({ ...base, period_end: '2026-10-15' });
    expect(v).toMatchObject({ ok: false, field: 'period_end' });
    if (!v.ok) expect(v.message).toMatch(/mes natural|1 al 30/i);
  });
  it('mensual que empieza el día 2 → 400 en period_start', () => {
    expect(validateQuotaInput({ ...base, period_start: '2026-09-02' })).toMatchObject({ ok: false, field: 'period_start' });
  });
  it('anual de un mes y trimestral de un mes → 400; trimestre y año naturales → ok', () => {
    expect(validateQuotaInput({ ...base, period: 'yearly' })).toMatchObject({ ok: false });
    expect(validateQuotaInput({ ...base, period: 'quarterly' })).toMatchObject({ ok: false });
    expect(validateQuotaInput({ ...base, period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period: 'yearly', period_start: '2026-01-01', period_end: '2026-12-31' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period: 'yearly', period_start: '2026-01-01', period_end: '2026-12-30' })).toMatchObject({ ok: false, field: 'period_end' });
  });
  it('2026-02-31 no existe → 400 aunque pase la forma YYYY-MM-DD; febrero bisiesto sí', () => {
    expect(validateQuotaInput({ ...base, period_start: '2026-02-01', period_end: '2026-02-31' })).toMatchObject({ ok: false, field: 'period_end' });
    expect(validateQuotaInput({ ...base, period_start: '2026-02-01', period_end: '2026-02-28' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period_start: '2028-02-01', period_end: '2028-02-29' })).toMatchObject({ ok: true });
    expect(isRealPlainDate('2026-02-31')).toBe(false);
    expect(isRealPlainDate('2026-13-01')).toBe(false);
    expect(isRealPlainDate('2026-00-10')).toBe(false);
    expect(isRealPlainDate('2026-02-28')).toBe(true);
    expect(isRealPlainDate('2026-2-8')).toBe(false);
  });
  it('sin target_currency el valor queda sin moneda (la fija la ruta con la base de la organización): nunca «COP» cableado', () => {
    const v = validateQuotaInput({ ...base, target_currency: undefined });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.target_currency).toBeUndefined();
    const w = validateQuotaInput({ ...base, target_currency: 'usd' });
    if (w.ok) expect(w.value.target_currency).toBe('USD');
  });
});

describe('validateQuotaPatch — parcial contra la fila existente', () => {
  const existing = { period: 'monthly' as const, period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_type: 'revenue' as const, target_currency: 'COP' };
  it('period_end anterior al inicio existente → error en period_end', () => {
    expect(validateQuotaPatch({ period_end: '2026-08-01' }, existing)).toMatchObject({ ok: false, field: 'period_end' });
  });
  it('body vacío → error «Nada que actualizar»; achieved_amount y organization_id se ignoran', () => {
    expect(validateQuotaPatch({}, existing)).toMatchObject({ ok: false, field: 'body' });
    expect(validateQuotaPatch({ achieved_amount: 5, organization_id: 121 }, existing)).toMatchObject({ ok: false, field: 'body' });
  });
  it('solo target_amount → ok con solo ese campo en el patch', () => {
    const v = validateQuotaPatch({ target_amount: 25 }, existing);
    expect(v).toEqual({ ok: true, value: { target_amount: 25 } });
  });
  it('period_start + period_end coherentes con el periodo existente → ok con ambos', () => {
    expect(validateQuotaPatch({ period_start: '2026-10-01', period_end: '2026-10-31' }, existing)).toEqual({ ok: true, value: { period_start: '2026-10-01', period_end: '2026-10-31' } });
  });
});

describe('regla dura 5 — una sola implementación compartida', () => {
  it('foreignOrganizationInBody vive en src/lib/security y Voces reexporta la misma función', () => {
    expect(fromVoices).toBe(foreignOrganizationInBody);
    expect(foreignOrganizationInBody(undefined, 120)).toBeNull();
    expect(foreignOrganizationInBody('', 120)).toBeNull();
    expect(foreignOrganizationInBody(120, 120)).toBeNull();
    expect(foreignOrganizationInBody('120', 120)).toBeNull();
    expect(foreignOrganizationInBody(121, 120)).toBe(121);
    expect(foreignOrganizationInBody('x', 120)).toBe('x');
  });
});
