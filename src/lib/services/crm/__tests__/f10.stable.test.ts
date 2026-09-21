/// <reference types="jest" />
/**
 * F10 — casos de servicio que ningún estable afirmaba: doble comisión (trigger
 * `fn_create_commission_on_opportunity_won` + `accrueCommission`), la comisión
 * cancelada que bloquea el devengo desde `registerCrmPayment`, importes y
 * monedas raros del pago manual y el hueco documentado del índice parcial
 * (`stripe:%`). Consolidado el 2026-09-21 desde los testers r1 (`f10Round1Tester`
 * B4, E1-E3), r2 (`f10Round2Tester` A5, `f10Round2TesterB` A2) y r4
 * (`f10Round4TesterB` B). Lo que ya afirma `f10RegisterPaymentRpc` no se repite.
 * Fixtures sin datos reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => createFakeSupabase(db).from(t) } }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120, obtenerOrganizacionActiva: () => ({ id: 120 }) }));

import { registerCrmPayment, isStripeReferenceDuplicate } from '@/lib/services/crm/paymentService';
import { commissionService } from '@/lib/services/crm/commissionService';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 6800000, balance: 5000000, status: 'partial', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: 'op-9', salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      // Pago previo de 1.800.000: el fake recalcula el saldo como el trigger real (total − Σ pagos completed).
      payments: [{ id: 'pay-seed', organization_id: 120, source: 'invoice_sales', source_id: 'inv-1', status: 'completed', amount: 1800000, currency: 'COP', reference: 'anticipo-seed', method: 'cash' }],
      accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-1', balance: 5000000, status: 'partial' }],
      commissions: [],
      opportunities: [{ id: 'op-1', organization_id: 120, salesperson_id: 'u-1', commission_rate: 10, amount: 1000, currency: 'COP' }],
      vendor_commission_rates: [],
      activities: [],
    },
  };
}

const client = () => createFakeSupabase(db) as never;
const manual = (amount: number, reference: string, over: Record<string, unknown> = {}) => ({ invoice_id: 'inv-1', amount, currency: 'COP', method: 'cash', reference, ...over });
const commissionWrites = () => db.writes.filter((w) => w.table === 'commissions');

beforeEach(() => { db = seed(); });

describe('doble comisión: trigger de BD + accrueCommission (tester r1 T-E)', () => {
  it('E1 con una comisión ya devengada por el trigger para la misma oportunidad, accrueCommission NO inserta una segunda: devuelve la existente con already_accrued', async () => {
    // El trigger de BD inserta commissions(source_type='opportunity', source_id=opp.id) al pasar a 'won'
    // cuando opportunities.commission_rate > 0. useStageFlow cambia la etapa ANTES de abrir WonCloseModal.
    db.rows.commissions = [
      { id: 'cm-trigger', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', base_amount: 1000, commission_rate: 10, commission_amount: 100 },
      { id: 'cm-ajena', organization_id: 121, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', base_amount: 1, commission_rate: 1, commission_amount: 1 },
    ];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ id: 'cm-trigger', commission_rate: 10, commission_amount: 100, already_accrued: true });
    expect(db.rows.commissions.filter((c) => c.organization_id === 120 && c.source_type === 'opportunity' && c.source_id === 'op-1')).toHaveLength(1);
    expect(db.writes).toEqual([]);
  });

  it('E2 sin comisión previa sí devenga una nueva; una comisión de otra fuente (invoice) o de otra organización (121, mismo source_id) no bloquea', async () => {
    db.rows.commissions = [
      { id: 'cm-inv', organization_id: 120, source_type: 'invoice', source_id: 'op-1', status: 'accrued', commission_amount: 7 },
      { id: 'cm-ajena', organization_id: 121, source_type: 'opportunity', source_id: 'op-1', status: 'accrued', commission_amount: 9 },
    ];
    const r = await commissionService.accrueCommission('op-1', 'u-1', 1000);
    expect(r).toMatchObject({ commission_rate: 10, commission_amount: 100, status: 'accrued' });
    expect(r?.already_accrued).toBeFalsy();
    const inserted = commissionWrites().filter((w) => w.op === 'insert');
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

  it('B4 (r3) pago completo con vendedor y tasa por registerCrmPayment: devenga comisión salvo que exista una para la oportunidad en CUALQUIER estado (alineado con el trigger)', async () => {
    Object.assign(db.rows.invoice_sales[0], { salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson' });
    db.rows.commissions = [{ id: 'cm-cancel', organization_id: 120, source_type: 'opportunity', source_id: 'op-1', status: 'cancelled', commission_amount: 1 }];
    const blocked = await registerCrmPayment(120, manual(5000000, 'stripe:b4a', { method: 'stripe' }), client());
    expect(blocked).toMatchObject({ success: true, invoice_status: 'paid', commission_created: false });
    expect(commissionWrites()).toHaveLength(0);
    db = seed();
    Object.assign(db.rows.invoice_sales[0], { salesperson_id: 'u-1', commission_rate: 10, commission_type: 'salesperson' });
    const created = await registerCrmPayment(120, manual(5000000, 'stripe:b4b', { method: 'stripe' }), client());
    expect(created).toMatchObject({ success: true, invoice_status: 'paid', commission_created: true });
    expect(commissionWrites().find((w) => w.op === 'insert')?.row).toMatchObject({ organization_id: 120, source_type: 'opportunity', source_id: 'op-1', payee_id: 'u-1', commission_amount: 680000, status: 'accrued' });
  });
});

describe('pago manual: importes y monedas raros (testers r2 y r4)', () => {
  it('R4B-B1 amount "100" (texto numérico) o -0 → INVALID_AMOUNT / 400 sin leer ni escribir', async () => {
    for (const amount of ['100' as unknown as number, -0]) {
      const r = await registerCrmPayment(120, manual(amount, `bad-${String(amount)}`), client());
      expect(r).toMatchObject({ success: false, code: 'INVALID_AMOUNT', http_status: 400 });
    }
    expect(db.writes).toEqual([]);
  });

  it('R4B-B2 1e308 es finito y > 0: pasa la validación y lo frena el saldo (no es 400 de formato)', async () => {
    const r = await registerCrmPayment(120, manual(1e308, 'enorme'), client());
    expect(r.success).toBe(false);
    expect(r.code).toBeUndefined();
    expect(r.message).toMatch(/excede/);
    expect(db.writes).toEqual([]);
  });

  it('R4B-B3 moneda "co" (2 letras) → CURRENCY_MISMATCH / 400', async () => {
    const bad = await registerCrmPayment(120, manual(1, 'co', { currency: 'co' }), client());
    expect(bad).toMatchObject({ success: false, code: 'CURRENCY_MISMATCH', http_status: 400 });
    expect(db.writes).toEqual([]);
  });

  it('T2-A5 el índice parcial NO cubre referencias que no empiezan por stripe: (dos manuales iguales concurrentes → 2 filas; documentado, no es F10)', async () => {
    await Promise.all([registerCrmPayment(120, manual(1000, 'recibo-77'), client()), registerCrmPayment(120, manual(1000, 'recibo-77'), client())]);
    expect(db.rows.payments.filter((p) => p.reference === 'recibo-77')).toHaveLength(2);
  });

  it('R2B-A2 isStripeReferenceDuplicate: un 23505 con referencia manual o un código distinto de 23505 nunca es idempotencia', () => {
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint "uq_payments_org_stripe_reference"' }, 'manual:abc')).toBe(false);
    expect(isStripeReferenceDuplicate({ code: '23503' }, 'stripe:evt')).toBe(false);
    expect(isStripeReferenceDuplicate(null, 'stripe:evt')).toBe(false);
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'uq_payments_org_stripe_reference' }, 'stripe:evt')).toBe(true);
  });
});
