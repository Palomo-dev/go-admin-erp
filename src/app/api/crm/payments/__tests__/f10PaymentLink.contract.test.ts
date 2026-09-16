/// <reference types="jest" />
/**
 * F10 — contrato de `/api/crm/payments/link` y `/api/crm/webhooks/stripe`.
 * Stripe está doblado por `StripeAdapter` (nunca se llama al SDK real): el
 * adaptador falso «verifica» solo cuando la firma es `sig:<webhookSecret>`.
 */
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;
const PLATFORM_SK = 'sk_test_51platformkey_abcdefghijklmnop';
const PLATFORM_WH = 'whsec_platform_0123456789abcdef';
const ORG_SK = 'sk_live_51orgkey_abcdefghijklmnopqrs';
const ORG_WH = 'whsec_org121_0123456789abcdef';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [
        { id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', converted_invoice_id: 'inv-1', payment_link_url: null, currency: 'COP', total: 6800000 },
        { id: 'q-2', organization_id: 120, number: 'COT-0002', opportunity_id: 'op-2', converted_invoice_id: null, payment_link_url: null, currency: 'COP', total: 100 },
        { id: 'q-3', organization_id: 120, number: 'COT-0003', opportunity_id: 'op-3', converted_invoice_id: 'inv-1', payment_link_url: 'https://buy.stripe.com/ya-existe', payment_link_amount: 5000000, payment_link_id: 'plink_existente', currency: 'COP', total: 6800000 },
        // Deuda B1: enlace vigente cuyo importe (5 000 000) ya no coincide con el saldo (inv-4: 3 000 000) → se regenera.
        { id: 'q-4', organization_id: 120, number: 'COT-0004', opportunity_id: 'op-4', converted_invoice_id: 'inv-4', payment_link_url: 'https://buy.stripe.com/viejo', payment_link_amount: 5000000, payment_link_id: 'plink_viejo', currency: 'COP', total: 6800000 },
        { id: 'q-9', organization_id: 121, number: 'COT-0009', opportunity_id: 'op-9', converted_invoice_id: 'inv-9', payment_link_url: null, currency: 'COP', total: 5 },
      ],
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 6800000, balance: 5000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-4', organization_id: 120, number: 'FACT-0004', total: 6800000, balance: 3000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-4', salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: 'op-9', salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      // Pago previo de 1.800.000: el fake recalcula el saldo como el trigger real (total − Σ pagos completed); sin él, 6.800.000 − 5.000.000 no cuadra.
      payments: [{ id: 'pay-seed', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 1800000, currency: 'COP', reference: 'anticipo-seed', method: 'cash' }],
      accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'partial' }],
      commissions: [],
      integration_connections: [],
      integration_credentials: [],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => createFakeSupabase(db) }));

const linkCalls: Array<{ secretKey: string; input: Record<string, unknown> }> = [];
const deactivations: Array<{ secretKey: string; id: string }> = [];
jest.mock('@/lib/services/crm/stripePaymentLinkService', () => {
  const actual = jest.requireActual('@/lib/services/crm/stripePaymentLinkService');
  const fakeAdapter = {
    createPaymentLink: jest.fn(async (secretKey: string, input: Record<string, unknown>) => {
      linkCalls.push({ secretKey, input });
      return { id: 'plink_1', url: 'https://buy.stripe.com/test_fake' };
    }),
    constructEvent: jest.fn((_sk: string, rawBody: string, signature: string, webhookSecret: string) => {
      if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
      return JSON.parse(rawBody);
    }),
    deactivatePaymentLink: jest.fn(async (secretKey: string, id: string) => { deactivations.push({ secretKey, id }); }),
  };
  return { ...actual, stripeAdapter: fakeAdapter };
});

import { NextRequest } from 'next/server';
import { GET as linkGet, POST as linkPost } from '../link/route';
import { POST as webhookPost } from '@/app/api/crm/webhooks/stripe/route';

const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
const writesTo = (t: string) => db.writes.filter((w) => w.table === t);
const envBackup = { ...process.env };

function stripeEvent(id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return JSON.stringify({
    id, type: 'checkout.session.completed', livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1', ...meta }, ...over } },
  });
}

beforeEach(() => {
  db = seed();
  linkCalls.length = 0;
  deactivations.length = 0;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CRM_WEBHOOK_SECRET;
});
afterAll(() => { process.env = envBackup; });

describe('GET/POST /api/crm/payments/link', () => {
  it('sin Stripe real (placeholder del .env.example) → GET configured:false sin variables; POST 409 sin llamar a Stripe ni escribir', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_your-secret-key';
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data.configured).toBe(false);
    expect(JSON.stringify(g)).not.toMatch(/STRIPE_SECRET_KEY|sk_live/);
    expect(g.data.invoice).toMatchObject({ number: 'FACT-0001', balance: 5000000 });
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(409);
    expect(linkCalls).toHaveLength(0);
    expect(db.writes).toHaveLength(0);
  });

  it('con clave de plataforma: crea el enlace por el SALDO de la factura con metadata de organización y lo guarda en la cotización', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    // el enlace cobra el SALDO (5 000 000), no el total de la cotización (6 800 000)
    expect(json.data).toMatchObject({ url: 'https://buy.stripe.com/test_fake', reused: false, invoice_id: 'inv-1', amount: 5000000, currency: 'COP' });
    expect(linkCalls[0].secretKey).toBe(PLATFORM_SK);
    expect(linkCalls[0].input).toMatchObject({ amountMinor: 500000000, currency: 'COP', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1' } });
    const upd = writesTo('quotations').find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'q-1', organization_id: 120 });
    expect(upd?.row).toMatchObject({ payment_link_url: 'https://buy.stripe.com/test_fake', payment_link_amount: 5000000, payment_link_id: 'plink_1' });
  });

  it('deuda B1: enlace vigente con importe distinto del saldo → 201, el anterior se desactiva por su id con la clave usada y se guardan url/importe/id nuevos', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-4' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toMatchObject({ reused: false, amount: 3000000, previous_link_deactivated: true });
    expect(deactivations).toEqual([{ secretKey: PLATFORM_SK, id: 'plink_viejo' }]);
    expect(linkCalls[0].input).toMatchObject({ amountMinor: 300000000 });
    const upd = writesTo('quotations').find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'q-4', organization_id: 120 });
    expect(upd?.row).toMatchObject({ payment_link_url: 'https://buy.stripe.com/test_fake', payment_link_amount: 3000000, payment_link_id: 'plink_1' });
  });

  it('las credenciales de la organización tienen prioridad sobre la plataforma', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    db.rows.integration_providers = [{ id: 'prov-stripe', code: 'stripe' }];
    db.rows.integration_connectors = [{ id: 'conn-stripe', provider_id: 'prov-stripe', code: 'stripe' }];
    db.rows.integration_connections = [{ id: 'ic-120', organization_id: 120, status: 'connected', connector_id: 'conn-stripe', integration_connectors: { integration_providers: { code: 'stripe' } } }];
    db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-120', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-120', purpose: 'webhook_secret', secret_ref: ORG_WH }];
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    expect(linkCalls[0].secretKey).toBe(ORG_SK);
  });

  it('propuesta sin factura → 422; enlace existente → 200 reused sin llamar a Stripe; ajena → 404; body con otra organización → 403', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    expect((await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-2' }))).status).toBe(422);
    const reused = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-3' }));
    expect(reused.status).toBe(200);
    expect((await reused.json()).data.reused).toBe(true);
    expect((await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-9' }))).status).toBe(404);
    expect((await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1', organization_id: 121 }))).status).toBe(403);
    expect(linkCalls).toHaveLength(0);
  });
});

describe('POST /api/crm/webhooks/stripe', () => {
  it('sin cabecera → 400; firma inválida o secreto placeholder → 401; nunca se escribe', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    expect((await webhookPost(req('POST', '/x', stripeEvent('evt_1')))).status).toBe(400);
    expect((await webhookPost(req('POST', '/x', stripeEvent('evt_1'), { 'stripe-signature': 'sig:otro' }))).status).toBe(401);
    process.env.STRIPE_CRM_WEBHOOK_SECRET = 'whsec_your-webhook-secret';
    expect((await webhookPost(req('POST', '/x', stripeEvent('evt_1'), { 'stripe-signature': 'sig:whsec_your-webhook-secret' }))).status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it('firma válida de plataforma → registra el pago por paymentService (source invoice_sales, completed, reference stripe:<event.id>) y actualiza factura y cartera', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    const res = await webhookPost(req('POST', '/x', stripeEvent('evt_1'), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, applied: true, idempotent: false, invoice_status: 'paid' });
    const pay = writesTo('payments').find((w) => w.op === 'insert');
    expect(pay?.row).toMatchObject({ organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 5000000, currency: 'COP', reference: 'stripe:evt_1', method: 'stripe' });
    const inv = writesTo('invoice_sales').find((w) => w.op === 'update');
    expect(inv?.filters).toMatchObject({ id: 'inv-1', organization_id: 120 });
    expect(inv?.row).toMatchObject({ balance: 0, status: 'paid' });
    const ar = writesTo('accounts_receivable').find((w) => w.op === 'update');
    expect(ar?.filters).toMatchObject({ id: 'ar-1', organization_id: 120 });
    expect(ar?.row).toMatchObject({ balance: 0, status: 'paid' });
  });

  it('r3 (R05): factura con moneda en minúsculas (cop) y evento en cop/COP → coincide y se aplica; el pago se guarda con la moneda normalizada', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    db.rows.invoice_sales[0].currency = 'cop';
    const lower = await webhookPost(req('POST', '/x', stripeEvent('evt_lc', { amount_total: 100000000 }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect(await lower.json()).toMatchObject({ applied: true, invoice_status: 'partial' });
    const upper = await webhookPost(req('POST', '/x', stripeEvent('evt_uc', { amount_total: 100000000, currency: 'COP' }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect(await upper.json()).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(writesTo('payments').filter((w) => w.op === 'insert').map((w) => (w.row as Row).currency)).toEqual(['COP', 'COP']);
    expect(writesTo('activities')).toHaveLength(0);
  });

  it('el mismo event.id reenviado NO registra un segundo pago (idempotente)', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    await webhookPost(req('POST', '/x', stripeEvent('evt_1'), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    const res = await webhookPost(req('POST', '/x', stripeEvent('evt_1'), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect((await res.json())).toMatchObject({ success: true, applied: true, idempotent: true });
    expect(writesTo('payments').filter((w) => w.op === 'insert')).toHaveLength(1);
  });

  it('metadata de otra organización (121) firmada con el secreto de plataforma: la fila se busca en ESA organización; sin cotización → applied:false sin escrituras', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    const res = await webhookPost(req('POST', '/x', stripeEvent('evt_2', {}, { organization_id: '121', quotation_id: 'q-1', invoice_id: 'inv-1' }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applied).toBe(false);
    // La cotización se busca en la organización de la metadata (121), no en la que la contiene (120).
    expect(json.error).toMatch(/Cotización o factura no encontrada/);
    expect(db.writes).toHaveLength(0);
  });

  it('firma de la organización: solo verifica con SU secreto y la metadata debe ser de esa organización', async () => {
    db.rows.integration_connections = [{ id: 'ic-121', organization_id: 121, status: 'connected', connector_id: 'x', integration_connectors: { integration_providers: { code: 'stripe' } } }];
    db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-121', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-121', purpose: 'webhook_secret', secret_ref: ORG_WH }];
    const ok = await webhookPost(req('POST', '/x', stripeEvent('evt_3', { amount_total: 500 }, { organization_id: '121', quotation_id: 'q-9', invoice_id: 'inv-9' }), { 'stripe-signature': `sig:${ORG_WH}` }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).applied).toBe(true);
    expect(writesTo('payments')[0]?.row).toMatchObject({ organization_id: 121, source_id: 'inv-9', amount: 5 });
    // Otro evento que insinúa la 121 en metadata pero cuya sesión es de la 120 → la 120 no verificó nada → 401
    db.writes = [];
    const cross = await webhookPost(req('POST', '/x', stripeEvent('evt_4'), { 'stripe-signature': `sig:${ORG_WH}` }));
    expect(cross.status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it('importe mayor que el saldo → applied:false (queda en logs) sin insertar; evento no soportado → ignorado', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    const big = await webhookPost(req('POST', '/x', stripeEvent('evt_5', { amount_total: 500000100 }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect((await big.json()).applied).toBe(false);
    expect(writesTo('payments')).toHaveLength(0);
    const other = await webhookPost(req('POST', '/x', JSON.stringify({ id: 'evt_6', type: 'payment_intent.succeeded', data: { object: {} } }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect((await other.json())).toMatchObject({ ignored: true });
  });

  it('invoice_id de la metadata distinto de la factura real de la cotización → applied:false', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    process.env.STRIPE_CRM_WEBHOOK_SECRET = PLATFORM_WH;
    const res = await webhookPost(req('POST', '/x', stripeEvent('evt_7', {}, { invoice_id: 'inv-9' }), { 'stripe-signature': `sig:${PLATFORM_WH}` }));
    expect((await res.json()).applied).toBe(false);
    // r2: ningún pago, pero el rechazo deja actividad `system` en la oportunidad (alguien tiene que verlo)
    expect(writesTo('payments')).toHaveLength(0);
    expect(writesTo('invoice_sales')).toHaveLength(0);
    expect(writesTo('activities')).toHaveLength(1);
    expect(writesTo('activities')[0].row).toMatchObject({ organization_id: 120, activity_type: 'system', metadata: expect.objectContaining({ source: 'stripe_webhook', reason: 'invoice_mismatch' }) });
  });
});
