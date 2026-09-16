/// <reference types="jest" />
/**
 * F10 — TESTER ronda 2 (segunda instancia; la primera escribió
 * `f10Round2Tester.test.ts`). Lo que el coordinador pidió además de las
 * mutaciones: 23505 fuera del espacio `stripe:`, moneda con mayúsculas y
 * minúsculas, desactivación con la clave que verificó, `already_accrued` con
 * `cancelled`, `edited` fijado por el servidor aunque el cliente mande false.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
const PLATFORM_SK = 'sk_test_51platformkey_abcdefghijklmnop';
const PLATFORM_WH = 'whsec_platform_0123456789abcdef';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120, obtenerOrganizacionActiva: () => ({ id: 120 }) }));

import { processStripeWebhook, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { isStripeReferenceDuplicate, registerCrmPayment } from '@/lib/services/crm/paymentService';
import { commissionService } from '@/lib/services/crm/commissionService';
import { updateProposalSections } from '@/lib/services/crm/proposalServerService';
import { buildProposalSections } from '@/lib/services/crm/proposalNarrative';

const deactivations: Array<{ key: string; link: string }> = [];
const fakeAdapter: StripeAdapter = {
  createPaymentLink: async () => ({ id: 'plink', url: 'https://buy.stripe.com/fake' }),
  constructEvent: (_sk, rawBody, signature, webhookSecret) => {
    if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
    return JSON.parse(rawBody);
  },
  deactivatePaymentLink: async (key, link) => { deactivations.push({ key, link }); },
};

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [{ id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', converted_invoice_id: 'inv-1', payment_link_url: null, currency: 'COP', total: 5000000, sections_json: null }],
      invoice_sales: [{ id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 5000000, balance: 5000000, status: 'issued', currency: 'cop', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null }],
      payments: [],
      accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'pending' }],
      commissions: [],
      activities: [],
      opportunities: [{ id: 'op-1', organization_id: 120, salesperson_id: 'u-1', commission_rate: 10, amount: 1000, currency: 'COP' }],
      vendor_commission_rates: [],
      integration_connections: [],
      integration_credentials: [],
    },
  };
}

function stripeEvent(id: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({ id, type: 'checkout.session.completed', livemode: false, data: { object: { id: `cs_${id}`, payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_link: 'plink_abc', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1' }, ...over } } });
}
const env = { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH };

beforeEach(() => { db = seed(); deactivations.length = 0; });

describe('R2B-A Stripe', () => {
  it('moneda: factura en minúsculas (cop) y evento en cop → coincide y el enlace se desactiva con la clave que verificó; evento USD → currency_mismatch con actividad', async () => {
    const ok = await processStripeWebhook(stripeEvent('r1'), `sig:${PLATFORM_WH}`, { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env });
    expect(ok.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, link: 'plink_abc' }]);
    db = seed();
    const bad = await processStripeWebhook(stripeEvent('r2', { currency: 'USD', amount_total: 100 }), `sig:${PLATFORM_WH}`, { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env });
    expect(bad.body).toMatchObject({ applied: false, reason: 'currency_mismatch' });
    expect(db.rows.payments).toHaveLength(0);
    expect(db.rows.activities.map((a) => String(a.notes))).toEqual([expect.stringMatching(/NO aplicado.*USD.*COP/)]);
  });

  it('un 23505 fuera del espacio stripe: NO es idempotencia: registerCrmPayment devuelve error', async () => {
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint "uq_payments_org_stripe_reference"' }, 'manual:abc')).toBe(false);
    expect(isStripeReferenceDuplicate({ code: '23503' }, 'stripe:evt')).toBe(false);
    db.nextWriteError = { table: 'payments', error: { code: '23505', message: 'duplicate key value violates unique constraint "payments_new_pkey"' } };
    const r = await registerCrmPayment(120, { invoice_id: 'inv-1', amount: 1, currency: 'COP', reference: 'manual:abc' }, createFakeSupabase(db) as never);
    expect(r.success).toBe(false);
    expect(r.duplicate).toBeUndefined();
  });

  it('pago parcial NO desactiva el enlace (la factura sigue con saldo)', async () => {
    const out = await processStripeWebhook(stripeEvent('r3', { amount_total: 100000000 }), `sig:${PLATFORM_WH}`, { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(deactivations).toEqual([]);
  });
});

describe('R2B-B Comisión', () => {
  it('cancelled SÍ bloquea un nuevo devengo automático (r3: alineado con el trigger de BD, que cuenta cualquier estado); already_accrued con existing_status', async () => {
    db.rows.commissions = [{ id: 'cm-x', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'cancelled', commission_amount: 100 }];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ id: 'cm-x', already_accrued: true, existing_status: 'cancelled' });
    expect(db.rows.commissions.filter((c) => c.source_id === 'op-1')).toHaveLength(1);
  });

  it('la deduplicación es por organización: una comisión de la org 121 con el mismo source_id no cuenta', async () => {
    db.rows.commissions = [{ id: 'cm-y', organization_id: 121, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', commission_amount: 100 }];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r?.already_accrued).toBeUndefined();
    expect(db.rows.commissions.filter((c) => c.organization_id === 120)).toHaveLength(1);
  });
});

describe('R2B-C Propuesta', () => {
  it('PATCH con edited:false en el body → el servidor guarda edited:true (no se puede «desmarcar» desde el cliente)', async () => {
    const base = buildProposalSections({ opportunityName: 'X', customerName: 'C', opportunityAmount: 100, discoveryFields: [], discovery: {}, objections: [], roi: null, pricing: { currency: 'COP', lines: [], total: 100, billingCycleMonths: null } });
    db.rows.quotations[0].sections_json = base;
    const updated = await updateProposalSections(120, 'q-1', { situacion: { ...base.situacion, content: 'EDITADO', edited: false } }, createFakeSupabase(db) as never);
    expect(updated?.sections?.situacion).toMatchObject({ content: 'EDITADO', edited: true });
    expect(updated?.sections?.problemas.edited).toBe(false);
  });
});
