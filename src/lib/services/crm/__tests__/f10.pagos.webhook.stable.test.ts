/// <reference types="jest" />
/**
 * F10 — webhook de Stripe (`processStripeWebhook`) e idempotencia del enlace,
 * más el contrato GET/POST de `/api/crm/payments/link` que la UI necesita
 * (`payment_link_stale`). Consolidado el 2026-09-21 desde el tester B1
 * (`f10B1Tester`: idempotencia, seguridad del webhook, contrato GET/UI) y el
 * tester r1 (`f10Round1Tester`: A1/A2 instrumentado, A6b, A10, A11+B5 de r2,
 * A12, G1/G2). Lo que ya afirman `f10PaymentLinkAmount` y
 * `f10PaymentLink.contract` no se repite. Sin datos reales (org 120 / señuelo 121).
 */
import * as H from '@/lib/services/crm/__tests__/f10PaymentLinkFake';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => require('@/lib/services/crm/__tests__/f10PaymentLinkFake').fakeClient().from(t) } }));
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError, // la clase real: `readOrgBody` la lanza y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(() => require('@/lib/services/crm/__tests__/f10PaymentLinkFake').orgContext()),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => require('@/lib/services/crm/__tests__/f10PaymentLinkFake').fakeClient() }));
jest.mock('@/lib/services/crm/stripePaymentLinkService', () => ({
  ...jest.requireActual('@/lib/services/crm/stripePaymentLinkService'),
  stripeAdapter: require('@/lib/services/crm/__tests__/f10PaymentLinkFake').fakeAdapter,
}));

import { registerCrmPayment } from '@/lib/services/crm/paymentService';
import { createPaymentLinkForQuotation, loadOrgStripeCredentials, processStripeWebhook, stripeAdapter, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { GET as linkGet, POST as linkPost } from '@/app/api/crm/payments/link/route';

const { PLATFORM_SK, PLATFORM_WH, ORG_SK, ORG_WH, state, quotation, invoice, manual, writesTo, req, newPayments } = H;
const client = () => H.fakeClient() as unknown as Parameters<typeof registerCrmPayment>[2];
const link = () => createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter, readiness: H.readiness });
const webhook = (id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}, opts: { env?: Record<string, string>; sig?: string | null; adapter?: StripeAdapter; type?: string; serviceClient?: unknown } = {}) =>
  processStripeWebhook(H.stripeEvent(id, over, meta, opts.type), opts.sig === undefined ? `sig:${PLATFORM_WH}` : opts.sig, { serviceClient: (opts.serviceClient ?? client()) as never, adapter: opts.adapter ?? stripeAdapter, env: opts.env ?? H.platformEnv });
const get = async () => (await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json()).data;
const systemActivities = () => state.db.rows.activities.filter((a) => a.activity_type === 'system' && a.related_id === 'op-1');
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const envBackup = { ...process.env };

beforeEach(() => H.resetState());
afterAll(() => { process.env = envBackup; });

describe('webhook hostil (tester r1 T-A)', () => {
  it('A1/A2 sin cabecera → 400 sin tocar la BD; firma inválida → 401 leyendo SOLO credenciales de la organización insinuada, nunca escribe', async () => {
    const a = H.instrumented();
    expect((await webhook('e1', {}, {}, { sig: null, serviceClient: a.client })).status).toBe(400);
    expect(a.reads).toEqual([]);
    const b = H.instrumented();
    expect((await webhook('e2', {}, {}, { sig: 'sig:whsec_mala', serviceClient: b.client })).status).toBe(401);
    // Lectura previa a la verificación (necesaria para hallar el secreto de la organización): documentada, no es escritura.
    expect(b.reads.every((t) => t === 'integration_connections' || t === 'integration_credentials')).toBe(true);
    expect(state.db.writes).toEqual([]);
  });

  it('A6b replay CONCURRENTE del mismo event.id → una sola fila; el 23505 del índice se trata como «ya registrado» (applied:false, reason duplicate), factura y cartera se cobran UNA vez', async () => {
    const outs = await Promise.all([webhook('e6b'), webhook('e6b')]);
    expect(outs.map((o) => o.status)).toEqual([200, 200]);
    const rows = state.db.rows.payments.filter((p) => p.reference === 'stripe:e6b');
    expect(rows).toHaveLength(1);
    expect(outs.filter((o) => o.body.applied === true)).toHaveLength(1);
    const dup = outs.filter((o) => o.body.applied === false);
    expect(dup).toHaveLength(1);
    expect(dup[0].body).toMatchObject({ success: true, reason: 'duplicate', idempotent: true });
    expect(invoice()).toMatchObject({ balance: 0, status: 'paid' });
    expect(writesTo('invoice_sales').filter((w) => w.op === 'update')).toHaveLength(1);
    expect(writesTo('accounts_receivable').filter((w) => w.op === 'update')).toHaveLength(1);
  });

  it('A10 evento en OTRA moneda que la factura → applied:false + actividad system en la oportunidad (USD y COP en las notas) + console.error, sin pago', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('e10', { currency: 'usd', amount_total: 100 });
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

  it('A11 + r2-B5 cuerpo inválido (organization_id no numérica; amount_total negativo, cero o decimal) → 400 sin escrituras; quotation ajena → applied:false', async () => {
    expect((await webhook('e11', {}, { organization_id: '120abc' })).status).toBe(400);
    for (const amount_total of [-1, 0, 12.5]) expect((await webhook('evt_bad', { amount_total })).status).toBe(400);
    expect((await webhook('e11b', {}, { quotation_id: 'q-9', invoice_id: 'inv-9' })).body).toMatchObject({ applied: false });
    expect(state.db.writes).toEqual([]);
  });

  it('A12 importe mayor que el saldo (enlace viejo tras un abono manual) → applied:false, actividad system con importe y moneda, console.error (el dinero queda en Stripe: alguien tiene que verlo)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('e12', { amount_total: 680000000 });
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

  it('G1/G2 loadOrgStripeCredentials: solo una conexión con status connected (CHECK real) aporta credenciales; paused/revoked/error/draft o el inexistente active → null', async () => {
    H.org120Creds();
    const creds = await loadOrgStripeCredentials(120, client() as never);
    expect(creds).toMatchObject({ secretKey: ORG_SK, webhookSecret: ORG_WH });
    for (const status of ['paused', 'revoked', 'error', 'draft', 'active']) {
      state.db.rows.integration_connections[0].status = status;
      expect(await loadOrgStripeCredentials(120, client() as never)).toBeNull();
    }
  });
});

describe('seguridad e idempotencia del enlace (tester B1)', () => {
  it('B1-T15 metadata org 121 con firma de la 120 → 401; metadata 120 firmada por la 120 pero cotización de la 121 → quotation_not_found: no paga ni desactiva el enlace ajeno', async () => {
    H.org120Creds();
    const noPlatform = { env: {}, sig: `sig:${ORG_WH}` };
    const forged = await webhook('evt_forge', {}, { organization_id: '121', quotation_id: 'q-9', invoice_id: 'inv-9' }, noPlatform);
    expect(forged.status).toBe(401);
    expect(state.db.writes).toEqual([]);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const crossed = await webhook('evt_cross', { amount_total: 500 }, { organization_id: '120', quotation_id: 'q-9', invoice_id: 'inv-9' }, noPlatform);
      expect(crossed.body).toMatchObject({ applied: false, reason: 'quotation_not_found' });
    } finally {
      err.mockRestore();
    }
    expect(writesTo('payments')).toEqual([]);
    expect(state.deactivations).toEqual([]);
    expect(quotation('q-9')).toMatchObject({ payment_link_url: 'https://buy.stripe.com/ajeno', payment_link_id: 'plink_ajeno' });
    expect(Number(invoice('inv-9').balance)).toBe(5);
  });

  it('B1-T16 la desactivación en el webhook usa la clave que VERIFICÓ la firma (org), aunque exista clave de plataforma', async () => {
    H.org120Creds();
    const r = await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    expect(state.linkCalls[0].key).toBe(ORG_SK);
    expect(r?.reused).toBe(false);
    const out = await webhook('evt_org', {}, {}, { env: H.platformEnv, sig: `sig:${ORG_WH}` });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(state.deactivations).toEqual([{ key: ORG_SK, id: 'plink_1' }]);
  });

  it('B1-T20 webhook repetido (mismo event.id): una sola desactivación y una sola limpieza; el segundo responde idempotent sin payment_link_deactivated', async () => {
    await link();
    const first = await webhook('evt_dup');
    expect(first.body).toMatchObject({ applied: true, invoice_status: 'paid' });
    const clears = () => writesTo('quotations').filter((w) => w.op === 'update' && w.row?.payment_link_url === null);
    expect(clears()).toHaveLength(1);
    const second = await webhook('evt_dup');
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ applied: true, idempotent: true });
    expect(second.body).not.toHaveProperty('payment_link_deactivated');
    expect(state.deactivations).toHaveLength(1);
    expect(clears()).toHaveLength(1);
    expect(writesTo('payments')).toHaveLength(1);
  });

  it('B1-T21/T22 Stripe falla al desactivar o el adaptador no sabe: el pago queda registrado, payment_link_deactivated:false y las columnas se limpian igual', async () => {
    await link();
    state.deactivateImpl = async () => { throw new Error('stripe caído'); };
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('evt_fail');
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: false });
      expect(writesTo('payments')).toHaveLength(1);
      expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
      H.resetState();
      await link();
      const sinDesactivar: StripeAdapter = { createPaymentLink: stripeAdapter.createPaymentLink, constructEvent: stripeAdapter.constructEvent };
      const out2 = await webhook('evt_noadapter', {}, {}, { adapter: sinDesactivar });
      expect(out2.body).toMatchObject({ applied: true, payment_link_deactivated: false });
      expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_id: null });
    } finally {
      err.mockRestore();
    }
  });

  it('B1-T23 la limpieza de columnas falla en BD: el pago sigue aplicado (200), se desactivó el enlace, solo console.error; el GET trata las columnas sucias como obsoletas', async () => {
    await link();
    state.db.nextWriteError = { table: 'quotations', error: { code: '57014', message: 'statement timeout' } };
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('evt_clearfail');
      expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
    expect(writesTo('payments')).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(0);
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1' });
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    expect((await get()).payment_link_url).toBeNull();
  });

  it('B1-T24 (+ r1 A7) completed «unpaid» → 200 ignored sin tocar columnas (no 400: Stripe reintentaría 3 días); async_payment_succeeded después → aplica, desactiva y limpia', async () => {
    await link();
    const unpaid = await webhook('evt_async_1', { payment_status: 'unpaid' });
    expect(unpaid.status).toBe(200);
    expect(unpaid.body).toMatchObject({ applied: false, ignored: true });
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1' });
    expect(state.deactivations).toEqual([]);
    // el evento diferido de Stripe llega sin payment_intent: paymentIntentId null no rompe el registro
    const paid = await webhook('evt_async_2', { payment_intent: null }, {}, { type: 'checkout.session.async_payment_succeeded' });
    expect(paid.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(newPayments()[0]).toMatchObject({ reference: 'stripe:evt_async_2', amount: 5000000 });
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });

  it('B1-T25 pago parcial por el webhook (enlace de un solo uso ya consumido): columnas intactas, el GET lo oculta (stale) y el siguiente POST regenera por el saldo restante', async () => {
    await link();
    const out = await webhook('evt_partial', { amount_total: 100000000 });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000 });
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    expect(await get()).toMatchObject({ payment_link_url: null, payment_link_stale: true, invoice: { balance: 4000000 } });
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ amount: 4000000, previous_link_deactivated: true });
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
  });
});

describe('contrato GET / UI (tester B1)', () => {
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = PLATFORM_SK; });

  it('B1-T27/T28 GET con enlace vigente e importe = saldo → payment_link_url y stale:false; tras un abono manual NO se muestra (stale:true) para que la UI ofrezca «Crear enlace» y el POST lo regenere', async () => {
    await link();
    expect(await get()).toMatchObject({ configured: true, payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_stale: false, invoice: { number: 'FACT-0001', balance: 5000000 } });
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    expect(await get()).toMatchObject({ payment_link_url: null, payment_link_stale: true, invoice: { balance: 3000000 } });
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ amount: 3000000, reused: false, previous_link_deactivated: true });
    expect(await get()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-2', payment_link_stale: false });
  });

  it('B1-T29/T30 GET con enlace heredado (url sin importe) → obsoleto; sin enlace → null y stale:false; señuelo → 404; saldo como texto compara como número', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: null, payment_link_id: null });
    expect(await get()).toMatchObject({ payment_link_url: null, payment_link_stale: true });
    Object.assign(quotation(), { payment_link_url: null });
    expect(await get()).toMatchObject({ payment_link_url: null, payment_link_stale: false });
    expect((await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-9'))).status).toBe(404);
    await link();
    invoice().balance = '5000000.00';
    expect(await get()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_stale: false });
  });

  it('B1-T32 la UI (PaymentLinkButton) solo ofrece «Crear enlace de pago» cuando payment_link_url es null y usa r.url/r.amount del POST; PaymentStatus sigue exponiendo payment_link_url', () => {
    const ui = read('src/components/crm/contratos/PaymentLinkButton.tsx');
    expect(ui).toMatch(/status\.payment_link_url \?/);
    expect(ui).toMatch(/Crear enlace de pago/);
    expect(ui).toMatch(/payment_link_url: r\.url/);
    expect(ui).not.toMatch(/payment_link_id|payment_link_amount/);
    expect(read('src/components/crm/propuestas/proposalApi.ts')).toMatch(/payment_link_url: string \| null/);
  });

  it('B1-T33 f10Guardrails no fija un contrato más débil: sigue exigiendo enlace de un solo uso, active:false, desactivación por id persistido y limpieza de columnas', () => {
    const g = read('src/lib/services/crm/__tests__/f10Guardrails.test.ts');
    expect(g).toMatch(/completed_sessions/);
    expect(g).toMatch(/active: false/);
    expect(g).toMatch(/payment_link_id \\\?\\\? p\\\.paymentLinkId/);
    expect(g).toMatch(/PAYMENT_LINK_CLEARED/);
    expect(g).toMatch(/deactivateLinkBestEffort\\\(adapter, verifyingKey, linkId,/);
    expect(g).not.toMatch(/it\.skip|it\.todo/);
  });
});
