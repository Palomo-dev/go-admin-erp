/// <reference types="jest" />
/** F12 — modelo puro de la página de partners. */
import {
  emptyPartnerForm,
  partnerToForm,
  validatePartnerForm,
  partnerFormToPayload,
  emptyTierForm,
  tierToForm,
  validateTierForm,
  tierFormToPayload,
  filterPartners,
  EMPTY_PARTNER_FILTERS,
  formatMoney,
  formatRate,
} from '../partnerModel';
import type { PartnerView } from '../partnerService';

const P = (id: string, extra: Partial<PartnerView> = {}): PartnerView => ({
  id, organization_id: 120, name: 'Carlos', company_name: 'Consultoría', email: 'carlos@x.co', phone: null, tier_id: 't1', commission_rate: 12.5, is_active: true, created_at: '2026-09-01T00:00:00Z',
  tier: { id: 't1', name: 'Oro', commission_rate: 20 }, effective_rate: 12.5, deals_count: 1, commissions: { count: 1, pending: 10, approved: 0, paid: 0, rejected: 0, outstanding: 10 }, commissions_currency: 'COP', currency_mixed: false, ...extra,
});

describe('partnerModel · formulario de partner', () => {
  it('tasa 0 en la fila se muestra vacía (hereda); vacía en el formulario se guarda como 0', () => {
    expect(partnerToForm(P('1', { commission_rate: 0 })).commission_rate).toBe('');
    expect(partnerToForm(P('1')).commission_rate).toBe('12.5');
    expect(partnerFormToPayload({ ...emptyPartnerForm(), name: 'A', email: 'a@b.co' }).commission_rate).toBe(0);
  });
  it('valida nombre, correo y tasa 0..100', () => {
    expect(validatePartnerForm(emptyPartnerForm()).map((e) => e.field)).toEqual(['name', 'email']);
    expect(validatePartnerForm({ ...emptyPartnerForm(), name: 'A', email: 'mal' })[0].field).toBe('email');
    expect(validatePartnerForm({ ...emptyPartnerForm(), name: 'A', email: 'a@b.co', commission_rate: '120' })[0].field).toBe('commission_rate');
    expect(validatePartnerForm({ ...emptyPartnerForm(), name: 'A', email: 'a@b.co', commission_rate: '' })).toEqual([]);
  });
  it('payload recortado con null en vacíos y tier_id null si no hay', () => {
    expect(partnerFormToPayload({ ...emptyPartnerForm(), name: ' A ', email: ' a@b.co ', phone: ' ', company_name: '' }))
      .toEqual({ name: 'A', company_name: null, email: 'a@b.co', phone: null, tier_id: null, commission_rate: 0, is_active: true });
  });
});

describe('partnerModel · formulario de tier', () => {
  it('beneficios: uno por línea, sin vacíos; umbrales numéricos', () => {
    expect(tierToForm({ id: 't', organization_id: 1, name: 'Oro', min_deals: 3, min_revenue: 100, commission_rate: 15, benefits: ['A', 5, 'B'], created_at: '' }).benefitsText).toBe('A\nB');
    expect(tierFormToPayload({ ...emptyTierForm(), name: 'Oro', min_deals: '3', min_revenue: '100.5', commission_rate: '15', benefitsText: ' A \n\nB' }))
      .toEqual({ name: 'Oro', min_deals: 3, min_revenue: 100.5, commission_rate: 15, benefits: ['A', 'B'] });
  });
  it('valida nombre, entero de deals, revenue y tasa', () => {
    expect(validateTierForm({ ...emptyTierForm(), name: '' }).map((e) => e.field)).toEqual(['name']);
    expect(validateTierForm({ ...emptyTierForm(), name: 'X', min_deals: '1.5' })[0].field).toBe('min_deals');
    expect(validateTierForm({ ...emptyTierForm(), name: 'X', min_revenue: '-1' })[0].field).toBe('min_revenue');
    expect(validateTierForm({ ...emptyTierForm(), name: 'X', commission_rate: '101' })[0].field).toBe('commission_rate');
  });
});

describe('partnerModel · filtros y formato', () => {
  it('filtra por texto (nombre, empresa, correo, tier) y por activos', () => {
    const list = [P('1'), P('2', { name: 'Diana', company_name: null, email: 'd@x.co', is_active: false, tier: null })];
    expect(filterPartners(list, EMPTY_PARTNER_FILTERS).length).toBe(2);
    expect(filterPartners(list, { q: 'oro', onlyActive: false }).map((p) => p.id)).toEqual(['1']);
    expect(filterPartners(list, { q: '', onlyActive: true }).map((p) => p.id)).toEqual(['1']);
    expect(filterPartners(list, { q: 'DIANA', onlyActive: false }).map((p) => p.id)).toEqual(['2']);
  });
  it('dinero con la moneda de la oportunidad; sin moneda, solo la cifra', () => {
    expect(formatMoney(1234.5, 'COP')).toMatch(/1.?234/);
    expect(formatMoney(1234.5, 'COP')).toMatch(/\$|COP/);
    expect(formatMoney(1234.5, null)).not.toMatch(/\$|COP/);
    expect(formatMoney('abc', 'USD')).toMatch(/0/);
    expect(formatRate('12.5')).toBe('12,5 %');
  });
});
