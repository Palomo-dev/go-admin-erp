/// <reference types="jest" />
/**
 * F10 — crear/regenerar el enlace de pago (`createPaymentLinkForQuotation` y
 * `POST /api/crm/payments/link`): dinero (saldo como texto, 0/negativo/null,
 * monedas sin decimales, centavos, carreras) y seguridad (señuelo org 121 en
 * cotización, factura y body; clave con la que se desactiva; secretos en logs).
 * Consolidado el 2026-09-21 desde el tester B1 (`f10B1Tester`); lo que ya
 * afirmaban `f10PaymentLinkAmount` y `f10PaymentLink.contract` no se repite.
 * Stripe doblado por `f10PaymentLinkFake`; BD doblada por `f10FakeSupabase`.
 */
import * as H from '@/lib/services/crm/__tests__/f10PaymentLinkFake';

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
import { createPaymentLinkForQuotation, processStripeWebhook, stripeAdapter, InvoiceRequiredError, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { GET as linkGet, POST as linkPost } from '@/app/api/crm/payments/link/route';

const { PLATFORM_SK, PLATFORM_WH, ORG_SK, state, quotation, invoice, manual, writesTo, req } = H;
const client = () => H.fakeClient() as unknown as Parameters<typeof registerCrmPayment>[2];
const link = (quotationId = 'q-1', adapter: StripeAdapter = stripeAdapter, orgId = 120) =>
  createPaymentLinkForQuotation(orgId, quotationId, client(), { serviceClient: client(), adapter, readiness: H.readiness });
const webhook = (id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}, opts: { env?: Record<string, string>; sig?: string } = {}) =>
  processStripeWebhook(H.stripeEvent(id, over, meta), opts.sig ?? `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: stripeAdapter, env: opts.env ?? H.platformEnv });
const envBackup = { ...process.env };

beforeEach(() => H.resetState());
afterAll(() => { process.env = envBackup; });

describe('dinero (tester B1)', () => {
  it('B1-T1 saldo como texto numeric(…,2) de PostgREST ("5000000.00") e importe guardado como texto ("5000000") → se reutiliza sin llamar a Stripe', async () => {
    await link();
    invoice().balance = '5000000.00';
    quotation().payment_link_amount = '5000000';
    state.db.writes.length = 0;
    const r = await link();
    expect(r).toMatchObject({ reused: true, amount: 5000000, url: 'https://buy.stripe.com/fake-1' });
    expect(state.linkCalls).toHaveLength(1);
    expect(state.deactivations).toEqual([]);
    expect(state.db.writes).toEqual([]);
  });

  it.each([['"0.00"', '0.00'], ['0', 0], ['negativo', '-1.00'], ['null', null], ['undefined', undefined], ['texto no numérico', 'abc']])(
    'B1-T2 saldo %s → «sin saldo pendiente», sin Stripe y sin escrituras',
    async (_label, balance) => {
      invoice().balance = balance as unknown as number;
      await expect(link()).rejects.toThrow(/saldo pendiente/);
      expect(state.linkCalls).toHaveLength(0);
      expect(state.db.writes).toEqual([]);
    },
  );

  it('B1-T3 factura marcada paid/void con saldo positivo (inconsistente) → no se crea enlace; por la ruta → 422', async () => {
    for (const status of ['paid', 'void', 'voided']) {
      invoice().status = status;
      await expect(link()).rejects.toThrow(/saldo pendiente/);
    }
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    expect((await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }))).status).toBe(422);
    expect(state.linkCalls).toHaveLength(0);
  });

  it('B1-T4 saldo con centavos (3.333.333,33 COP): unidades menores ×100 = 333333333 (entero), se persiste 3333333.33 y el texto de vuelta reutiliza', async () => {
    invoice().balance = 3333333.33;
    const r = await link();
    expect(r?.amount).toBe(3333333.33);
    expect(state.linkCalls[0].input.amountMinor).toBe(333333333);
    expect(Number.isInteger(state.linkCalls[0].input.amountMinor)).toBe(true);
    expect(quotation().payment_link_amount).toBe(3333333.33);
    invoice().balance = '3333333.33';
    quotation().payment_link_amount = '3333333.33';
    expect((await link())?.reused).toBe(true);
    expect(state.linkCalls).toHaveLength(1);
  });

  it('B1-T5 moneda sin decimales (CLP): unidades menores = saldo (×1); el webhook con amount_total = saldo paga la factura, desactiva y limpia', async () => {
    invoice().currency = 'CLP';
    quotation().currency = 'CLP';
    const r = await link();
    expect(r).toMatchObject({ amount: 5000000, currency: 'CLP' });
    expect(state.linkCalls[0].input).toMatchObject({ amountMinor: 5000000, currency: 'CLP' });
    const out = await webhook('evt_clp', { amount_total: 5000000, currency: 'clp' });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(writesTo('payments')[0].row).toMatchObject({ amount: 5000000, currency: 'CLP' });
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });

  it('B1-T7 carrera abono-manual-durante-creación: el enlace se persiste con el saldo que Stripe cobra (5.000.000) y la siguiente consulta lo regenera por 3.000.000 desactivándolo', async () => {
    state.beforeStripeCreate = async () => { await registerCrmPayment(120, manual(2000000, 'abono-carrera'), client()); };
    const first = await link();
    state.beforeStripeCreate = null;
    expect(first).toMatchObject({ reused: false, amount: 5000000 });
    expect(quotation()).toMatchObject({ payment_link_amount: 5000000, payment_link_id: 'plink_1' });
    expect(Number(invoice().balance)).toBe(3000000);
    const second = await link();
    expect(second).toMatchObject({ reused: false, amount: 3000000, previous_link_deactivated: true });
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(state.linkCalls[1].input.amountMinor).toBe(300000000);
  });

  it('B1-T8 dos POST simultáneos: nunca quedan DOS enlaces activos por la misma factura (el perdedor desactiva el suyo y avisa); por la ruta el perdedor recibe 409, no 500', async () => {
    const arm = () => { let release: () => void = () => undefined; const gate = new Promise<void>((resolve) => { release = resolve; }); let waiting = 0; state.beforeStripeCreate = async () => { waiting += 1; if (waiting === 2) release(); await gate; }; };
    arm();
    const results = await Promise.allSettled([link(), link()]);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof link>>> => r.status === 'fulfilled');
    const ko = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(state.linkCalls).toHaveLength(2);
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(String((ko[0].reason as Error).message)).toMatch(/otra petición/);
    const stored = quotation().payment_link_id as string;
    const loser = ['plink_1', 'plink_2'].find((id) => id !== stored)!;
    expect(ok[0].value?.url).toBe(`https://buy.stripe.com/fake-${stored.replace('plink_', '')}`);
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: loser }]);
    expect(quotation()).toMatchObject({ payment_link_amount: 5000000, payment_link_url: `https://buy.stripe.com/fake-${stored.replace('plink_', '')}` });
    // B1-T9: misma carrera por la ruta
    H.resetState();
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    arm();
    const [a, b] = await Promise.all([linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' })), linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1' }))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('B1-T10 enlace heredado con url + importe igual pero SIN id → se reutiliza; con importe distinto → se regenera sin nada que desactivar (previous_link_deactivated:null)', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: 5000000, payment_link_id: null });
    expect((await link())?.reused).toBe(true);
    expect(state.linkCalls).toHaveLength(0);
    Object.assign(quotation(), { payment_link_amount: 4000000 });
    const r = await link();
    expect(r).toMatchObject({ reused: false, amount: 5000000, previous_link_deactivated: null, url: 'https://buy.stripe.com/fake-1' });
    expect(state.deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_id: 'plink_1', payment_link_amount: 5000000 });
  });

  it('B1-T11 un tercer cambio de saldo encadena: cada regeneración desactiva exactamente el id vigente, nunca uno ya reemplazado', async () => {
    await link();
    await registerCrmPayment(120, manual(1000000, 'a1'), client());
    await link();
    await registerCrmPayment(120, manual(1000000, 'a2'), client());
    const r = await link();
    expect(r).toMatchObject({ amount: 3000000, url: 'https://buy.stripe.com/fake-3' });
    expect(state.deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }, { key: PLATFORM_SK, id: 'plink_2' }]);
    expect(state.linkCalls.map((c) => c.input.amountMinor)).toEqual([500000000, 400000000, 300000000]);
  });
});

describe('seguridad (tester B1)', () => {
  it('B1-T13 cotización propia cuya factura pertenece a la org 121 → InvoiceRequiredError, sin Stripe y sin leer el saldo ajeno; cotización de la 121 → null y su enlace no se toca', async () => {
    await expect(link('q-2')).rejects.toBeInstanceOf(InvoiceRequiredError);
    expect(await link('q-9')).toBeNull();
    expect(state.linkCalls).toHaveLength(0);
    expect(state.deactivations).toEqual([]);
    expect(state.db.writes).toEqual([]);
    expect(quotation('q-9')).toMatchObject({ payment_link_url: 'https://buy.stripe.com/ajeno', payment_link_id: 'plink_ajeno' });
  });

  it('B1-T14 regla dura 5 en POST /payments/link: organization_id ajeno en el body → 403 sin Stripe y con warn; el propio se ignora y funciona (201)', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const forbidden = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-9', organization_id: 121 }));
      expect(forbidden.status).toBe(403);
      expect(state.linkCalls).toHaveLength(0);
      expect(state.db.writes).toEqual([]);
      expect(warn).toHaveBeenCalled();
      const own = await linkPost(req('POST', '/api/crm/payments/link', { quotation_id: 'q-1', organization_id: 120 }));
      expect(own.status).toBe(201);
      expect(state.linkCalls[0].input.metadata.organization_id).toBe('120');
    } finally {
      warn.mockRestore();
    }
  });

  it('B1-T17 la regeneración desactiva con la clave con la que se creará el nuevo (readiness de la organización si la hay)', async () => {
    H.org120Creds();
    await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    await createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: stripeAdapter });
    expect(state.deactivations).toEqual([{ key: ORG_SK, id: 'plink_1' }]);
    expect(state.linkCalls.map((c) => c.key)).toEqual([ORG_SK, ORG_SK]);
  });

  it('B1-T18 ningún secreto va a los logs cuando Stripe falla al desactivar (creación y webhook) ni cuando el adaptador no sabe desactivar', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await link();
      await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
      state.deactivateImpl = async () => { throw new Error('No such payment_link: plink_1'); };
      await link();
      expect(err).toHaveBeenCalled();
      // el contexto que se registra (organización, cotización, id del enlace) nunca lleva la clave con la que se llamó
      expect(H.secretLeak(err)).toBeNull();
      expect(H.secretLeak(warn)).toBeNull();
      err.mockClear();
      await webhook('evt_leak');
      expect(err).toHaveBeenCalled();
      expect(H.secretLeak(err)).toBeNull();
      err.mockClear();
      state.deactivateImpl = null;
      const sinDesactivar: StripeAdapter = { createPaymentLink: stripeAdapter.createPaymentLink, constructEvent: stripeAdapter.constructEvent };
      Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/x', payment_link_amount: 1, payment_link_id: 'plink_x' });
      await link('q-1', sinDesactivar);
      expect(H.secretLeak(err)).toBeNull();
    } finally {
      err.mockRestore();
      warn.mockRestore();
    }
  });

  it('B1-T19 el JSON del GET no expone claves ni el id del Payment Link', async () => {
    process.env.STRIPE_SECRET_KEY = PLATFORM_SK;
    await link();
    const g = await (await linkGet(req('GET', '/api/crm/payments/link?quotation_id=q-1'))).json();
    expect(JSON.stringify(g)).not.toMatch(/sk_(?:test|live)_|whsec_|plink_/);
    expect(g.data.payment_link_url).toBe('https://buy.stripe.com/fake-1');
  });
});
