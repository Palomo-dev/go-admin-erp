/// <reference types="jest" />
/**
 * F13 — casos únicos consolidados de las rondas (2026-09-21): modelos puros.
 * Vienen de `f13Round2Pure` (constructor r2), `f13Round2Tester` (tester r2) y
 * `f13Round3Tester` (tester r3). Cubre: resumen por moneda (nunca sumas
 * cruzadas; dato real de la org 113: 18 COP + 1 USD), validación de cuotas
 * (periodo natural, fecha real, PATCH contra la fila existente, cambio de
 * `period`), la única implementación de la regla dura 5 (`foreignOrganizationInBody`,
 * reexportada por Voces sin cambiar de contrato) y el modelo de foco de la UI.
 */
// `f13RouteSupport` arrastra `@/lib/utils/orgContext` (svix, ESM puro): se dobla con la clase real de error.
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(),
}));

import { resolvePrimaryCurrency, summarizeCommissions, summarizeCommissionsByCurrency } from '../commissionTransitions';
import { summarizeMonthCommissions, summarizeMonthCommissionsByCurrency } from '../sellerDashboardModel';
import { isRealPlainDate, validateQuotaInput, validateQuotaPatch, type QuotaInput } from '../quotaProgress';
import { rejectForeignOrganization } from '../f13RouteSupport';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { foreignOrganizationInBody as fromVoices } from '../voiceLibrary';
import { focusAfterCommissionAction, pluralComisiones } from '@/components/finanzas/comisiones/comisionesModel';

const cop = (n: number, status = 'accrued') => ({ status, commission_amount: n, currency: 'COP', metadata: null });
const org113 = [...Array.from({ length: 18 }, (_, i) => cop(41653.59, i < 3 ? 'paid' : 'accrued')), { status: 'accrued', commission_amount: 11344.54, currency: 'USD', metadata: null }];

describe('resumen por moneda (r2 pure; dato real: org 113 tiene 18 COP + 1 USD de 11.344,54)', () => {
  it('summarizeCommissionsByCurrency: la base como principal, la USD aparte; ninguna cifra cruza monedas', () => {
    const s = summarizeCommissionsByCurrency(org113, 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', count: 18, accrued_total: 749764.62, paid_total: 124960.77 });
    expect(s.others).toEqual([expect.objectContaining({ currency: 'USD', count: 1, accrued_total: 11344.54, pending_total: 11344.54, paid_total: 0 })]);
    const naive = summarizeCommissions(org113).accrued_total; // la suma ingenua (ronda 1) NO aparece en ningún sitio
    expect(naive).toBe(761109.16);
    expect([s.primary.accrued_total, ...s.others.map((o) => o.accrued_total)]).not.toContain(naive);
  });
  it('sin filas de la base: la principal queda a cero (y cuenta 0) pero la moneda sigue siendo la base', () => {
    const s = summarizeCommissionsByCurrency([{ status: 'paid', commission_amount: 5, currency: 'USD', metadata: null }], 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', count: 0, accrued_total: 0 });
    expect(s.others).toEqual([expect.objectContaining({ currency: 'USD', paid_total: 5 })]);
  });
  it('summarizeMonthCommissionsByCurrency (widget): base y otras; la de un solo bloque no cambia', () => {
    const m = summarizeMonthCommissionsByCurrency(org113, 'COP');
    expect(m.primary).toEqual({ currency: 'COP', accrued: 624803.85, paid: 124960.77, total: 749764.62, count: 18 });
    expect(m.others).toEqual([{ currency: 'USD', accrued: 11344.54, paid: 0, total: 11344.54, count: 1 }]);
    expect(summarizeMonthCommissions(org113.slice(0, 18))).toEqual({ accrued: 624803.85, paid: 124960.77, total: 749764.62, count: 18 });
  });
  it('tester r2 2.1: base COP con 3 monedas y currency null: principal = COP (incluye la null), others = [EUR(10 pagado), USD] ordenadas; nada se pierde ni se mezcla', () => {
    const rows = [
      { status: 'accrued', commission_amount: 100, currency: 'COP' }, { status: 'accrued', commission_amount: 11344.54, currency: 'USD' },
      { status: 'paid', commission_amount: 7, currency: 'EUR' }, { status: 'paid', commission_amount: 3, currency: 'eur' }, { status: 'accrued', commission_amount: 5, currency: null },
    ];
    const s = summarizeCommissionsByCurrency(rows, 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', pending_total: 105, paid_total: 0, count: 2 });
    expect(s.others.map((o) => o.currency)).toEqual(['EUR', 'USD']);
    expect(s.others[0]).toMatchObject({ paid_total: 10, count: 2 });
    expect(s.others[1]).toMatchObject({ pending_total: 11344.54, count: 1 });
    expect([s.primary, ...s.others].reduce((a, o) => a + o.accrued_total, 0)).toBeCloseTo(105 + 10 + 11344.54, 2);
    // tester r2 2.2: sin base, la más frecuente manda; empate → alfabético; sin filas → null
    expect(resolvePrimaryCurrency(rows, null)).toBe('EUR');
    expect(resolvePrimaryCurrency([{ currency: 'USD' }, { currency: 'COP' }], null)).toBe('COP');
    expect(resolvePrimaryCurrency([], null)).toBeNull();
    const noBase = summarizeCommissionsByCurrency(rows, null);
    expect(noBase.primary.currency).toBe('EUR');
    expect(noBase.others.map((o) => o.currency)).toEqual(['COP', 'USD']);
  });
  it('tester r3 4.6 / 2.7: currency null, «» y « cop » cuentan como la base (nada va a others); importes «1e3», «abc» y null no rompen (basura = 0)', () => {
    const s = summarizeCommissionsByCurrency([{ ...cop(1), currency: null }, { ...cop(2), currency: '' }, { ...cop(4), currency: ' cop ' }], 'COP');
    expect(s.primary).toMatchObject({ currency: 'COP', pending_total: 7, count: 3 });
    expect(s.others).toEqual([]);
    const t = summarizeCommissionsByCurrency([{ status: 'accrued', commission_amount: '1e3', currency: 'COP' }, { status: 'accrued', commission_amount: 'abc', currency: 'COP' }, { status: 'paid', commission_amount: null, currency: 'COP' }], 'COP');
    expect(t.primary).toMatchObject({ pending_total: 1000, paid_total: 0, accrued_total: 1000, count: 3 });
  });
});

describe('validateQuotaInput — periodo natural y fecha real (r2 pure, tester r3 2.5)', () => {
  const base = { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_currency: 'COP' };
  it('mensual de 45 días → 400 en period_end (mes natural completo); mensual que empieza el día 2 → 400 en period_start', () => {
    const v = validateQuotaInput({ ...base, period_end: '2026-10-15' });
    expect(v).toMatchObject({ ok: false, field: 'period_end' });
    if (!v.ok) expect(v.message).toMatch(/mes natural|1 al 30/i);
    expect(validateQuotaInput({ ...base, period_start: '2026-09-02' })).toMatchObject({ ok: false, field: 'period_start' });
  });
  it('anual de un mes y trimestral de un mes → 400; trimestre y año naturales → ok; año hasta el 12-30 → 400', () => {
    expect(validateQuotaInput({ ...base, period: 'yearly' })).toMatchObject({ ok: false });
    expect(validateQuotaInput({ ...base, period: 'quarterly' })).toMatchObject({ ok: false });
    expect(validateQuotaInput({ ...base, period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period: 'yearly', period_start: '2026-01-01', period_end: '2026-12-31' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period: 'yearly', period_start: '2026-01-01', period_end: '2026-12-30' })).toMatchObject({ ok: false, field: 'period_end' });
  });
  it('2026-02-31 no existe → 400 aunque pase la forma YYYY-MM-DD; febrero bisiesto sí; isRealPlainDate', () => {
    expect(validateQuotaInput({ ...base, period_start: '2026-02-01', period_end: '2026-02-31' })).toMatchObject({ ok: false, field: 'period_end' });
    expect(validateQuotaInput({ ...base, period_start: '2026-02-01', period_end: '2026-02-28' })).toMatchObject({ ok: true });
    expect(validateQuotaInput({ ...base, period_start: '2028-02-01', period_end: '2028-02-29' })).toMatchObject({ ok: true });
    for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-2-8']) expect(isRealPlainDate(bad)).toBe(false);
    expect(isRealPlainDate('2026-02-28')).toBe(true);
  });
  it('sin target_currency el valor queda sin moneda (la fija la ruta con la base de la org): nunca «COP» cableado; «usd» → USD; revenue admite 2.5', () => {
    const v = validateQuotaInput({ ...base, target_currency: undefined });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.target_currency).toBeUndefined();
    const w = validateQuotaInput({ ...base, target_currency: 'usd' });
    if (w.ok) expect(w.value.target_currency).toBe('USD');
    expect(validateQuotaInput({ ...base, target_type: 'revenue', target_amount: 2.5 })).toMatchObject({ ok: true });
  });
});

describe('validateQuotaPatch — parcial contra la fila existente (r2 pure, tester r2 §3)', () => {
  const existing: QuotaInput = { period: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', target_amount: 10, target_type: 'revenue', target_currency: 'COP' };
  it('period_end anterior al inicio existente → error en period_end; body vacío o solo achieved_amount/organization_id → error «body»', () => {
    expect(validateQuotaPatch({ period_end: '2026-08-01' }, existing)).toMatchObject({ ok: false, field: 'period_end' });
    expect(validateQuotaPatch({}, existing)).toMatchObject({ ok: false, field: 'body' });
    expect(validateQuotaPatch({ achieved_amount: 5, organization_id: 121 }, existing)).toMatchObject({ ok: false, field: 'body' });
  });
  it('solo target_amount → patch con solo ese campo; period_start + period_end coherentes → ambos', () => {
    expect(validateQuotaPatch({ target_amount: 25 }, existing)).toEqual({ ok: true, value: { target_amount: 25 } });
    expect(validateQuotaPatch({ period_start: '2026-10-01', period_end: '2026-10-31' }, existing)).toEqual({ ok: true, value: { period_start: '2026-10-01', period_end: '2026-10-31' } });
  });
  it('tester r2 3.1–3.3: solo period=quarterly/yearly sin tocar límites → error (el mes no es un trimestre); con límites del trimestre natural → ok con los tres; period_start solo coherente → ok, a otro mes → error en period_end', () => {
    expect(validateQuotaPatch({ period: 'quarterly' }, existing)).toMatchObject({ ok: false, field: 'period_start' });
    expect(validateQuotaPatch({ period: 'yearly' }, existing)).toMatchObject({ ok: false, field: 'period_start' });
    expect(validateQuotaPatch({ period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' }, existing)).toEqual({ ok: true, value: { period: 'quarterly', period_start: '2026-07-01', period_end: '2026-09-30' } });
    expect(validateQuotaPatch({ period_start: '2026-09-01' }, existing)).toEqual({ ok: true, value: { period_start: '2026-09-01' } });
    expect(validateQuotaPatch({ period_start: '2026-10-01' }, existing)).toMatchObject({ ok: false, field: 'period_end' });
  });
});

describe('regla dura 5 — una sola implementación compartida (r2 pure, tester r2 §1)', () => {
  it('foreignOrganizationInBody vive en src/lib/security y Voces (voiceLibrary) reexporta EXACTAMENTE la misma función', () => {
    expect(fromVoices).toBe(foreignOrganizationInBody);
  });
  it.each([
    [120, null], ['120', null], [' 120 ', null], [120.0, null], [undefined, null], [null, null], ['', null], ['   ', null],
    [121, 121], ['121', '121'], [0, 0], ['abc', 'abc'], [-120, -120], ['120abc', '120abc'], [true, true],
  ])('foreignOrganizationInBody(%p, 120) → %p', (claimed, expected) => {
    expect(foreignOrganizationInBody(claimed, 120)).toEqual(expected);
  });
  it('rejectForeignOrganization: «120» (texto) pasa sin registrar; «121» lanza 403 FOREIGN_ORGANIZATION y registra ruta, sesión y body', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => rejectForeignOrganization('T', { organization_id: '120' }, { organizationId: 120, userId: 'u-1' })).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
      expect(() => rejectForeignOrganization('T', { organization_id: '121' }, { organizationId: 120, userId: 'u-1' })).toThrow(expect.objectContaining({ statusCode: 403, code: 'FOREIGN_ORGANIZATION' }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('organization_id ajeno'), expect.objectContaining({ route: 'T', session: 120, body: '121' }));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('foco tras una acción de comisiones (tester r2 §5)', () => {
  const el = (connected: boolean) => ({ isConnected: connected });
  it('sin fila siguiente ni «Actualizar» → «Seleccionar todas»; sin ninguno → null; el opener conectado gana; el desconectado no cuenta', () => {
    const selectAll = el(true);
    expect(focusAfterCommissionAction(el(false), [null, undefined, selectAll])).toBe(selectAll);
    expect(focusAfterCommissionAction(el(false), [el(false), el(false), el(false)])).toBeNull();
    expect(focusAfterCommissionAction(null, [])).toBeNull();
    const opener = el(true);
    expect(focusAfterCommissionAction(opener, [selectAll])).toBe(opener);
  });
  it('pluralComisiones: 1 comisión pagada / 2 comisiones pagadas (sin tilde en el plural)', () => {
    expect(pluralComisiones(1, 'pagada')).toBe('1 comisión pagada');
    expect(pluralComisiones(2, 'pagada')).toBe('2 comisiones pagadas');
    expect(pluralComisiones(7)).toBe('7 comisiones');
  });
});
