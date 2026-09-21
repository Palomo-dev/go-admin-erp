/// <reference types="jest" />
/**
 * F10 — contrato de `POST /api/crm/payments/register`: ruta previa a F10 pero
 * dentro de `src/app/api/crm/payments/**` y única entrada manual a
 * `registerCrmPayment` (el mismo servicio que el webhook de Stripe). Usa
 * `readOrgBody` (regla 5: 403 con `organization_id` ajeno) y devuelve 400 con
 * lo que el servicio rechaza (importe, moneda, factura ajena). Consolidado el
 * 2026-09-21 desde el tester r2 (`f10PaymentsRegisterTester`); ningún estable
 * ejercía esta ruta. Fixtures sin datos reales (org 120 / señuelo 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      invoice_sales: [
        { id: 'inv-1', organization_id: 120, number: 'FACT-0001', total: 1000, balance: 1000, status: 'issued', currency: 'COP', customer_id: 'c-1', opportunity_id: null, salesperson_id: null, commission_rate: null, commission_type: null },
        { id: 'inv-9', organization_id: 121, number: 'FACT-0009', total: 5, balance: 5, status: 'issued', currency: 'COP', customer_id: 'c-9', opportunity_id: null, salesperson_id: null, commission_rate: null, commission_type: null },
      ],
      payments: [],
      accounts_receivable: [],
      commissions: [],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError, // la clase real: `readOrgBody` la lanza y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 4, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../register/route';

const req = (body: unknown) => new NextRequest('http://localhost/api/crm/payments/register', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const balance = () => Number(db.rows.invoice_sales[0].balance);

beforeEach(() => { db = seed(); });

describe('POST /api/crm/payments/register (tester r2)', () => {
  it('camino feliz: 201, pago completed en la organización de la sesión con created_by, factura paid', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 1000, currency: 'COP', reference: 'recibo-1' }));
    expect(res.status).toBe(201);
    expect(db.rows.payments).toHaveLength(1);
    expect(db.rows.payments[0]).toMatchObject({ organization_id: 120, status: 'completed', created_by: 'u-1' });
    expect(db.rows.invoice_sales[0].status).toBe('paid');
  });

  it('factura de otra organización → 400 «Factura no encontrada» sin escrituras (la organización sale de la sesión)', async () => {
    const res = await POST(req({ invoice_id: 'inv-9', amount: 5, currency: 'COP', reference: 'r' }));
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it('regla 5: organization_id ajeno en el body → 403 como en el resto de rutas de la fase', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 10, currency: 'COP', reference: 'r', organization_id: 121 }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });

  it('importe negativo o no numérico ("abc") → 400 (INVALID_AMOUNT del servicio), sin pago y saldo intacto', async () => {
    expect((await POST(req({ invoice_id: 'inv-1', amount: -400, currency: 'COP', reference: 'neg' }))).status).toBe(400);
    expect((await POST(req({ invoice_id: 'inv-1', amount: 'abc', currency: 'COP', reference: 'nan' }))).status).toBe(400);
    expect(db.rows.payments).toHaveLength(0);
    expect(balance()).toBe(1000);
  });

  it('moneda distinta a la de la factura → 400 (CURRENCY_MISMATCH del servicio) y saldo intacto', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 100, currency: 'USD', reference: 'usd' }));
    expect(res.status).toBe(400);
    expect(balance()).toBe(1000);
  });

  it('referencia stripe:<id> fabricada desde la sesión se acepta y luego el webhook real la trata como ya registrada (idempotencia por reference sin distinguir origen)', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 1, currency: 'COP', reference: 'stripe:evt_fabricado' }));
    expect(res.status).toBe(201);
    expect(db.rows.payments[0].reference).toBe('stripe:evt_fabricado');
  });
});
