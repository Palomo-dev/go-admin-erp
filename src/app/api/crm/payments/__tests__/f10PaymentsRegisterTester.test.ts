/// <reference types="jest" />
/**
 * F10 — TESTER r2: `POST /api/crm/payments/register`. Ruta previa a F10 pero
 * dentro de `src/app/api/crm/payments/**` y única entrada manual a
 * `registerCrmPayment` (el mismo servicio que el webhook de Stripe). No pasa
 * por `f10RouteHelpers`: no aplica la regla 5 (403 con `organization_id`
 * ajeno) ni valida importe/moneda. Los rojos van como `it.failing`.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

class FakeOrgContextError extends Error { statusCode = 401; code = 'UNAUTHORIZED'; }
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
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 4, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../register/route';

const req = (body: unknown) => new NextRequest('http://localhost/api/crm/payments/register', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => { db = seed(); });

describe('POST /api/crm/payments/register', () => {
  it('camino feliz: 201, pago completed en la organización de la sesión, factura paid', async () => {
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

  it.failing('regla 5: organization_id ajeno en el body → 403 como en el resto de rutas de la fase; hoy se ignora en silencio y se escribe', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 10, currency: 'COP', reference: 'r', organization_id: 121 }));
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });

  it('importe negativo → 400 (r4: lo rechaza registerCrmPayment con code INVALID_AMOUNT)', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: -400, currency: 'COP', reference: 'neg' }));
    expect(res.status).toBe(400);
    expect(db.rows.payments).toHaveLength(0);
    expect(Number(db.rows.invoice_sales[0].balance)).toBe(1000);
  });

  it('importe no numérico ("abc") → 400 (r4: el servicio no acepta lo que no sea número finito > 0)', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 'abc', currency: 'COP', reference: 'nan' }));
    expect(res.status).toBe(400);
    expect(db.rows.payments).toHaveLength(0);
  });

  it('moneda distinta a la de la factura → 400 (r4: CURRENCY_MISMATCH en el servicio)', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 100, currency: 'USD', reference: 'usd' }));
    expect(res.status).toBe(400);
    expect(Number(db.rows.invoice_sales[0].balance)).toBe(1000);
  });

  it('referencia stripe:<id> fabricada desde la sesión se acepta y luego el webhook real la trata como ya registrada (idempotencia por reference sin distinguir origen)', async () => {
    const res = await POST(req({ invoice_id: 'inv-1', amount: 1, currency: 'COP', reference: 'stripe:evt_fabricado' }));
    expect(res.status).toBe(201);
    expect(db.rows.payments[0].reference).toBe('stripe:evt_fabricado');
  });
});
