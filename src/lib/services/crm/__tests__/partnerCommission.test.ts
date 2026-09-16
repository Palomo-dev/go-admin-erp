/// <reference types="jest" />
/**
 * F12 — comisión de partner (puro). La comisión es un REGISTRO en
 * `partner_deals`, no un pago: aquí solo se calcula y se decide la transición.
 * Tasa: la del partner si la tiene (> 0); si no, la del tier; si no, 0.
 */
import {
  effectiveCommissionRate,
  computePartnerCommission,
  canTransitionCommission,
  checkCommissionTransition,
  commissionPatch,
  summarizeCommissions,
  COMMISSION_STATUSES,
  DEAL_TYPES,
} from '../partnerCommission';

describe('partnerCommission · tasa efectiva', () => {
  it('la tasa propia del partner gana sobre la del tier', () => {
    expect(effectiveCommissionRate({ commission_rate: 12.5 }, { commission_rate: 20 })).toBe(12.5);
  });
  it('partner con tasa 0 (= hereda) usa la del tier', () => {
    expect(effectiveCommissionRate({ commission_rate: 0 }, { commission_rate: 15 })).toBe(15);
  });
  it('partner sin tasa y sin tier -> 0', () => {
    expect(effectiveCommissionRate({ commission_rate: null }, null)).toBe(0);
    expect(effectiveCommissionRate({ commission_rate: undefined }, undefined)).toBe(0);
  });
  it('valores no numéricos (texto de PostgREST) se interpretan', () => {
    expect(effectiveCommissionRate({ commission_rate: '7.50' as unknown as number }, null)).toBe(7.5);
    expect(effectiveCommissionRate({ commission_rate: 'abc' as unknown as number }, { commission_rate: '9' as unknown as number })).toBe(9);
  });
  it('tasa negativa del partner no se usa', () => {
    expect(effectiveCommissionRate({ commission_rate: -5 }, { commission_rate: 10 })).toBe(10);
  });
});

describe('partnerCommission · importe', () => {
  it('monto x tasa / 100, redondeado a 2 decimales', () => {
    expect(computePartnerCommission(1000000, 10)).toBe(100000);
    expect(computePartnerCommission(333.33, 15)).toBe(50);
    expect(computePartnerCommission(1234.567, 12.5)).toBe(154.32);
  });
  it('monto nulo, negativo o no numérico -> 0 (nunca NaN)', () => {
    expect(computePartnerCommission(null, 10)).toBe(0);
    expect(computePartnerCommission(-100, 10)).toBe(0);
    expect(computePartnerCommission('abc', 10)).toBe(0);
    expect(computePartnerCommission(undefined, 10)).toBe(0);
  });
  it('monto como texto (numeric de PostgREST) se interpreta', () => {
    expect(computePartnerCommission('2500.50', 10)).toBe(250.05);
  });
  it('tasa no válida -> 0', () => {
    expect(computePartnerCommission(1000, NaN)).toBe(0);
    expect(computePartnerCommission(1000, -1)).toBe(0);
  });
});

describe('partnerCommission · transiciones', () => {
  it('conoce los CHECK de la BD', () => {
    expect([...COMMISSION_STATUSES]).toEqual(['pending', 'approved', 'paid', 'rejected']);
    expect([...DEAL_TYPES]).toEqual(['referral', 'co_sell', 'reseller']);
  });
  it.each([
    ['pending', 'approved', true],
    ['pending', 'rejected', true],
    ['approved', 'paid', true],
    ['approved', 'rejected', true],
    ['pending', 'paid', false],
    ['approved', 'pending', false],
    ['paid', 'rejected', false],
    ['paid', 'approved', false],
    ['rejected', 'approved', false],
    ['rejected', 'pending', false],
    ['pending', 'pending', false],
  ])('%s -> %s = %s', (from, to, ok) => {
    expect(canTransitionCommission(from as never, to as never)).toBe(ok);
  });
  it('checkCommissionTransition devuelve código y status HTTP', () => {
    expect(checkCommissionTransition('pending', 'paid')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', statusCode: 409 });
    expect(checkCommissionTransition('pending', 'x')).toMatchObject({ ok: false, code: 'INVALID_STATUS', statusCode: 400 });
    expect(checkCommissionTransition('approved', 'paid')).toEqual({ ok: true });
  });
  it('commissionPatch: solo `paid` fija commission_paid_at', () => {
    const now = new Date('2026-09-15T10:00:00.000Z');
    expect(commissionPatch('paid', now)).toEqual({ commission_status: 'paid', commission_paid_at: '2026-09-15T10:00:00.000Z' });
    expect(commissionPatch('approved', now)).toEqual({ commission_status: 'approved' });
    expect(commissionPatch('rejected', now)).toEqual({ commission_status: 'rejected' });
  });
});

describe('partnerCommission · resumen por partner', () => {
  it('suma por estado y cuenta deals; rechazados no suman pendiente', () => {
    const s = summarizeCommissions([
      { commission_status: 'pending', commission_amount: 100 },
      { commission_status: 'pending', commission_amount: '50' },
      { commission_status: 'approved', commission_amount: 30 },
      { commission_status: 'paid', commission_amount: 20 },
      { commission_status: 'rejected', commission_amount: 999 },
      { commission_status: 'paid', commission_amount: null },
    ]);
    expect(s).toEqual({ count: 6, pending: 150, approved: 30, paid: 20, rejected: 999, outstanding: 180 });
  });
  it('lista vacía -> ceros', () => {
    expect(summarizeCommissions([])).toEqual({ count: 0, pending: 0, approved: 0, paid: 0, rejected: 0, outstanding: 0 });
  });
});
