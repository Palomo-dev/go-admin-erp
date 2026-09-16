/// <reference types="jest" />
/**
 * F10 — pruebas del TESTER (ronda 1). Cubre lo que las suites del constructor
 * no cubren: replay concurrente del webhook de Stripe, monedas sin decimales
 * y de tres decimales, moneda distinta a la factura, longitudes distintas en
 * la comparación en tiempo constante, PATCH de contrato con organización
 * ajena en el body, batería hostil del evaluador ROI, doble comisión
 * (trigger + accrueCommission), demo en el pasado, «Regenerar» que no
 * regenera, y el corrimiento de un día de `valid_until` (columna `date`).
 *
 * Ronda 2 (constructor): los `it.failing` de la ronda 1 se invirtieron al
 * corregir cada hueco (A6/A6b, A7, A9, A10, G1, E1, F2, F5, C6) y afirman
 * ahora el comportamiento correcto.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
const PLATFORM_SK = 'sk_test_51platformkey_abcdefghijklmnop';
const PLATFORM_WH = 'whsec_platform_0123456789abcdef';
const ORG_SK = 'sk_live_51orgkey_abcdefghijklmnopqrs';
const ORG_WH = 'whsec_org121_0123456789abcdef';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120, obtenerOrganizacionActiva: () => ({ id: 120 }) }));

import { processStripeWebhook, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { minorToMajor, majorToMinor } from '@/lib/services/crm/paymentEvents';
import { registerCrmPayment } from '@/lib/services/crm/paymentService';
import { verifyDocumensoSignature, mergeSigners } from '@/lib/services/crm/contractStateMachine';
import { processDocumensoWebhook } from '@/lib/services/crm/contractService';
import { evaluateExpression, evaluateFormula } from '@/lib/services/crm/roiEvaluator';
import { validateCreateDemo } from '@/lib/services/crm/demoInput';
import { mergeSections, buildProposalSections, hasEditedSections } from '@/lib/services/crm/proposalNarrative';
import { addDaysPlain } from '@/lib/services/crm/proposalServerService';
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { commissionService } from '@/lib/services/crm/commissionService';
import { readFileSync } from 'fs';
import { join } from 'path';

const fakeAdapter: StripeAdapter = {
  createPaymentLink: async () => ({ id: 'plink', url: 'https://buy.stripe.com/fake' }),
  constructEvent: (_sk, rawBody, signature, webhookSecret) => {
    if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
    return JSON.parse(rawBody);
  },
};

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [
        { id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', converted_invoice_id: 'inv-1', payment_link_url: null, currency: 'COP', total: 6800000 },
        { id: 'q-9', organization_id: 121, number: 'COT-0009', opportunity_id: 'op-9', converted_invoice_id: 'inv-9', payment_link_url: null, currency: 'COP', total: 5 },
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
      contract_signatures: [
        { id: 'ct-1', organization_id: 120, provider: 'documenso', provider_document_id: 'doc-120', status: 'signed', signers: [{ name: 'A', email: 'a@x.co' }], quotation_id: 'q-1' },
        { id: 'ct-9', organization_id: 121, provider: 'documenso', provider_document_id: 'doc-121', status: 'sent', signers: [{ name: 'B', email: 'b@x.co' }], quotation_id: null },
      ],
      provider_configs: [
        { id: 'pc-120', organization_id: 120, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: 'api_realkey_0123456789abcdef', DOCUMENSO_WEBHOOK_SECRET: 'secret-org-120-0123456789abcdef' }, priority: 10 },
        { id: 'pc-121', organization_id: 121, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: 'api_realkey_zzzzzzzzzzzzzzzz', DOCUMENSO_WEBHOOK_SECRET: 'secret-org-121-0123456789abcdef' }, priority: 10 },
      ],
      opportunities: [{ id: 'op-1', organization_id: 120, salesperson_id: 'u-1', commission_rate: 10, amount: 1000, currency: 'COP' }],
      vendor_commission_rates: [],
      activities: [],
    },
  };
}

/** Actividades `system` registradas sobre la oportunidad op-1 (rechazos del webhook). */
const systemActivities = () => db.rows.activities.filter((a) => a.activity_type === 'system' && a.related_id === 'op-1');

function stripeEvent(id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return JSON.stringify({
    id, type: 'checkout.session.completed', livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1', ...meta }, ...over } },
  });
}

/** Cliente de servicio instrumentado: cuenta cada `from(tabla)`. */
function instrumented() {
  const reads: string[] = [];
  const base = createFakeSupabase(db);
  return { reads, client: { ...base, from: (t: string) => { reads.push(t); return base.from(t); } } as unknown as Parameters<typeof processStripeWebhook>[2]['serviceClient'] };
}

beforeEach(() => { db = seed(); });
/** Pagos hechos por la prueba (sin el anticipo de la semilla). */
const newPayments = () => db.rows.payments.filter((p) => p.reference !== 'anticipo-seed');

describe('T-A Webhook de Stripe (hostil)', () => {
  const env = { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH };

  it('A1 sin cabecera → 400 sin tocar la BD', async () => {
    const { reads, client } = instrumented();
    const out = await processStripeWebhook(stripeEvent('e1'), null, { serviceClient: client, adapter: fakeAdapter, env });
    expect(out.status).toBe(400);
    expect(reads).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it('A2 firma inválida con plataforma configurada → 401; solo lee credenciales de la organización insinuada, nunca escribe', async () => {
    const { reads, client } = instrumented();
    const out = await processStripeWebhook(stripeEvent('e2'), 'sig:whsec_mala', { serviceClient: client, adapter: fakeAdapter, env });
    expect(out.status).toBe(401);
    // Lectura previa a la verificación (necesaria para hallar el secreto de la organización): documentada, no es escritura.
    expect(reads.every((t) => t === 'integration_connections' || t === 'integration_credentials')).toBe(true);
    expect(db.writes).toEqual([]);
  });

  it('A3 firma inválida sin plataforma ni organización configurada → 401 sin escrituras', async () => {
    const out = await processStripeWebhook(stripeEvent('e3'), 'sig:x', { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env: {} });
    expect(out.status).toBe(401);
    expect(db.writes).toEqual([]);
  });

  it('A4 firma válida de la org 121 con metadata de la org 120 → 401 (la organización que verificó manda)', async () => {
    db.rows.integration_connections = [{ id: 'ic-121', organization_id: 121, status: 'connected', integration_connectors: { integration_providers: { code: 'stripe' } } }];
    db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-121', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-121', purpose: 'webhook_secret', secret_ref: ORG_WH }];
    // La metadata insinúa 120 (sin credenciales) → no hay secreto que verifique → 401
    const out = await processStripeWebhook(stripeEvent('e4'), `sig:${ORG_WH}`, { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env: {} });
    expect(out.status).toBe(401);
    expect(db.writes).toEqual([]);
  });

  it('A5 replay SECUENCIAL del mismo event.id → un solo pago', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    await processStripeWebhook(stripeEvent('e5'), `sig:${PLATFORM_WH}`, deps);
    const second = await processStripeWebhook(stripeEvent('e5'), `sig:${PLATFORM_WH}`, deps);
    expect(second.body).toMatchObject({ applied: true, idempotent: true });
    expect(newPayments()).toHaveLength(1);
  });

  it('A6 replay CONCURRENTE del mismo event.id → una sola fila (el índice único parcial `uq_payments_org_stripe_reference` corta la carrera)', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    const [a, b] = await Promise.all([
      processStripeWebhook(stripeEvent('e6'), `sig:${PLATFORM_WH}`, deps),
      processStripeWebhook(stripeEvent('e6'), `sig:${PLATFORM_WH}`, deps),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(db.rows.payments.filter((p) => p.reference === 'stripe:e6')).toHaveLength(1);
  });

  it('A6b replay concurrente: el 23505 del índice se trata como «ya registrado» (applied:false, reason duplicate), la factura se cobra UNA vez y no hay segundo recálculo', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    const outs = await Promise.all([
      processStripeWebhook(stripeEvent('e6b'), `sig:${PLATFORM_WH}`, deps),
      processStripeWebhook(stripeEvent('e6b'), `sig:${PLATFORM_WH}`, deps),
    ]);
    const rows = db.rows.payments.filter((p) => p.reference === 'stripe:e6b');
    expect(rows).toHaveLength(1);
    expect(rows.reduce((s, r) => s + Number(r.amount), 0)).toBe(5000000);
    const applied = outs.filter((o) => o.body.applied === true);
    const dup = outs.filter((o) => o.body.applied === false);
    expect(applied).toHaveLength(1);
    expect(dup).toHaveLength(1);
    expect(dup[0].body).toMatchObject({ success: true, reason: 'duplicate', idempotent: true });
    // La factura y la cartera se actualizaron una sola vez (saldo 0, no negativo)
    expect(db.rows.invoice_sales[0]).toMatchObject({ balance: 0, status: 'paid' });
    expect(db.writes.filter((w) => w.table === 'invoice_sales' && w.op === 'update')).toHaveLength(1);
    expect(db.writes.filter((w) => w.table === 'accounts_receivable' && w.op === 'update')).toHaveLength(1);
  });

  it('A7 checkout.session.completed con payment_status=unpaid → 200 ignored (no 400: Stripe reintentaría 3 días) y async_payment_succeeded SÍ registra el pago diferido', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    const out = await processStripeWebhook(stripeEvent('e7', { payment_status: 'unpaid' }), `sig:${PLATFORM_WH}`, deps);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ applied: false, ignored: true });
    expect(db.writes).toEqual([]);
    const later = await processStripeWebhook(JSON.stringify({ id: 'e7b', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_e7', payment_status: 'paid', amount_total: 500000000, currency: 'cop', metadata: { organization_id: '120', quotation_id: 'q-1' } } } }), `sig:${PLATFORM_WH}`, deps);
    expect(later.status).toBe(200);
    expect(later.body).toMatchObject({ applied: true, invoice_status: 'paid' });
    expect(newPayments()).toHaveLength(1);
    expect(newPayments()[0]).toMatchObject({ reference: 'stripe:e7b', amount: 5000000 });
  });

  it('A7b evento firmado que no es de checkout (payment_intent.succeeded) → 200 ignored sin escrituras', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    const out = await processStripeWebhook(JSON.stringify({ id: 'e7c', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } }), `sig:${PLATFORM_WH}`, deps);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ignored: true });
    expect(db.writes).toEqual([]);
  });

  it('A8 moneda sin decimales (JPY) → importe en unidades mayores tal cual; COP → /100', () => {
    expect(minorToMajor(5000, 'jpy')).toBe(5000);
    expect(minorToMajor(500000000, 'COP')).toBe(5000000);
    expect(majorToMinor(5000, 'JPY')).toBe(5000);
    expect(majorToMinor(12.345, 'USD')).toBe(1235);
  });

  it('A9 monedas de tres decimales de Stripe (KWD/BHD/JOD/OMR/TND) se dividen por 1000, ida y vuelta', () => {
    // Stripe: 1 KWD = 1000 fils → amount_total 5000 = 5 KWD
    expect(minorToMajor(5000, 'kwd')).toBe(5);
    for (const c of ['BHD', 'jod', 'OMR', 'tnd']) expect(minorToMajor(1500, c)).toBe(1.5);
    expect(majorToMinor(5, 'KWD')).toBe(5000);
    expect(majorToMinor(1.2345, 'bhd')).toBe(1235);
  });

  it('A10 un evento en OTRA moneda que la factura → applied:false + actividad system en la oportunidad + console.error, sin pago', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
      const out = await processStripeWebhook(stripeEvent('e10', { currency: 'usd', amount_total: 100 }), `sig:${PLATFORM_WH}`, deps);
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ applied: false, reason: 'currency_mismatch' });
      expect(newPayments()).toHaveLength(0);
      expect(errSpy).toHaveBeenCalled();
      const acts = systemActivities();
      expect(acts).toHaveLength(1);
      expect(acts[0]).toMatchObject({ organization_id: 120, related_type: 'opportunity', user_id: null });
      expect(String(acts[0].notes)).toMatch(/USD/);
      expect(String(acts[0].notes)).toMatch(/COP/);
      expect(acts[0].metadata).toMatchObject({ source: 'stripe_webhook', event_id: 'e10', reason: 'currency_mismatch' });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('A11 metadata.organization_id no numérica o quotation ajena → rechazo sin escrituras', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
    const bad = await processStripeWebhook(stripeEvent('e11', {}, { organization_id: '120abc' }), `sig:${PLATFORM_WH}`, deps);
    expect(bad.status).toBe(400);
    const cross = await processStripeWebhook(stripeEvent('e11b', {}, { quotation_id: 'q-9', invoice_id: 'inv-9' }), `sig:${PLATFORM_WH}`, deps);
    expect(cross.body).toMatchObject({ applied: false });
    expect(db.writes).toEqual([]);
  });

  it('A12 importe mayor que el saldo (enlace viejo tras un abono manual) → applied:false, actividad system visible en la oportunidad y console.error (el dinero queda en Stripe: alguien tiene que verlo)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const deps = { serviceClient: createFakeSupabase(db) as never, adapter: fakeAdapter, env };
      const out = await processStripeWebhook(stripeEvent('e12', { amount_total: 680000000 }), `sig:${PLATFORM_WH}`, deps);
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ success: false, applied: false, reason: 'not_applied' });
      expect(newPayments()).toHaveLength(0);
      expect(errSpy).toHaveBeenCalled();
      const acts = systemActivities();
      expect(acts).toHaveLength(1);
      expect(String(acts[0].notes)).toMatch(/6800000/);
      expect(acts[0].metadata).toMatchObject({ source: 'stripe_webhook', event_id: 'e12', amount: 6800000, currency: 'COP' });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('A13 factura que queda pagada → el Payment Link de la sesión se desactiva (active:false) con la clave que verificó; pago parcial no lo toca', async () => {
    const deactivated: Array<{ sk: string; id: string }> = [];
    const adapter: StripeAdapter = { ...fakeAdapter, deactivatePaymentLink: async (sk, id) => { deactivated.push({ sk, id }); } };
    const deps = { serviceClient: createFakeSupabase(db) as never, adapter, env };
    const partial = await processStripeWebhook(stripeEvent('e13a', { amount_total: 100000000, payment_link: 'plink_abc' }), `sig:${PLATFORM_WH}`, deps);
    expect(partial.body).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(deactivated).toEqual([]);
    const full = await processStripeWebhook(stripeEvent('e13b', { amount_total: 400000000, payment_link: 'plink_abc' }), `sig:${PLATFORM_WH}`, deps);
    expect(full.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivated).toEqual([{ sk: PLATFORM_SK, id: 'plink_abc' }]);
  });

  it('A14 fallo al desactivar el enlace no deshace el pago: applied:true, payment_link_deactivated:false y console.error', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const adapter: StripeAdapter = { ...fakeAdapter, deactivatePaymentLink: async () => { throw new Error('stripe caído'); } };
      const deps = { serviceClient: createFakeSupabase(db) as never, adapter, env };
      const full = await processStripeWebhook(stripeEvent('e14', { payment_link: 'plink_x' }), `sig:${PLATFORM_WH}`, deps);
      expect(full.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: false });
      expect(newPayments()).toHaveLength(1);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('T-G Credenciales de Stripe de la organización contra el esquema REAL', () => {
  it('G1 integration_connections.status es connected|draft|paused|error|revoked (CHECK real); el servicio filtra status=connected y encuentra la conexión', async () => {
    // Las 2 conexiones Stripe reales (orgs 2 y 60) tienen status='connected' (verificado por MCP).
    db.rows.integration_connections = [{ id: 'ic-120', organization_id: 120, status: 'connected', integration_connectors: { integration_providers: { code: 'stripe' } } }];
    db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-120', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-120', purpose: 'webhook_secret', secret_ref: ORG_WH }];
    const { loadOrgStripeCredentials } = await import('@/lib/services/crm/stripePaymentLinkService');
    const creds = await loadOrgStripeCredentials(120, createFakeSupabase(db) as never);
    expect(creds?.secretKey).toBe(ORG_SK);
    expect(creds?.webhookSecret).toBe(ORG_WH);
  });

  it('G2 una conexión paused/revoked/error/draft (o el valor inexistente active) no aporta credenciales', async () => {
    const { loadOrgStripeCredentials } = await import('@/lib/services/crm/stripePaymentLinkService');
    db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-120', purpose: 'secret_key', secret_ref: ORG_SK }];
    for (const status of ['paused', 'revoked', 'error', 'draft', 'active']) {
      db.rows.integration_connections = [{ id: 'ic-120', organization_id: 120, status, integration_connectors: { integration_providers: { code: 'stripe' } } }];
      expect(await loadOrgStripeCredentials(120, createFakeSupabase(db) as never)).toBeNull();
    }
  });
});

describe('T-B registerCrmPayment con el fake', () => {
  it('B1 pago parcial: payments completed, factura y cartera en partial con el saldo restante', async () => {
    const r = await registerCrmPayment(120, { invoice_id: 'inv-1', amount: 1000000, currency: 'COP', reference: 'stripe:b1', method: 'stripe' }, createFakeSupabase(db) as never);
    expect(r).toMatchObject({ success: true, invoice_status: 'partial', idempotent: false });
    expect(db.rows.invoice_sales[0]).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(db.rows.accounts_receivable[0]).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(newPayments()[0]).toMatchObject({ source: 'invoice_sales', source_id: 'inv-1', status: 'completed', reference: 'stripe:b1' });
  });

  it('B3 dos registros concurrentes con la misma reference stripe: → uno inserta, el otro recibe success:true, idempotent:true, duplicate:true sin tocar factura ni cartera', async () => {
    const input = { invoice_id: 'inv-1', amount: 1000000, currency: 'COP', reference: 'stripe:b3', method: 'stripe' };
    const [a, b] = await Promise.all([registerCrmPayment(120, input, createFakeSupabase(db) as never), registerCrmPayment(120, input, createFakeSupabase(db) as never)]);
    const inserted = [a, b].filter((r) => r.idempotent === false);
    const dup = [a, b].filter((r) => r.duplicate === true);
    expect(inserted).toHaveLength(1);
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ success: true, idempotent: true, duplicate: true, payment_id: null });
    expect(db.rows.payments.filter((p) => p.reference === 'stripe:b3')).toHaveLength(1);
    expect(db.rows.invoice_sales[0]).toMatchObject({ balance: 4000000, status: 'partial' });
    expect(db.writes.filter((w) => w.table === 'invoice_sales' && w.op === 'update')).toHaveLength(1);
    // una reference no Stripe con 23505 sigue siendo error (el índice solo cubre stripe:%)
    const { isStripeReferenceDuplicate } = await import('@/lib/services/crm/paymentService');
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'uq_payments_org_stripe_reference' }, 'manual:1')).toBe(false);
    expect(isStripeReferenceDuplicate({ code: '23503', message: 'fk' }, 'stripe:x')).toBe(false);
  });

  it('B4 (r3) pago completo con vendedor y tasa: devenga comisión salvo que exista una para la oportunidad en CUALQUIER estado (alineado con el trigger de BD)', async () => {
    Object.assign(db.rows.invoice_sales[0], { salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson' });
    db.rows.commissions = [{ id: 'cm-cancel', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'cancelled', commission_amount: 1 }];
    const blocked = await registerCrmPayment(120, { invoice_id: 'inv-1', amount: 5000000, currency: 'COP', reference: 'stripe:b4a', method: 'stripe' }, createFakeSupabase(db) as never);
    expect(blocked).toMatchObject({ success: true, invoice_status: 'paid', commission_created: false });
    expect(db.writes.filter((w) => w.table === 'commissions')).toHaveLength(0);
    db = seed();
    Object.assign(db.rows.invoice_sales[0], { salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson' });
    const created = await registerCrmPayment(120, { invoice_id: 'inv-1', amount: 5000000, currency: 'COP', reference: 'stripe:b4b', method: 'stripe' }, createFakeSupabase(db) as never);
    expect(created).toMatchObject({ success: true, invoice_status: 'paid', commission_created: true });
    expect(db.writes.find((w) => w.table === 'commissions' && w.op === 'insert')?.row).toMatchObject({ organization_id: 120, source_type: 'opportunity', source_id: 'op-1', payee_id: 'u-1', commission_amount: 680000, status: 'accrued' });
  });

  it('B2 factura de otra organización → «Factura no encontrada» sin escrituras', async () => {
    const r = await registerCrmPayment(120, { invoice_id: 'inv-9', amount: 1, currency: 'COP', reference: 'stripe:b2' }, createFakeSupabase(db) as never);
    expect(r.success).toBe(false);
    expect(db.writes).toEqual([]);
  });
});

describe('T-C Webhook de Documenso (hostil)', () => {
  const headersFor = (secret: string) => ({ 'x-documenso-signature': null, 'x-documenso-secret': secret });

  it('C1 safeEqual con longitudes distintas → false sin lanzar (timingSafeEqual lanzaría)', () => {
    expect(() => verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto'), secret: 'secret-org-120-0123456789abcdef' })).not.toThrow();
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto'), secret: 'secret-org-120-0123456789abcdef' })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: { 'x-documenso-signature': 'abc', 'x-documenso-secret': null }, secret: 'secret-org-120-0123456789abcdef' })).toBe(false);
  });

  it('C2 firma HMAC presente pero errónea + secreto compartido correcto → false (la firma manda, no se cae al secreto)', () => {
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: { 'x-documenso-signature': 'deadbeef', 'x-documenso-secret': 'secret-org-120-0123456789abcdef' }, secret: 'secret-org-120-0123456789abcdef' })).toBe(false);
  });

  it('C3 secreto corto (<16) o placeholder nunca verifica aunque coincida', () => {
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('corto12345'), secret: 'corto12345' })).toBe(false);
    expect(verifyDocumensoSignature({ rawBody: '{}', headers: headersFor('your-webhook-secret-here-xxxx'), secret: 'your-webhook-secret-here-xxxx' })).toBe(false);
  });

  it('C4 document_id de la org 121 con el secreto de la 120 → 401 sin escrituras (el secreto es el de la fila)', async () => {
    const out = await processDocumensoWebhook(JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'doc-121' }), headersFor('secret-org-120-0123456789abcdef'), { serviceClient: createFakeSupabase(db) as never, env: {} });
    expect(out.status).toBe(401);
    expect(db.writes).toEqual([]);
  });

  it('C5 reenvío signed→signed → 409; retroceso signed→viewed → 409; sin escrituras', async () => {
    const deps = { serviceClient: createFakeSupabase(db) as never, env: {} };
    const re = await processDocumensoWebhook(JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'doc-120' }), headersFor('secret-org-120-0123456789abcdef'), deps);
    expect(re.status).toBe(409);
    const back = await processDocumensoWebhook(JSON.stringify({ event: 'DOCUMENT_OPENED', document_id: 'doc-120' }), headersFor('secret-org-120-0123456789abcdef'), deps);
    expect(back.status).toBe(409);
    expect(db.writes).toEqual([]);
  });

  it('C6 documento desconocido → 401 si la firma no verifica con el secreto de plataforma (sin oráculo de existencia); 404 solo con firma de plataforma válida', async () => {
    const body = JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'no-existe' });
    const noPlatform = await processDocumensoWebhook(body, headersFor('lo-que-sea-0123456789abcdef'), { serviceClient: createFakeSupabase(db) as never, env: {} });
    expect(noPlatform.status).toBe(401);
    const env = { DOCUMENSO_API_KEY: 'api_platform_0123456789abcdef', DOCUMENSO_WEBHOOK_SECRET: 'secret-platform-0123456789abcdef' };
    const wrong = await processDocumensoWebhook(body, headersFor('secret-org-120-0123456789abcdef'), { serviceClient: createFakeSupabase(db) as never, env });
    expect(wrong.status).toBe(401);
    const verified = await processDocumensoWebhook(body, headersFor('secret-platform-0123456789abcdef'), { serviceClient: createFakeSupabase(db) as never, env });
    expect(verified.status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('C8 el UPDATE condicionado por `status` que no afecta filas (carrera entre dos webhooks) → 409 y no se vincula la cotización', async () => {
    db.rows.contract_signatures[1].organization_id = 120;
    db.rows.contract_signatures[1].quotation_id = 'q-1';
    const client = createFakeSupabase(db);
    const original = client.from;
    // Entre la lectura y el UPDATE otro webhook ya firmó: la fila deja de coincidir con eq(status,'sent').
    // (se sustituye el objeto: el doble devuelve referencias vivas y mutarlo cambiaría también lo leído por el servicio)
    let armed = true;
    const patched = { ...client, from: (t: string) => { const c = original(t); if (t === 'contract_signatures' && armed) { const upd = c.update as (r: Record<string, unknown>) => unknown; c.update = (r: Record<string, unknown>) => { armed = false; db.rows.contract_signatures[1] = { ...db.rows.contract_signatures[1], status: 'signed' }; return upd(r); }; } return c; } };
    const out = await processDocumensoWebhook(JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'doc-121' }), headersFor('secret-org-120-0123456789abcdef'), { serviceClient: patched as never, env: {} });
    expect(out.status).toBe(409);
    expect(db.writes.filter((w) => w.table === 'quotations')).toHaveLength(0);
  });

  it('C7 el webhook no admite firmantes nuevos ni `status` libre', () => {
    const merged = mergeSigners([{ name: 'A', email: 'a@x.co' }], [{ email: 'intruso@x.co', status: 'signed' }, { email: 'A@X.CO', status: 'signed', signed_at: '2026-09-15T00:00:00Z' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ email: 'a@x.co', status: 'signed', signed_at: '2026-09-15T00:00:00Z' });
  });
});

describe('T-D Evaluador ROI hostil', () => {
  const scope = { a: 2, b: 3 };
  const hostile = [
    '1e400', 'a.constructor', 'a.__proto__', 'constructor', '__proto__', '('.repeat(40) + '1' + ')'.repeat(40), '1/0', '0/0', 'x', 'a/(b-3)',
    '１+１', 'a​+1', '1;2', '2**3', '1 % 2', 'a?b:c', '"a"', '[1]', '1..2', '1e', 'NaN', 'Infinity', 'process.exit', 'this', 'a=1', 'a++', '+1',
    '1' + '+1'.repeat(5000), '-'.repeat(40) + '1', '9'.repeat(400), '1e308*10', '',
  ];
  it.each(hostile.map((h) => [h.length > 40 ? `${h.slice(0, 40)}… (${h.length})` : h, h]))('D1 %s → ok:false', (_label, expr) => {
    const r = evaluateExpression(expr, scope);
    expect(r.ok).toBe(false);
  });

  it('D2 lo válido sigue valiendo: --1 = 1, precedencia, inputs./outputs. encadenados', () => {
    expect(evaluateExpression('--1', {})).toEqual({ ok: true, value: 1 });
    expect(evaluateExpression('a + b * 2 - (a - b) / 5', scope)).toEqual({ ok: true, value: 2 + 6 + 0.2 });
    const r = evaluateFormula([{ output_key: 'x', expression: 'inputs.a * 10' }, { output_key: 'y', expression: 'outputs.x + x + a' }], { a: 1 });
    expect(r.outputs).toEqual({ x: 10, y: 21 });
    expect(r.errors).toEqual({});
  });

  it('D3 output_key hostil no envenena el prototipo; input no numérico se reporta, no se vuelve 0', () => {
    const r = evaluateFormula([{ output_key: '__proto__', expression: '1' }, { output_key: 'z', expression: 'a * 2' }], { a: 'abc' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(r.errors)).toContain('__proto__');
    expect(r.errors.z).toMatch(/Entrada no numérica: a/);
  });

  it('D4 roiService y roiEvaluator no contienen Function( ni eval(', () => {
    const root = process.cwd();
    for (const f of ['src/lib/services/crm/roiService.ts', 'src/lib/services/crm/roiEvaluator.ts', 'src/app/api/crm/roi/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(|\beval\s*\(/);
    }
  });
});

describe('T-E Doble comisión (trigger fn_create_commission_on_opportunity_won + WonCloseModal.executeCommission)', () => {
  it('E1 con una comisión ya devengada por el trigger de BD para la misma oportunidad, accrueCommission NO inserta una segunda: devuelve la existente con already_accrued', async () => {
    // El trigger de BD (leído por MCP) inserta commissions(source_type='opportunity', source_id=opp.id) al pasar a 'won'
    // cuando opportunities.commission_rate > 0. useStageFlow cambia la etapa ANTES de abrir WonCloseModal.
    db.rows.commissions = [
      { id: 'cm-trigger', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', base_amount: 1000, commission_rate: 10, commission_amount: 100 },
      { id: 'cm-ajena', organization_id: 121, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', base_amount: 1, commission_rate: 1, commission_amount: 1 },
    ];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ id: 'cm-trigger', commission_rate: 10, commission_amount: 100, already_accrued: true });
    const forOpp = db.rows.commissions.filter((c) => c.organization_id === 120 && c.source_type === 'opportunity' && c.source_id === 'op-1');
    expect(forOpp).toHaveLength(1);
    expect(db.writes).toEqual([]);
  });

  it('E2 sin comisión previa sí devenga una nueva; una comisión de otra fuente (invoice) o de otra organización no bloquea', async () => {
    db.rows.commissions = [
      { id: 'cm-inv', organization_id: 120, source_type: 'invoice', source_id: 'op-1', status: 'accrued', commission_amount: 7 },
      { id: 'cm-ajena', organization_id: 121, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', commission_amount: 9 },
    ];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ commission_rate: 10, commission_amount: 100, status: 'accrued' });
    expect(r?.already_accrued).toBeFalsy();
    const inserted = db.writes.filter((w) => w.table === 'commissions' && w.op === 'insert');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].row).toMatchObject({ organization_id: 120, source_type: 'opportunity', source_id: 'op-1', payee_id: 'u-1', status: 'accrued' });
  });

  it('E3 (r3) una comisión CANCELADA (rechazo/clawback de un gestor) también bloquea el devengo automático, como el trigger de BD que cuenta cualquier estado', async () => {
    db.rows.commissions = [{ id: 'cm-cancel', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'cancelled', base_amount: 1000, commission_rate: 10, commission_amount: 100 }];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ id: 'cm-cancel', already_accrued: true, existing_status: 'cancelled' });
    expect(db.writes).toEqual([]);
    expect(db.rows.commissions).toHaveLength(1);
  });
});

describe('T-F Demo, propuesta y fechas', () => {
  it('F1 demo 2 h en el pasado → error (tolerancia documentada de 1 h por error de zona); futuro → ok; 481 min → error', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-15T09:59:00Z' }, now).ok).toBe(false);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-15T11:30:00Z' }, now).ok).toBe(true);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-15T12:01:00Z' }, now).ok).toBe(true);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-15T12:01:00Z', duration_minutes: 481 }, now).ok).toBe(false);
  });

  it('F2 «Regenerar» conserva SOLO lo editado a mano (edited:true) y refresca de verdad las secciones no editadas; force descarta las ediciones', () => {
    const base = { opportunityName: 'X', customerName: 'C', opportunityAmount: 100, discoveryFields: [], discovery: {}, objections: [], roi: null, pricing: { currency: 'COP', lines: [], total: 100, billingCycleMonths: null } };
    const first = buildProposalSections(base);
    expect(first.situacion.edited).toBe(false);
    const edited = { ...first, situacion: { ...first.situacion, content: 'EDITADO', edited: true } };
    const regenerated = buildProposalSections({ ...base, discovery: { dolor: 'nuevo dato relevante' }, discoveryFields: [{ id: 'dolor', label: 'Dolor', type: 'text' }] });
    expect(regenerated.problemas.content).not.toBe(first.problemas.content);
    const merged = mergeSections(edited, regenerated);
    expect(merged.situacion).toMatchObject({ content: 'EDITADO', edited: true });
    // sección NO editada: se refresca con el discovery nuevo
    expect(merged.problemas.content).toBe(regenerated.problemas.content);
    // filas anteriores a la bandera (sin `edited`): se conservan como antes (no se pierde texto)
    const legacy = { ...first, problemas: { title: first.problemas.title, content: 'LEGADO' } };
    expect(mergeSections(legacy, regenerated).problemas.content).toBe('LEGADO');
    // force: todo regenerado, la edición se descarta
    expect(mergeSections(edited, regenerated, { force: true }).situacion.content).toBe(regenerated.situacion.content);
    expect(hasEditedSections(edited)).toBe(true);
    expect(hasEditedSections(first)).toBe(false);
  });

  it('F3 addDaysPlain no pasa por la zona local; valid_until = hoy(tz)+30', () => {
    expect(addDaysPlain('2026-01-31', 30)).toBe('2026-03-02');
    expect(addDaysPlain('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('F4 REPRODUCIDO: `valid_until` (columna date) pasado por formatDate del hook muestra el día anterior en America/Bogota', () => {
    expect(formatDateInTz('2026-10-15', 'America/Bogota')).toBe('14/10/2026'); // ← lo que hoy pintan ProposalGenerator y ProposalPrintView
    expect(formatPlainDate('2026-10-15')).toMatch(/15\/10\/2026|15\/10\/26|2026-10-15/);
  });

  it('F5 ProposalGenerator/ProposalPrintView formatean valid_until (columna date) con formatPlainDate, nunca con formatDate/formatDateInTz', () => {
    const root = process.cwd();
    for (const f of ['src/components/crm/propuestas/ProposalGenerator.tsx', 'src/components/crm/propuestas/ProposalPrintView.tsx']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/formatDate(?:InTz)?\([^)]*valid_until/);
      expect(src).toMatch(/formatPlainDate\([^)]*valid_until/);
    }
  });
});
