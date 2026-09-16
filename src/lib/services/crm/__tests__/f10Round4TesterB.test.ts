/// <reference types="jest" />
/**
 * F10 — TESTER ronda 4 (segunda instancia). Rutas en HEAD ejecutadas contra el
 * fake: `POST /api/crm/proposals` y `POST /api/crm/proposals/[id]/sent` deben
 * responder 409 `PROPOSAL_CONVERTED` sin escrituras; `registerCrmPayment`
 * con `"100"`, `-0`, `1e308`, moneda `co`; `converted` solo por status o solo
 * por `converted_invoice_id`; `failResponse` con `statusCode` 5xx → 500.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

import { NextRequest } from 'next/server';
import { POST as proposalsPost } from '@/app/api/crm/proposals/route';
import { POST as sentPost } from '@/app/api/crm/proposals/[id]/sent/route';
import { registerCrmPayment } from '@/lib/services/crm/paymentService';
import { failResponse } from '@/lib/services/crm/f10RouteHelpers';
import { isConvertedProposal, markProposalSent, generateProposal, ProposalConvertedError } from '@/lib/services/crm/proposalServerService';
import { updateContractStatus } from '@/lib/services/crm/contractService';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      opportunities: [{ id: 'op-1', organization_id: 120, name: 'Op', customer_id: 'c-1', amount: 100, currency: 'COP', salesperson_id: 'u-1', vertical_id: null, discovery_data: {}, billing_cycle_months: null }],
      customers: [{ id: 'c-1', organization_id: 120, full_name: 'Cliente', email: 'c@example.com', company_name: null }],
      opportunity_objections: [], opportunity_products: [], opportunity_custom_lines: [], quotation_items: [], activities: [],
      quotations: [
        { id: 'q-conv', organization_id: 120, number: 'COT-0001', opportunity_id: 'op-1', customer_id: 'c-1', status: 'converted', converted_invoice_id: 'inv-1', total: 100, currency: 'COP', sections_json: null, created_at: '2026-09-01T10:00:00.000Z' },
      ],
      invoice_sales: [{ id: 'inv-1', organization_id: 120, number: 'F-1', total: 100, balance: 100, status: 'issued', currency: 'COP', customer_id: 'c-1', opportunity_id: 'op-1', salesperson_id: null, commission_rate: null, commission_type: null }],
      payments: [], accounts_receivable: [], commissions: [],
      contract_signatures: [{ id: 'ct-1', organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-conv', provider: 'documenso', provider_document_id: 'doc-1', status: 'sent', signers: [] }],
    },
  };
}
const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const client = () => createFakeSupabase(db) as never;

beforeEach(() => { db = seed(); });

describe('R4B-A rutas en HEAD contra el fake', () => {
  it('POST /api/crm/proposals sobre una cotización facturada → 409 PROPOSAL_CONVERTED sin escrituras', async () => {
    const res = await proposalsPost(req('/api/crm/proposals', { opportunity_id: 'op-1' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, code: 'PROPOSAL_CONVERTED' });
    expect(db.writes).toEqual([]);
  });

  it('POST /api/crm/proposals/[id]/sent sobre una cotización facturada → 409 y sigue converted', async () => {
    const res = await sentPost(req('/api/crm/proposals/q-conv/sent', {}), { params: Promise.resolve({ id: 'q-conv' }) });
    expect(res.status).toBe(409);
    expect(db.rows.quotations[0].status).toBe('converted');
    expect(db.writes).toEqual([]);
  });

  it('failResponse: statusCode 5xx o fuera de rango NO se filtra (500); 4xx sí', async () => {
    const e5 = Object.assign(new Error('boom'), { statusCode: 503, code: 'X' });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(failResponse('t', e5).status).toBe(500);
      expect(failResponse('t', Object.assign(new Error('x'), { statusCode: 399 })).status).toBe(500);
      expect(failResponse('t', Object.assign(new Error('x'), { statusCode: '409' })).status).toBe(500);
      expect(failResponse('t', new ProposalConvertedError('COT-9')).status).toBe(409);
    } finally { spy.mockRestore(); }
  });
});

describe('R4B-B registerCrmPayment: importes y monedas raros', () => {
  const base = { invoice_id: 'inv-1', currency: 'COP', reference: 'manual:x' };
  it.each([
    ['"100" (string numérico)', '100' as unknown as number],
    ['-0', -0],
    ['0', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null as unknown as number],
  ])('amount %s → INVALID_AMOUNT / 400 sin leer ni escribir', async (_l, amount) => {
    const r = await registerCrmPayment(120, { ...base, amount }, client());
    expect(r).toMatchObject({ success: false, code: 'INVALID_AMOUNT', http_status: 400 });
    expect(db.writes).toEqual([]);
  });

  it('1e308 es finito y > 0: pasa la validación y lo frena el saldo (no es 400 de formato)', async () => {
    const r = await registerCrmPayment(120, { ...base, amount: 1e308 }, client());
    expect(r.success).toBe(false);
    expect(r.code).toBeUndefined();
    expect(r.message).toMatch(/excede/);
    expect(db.writes).toEqual([]);
  });

  it('moneda "co" (2 letras), "cop " con espacios, "cop" minúsculas', async () => {
    const bad = await registerCrmPayment(120, { ...base, amount: 1, currency: 'co' }, client());
    expect(bad).toMatchObject({ success: false, code: 'CURRENCY_MISMATCH', http_status: 400 });
    const ok = await registerCrmPayment(120, { ...base, amount: 1, currency: ' cop ' }, client());
    expect(ok.success).toBe(true);
    expect(db.rows.payments[0]).toMatchObject({ currency: 'COP', amount: 1 });
  });
});

describe('R4B-C converted y firma manual', () => {
  it('isConvertedProposal: por status, por converted_invoice_id, o ninguno', () => {
    expect(isConvertedProposal({ status: 'converted', converted_invoice_id: null })).toBe(true);
    expect(isConvertedProposal({ status: 'sent', converted_invoice_id: 'inv-1' })).toBe(true);
    expect(isConvertedProposal({ status: 'sent', converted_invoice_id: null })).toBe(false);
  });

  it('status=converted con converted_invoice_id null → markProposalSent y generateProposal lanzan 409 sin escribir', async () => {
    db.rows.quotations[0].converted_invoice_id = null;
    await expect(markProposalSent(120, 'q-conv', client(), { userId: 'u-1' })).rejects.toBeInstanceOf(ProposalConvertedError);
    await expect(generateProposal(120, 'op-1', client(), { userId: 'u-1', timezone: 'America/Bogota' })).rejects.toBeInstanceOf(ProposalConvertedError);
    expect(db.writes).toEqual([]);
  });

  it('signed a mano → quotations.signature_id enlazado filtrando por organización; viewed no enlaza', async () => {
    await updateContractStatus('ct-1', 120, 'viewed', client(), { userId: 'u-1' });
    expect(db.writes.filter((w) => w.table === 'quotations')).toHaveLength(0);
    await updateContractStatus('ct-1', 120, 'signed', client(), { userId: 'u-1' });
    const link = db.writes.find((w) => w.table === 'quotations');
    expect(link).toMatchObject({ op: 'update', filters: { id: 'q-conv', organization_id: 120 }, row: { signature_id: 'ct-1' } });
  });
});
