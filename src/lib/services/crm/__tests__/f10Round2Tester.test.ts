/// <reference types="jest" />
/**
 * F10 — pruebas del TESTER (ronda 2). Verifica los ocho puntos de la r1 ya
 * cubiertos en `f10Round1Tester.test.ts` y busca huecos NUEVOS alrededor:
 * pagos manuales (importe negativo, moneda distinta, carrera con referencias
 * distintas), enlace de pago reutilizado con saldo cambiado, regresión de
 * estado de la cotización (`converted` → `sent`), «Regenerar» sobre una
 * cotización ya facturada, pasos del cierre no idempotentes (onboarding y
 * renovación duplican lo que F11 ya sabe hacer), firma manual que no vincula
 * la cotización y el 23505 de OTRA restricción disfrazado de duplicado.
 *
 * Convención de la r1: lo que reproduce un bug va como `it.failing` (rojo
 * citado = verde en la suite). El constructor lo invierte al corregir.
 * Fixtures sin datos de clientes reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
const PLATFORM_SK = 'sk_test_51platformkey_abcdefghijklmnop';
const PLATFORM_WH = 'whsec_platform_0123456789abcdef';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t), auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } } }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120, obtenerOrganizacionActiva: () => ({ id: 120 }) }));
// La ruta de contratos importa orgContext (→ svix ESM): aquí solo se prueba `canManualSign`, puro.
jest.mock('@/lib/utils/orgContext', () => ({ OrgContextError: class extends Error { statusCode = 401; }, getServerOrgContext: jest.fn() }));

import { registerCrmPayment, isStripeReferenceDuplicate } from '@/lib/services/crm/paymentService';
import { createPaymentLinkForQuotation, processStripeWebhook, type StripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';
import { markProposalSent, generateProposal } from '@/lib/services/crm/proposalServerService';
import { updateContractStatus } from '@/lib/services/crm/contractService';
import { executeOnboarding, executeRenewal, executeReferral, type OpportunityData, type WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';
import { canManualSign } from '@/app/api/crm/contracts/[id]/route';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      quotations: [
        { id: 'q-1', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', customer_id: 'c-1', converted_invoice_id: 'inv-1', payment_link_url: null, currency: 'COP', total: 6800000, status: 'converted', sections_json: null, created_at: '2026-09-01T10:00:00.000Z' },
        { id: 'q-9', organization_id: 121, number: 'COT-0009', opportunity_id: 'op-9', customer_id: 'c-9', converted_invoice_id: 'inv-9', payment_link_url: null, currency: 'COP', total: 5, status: 'draft', sections_json: null, created_at: '2026-09-01T10:00:00.000Z' },
      ],
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 6800000, balance: 5000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: 'op-9', salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      payments: [],
      accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'partial' }],
      commissions: [],
      integration_connections: [],
      integration_credentials: [],
      activities: [],
      opportunities: [
        { id: 'op-1', organization_id: 120, name: 'Oportunidad uno', customer_id: 'c-1', amount: 6800000, currency: 'COP', salesperson_id: 'u-1', vertical_id: null, discovery_data: {}, billing_cycle_months: 1, status: 'won', pipeline_id: 'p-1', stage_id: 's-1', metadata: null, created_by: 'u-1' },
        { id: 'op-9', organization_id: 121, name: 'Ajena', customer_id: 'c-9', amount: 5, currency: 'COP', salesperson_id: null, vertical_id: null, discovery_data: {}, billing_cycle_months: null, status: 'open', pipeline_id: 'p-9', stage_id: 's-9', metadata: null, created_by: null },
      ],
      customers: [{ id: 'c-1', organization_id: 120, full_name: 'Cliente Uno', email: 'uno@example.com', company_name: null }],
      opportunity_objections: [],
      opportunity_products: [],
      opportunity_custom_lines: [],
      quotation_items: [],
      pipelines: [{ id: 'p-onb', organization_id: 120, pipeline_type: 'onboarding' }],
      stages: [{ id: 's-onb-1', pipeline_id: 'p-onb', position: 1 }],
      tasks: [],
      contract_signatures: [
        { id: 'ct-1', organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-1', provider: 'documenso', provider_document_id: 'doc-120', status: 'sent', signers: [{ name: 'A', email: 'a@example.com' }] },
      ],
    },
  };
}

const fakeAdapter: StripeAdapter = {
  createPaymentLink: jest.fn(async () => ({ id: 'plink_1', url: 'https://buy.stripe.com/fake-1' })),
  constructEvent: (_sk, rawBody, signature, webhookSecret) => {
    if (signature !== `sig:${webhookSecret}`) throw new Error('firma inválida');
    return JSON.parse(rawBody);
  },
};

function stripeEvent(id: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return JSON.stringify({
    id, type: 'checkout.session.completed', livemode: false,
    data: { object: { id: `cs_${id}`, object: 'checkout.session', payment_status: 'paid', amount_total: 500000000, currency: 'cop', payment_intent: 'pi_1', metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1', ...meta }, ...over } },
  });
}

const client = () => createFakeSupabase(db) as unknown as Parameters<typeof registerCrmPayment>[2];
const invoice = () => db.rows.invoice_sales.find((i) => i.id === 'inv-1')!;
const manual = (amount: number, reference: string, currency = 'COP') => ({ invoice_id: 'inv-1', amount, currency, method: 'cash', reference });

beforeEach(() => { db = seed(); jest.clearAllMocks(); });

describe('T2-A Pago manual por registerCrmPayment (misma función que usa POST /api/crm/payments/register)', () => {
  it.failing('A1 importe NEGATIVO → debe rechazarse; hoy se inserta y el saldo de la factura SUBE', async () => {
    const r = await registerCrmPayment(120, manual(-500000, 'ref-neg'), client());
    expect(r.success).toBe(false);
    expect(db.rows.payments).toHaveLength(0);
    expect(Number(invoice().balance)).toBe(5000000);
  });

  it.failing('A2 importe cero o NaN → debe rechazarse; hoy NaN pasa la comparación y se intenta insertar', async () => {
    const r = await registerCrmPayment(120, manual(Number.NaN, 'ref-nan'), client());
    expect(r.success).toBe(false);
    expect(db.rows.payments).toHaveLength(0);
  });

  it.failing('A3 moneda distinta a la de la factura (USD sobre COP) → debe rechazarse; hoy descuenta 100 «USD» del saldo en COP', async () => {
    const r = await registerCrmPayment(120, manual(100, 'ref-usd', 'USD'), client());
    expect(r.success).toBe(false);
    expect(Number(invoice().balance)).toBe(5000000);
  });

  it.failing('A4 dos pagos concurrentes con referencias DISTINTAS por el saldo completo → el segundo debe rechazarse; hoy ambos pasan la comprobación de saldo y la factura queda en negativo', async () => {
    const [a, b] = await Promise.all([
      registerCrmPayment(120, manual(5000000, 'manual-a'), client()),
      registerCrmPayment(120, manual(5000000, 'stripe:evt_b'), client()),
    ]);
    expect([a.success, b.success].filter(Boolean)).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(0);
  });

  it('A5 el índice parcial NO cubre referencias que no empiezan por stripe: (dos manuales iguales concurrentes → 2 filas; documentado, no es F10)', async () => {
    await Promise.all([
      registerCrmPayment(120, manual(1000, 'recibo-77'), client()),
      registerCrmPayment(120, manual(1000, 'recibo-77'), client()),
    ]);
    expect(db.rows.payments.filter((p) => p.reference === 'recibo-77')).toHaveLength(2);
  });

  it.failing('A6 un 23505 de OTRA restricción (payments_pkey) con referencia stripe: no debe pasar por duplicado; hoy se responde «ya registrado» y el pago se pierde en silencio', () => {
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint "payments_pkey"' }, 'stripe:evt_1')).toBe(false);
  });
});

describe('T2-B Enlace de pago y webhook', () => {
  const link = () => createPaymentLinkForQuotation(120, 'q-1', client(), { serviceClient: client(), adapter: fakeAdapter, readiness: { configured: true, source: 'platform', secretKey: PLATFORM_SK, webhookSecret: PLATFORM_WH, missing: [] } });

  it.failing('B1 enlace creado por 5.000.000, abono manual deja el saldo en 3.000.000 → el enlace guardado cobra de más; debe regenerarse o rechazarse, hoy se reutiliza (reused:true) declarando el saldo nuevo', async () => {
    const first = await link();
    expect(first?.reused).toBe(false);
    expect((fakeAdapter.createPaymentLink as jest.Mock).mock.calls[0][1].amountMinor).toBe(500000000);
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const second = await link();
    // Lo honesto: un enlace nuevo por 3.000.000 (o 409). Lo que pasa: reused:true con la URL del enlace de 5.000.000.
    expect(second?.reused).toBe(false);
    expect((fakeAdapter.createPaymentLink as jest.Mock).mock.calls[1]?.[1].amountMinor).toBe(300000000);
  });

  it('B2 el webhook con el enlace viejo (5.000.000 > saldo 3.000.000) no aplica y deja actividad system: el dinero queda en Stripe (comportamiento documentado, sigue siendo un riesgo operativo)', async () => {
    await registerCrmPayment(120, manual(2000000, 'abono-1'), client());
    const out = await processStripeWebhook(stripeEvent('evt_old_link'), `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: fakeAdapter, env: { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH } });
    expect(out.status).toBe(200);
    expect(out.body.applied).toBe(false);
    expect(out.body.reason).toBe('not_applied');
    expect(db.rows.activities.filter((a) => a.activity_type === 'system' && a.related_id === 'op-1')).toHaveLength(1);
    expect(db.rows.payments.filter((p) => String(p.reference).startsWith('stripe:'))).toHaveLength(0);
  });

  it('B3 dos entregas concurrentes del mismo event.id → 1 pago, 1 UPDATE de factura y 1 de cartera (verificación r2 del punto 1 de la r1)', async () => {
    const deps = () => ({ serviceClient: client(), adapter: fakeAdapter, env: { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH } });
    const [a, b] = await Promise.all([
      processStripeWebhook(stripeEvent('evt_race'), `sig:${PLATFORM_WH}`, deps()),
      processStripeWebhook(stripeEvent('evt_race'), `sig:${PLATFORM_WH}`, deps()),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.applied, b.body.applied].filter(Boolean)).toHaveLength(1);
    expect(db.rows.payments).toHaveLength(1);
    expect(db.writes.filter((w) => w.table === 'invoice_sales' && w.op === 'update')).toHaveLength(1);
    expect(db.writes.filter((w) => w.table === 'accounts_receivable' && w.op === 'update')).toHaveLength(1);
    expect(Number(invoice().balance)).toBe(0);
    expect(invoice().status).toBe('paid');
  });

  it('B4 firma válida de plataforma pero metadata de la org 121 con quotation de la 120 → no se aplica (se busca en 121) y no se escribe pago', async () => {
    const out = await processStripeWebhook(stripeEvent('evt_x', {}, { organization_id: '121' }), `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: fakeAdapter, env: { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH } });
    expect(out.status).toBe(200);
    expect(out.body.applied).toBe(false);
    expect(db.rows.payments).toHaveLength(0);
  });

  it('B5 amount_total negativo, cero o decimal → 400 sin escrituras (no 200 ignorado: es un cuerpo inválido)', async () => {
    for (const amount_total of [-1, 0, 12.5]) {
      const out = await processStripeWebhook(stripeEvent('evt_bad', { amount_total }), `sig:${PLATFORM_WH}`, { serviceClient: client(), adapter: fakeAdapter, env: { STRIPE_SECRET_KEY: PLATFORM_SK, STRIPE_CRM_WEBHOOK_SECRET: PLATFORM_WH } });
      expect(out.status).toBe(400);
    }
    expect(db.writes).toEqual([]);
  });
});

describe('T2-C Ciclo de vida de la propuesta', () => {
  const sb = () => createFakeSupabase(db) as unknown as Parameters<typeof markProposalSent>[2];

  it.failing('C1 marcar «enviada» una cotización ya FACTURADA (converted) debe rechazarse; hoy regresa a sent y habilita una segunda conversión a factura (convertToInvoice solo frena status=converted)', async () => {
    const r = await markProposalSent(120, 'q-1', sb(), { userId: 'u-1' });
    expect(r).toBeNull();
    expect(db.rows.quotations[0].status).toBe('converted');
  });

  it.failing('C2 «Regenerar» sobre una cotización facturada cambia total/subtotal y deja quotation_items sin tocar: la factura y la cotización divergen', async () => {
    db.rows.opportunities[0].amount = 9999999;
    const r = await generateProposal(120, 'op-1', sb(), { userId: 'u-1', timezone: 'America/Bogota' });
    expect(r?.isNew).toBe(false);
    expect(db.rows.quotations[0].total).toBe(6800000);
  });

  it('C3 regenerar una propuesta en borrador sí refresca el total (camino feliz)', async () => {
    db.rows.quotations[0].status = 'draft';
    db.rows.quotations[0].converted_invoice_id = null;
    db.rows.opportunities[0].amount = 7000000;
    const r = await generateProposal(120, 'op-1', sb(), { userId: 'u-1', timezone: 'America/Bogota' });
    expect(r?.isNew).toBe(false);
    expect(db.rows.quotations[0].total).toBe(7000000);
  });
});

describe('T2-D Pasos del cierre «al ganar» (wonCloseSteps) — idempotencia e integración con F11', () => {
  const opp = (): OpportunityData => ({ id: 'op-1', name: 'Oportunidad uno', customer_id: 'c-1', amount: 6800000, currency: 'COP', salesperson_id: 'u-1', pipeline_id: 'p-1', stage_id: 's-1', billing_cycle_months: 1, metadata: null, created_by: 'u-1' });
  const deps = (): WonCloseDeps => ({
    supabase: createFakeSupabase(db) as unknown as WonCloseDeps['supabase'],
    orgId: 120,
    contextBranchId: 3,
    timezone: 'America/Bogota',
    now: () => new Date('2026-09-15T20:00:00.000Z'),
    getLatestProposal: async () => ({ id: 'q-1', branch_id: 3 }),
    convertToInvoice: async () => 'inv-1',
    accrueCommission: async () => null,
  });

  it.failing('D1 ejecutar «onboarding» dos veces (modal reabierto) crea DOS oportunidades hijas; F11 expone startOnboardingForWonOpportunity idempotente y nadie la llama', async () => {
    await executeOnboarding(opp(), deps());
    await executeOnboarding(opp(), deps());
    expect(db.rows.opportunities.filter((o) => o.parent_opportunity_id === 'op-1')).toHaveLength(1);
  });

  it('D1b el paso «onboarding» de F10 no crea instancia ni pasos de onboarding (onboarding_instances): la pestaña «Onboarding» de F11 queda vacía tras ganar', async () => {
    await executeOnboarding(opp(), deps());
    expect(db.rows.onboarding_instances ?? []).toHaveLength(0);
  });

  it.failing('D2 ejecutar «renovación» dos veces crea 12 tareas; y con ciclo de 1 mes los hitos 120/90/60 quedan con vencimiento en el PASADO (F11 renewalService ya sabe omitirlos)', async () => {
    await executeRenewal(opp(), deps());
    await executeRenewal(opp(), deps());
    const tasks = db.rows.tasks.filter((t) => t.type === 'renovacion');
    expect(tasks).toHaveLength(6);
    const now = Date.parse('2026-09-15T20:00:00.000Z');
    expect(tasks.filter((t) => Date.parse(String(t.due_date)) < now)).toHaveLength(0);
  });

  it('D3 el paso «referido» fija la tarea a +30 días con la fecha en la zona de la organización', async () => {
    const msg = await executeReferral(opp(), deps());
    expect(msg).toContain('15/10/2026');
    expect(db.rows.tasks.filter((t) => t.type === 'referido')).toHaveLength(1);
    expect(db.rows.tasks[0].organization_id).toBe(120);
  });

  it('D4 orgId inválido en deps → error antes de escribir', async () => {
    await expect(executeReferral(opp(), { ...deps(), orgId: 0 })).rejects.toThrow('Organización no válida');
    expect(db.writes).toEqual([]);
  });
});

describe('T2-E Contratos: firma manual', () => {
  const sb = () => createFakeSupabase(db) as unknown as Parameters<typeof updateContractStatus>[3];

  it('E1 canManualSign: roles 1/2/5 o superadmin sí; 3/4/6 no; roleId no numérico no', () => {
    expect(canManualSign({ roleId: 1, isSuperAdmin: false })).toBe(true);
    expect(canManualSign({ roleId: 2, isSuperAdmin: false })).toBe(true);
    expect(canManualSign({ roleId: 5, isSuperAdmin: false })).toBe(true);
    expect(canManualSign({ roleId: 4, isSuperAdmin: true })).toBe(true);
    expect(canManualSign({ roleId: 3, isSuperAdmin: false })).toBe(false);
    expect(canManualSign({ roleId: 4, isSuperAdmin: false })).toBe(false);
    expect(canManualSign({ roleId: 6, isSuperAdmin: false })).toBe(false);
    expect(canManualSign({ roleId: Number.NaN, isSuperAdmin: false })).toBe(false);
  });

  it.failing('E2 «signed» a mano no vincula quotations.signature_id como sí hace el webhook: dos caminos, dos resultados', async () => {
    const r = await updateContractStatus('ct-1', 120, 'signed', sb(), { userId: 'u-1' });
    expect(r?.status).toBe('signed');
    expect(db.rows.quotations[0].signature_id).toBe('ct-1');
  });

  it('E3 «signed» a mano deja actividad system con manual_signed_by en la oportunidad, filtrando por organización', async () => {
    await updateContractStatus('ct-1', 120, 'signed', sb(), { userId: 'u-1' });
    const act = db.rows.activities.find((a) => a.related_id === 'op-1');
    expect(act?.organization_id).toBe(120);
    expect((act?.metadata as Record<string, unknown>).manual_signed_by).toBe('u-1');
    const upd = db.writes.find((w) => w.table === 'contract_signatures' && w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'ct-1', organization_id: 120, status: 'sent' });
  });
});
