/// <reference types="jest" />
/** F12 — validación de entrada (pura) de partners, tiers, programas, referidos y deals. */
import {
  isUuid,
  validatePartnerInput,
  validateTierInput,
  validateProgramInput,
  validateReferralInput,
  validateDealInput,
} from '../f12Validation';

const U1 = '11111111-1111-4111-8111-111111111111';

describe('f12Validation · isUuid', () => {
  it('acepta uuid y rechaza basura', () => {
    expect(isUuid(U1)).toBe(true);
    expect(isUuid('abc')).toBe(false);
    expect(isUuid(1)).toBe(false);
    expect(isUuid(`${U1} or 1=1`)).toBe(false);
  });
});

describe('f12Validation · partner', () => {
  it('nombre y email obligatorios al crear', () => {
    const r = validatePartnerInput({}, { partial: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field).sort()).toEqual(['email', 'name']);
  });
  it('email con formato inválido -> error en email', () => {
    const r = validatePartnerInput({ name: 'Ana', email: 'no-es-correo' }, { partial: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].field).toBe('email');
  });
  it('normaliza: recorta y pasa el email a minúsculas', () => {
    const r = validatePartnerInput({ name: '  Ana  ', email: ' ANA@Example.com ' }, { partial: false });
    expect(r).toEqual({ ok: true, value: { name: 'Ana', email: 'ana@example.com' } });
  });
  it('commission_rate fuera de 0..100 o no numérico -> error', () => {
    expect(validatePartnerInput({ name: 'A', email: 'a@b.co', commission_rate: 101 }, { partial: false }).ok).toBe(false);
    expect(validatePartnerInput({ name: 'A', email: 'a@b.co', commission_rate: -1 }, { partial: false }).ok).toBe(false);
    expect(validatePartnerInput({ name: 'A', email: 'a@b.co', commission_rate: 'x' }, { partial: false }).ok).toBe(false);
    const ok = validatePartnerInput({ name: 'A', email: 'a@b.co', commission_rate: '12.5' }, { partial: false });
    expect(ok).toEqual({ ok: true, value: { name: 'A', email: 'a@b.co', commission_rate: 12.5 } });
  });
  it('tier_id debe ser uuid o null', () => {
    expect(validatePartnerInput({ name: 'A', email: 'a@b.co', tier_id: 'x' }, { partial: false }).ok).toBe(false);
    expect(validatePartnerInput({ name: 'A', email: 'a@b.co', tier_id: null }, { partial: false })).toEqual({ ok: true, value: { name: 'A', email: 'a@b.co', tier_id: null } });
  });
  it('parcial: solo valida lo presente; vacío -> error «nada que actualizar»', () => {
    expect(validatePartnerInput({ phone: ' 300 ' }, { partial: true })).toEqual({ ok: true, value: { phone: '300' } });
    expect(validatePartnerInput({ name: '' }, { partial: true }).ok).toBe(false);
    expect(validatePartnerInput({}, { partial: true }).ok).toBe(false);
  });
  it('ignora claves ajenas (organization_id, id) y no las devuelve', () => {
    const r = validatePartnerInput({ name: 'A', email: 'a@b.co', organization_id: 121, id: 'x' }, { partial: false });
    expect(r).toEqual({ ok: true, value: { name: 'A', email: 'a@b.co' } });
  });
  it('is_active debe ser booleano', () => {
    expect(validatePartnerInput({ is_active: 'yes' }, { partial: true }).ok).toBe(false);
    expect(validatePartnerInput({ is_active: false }, { partial: true })).toEqual({ ok: true, value: { is_active: false } });
  });
});

describe('f12Validation · tier', () => {
  it('nombre obligatorio, umbrales >= 0 (deals entero), tasa 0..100, benefits lista de textos', () => {
    expect(validateTierInput({}, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: 'Oro', min_deals: -1 }, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: 'Oro', min_deals: 1.5 }, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: 'Oro', min_revenue: 'x' }, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: 'Oro', benefits: 'texto' }, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: 'Oro', benefits: [1] }, { partial: false }).ok).toBe(false);
    expect(validateTierInput({ name: ' Oro ', min_deals: '3', min_revenue: '1000.5', commission_rate: 15, benefits: [' Soporte ', ''] }, { partial: false }))
      .toEqual({ ok: true, value: { name: 'Oro', min_deals: 3, min_revenue: 1000.5, commission_rate: 15, benefits: ['Soporte'] } });
  });
});

describe('f12Validation · programa', () => {
  it('exige name, reward_type y reward_to del CHECK; amount >= 0', () => {
    expect(validateProgramInput({ name: 'P', reward_type: 'points', reward_to: 'both' }, { partial: false }).ok).toBe(false);
    expect(validateProgramInput({ name: 'P', reward_type: 'cash', reward_to: 'everyone' }, { partial: false }).ok).toBe(false);
    expect(validateProgramInput({ name: 'P', reward_type: 'cash', reward_to: 'both', reward_amount: -1 }, { partial: false }).ok).toBe(false);
    expect(validateProgramInput({ name: 'P', reward_type: 'cash', reward_to: 'both' }, { partial: false }))
      .toEqual({ ok: true, value: { name: 'P', reward_type: 'cash', reward_to: 'both', reward_amount: 0 } });
  });
  it('descuento > 100 % no tiene sentido', () => {
    expect(validateProgramInput({ name: 'P', reward_type: 'discount', reward_to: 'both', reward_amount: 150 }, { partial: false }).ok).toBe(false);
  });
});

describe('f12Validation · referido', () => {
  it('exige referrer_customer_id uuid y referred_name; email/teléfono opcionales pero válidos', () => {
    expect(validateReferralInput({}).ok).toBe(false);
    expect(validateReferralInput({ referrer_customer_id: 'x', referred_name: 'Ana' }).ok).toBe(false);
    expect(validateReferralInput({ referrer_customer_id: U1, referred_name: 'Ana', referred_email: 'mal' }).ok).toBe(false);
    expect(validateReferralInput({ referrer_customer_id: U1, referred_name: ' Ana ', referred_email: ' ANA@x.co ', referred_phone: ' 300 ', program_id: null }))
      .toEqual({ ok: true, value: { referrer_customer_id: U1, referred_name: 'Ana', referred_email: 'ana@x.co', referred_phone: '300', program_id: null } });
  });
  it('status, reward_paid u opportunity_id del body se ignoran: nacen pending y se enlazan por sus rutas', () => {
    const r = validateReferralInput({ referrer_customer_id: U1, referred_name: 'Ana', status: 'converted', reward_paid: true, opportunity_id: U1 });
    expect(r).toEqual({ ok: true, value: { referrer_customer_id: U1, referred_name: 'Ana' } });
  });
});

describe('f12Validation · deal', () => {
  it('opportunity_id uuid y deal_type del CHECK; commission_amount del body se ignora', () => {
    expect(validateDealInput({ opportunity_id: 'x', deal_type: 'referral' }).ok).toBe(false);
    expect(validateDealInput({ opportunity_id: U1, deal_type: 'partner' }).ok).toBe(false);
    expect(validateDealInput({ opportunity_id: U1, deal_type: 'co_sell', commission_amount: 999999 }))
      .toEqual({ ok: true, value: { opportunity_id: U1, deal_type: 'co_sell' } });
  });
});
