/// <reference types="jest" />
/** F12 — modelo puro de la página de referidos: filtros, conteos y formulario de registro. */
import { EMPTY_REFERRAL_FILTERS, countByStatus, filterReferrals, registerFormToPayload, validateRegisterForm, emptyRegisterForm } from '../referralModel';
import type { ReferralView } from '../referralsService';

const R = (id: string, extra: Partial<ReferralView> = {}): ReferralView => ({
  id, organization_id: 120, program_id: null, referrer_customer_id: 'c1', referred_customer_id: null, referred_name: 'Ana Pérez', referred_email: 'ana@x.co', referred_phone: '300', opportunity_id: null,
  status: 'pending', reward_paid: false, reward_paid_at: null, created_at: '2026-09-01T00:00:00Z', referrer: { id: 'c1', full_name: 'Beto Referidor', email: null }, referred: null, program: null, opportunity: null, ...extra,
});

describe('referralModel · filtros', () => {
  const list = [R('1'), R('2', { status: 'qualified', referred_name: 'Carla', referred_email: null, referred_phone: null }), R('3', { status: 'converted', referrer: { id: 'c2', full_name: 'Dani', email: null } })];
  it('sin filtros devuelve todo', () => {
    expect(filterReferrals(list, EMPTY_REFERRAL_FILTERS).map((r) => r.id)).toEqual(['1', '2', '3']);
  });
  it('por estado', () => {
    expect(filterReferrals(list, { ...EMPTY_REFERRAL_FILTERS, status: 'qualified' }).map((r) => r.id)).toEqual(['2']);
  });
  it('por texto: nombre, correo, teléfono o referidor, sin distinguir mayúsculas ni acentos exactos', () => {
    expect(filterReferrals(list, { ...EMPTY_REFERRAL_FILTERS, q: 'ANA' }).map((r) => r.id)).toEqual(['1', '3']);
    expect(filterReferrals(list, { ...EMPTY_REFERRAL_FILTERS, q: 'dani' }).map((r) => r.id)).toEqual(['3']);
    expect(filterReferrals(list, { ...EMPTY_REFERRAL_FILTERS, q: '300' }).map((r) => r.id)).toEqual(['1', '3']);
    expect(filterReferrals(list, { ...EMPTY_REFERRAL_FILTERS, q: 'zzz' })).toEqual([]);
  });
  it('cuenta por estado con ceros', () => {
    expect(countByStatus(list)).toEqual({ pending: 1, contacted: 0, qualified: 1, converted: 1, rejected: 0 });
  });
});

describe('referralModel · formulario de registro', () => {
  it('exige referidor y nombre; correo válido si viene', () => {
    expect(validateRegisterForm(emptyRegisterForm()).map((e) => e.field)).toEqual(['referrer_customer_id', 'referred_name']);
    const f = { ...emptyRegisterForm(), referrer_customer_id: 'c1', referred_name: 'Ana', referred_email: 'mal' };
    expect(validateRegisterForm(f)).toEqual([{ field: 'referred_email', message: expect.any(String) }]);
  });
  it('el payload recorta y manda null en vacíos; program_id vacío -> null', () => {
    const f = { ...emptyRegisterForm(), referrer_customer_id: 'c1', referred_name: ' Ana ', referred_email: '', referred_phone: ' 300 ', program_id: '' };
    expect(registerFormToPayload(f)).toEqual({ referrer_customer_id: 'c1', referred_name: 'Ana', referred_email: null, referred_phone: '300', program_id: null });
  });
});
