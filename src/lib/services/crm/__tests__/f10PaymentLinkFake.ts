/// <reference types="jest" />
/**
 * F10 — harness compartido del enlace de pago de Stripe (consolidación 2026-09-21,
 * extraído del tester B1). Lo usan `f10.pagos.enlace.stable.test.ts` y
 * `f10.pagos.webhook.stable.test.ts`: doble de `StripeAdapter` con ganchos
 * (`beforeStripeCreate` simula lo que pasa ENTRE leer el saldo y la respuesta de
 * Stripe; `deactivateImpl` fuerza fallos), semilla con señuelo org 121 y
 * helpers. Cada archivo de prueba declara sus propios `jest.mock` apuntando
 * aquí (`fakeClient`, `fakeAdapter`). Fixtures sin datos reales.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import type { StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { NextRequest } from 'next/server';

export const PLATFORM_SK = ['sk_test_', '51platformkey_tester_b1_abcdefgh'].join('');
export const PLATFORM_WH = ['whsec_', 'platform_tester_b1_0123456789'].join('');
export const ORG_SK = ['sk_live_', '51org120key_tester_b1_abcdefghij'].join('');
export const ORG_WH = ['whsec_', 'org120_tester_b1_0123456789'].join('');
export const SECRETS = [PLATFORM_SK, PLATFORM_WH, ORG_SK, ORG_WH];
export const platformEnv = { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH };
export const readiness = { configured: true, source: 'platform' as const, secretKey: PLATFORM_SK, webhookSecret: PLATFORM_WH, missing: [] as string[] };

export interface LinkCall { key: string; input: { amountMinor: number; currency: string; metadata: Record<string, string> } }
export const state = {
  db: null as unknown as FakeDb,
  linkCalls: [] as LinkCall[],
  deactivations: [] as Array<{ key: string; id: string }>,
  linkSeq: 0,
  beforeStripeCreate: null as (() => Promise<void> | void) | null,
  deactivateImpl: null as ((key: string, id: string) => Promise<void>) | null,
};

export function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [
        { id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', customer_id: 'c-1', converted_invoice_id: 'inv-1', payment_link_url: null, payment_link_amount: null, payment_link_id: null, currency: 'COP', total: 6800000, status: 'converted' },
        // cotización propia que apunta a una factura AJENA (org 121)
        { id: 'q-2', organization_id: 120, number: 'COT-0002', opportunity_id: 'op-1', customer_id: 'c-1', converted_invoice_id: 'inv-9', payment_link_url: null, payment_link_amount: null, payment_link_id: null, currency: 'COP', total: 5, status: 'converted' },
        { id: 'q-9', organization_id: 121, number: 'COT-0009', opportunity_id: 'op-9', customer_id: 'c-9', converted_invoice_id: 'inv-9', payment_link_url: 'https://buy.stripe.com/ajeno', payment_link_amount: 5, payment_link_id: 'plink_ajeno', currency: 'COP', total: 5, status: 'converted' },
      ],
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 6800000, balance: 5000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: 'op-9', salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      // Pago previo de 1.800.000: el fake recalcula el saldo como el trigger real (total − Σ pagos completed); sin él, 6.800.000 − 5.000.000 no cuadra.
      payments: [{ id: 'pay-seed', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 1800000, currency: 'COP', reference: 'anticipo-seed', method: 'cash' }],
      accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'partial' }],
      commissions: [],
      integration_connections: [],
      integration_credentials: [],
      activities: [],
      opportunities: [{ id: 'op-1', organization_id: 120, name: 'Oportunidad uno', customer_id: 'c-1', amount: 6800000, currency: 'COP', salesperson_id: 'u-1', status: 'won' }],
    },
  };
}

export const fakeAdapter: StripeAdapter = {
  createPaymentLink: async (key, input) => {
    if (state.beforeStripeCreate) await state.beforeStripeCreate();
    state.linkSeq += 1;
    state.linkCalls.push({ key, input: input as LinkCall['input'] });
    return { id: `plink_${state.linkSeq}`, url: `https://buy.stripe.com/fake-${state.linkSeq}` };
  },
  constructEvent: (_sk, rawBody, signature, webhookSecret) => {
    if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
    return JSON.parse(rawBody);
  },
  deactivatePaymentLink: async (key, id) => {
    if (state.deactivateImpl) return state.deactivateImpl(key, id);
    state.deactivations.push({ key, id });
  },
};

/** Cliente doble sobre la BD actual (el `jest.mock` de cada archivo lo invoca perezosamente). */
export const fakeClient = () => createFakeSupabase(state.db);
export const orgContext = async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: fakeClient() });

export function resetState() {
  state.db = seed();
  state.linkCalls.length = 0;
  state.deactivations.length = 0;
  state.linkSeq = 0;
  state.beforeStripeCreate = null;
  state.deactivateImpl = null;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CRM_WEBHOOK_SECRET;
}

export const quotation = (id = 'q-1') => state.db.rows.quotations.find((q) => q.id === id)!;
export const invoice = (id = 'inv-1') => state.db.rows.invoice_sales.find((i) => i.id === id)!;
export const manual = (amount: number, reference: string) => ({ invoice_id: 'inv-1', amount, currency: 'COP', method: 'cash', reference });
export const writesTo = (t: string) => state.db.writes.filter((w) => w.table === t);
export const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });

export function stripeEvent(id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}, type = 'checkout.session.completed') {
  return JSON.stringify({
    id, type, livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', payment_link: 'plink_de_la_sesion', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1', ...meta }, ...over } },
  });
}

/** Credenciales Stripe de la org 120 en `integration_connections` + `integration_credentials` (status `connected`, el único usable). */
export const org120Creds = () => {
  state.db.rows.integration_connections = [{ id: 'ic-120', organization_id: 120, status: 'connected', connector_id: 'x', integration_connectors: { integration_providers: { code: 'stripe' } } }];
  state.db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-120', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-120', purpose: 'webhook_secret', secret_ref: ORG_WH }];
};
export const secretLeak = (spy: jest.SpyInstance) => { const dump = JSON.stringify(spy.mock.calls); return SECRETS.find((s) => dump.includes(s)) ?? null; };
/** Pagos hechos por la prueba (sin el anticipo de la semilla). */
export const newPayments = () => state.db.rows.payments.filter((p) => p.reference !== 'anticipo-seed');
/** Cliente de servicio instrumentado: cuenta cada `from(tabla)`. */
export function instrumented() {
  const reads: string[] = [];
  const base = fakeClient();
  return { reads, client: { ...base, from: (t: string) => { reads.push(t); return base.from(t); } } };
}
