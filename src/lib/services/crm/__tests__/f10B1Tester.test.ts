/// <reference types="jest" />
/**
 * F10-B1 — tester adversarial del importe del enlace de pago
 * (`quotations.payment_link_amount` / `payment_link_id`, migración 20260916030000).
 *
 * Ataca dinero (saldo como texto, 0/negativo/null, monedas sin decimales,
 * centavos, carreras), seguridad (señuelo org 121 en cotización, factura,
 * body y metadata del webhook; clave con la que se desactiva; secretos en
 * logs), idempotencia (webhook repetido, fallos de Stripe/BD al desactivar o
 * limpiar) y contrato (GET de `payments/link` coherente con la UI que solo
 * ofrece «Crear enlace» cuando no hay `payment_link_url`).
 * Stripe doblado por `StripeAdapter`; BD doblada por `f10FakeSupabase`.
 * Fixtures sin datos de clientes reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import * as fs from 'fs';
import * as path from 'path';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;
const PLATFORM_SK = ['sk_test_', '51platformkey_tester_b1_abcdefgh'].join('');
const PLATFORM_WH = ['whsec_', 'platform_tester_b1_0123456789'].join('');
const ORG_SK = ['sk_live_', '51org120key_tester_b1_abcdefghij'].join('');
const ORG_WH = ['whsec_', 'org120_tester_b1_0123456789'].join('');

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => createFakeSupabase(db) }));

const linkCalls: Array<{ key: string; input: { amountMinor: number; currency: string; metadata: Record<string, string> } }> = [];
const deactivations: Array<{ key: string; id: string }> = [];
let linkSeq = 0;
/** Gancho para simular lo que pasa ENTRE la lectura del saldo y la respuesta de Stripe. */
let beforeStripeCreate: (() => Promise<void> | void) | null = null;
let deactivateImpl: ((key: string, id: string) => Promise<void>) | null = null;

jest.mock('@/lib/services/crm/stripePaymentLinkService', () => {
  const actual = jest.requireActual('@/lib/services/crm/stripePaymentLinkService');
  const fakeAdapter = {
    createPaymentLink: async (key: string, input: { amountMinor: number; currency: string; metadata: Record<string, string> }) => {
      if (beforeStripeCreate) await beforeStripeCreate();
      linkSeq += 1;
      linkCalls.push({ key, input });
      return { id: `plink_${linkSeq}`, url: `https://buy.stripe.com/fake-${linkSeq}` };
    },
    constructEvent: (_sk: string, rawBody: string, signature: string, webhookSecret: string) => {
      if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
      return JSON.parse(rawBody);
    },
    deactivatePaymentLink: async (key: string, id: string) => {
      if (deactivateImpl) return deactivateImpl(key, id);
      deactivations.push({ key, id });
    },
  };
  return { ...actual, stripeAdapter: fakeAdapter };
});

import { NextRequest } from 'next/server';
import { registerCrmPayment } from '@/lib/services/crm/paymentService';
import { createPaymentLinkForQuotation, processStripeWebhook, stripeAdapter, InvoiceRequiredError, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { GET as linkGet, POST as linkPost } from '@/app/api/crm/payments/link/route';

function seed(): FakeDb {
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

const client = () => createFakeSupabase(db) as unknown as Parameters<typeof registerCrmPayment>[2];
const readiness = { configured: true, source: 'platform' as const, secretKey: PLATFORM_SK, webhookSecret: PLATFORM_WH, missing: [] };
const link = (quotationId = 'q-1', adapter: StripeAdapter = stripeAdapter, orgId = 120) =>
  createPaymentLinkForQuotation(orgId, quotationId, client(), { serviceClient: client(), adapter, readiness });
const quotation = (id = 'q-1') => db.rows.quotations.find((q) => q.id === id)!;
const invoice = (id = 'inv-1') => db.rows.invoice_sales.find((i) => i.id === id)!;
const manual = (amount: number, reference: string) => ({ invoice_id: 'inv-1', amount, currency: 'COP', method: 'cash', reference });
const writesTo = (t: string) => db.writes.filter((w) => w.table === t);
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
const envBackup = { ...process.env };

function stripeEvent(id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}, type = 'checkout.session.completed') {
  return JSON.stringify({
    id, type, livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', payment_link: 'plink_de_la_sesion', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1', ...meta }, ...over } },
  });
}
const platformEnv = { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH };
const webhook = (id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}, opts: { env?: Record<string, string>; sig?: string; adapter?: StripeAdapter; type?: string } = {}) =>
  processStripeWebhook(stripeEvent(id, over, meta, opts.type), opts.sig ?? `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: opts.adapter ?? stripeAdapter, env: opts.env ?? platformEnv });
const org120Creds = () => {
  db.rows.integration_connections = [{ id: 'ic-120', organization_id: 120, status: 'connected', connector_id: 'x', integration_connectors: { integration_providers: { code: 'stripe' } } }];
  db.rows.integration_credentials = [{ id: 'cr-1', connection_id: 'ic-120', purpose: 'secret_key', secret_ref: ORG_SK }, { id: 'cr-2', connection_id: 'ic-120', purpose: 'webhook_secret', secret_ref: ORG_WH }];
};
const SECRETS = [PLATFORM_SK, PLATFORM_WH, ORG_SK, ORG_WH];
const secretLeak = (spy: jest.SpyInstance) => { const dump = JSON.stringify(spy.mock.calls); return SECRETS.find((s) => dump.includes(s)) ?? null; };
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  db = seed();
  linkCalls.length = 0;
  deactivations.length = 0;
  linkSeq = 0;
  beforeStripeCreate = null;
  deactivateImpl = null;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CRM_WEBHOOK_SECRET;
});
afterAll(() => { process.env = envBackup; });

// ─── 1. Dinero ───────────────────────────────────────────────────────────────

describe('B1-T dinero', () => {
  it('saldo como texto numeric(…,2) de PostgREST ("5000000.00") y importe guardado como texto sin decimales ("5000000") → se reutiliza sin llamar a Stripe', async () => {
    await link();
    invoice().balance = '5000000.00';
    quotation().payment_link_amount = '5000000';
    db.writes.length = 0;
    const r = await link();
    expect(r).toMatchObject({ reused: true, amount: 5000000, url: 'https://buy.stripe.com/fake-1' });
    expect(linkCalls).toHaveLength(1);
    expect(deactivations).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it.each([['"0.00"', '0.00'], ['0', 0], ['negativo', '-1.00'], ['null', null], ['undefined', undefined], ['texto no numérico', 'abc']])(
    'saldo %s → «sin saldo pendiente», sin Stripe y sin escrituras',
    async (_label, balance) => {
      invoice().balance = balance as unknown as number;
      await expect(link()).rejects.toThrow(/saldo pendiente/);
      expect(linkCalls).toHaveLength(0);
      expect(db.writes).toEqual([]);
    },
  );

  it('factura marcada paid/void con saldo positivo (inconsistente) → no se crea enlace', async () => {
    for (const status of ['paid', 'void', 'voided']) {
      invoice().status = status;
      await expect(link()).rejects.toThrow(/saldo pendiente/);
    }
    expect(linkCalls).toHaveLength(0);
  });

  it('saldo con centavos (3.333.333,33 COP): unidades menores ×100 = 333333333 (entero), se persiste 3333333.33 y el texto "3333333.33" de vuelta reutiliza', async () => {
    invoice().balance = 3333333.33;
    const r = await link();
    expect(r?.amount).toBe(3333333.33);
    expect(linkCalls[0].input.amountMinor).toBe(333333333);
    expect(Number.isInteger(linkCalls[0].input.amountMinor)).toBe(true);
    expect(quotation().payment_link_amount).toBe(3333333.33);
    invoice().balance = '3333333.33';
    quotation().payment_link_amount = '3333333.33';
    expect((await link())?.reused).toBe(true);
    expect(linkCalls).toHaveLength(1);
  });

  it('moneda sin decimales (CLP): unidades menores = saldo (×1); el webhook con amount_total = saldo paga la factura, desactiva y limpia', async () => {
    invoice().currency = 'CLP';
    quotation().currency = 'CLP';
    const r = await link();
    expect(r).toMatchObject({ amount: 5000000, currency: 'CLP' });
    expect(linkCalls[0].input).toMatchObject({ amountMinor: 5000000, currency: 'CLP' });
    const out = await webhook('evt_clp', { amount_total: 5000000, currency: 'clp' });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(writesTo('payments')[0].row).toMatchObject({ amount: 5000000, currency: 'CLP' });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });

  it('el importe guardado es el SALDO (no el total de la cotización) y se persiste como número', async () => {
    await link();
    expect(quotation().payment_link_amount).toBe(5000000);
    expect(typeof quotation().payment_link_amount).toBe('number');
    expect(quotation().total).toBe(6800000);
  });

  it('carrera abono-manual-durante-creación: el enlace se persiste con el saldo que Stripe cobra (5.000.000), y la siguiente consulta lo regenera por 3.000.000 desactivándolo', async () => {
    beforeStripeCreate = async () => { await registerCrmPayment(120, manual(2000000, 'abono-carrera'), client()); };
    const first = await link();
    beforeStripeCreate = null;
    expect(first).toMatchObject({ reused: false, amount: 5000000 });
    expect(quotation()).toMatchObject({ payment_link_amount: 5000000, payment_link_id: 'plink_1' });
    expect(Number(invoice().balance)).toBe(3000000);
    const second = await link();
    expect(second).toMatchObject({ reused: false, amount: 3000000, previous_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(linkCalls[1].input.amountMinor).toBe(300000000);
  });

  it('carrera de dos POST simultáneos: nunca quedan DOS enlaces activos por la misma factura (el perdedor desactiva el suyo y avisa)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let waiting = 0;
    beforeStripeCreate = async () => { waiting += 1; if (waiting === 2) release(); await gate; };
    const results = await Promise.allSettled([link(), link()]);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof link>>> => r.status === 'fulfilled');
    const ko = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(linkCalls).toHaveLength(2);
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toBeInstanceOf(Error);
    expect(String(ko[0].reason.message)).toMatch(/otra petición/);
    const stored = quotation().payment_link_id as string;
    const loser = ['plink_1', 'plink_2'].find((id) => id !== stored)!;
    expect(ok[0].value?.url).toBe(`https://buy.stripe.com/fake-${stored.replace('plink_', '')}`);
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: loser }]);
    expect(quotation()).toMatchObject({ payment_link_amount: 5000000, payment_link_url: `https://buy.stripe.com/fake-${stored.replace('plink_', '')}` });
  });

  it('carrera perdida por la ruta → 409 (no 500) y el cliente vuelve a consultar', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let waiting = 0;
    beforeStripeCreate = async () => { waiting += 1; if (waiting === 2) release(); await gate; };
    const [a, b] = await Promise.all([linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' })), linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('enlace heredado con url + importe igual pero SIN id → se reutiliza; con importe distinto → se regenera sin nada que desactivar (previous_link_deactivated:null)', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: 5000000, payment_link_id: null });
    expect((await link())?.reused).toBe(true);
    expect(linkCalls).toHaveLength(0);
    Object.assign(quotation(), { payment_link_amount: 4000000 });
    const r = await link();
    expect(r).toMatchObject({ reused: false, amount: 5000000, previous_link_deactivated: null, url: 'https://buy.stripe.com/fake-1' });
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1', payment_link_amount: 5000000 });
  });

  it('un tercer cambio de saldo encadena: cada regeneración desactiva exactamente el id vigente, nunca uno ya reemplazado', async () => {
    await link();
    await registerCrmPayment(120, manual(1000000, 'a1'), client());
    await link();
    await registerCrmPayment(120, manual(1000000, 'a2'), client());
    const r = await link();
    expect(r).toMatchObject({ amount: 3000000, url: 'https://buy.stripe.com/fake-3' });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }, { key: PLATFORM_SK, id: 'plink_2' }]);
    expect(linkCalls.map((c) => c.input.amountMinor)).toEqual([500000000, 400000000, 300000000]);
  });
});

// ─── 2. Seguridad ────────────────────────────────────────────────────────────

describe('B1-T seguridad', () => {
  it('cotización de la org 121 pedida como 120 → null (404), sin Stripe, sin escrituras; y su enlace ajeno no se toca', async () => {
    expect(await link('q-9')).toBeNull();
    expect(linkCalls).toHaveLength(0);
    expect(deactivations).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(quotation('q-9')).toMatchObject({ payment_link_url: 'https://buy.stripe.com/ajeno', payment_link_id: 'plink_ajeno' });
  });

  it('cotización propia cuya factura pertenece a la org 121 → InvoiceRequiredError, sin Stripe y sin leer el saldo ajeno', async () => {
    await expect(link('q-2')).rejects.toBeInstanceOf(InvoiceRequiredError);
    expect(linkCalls).toHaveLength(0);
    expect(db.writes).toEqual([]);
  });

  it('regla dura 5 en POST /payments/link: organization_id ajeno en el body → 403 sin Stripe; el propio se ignora y funciona', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const forbidden = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-9', organization_id: 121 }));
      expect(forbidden.status).toBe(403);
      expect(linkCalls).toHaveLength(0);
      expect(db.writes).toEqual([]);
      expect(warn).toHaveBeenCalled();
      const own = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1', organization_id: 120 }));
      expect(own.status).toBe(201);
      expect(linkCalls[0].input.metadata.organization_id).toBe('120');
    } finally {
      warn.mockRestore();
    }
  });

  it('webhook: metadata org 121 con firma de la 120 → 401; metadata 120 firmada por la 120 pero cotización de la 121 → no aplica, no paga, no desactiva el enlace ajeno', async () => {
    org120Creds();
    const noPlatform = { env: {}, sig: `sig:${ORG_WH}` };
    const forged = await webhook('evt_forge', {}, { organization_id: '121', quotation_id: 'q-9', invoice_id: 'inv-9' }, noPlatform);
    expect(forged.status).toBe(401);
    expect(db.writes).toEqual([]);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const crossed = await webhook('evt_cross', { amount_total: 500 }, { organization_id: '120', quotation_id: 'q-9', invoice_id: 'inv-9' }, noPlatform);
      expect(crossed.body).toMatchObject({ applied: false, reason: 'quotation_not_found' });
    } finally {
      err.mockRestore();
    }
    expect(writesTo('payments')).toEqual([]);
    expect(deactivations).toEqual([]);
    expect(quotation('q-9')).toMatchObject({ payment_link_url: 'https://buy.stripe.com/ajeno', payment_link_id: 'plink_ajeno' });
    expect(Number(invoice('inv-9').balance)).toBe(5);
  });

  it('la desactivación en el webhook usa la clave que VERIFICÓ la firma (org), aunque exista clave de plataforma', async () => {
    org120Creds();
    const r = await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    expect(linkCalls[0].key).toBe(ORG_SK);
    expect(r?.reused).toBe(false);
    const out = await webhook('evt_org', {}, {}, { env: platformEnv, sig: `sig:${ORG_WH}` });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivations).toEqual([{ key: ORG_SK, id: 'plink_1' }]);
  });

  it('la regeneración desactiva con la clave con la que se creará el nuevo (readiness de la organización si la hay)', async () => {
    org120Creds();
    await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    expect(deactivations).toEqual([{ key: ORG_SK, id: 'plink_1' }]);
    expect(linkCalls.map((c) => c.key)).toEqual([ORG_SK, ORG_SK]);
  });

  it('ningún secreto va a los logs cuando Stripe falla al desactivar (creación y webhook) ni cuando el adaptador no sabe desactivar', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await link();
      await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
      deactivateImpl = async () => { throw new Error('No such payment_link: plink_1'); };
      await link();
      expect(err).toHaveBeenCalled();
      // el contexto que se registra (organización, cotización, id del enlace) nunca lleva la clave con la que se llamó
      expect(secretLeak(err)).toBeNull();
      expect(secretLeak(warn)).toBeNull();
      err.mockClear();
      await webhook('evt_leak');
      expect(err).toHaveBeenCalled();
      expect(secretLeak(err)).toBeNull();
      err.mockClear();
      deactivateImpl = null;
      const sinDesactivar: StripeAdapter = { createPaymentLink: stripeAdapter.createPaymentLink, constructEvent: stripeAdapter.constructEvent };
      Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/x', payment_link_amount: 1, payment_link_id: 'plink_x' });
      await link('q-1', sinDesactivar);
      expect(secretLeak(err)).toBeNull();
    } finally {
      err.mockRestore();
      warn.mockRestore();
    }
  });

  it('el JSON del GET no expone claves ni el id del Payment Link', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    await link();
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(JSON.stringify(g)).not.toMatch(/sk_(?:test|live)_|whsec_|plink_/);
    expect(g.data.payment_link_url).toBe('https://buy.stripe.com/fake-1');
  });
});

// ─── 3. Idempotencia ─────────────────────────────────────────────────────────

describe('B1-T idempotencia', () => {
  it('webhook repetido (mismo event.id): una sola desactivación y una sola limpieza; el segundo responde idempotent', async () => {
    await link();
    const first = await webhook('evt_dup');
    expect(first.body).toMatchObject({ applied: true, invoice_status: 'paid' });
    const clears = () => writesTo('quotations').filter((w) => w.op === 'update' && w.row?.payment_link_url === null);
    expect(clears()).toHaveLength(1);
    const second = await webhook('evt_dup');
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ applied: true, idempotent: true });
    expect(second.body).not.toHaveProperty('payment_link_deactivated');
    expect(deactivations).toHaveLength(1);
    expect(clears()).toHaveLength(1);
    expect(writesTo('payments')).toHaveLength(1);
  });

  it('Stripe falla al desactivar en el webhook: el pago queda registrado, payment_link_deactivated:false y las columnas se limpian igual', async () => {
    await link();
    deactivateImpl = async () => { throw new Error('stripe caído'); };
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('evt_fail');
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: false });
    } finally {
      err.mockRestore();
    }
    expect(writesTo('payments')).toHaveLength(1);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });

  it('adaptador sin deactivatePaymentLink en el webhook: applied:true, payment_link_deactivated:false, columnas limpias', async () => {
    await link();
    const sinDesactivar: StripeAdapter = { createPaymentLink: stripeAdapter.createPaymentLink, constructEvent: stripeAdapter.constructEvent };
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('evt_noadapter', {}, {}, { adapter: sinDesactivar });
      expect(out.body).toMatchObject({ applied: true, payment_link_deactivated: false });
    } finally {
      err.mockRestore();
    }
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_id: null });
  });

  it('la limpieza de columnas falla en BD: el pago sigue aplicado (200), se desactivó el enlace y solo queda console.error', async () => {
    await link();
    db.nextWriteError = { table: 'quotations', error: { code: '57014', message: 'statement timeout' } };
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
    // las columnas quedaron sucias: el GET las trata como obsoletas (factura pagada ≠ importe del enlace)
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1' });
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data.payment_link_url).toBeNull();
  });

  it('completed «unpaid» → ignored sin tocar columnas; async_payment_succeeded después → aplica, desactiva y limpia', async () => {
    await link();
    const unpaid = await webhook('evt_async_1', { payment_status: 'unpaid' });
    expect(unpaid.body).toMatchObject({ ignored: true });
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1' });
    expect(deactivations).toEqual([]);
    const paid = await webhook('evt_async_2', {}, {}, { type: 'checkout.session.async_payment_succeeded' });
    expect(paid.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });

  it('pago parcial por el webhook (enlace de un solo uso ya consumido): columnas intactas, el GET lo oculta y el siguiente POST regenera por el saldo restante', async () => {
    await link();
    const out = await webhook('evt_partial', { amount_total: 100000000 });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000 });
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data).toMatchObject({ payment_link_url: null, payment_link_stale: true, invoice: { balance: 4000000 } });
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ amount: 4000000, previous_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
  });

  it('el pago rechazado por exceder el saldo NO limpia ni desactiva (el enlace viejo sigue siendo evidencia para Finanzas)', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const out = await webhook('evt_over');
      expect(out.body).toMatchObject({ applied: false, reason: 'not_applied' });
    } finally {
      err.mockRestore();
    }
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1', payment_link_amount: 5000000 });
    expect(db.rows.activities).toHaveLength(1);
  });
});

// ─── 4. Contrato GET / UI ────────────────────────────────────────────────────

describe('B1-T contrato GET y UI', () => {
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = PLATFORM_SK; });

  it('GET con enlace vigente e importe = saldo → payment_link_url presente y payment_link_stale:false', async () => {
    await link();
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data).toMatchObject({ configured: true, payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_stale: false, invoice: { number: 'FACT-0001', balance: 5000000 } });
  });

  it('GET tras un abono manual: el enlace de 5.000.000 NO se muestra (payment_link_url:null, payment_link_stale:true) para que la UI ofrezca «Crear enlace de pago» y el POST lo regenere', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data).toMatchObject({ payment_link_url: null, payment_link_stale: true, invoice: { balance: 3000000 } });
    const res = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ amount: 3000000, reused: false, previous_link_deactivated: true });
    const again = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(again.data).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-2', payment_link_stale: false });
  });

  it('GET con enlace heredado (url sin importe) → obsoleto (no se muestra); sin enlace → null y stale:false', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: null, payment_link_id: null });
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data).toMatchObject({ payment_link_url: null, payment_link_stale: true });
    Object.assign(quotation(), { payment_link_url: null });
    const g2 = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g2.data).toMatchObject({ payment_link_url: null, payment_link_stale: false });
  });

  it('GET del señuelo → 404 y GET con saldo como texto compara como número', async () => {
    expect((await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-9'))).status).toBe(404);
    await link();
    invoice().balance = '5000000.00';
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(g.data).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_stale: false });
  });

  it('POST reused → 200 sin previous_link_deactivated; regenerado → 201 con previous_link_deactivated', async () => {
    const a = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(a.status).toBe(201);
    expect((await a.json()).data).not.toHaveProperty('previous_link_deactivated');
    const b = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }));
    expect(b.status).toBe(200);
    expect((await b.json()).data).toMatchObject({ reused: true });
  });

  it('la UI (PaymentLinkButton) solo ofrece «Crear enlace de pago» cuando payment_link_url es null y usa r.url/r.amount del POST; el tipo PaymentStatus sigue exponiendo payment_link_url', () => {
    const ui = read('src/components/crm/contratos/PaymentLinkButton.tsx');
    expect(ui).toMatch(/status\.payment_link_url \?/);
    expect(ui).toMatch(/Crear enlace de pago/);
    expect(ui).toMatch(/payment_link_url: r\.url/);
    expect(ui).not.toMatch(/payment_link_id|payment_link_amount/);
    expect(read('src/components/crm/propuestas/proposalApi.ts')).toMatch(/payment_link_url: string \| null/);
  });

  it('f10Guardrails no fija un contrato más débil: sigue exigiendo enlace de un solo uso, active:false, desactivación por id persistido y limpieza de columnas', () => {
    const g = read('src/lib/services/crm/__tests__/f10Guardrails.test.ts');
    expect(g).toMatch(/completed_sessions/);
    expect(g).toMatch(/active: false/);
    expect(g).toMatch(/payment_link_id \\\?\\\? p\\\.paymentLinkId/);
    expect(g).toMatch(/PAYMENT_LINK_CLEARED/);
    expect(g).toMatch(/deactivateLinkBestEffort\\\(adapter, verifyingKey, linkId,/);
    expect(g).not.toMatch(/it\.skip|it\.todo/);
  });
});
