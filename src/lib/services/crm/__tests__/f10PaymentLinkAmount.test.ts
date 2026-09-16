/// <reference types="jest" />
/**
 * F10 — deuda B1: importe del enlace de pago (`quotations.payment_link_amount`
 * + `payment_link_id`, migración 20260916030000).
 *
 * Contrato nuevo:
 *  - crear → se persisten url, importe (= saldo de la factura) e id `plink_…`;
 *  - enlace vigente con saldo DISTINTO → se desactiva el anterior por su id
 *    (mejor esfuerzo) y se crea uno nuevo por el saldo actual;
 *  - saldo IGUAL → se reutiliza sin llamar a Stripe;
 *  - sin clave real → 409 de siempre, aunque el saldo haya cambiado;
 *  - webhook con factura `paid` → desactiva por el id PERSISTIDO (no por
 *    `session.payment_link`) y limpia las tres columnas de la cotización.
 * Fixtures sin datos de clientes reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
const PLATFORM_SK = ['sk_test_', '51platformkey_abcdefghijklmnop'].join('');
const PLATFORM_WH = ['whsec_', 'platform_0123456789abcdef'].join('');

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));

import { registerCrmPayment } from '@/lib/services/crm/paymentService';
import { createPaymentLinkForQuotation, processStripeWebhook, PaymentNotConfiguredError, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [
        { id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', customer_id: 'c-1', converted_invoice_id: 'inv-1', payment_link_url: null, payment_link_amount: null, payment_link_id: null, currency: 'COP', total: 6800000, status: 'converted' },
        { id: 'q-9', organization_id: 121, number: 'COT-0009', opportunity_id: 'op-9', customer_id: 'c-9', converted_invoice_id: 'inv-9', payment_link_url: null, payment_link_amount: null, payment_link_id: null, currency: 'COP', total: 5, status: 'draft' },
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

const deactivations: Array<{ key: string; id: string }> = [];
let linkSeq = 0;
const fakeAdapter: StripeAdapter = {
  createPaymentLink: jest.fn(async () => { linkSeq += 1; return { id: `plink_${linkSeq}`, url: `https://buy.stripe.com/fake-${linkSeq}` }; }),
  constructEvent: (_sk, rawBody, signature, webhookSecret) => {
    if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
    return JSON.parse(rawBody);
  },
  deactivatePaymentLink: jest.fn(async (key: string, id: string) => { deactivations.push({ key, id }); }),
};

const client = () => createFakeSupabase(db) as unknown as Parameters<typeof registerCrmPayment>[2];
const readiness = { configured: true, source: 'platform' as const, secretKey: PLATFORM_SK, webhookSecret: PLATFORM_WH, missing: [] };
const link = (adapter: StripeAdapter = fakeAdapter) => createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter, readiness });
const quotation = () => db.rows.quotations.find((q) => q.id === 'q-1')!;
const manual = (amount: number, reference: string) => ({ invoice_id: 'inv-1', amount, currency: 'COP', method: 'cash', reference });
const created = () => fakeAdapter.createPaymentLink as jest.Mock;

function stripeEvent(id: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    id, type: 'checkout.session.completed', livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1' }, ...over } },
  });
}
const webhook = (id: string, over: Record<string, unknown> = {}) =>
  processStripeWebhook(stripeEvent(id, over), `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: fakeAdapter, env: { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH } });

beforeEach(() => { db = seed(); deactivations.length = 0; linkSeq = 0; jest.clearAllMocks(); });

describe('B1-1 Crear el enlace persiste importe e id', () => {
  it('guarda payment_link_url, payment_link_amount = saldo de la factura (no el total) y payment_link_id, filtrando por organización', async () => {
    const r = await link();
    expect(r).toMatchObject({ reused: false, amount: 5000000, currency: 'COP', url: 'https://buy.stripe.com/fake-1' });
    expect(created().mock.calls[0][1].amountMinor).toBe(500000000);
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000, payment_link_id: 'plink_1' });
    const w = db.writes.find((x) => x.table === 'quotations' && x.op === 'update');
    expect(w?.filters).toMatchObject({ id: 'q-1', organization_id: 120 });
    expect(w?.row).toMatchObject({ payment_link_amount: 5000000, payment_link_id: 'plink_1' });
    expect(deactivations).toEqual([]);
  });
});

describe('B1-2 Saldo cambiado → desactivar el anterior y crear uno nuevo', () => {
  it('abono manual de 2.000.000: el enlace de 5.000.000 se desactiva por SU id con la clave y se crea otro por 3.000.000', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const second = await link();
    expect(second).toMatchObject({ reused: false, amount: 3000000, url: 'https://buy.stripe.com/fake-2', previous_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(created()).toHaveBeenCalledTimes(2);
    expect(created().mock.calls[1][1].amountMinor).toBe(300000000);
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-2', payment_link_amount: 3000000, payment_link_id: 'plink_2' });
  });

  it('la desactivación es mejor esfuerzo: si Stripe falla, se crea igual el nuevo enlace con previous_link_deactivated:false y console.error', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const second = await link({ ...fakeAdapter, deactivatePaymentLink: async () => { throw new Error('stripe caído'); } });
      expect(second).toMatchObject({ reused: false, amount: 3000000, previous_link_deactivated: false });
      expect(quotation()).toMatchObject({ payment_link_amount: 3000000, payment_link_id: 'plink_2' });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('enlace heredado (url sin importe ni id, anterior a la migración): se regenera por el saldo actual y no hay nada que desactivar', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: null, payment_link_id: null });
    const r = await link();
    expect(r).toMatchObject({ reused: false, amount: 5000000, url: 'https://buy.stripe.com/fake-1', previous_link_deactivated: null });
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_amount: 5000000, payment_link_id: 'plink_1' });
  });

  it('sin clave real el saldo cambiado NO llama a Stripe: PaymentNotConfiguredError (409) y columnas intactas', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    jest.clearAllMocks();
    const noKey = createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: fakeAdapter, readiness: { configured: false, source: null, secretKey: null, webhookSecret: null, missing: ['STRIPE_SECRET_KEY'] } });
    await expect(noKey).rejects.toBeInstanceOf(PaymentNotConfiguredError);
    expect(created()).not.toHaveBeenCalled();
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000, payment_link_id: 'plink_1' });
  });
});

describe('B1-3 Saldo igual → reutilizar sin tocar Stripe', () => {
  it('segunda llamada con el mismo saldo: reused:true, misma url, sin createPaymentLink, sin desactivar y sin escrituras', async () => {
    const first = await link();
    db.writes.length = 0;
    const second = await link();
    expect(second).toMatchObject({ reused: true, url: first!.url, amount: 5000000 });
    expect(created()).toHaveBeenCalledTimes(1);
    expect(deactivations).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it('el importe persistido llega como texto (numeric de Postgres) y sigue comparando igual', async () => {
    await link();
    quotation().payment_link_amount = '5000000';
    const second = await link();
    expect(second?.reused).toBe(true);
    expect(created()).toHaveBeenCalledTimes(1);
  });
});

describe('B1-4 Webhook: factura pagada → desactivar por el id persistido y limpiar la cotización', () => {
  it('desactiva payment_link_id de la cotización (no session.payment_link) con la clave que verificó y deja url/amount/id en null', async () => {
    await link();
    const out = await webhook('evt_paid', { payment_link: 'plink_de_la_sesion' });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_1' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
    const clear = db.writes.filter((w) => w.table === 'quotations' && w.op === 'update' && w.row?.payment_link_url === null);
    expect(clear).toHaveLength(1);
    expect(clear[0].filters).toMatchObject({ id: 'q-1', organization_id: 120 });
  });

  it('las columnas se limpian DESPUÉS de confirmar el pago: el orden de escrituras es payments → invoice_sales → quotations', async () => {
    await link();
    db.writes.length = 0;
    await webhook('evt_order');
    const tables = db.writes.map((w) => w.table);
    expect(tables.indexOf('payments')).toBeGreaterThanOrEqual(0);
    expect(tables.lastIndexOf('quotations')).toBeGreaterThan(tables.indexOf('invoice_sales'));
  });

  it('pago parcial por el webhook: la factura sigue partial, no se desactiva ni se limpia nada', async () => {
    await link();
    const out = await webhook('evt_partial', { amount_total: 100000000 });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'partial' });
    expect(out.body).not.toHaveProperty('payment_link_deactivated');
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000, payment_link_id: 'plink_1' });
  });

  it('pago NO aplicado (importe del evento mayor que el saldo): columnas intactas y sin desactivar', async () => {
    await link();
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const out = await webhook('evt_over');
    expect(out.body).toMatchObject({ applied: false, reason: 'not_applied' });
    expect(deactivations).toEqual([]);
    expect(quotation()).toMatchObject({ payment_link_url: 'https://buy.stripe.com/fake-1', payment_link_amount: 5000000, payment_link_id: 'plink_1' });
  });

  it('cotización sin payment_link_id (enlace heredado): cae a session.payment_link y limpia igual', async () => {
    Object.assign(quotation(), { payment_link_url: 'https://buy.stripe.com/legacy', payment_link_amount: null, payment_link_id: null });
    const out = await webhook('evt_legacy', { payment_link: 'plink_legacy' });
    expect(out.body).toMatchObject({ applied: true, invoice_status: 'paid', payment_link_deactivated: true });
    expect(deactivations).toEqual([{ key: PLATFORM_SK, id: 'plink_legacy' }]);
    expect(quotation()).toMatchObject({ payment_link_url: null, payment_link_amount: null, payment_link_id: null });
  });
});
