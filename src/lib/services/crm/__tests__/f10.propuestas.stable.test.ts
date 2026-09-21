/// <reference types="jest" />
/**
 * F10 — ciclo de vida de la propuesta que los estables no afirmaban: una
 * cotización facturada (`converted` por status o por `converted_invoice_id`)
 * no se marca «enviada» ni se regenera (409 `PROPOSAL_CONVERTED` en las rutas,
 * `ProposalConvertedError` en el servicio), «Regenerar» en borrador sí refresca
 * el total, y el PATCH no puede «desmarcar» `edited`. Consolidado el 2026-09-21
 * desde los testers r2 (`f10Round2Tester` C2b/C3, `f10Round2TesterB` C1) y r4
 * (`f10Round4TesterB` A1/A2, C1/C2). Fixtures sin datos reales (org 120).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError, // la clase real: `readOrgBody` la lanza y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

import { NextRequest } from 'next/server';
import { POST as proposalsPost } from '@/app/api/crm/proposals/route';
import { POST as sentPost } from '@/app/api/crm/proposals/[id]/sent/route';
import { isConvertedProposal, markProposalSent, generateProposal, updateProposalSections, ProposalConvertedError } from '@/lib/services/crm/proposalServerService';
import { buildProposalSections } from '@/lib/services/crm/proposalNarrative';

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
    },
  };
}
const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const client = () => createFakeSupabase(db) as never;
const quotation = () => db.rows.quotations[0];
const opts = { userId: 'u-1', timezone: 'America/Bogota' };

beforeEach(() => { db = seed(); });

describe('cotización facturada: ni «enviada» ni «regenerar» (testers r2/r4)', () => {
  it('R4B-A1 POST /api/crm/proposals sobre una cotización facturada → 409 PROPOSAL_CONVERTED sin escrituras; total y secciones intactos', async () => {
    db.rows.opportunities[0].amount = 9999999;
    const res = await proposalsPost(req('/api/crm/proposals', { opportunity_id: 'op-1' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, code: 'PROPOSAL_CONVERTED' });
    expect(db.writes).toEqual([]);
    expect(quotation().total).toBe(100);
  });

  it('R4B-A2 POST /api/crm/proposals/[id]/sent sobre una cotización facturada → 409 y sigue converted', async () => {
    const res = await sentPost(req('/api/crm/proposals/q-conv/sent', {}), { params: Promise.resolve({ id: 'q-conv' }) });
    expect(res.status).toBe(409);
    expect(quotation().status).toBe('converted');
    expect(db.writes).toEqual([]);
  });

  it('R4B-C1 isConvertedProposal: por status, por converted_invoice_id, o ninguno', () => {
    expect(isConvertedProposal({ status: 'converted', converted_invoice_id: null })).toBe(true);
    expect(isConvertedProposal({ status: 'sent', converted_invoice_id: 'inv-1' })).toBe(true);
    expect(isConvertedProposal({ status: 'sent', converted_invoice_id: null })).toBe(false);
  });

  it('R4B-C2 + T2-C1/C2b status=converted con converted_invoice_id null → markProposalSent y generateProposal lanzan ProposalConvertedError (409) sin escribir; factura enlazada con status sent tampoco se regenera', async () => {
    quotation().converted_invoice_id = null;
    await expect(markProposalSent(120, 'q-conv', client(), { userId: 'u-1' })).rejects.toBeInstanceOf(ProposalConvertedError);
    await expect(markProposalSent(120, 'q-conv', client(), { userId: 'u-1' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(generateProposal(120, 'op-1', client(), opts)).rejects.toBeInstanceOf(ProposalConvertedError);
    expect(db.writes).toEqual([]);
    expect(quotation().status).toBe('converted');
    db = seed();
    quotation().status = 'sent';
    await expect(generateProposal(120, 'op-1', client(), opts)).rejects.toBeInstanceOf(ProposalConvertedError);
    expect(db.writes).toEqual([]);
  });

  it('T2-C3 regenerar una propuesta en borrador sí refresca el total (camino feliz)', async () => {
    quotation().status = 'draft';
    quotation().converted_invoice_id = null;
    db.rows.opportunities[0].amount = 7000000;
    const r = await generateProposal(120, 'op-1', client(), opts);
    expect(r?.isNew).toBe(false);
    expect(quotation().total).toBe(7000000);
  });
});

describe('edición de secciones (tester r2 B)', () => {
  it('R2B-C1 PATCH con edited:false en el body → el servidor guarda edited:true (no se puede «desmarcar» desde el cliente); las demás siguen sin editar', async () => {
    const base = buildProposalSections({ opportunityName: 'X', customerName: 'C', opportunityAmount: 100, discoveryFields: [], discovery: {}, objections: [], roi: null, pricing: { currency: 'COP', lines: [], total: 100, billingCycleMonths: null } });
    quotation().sections_json = base;
    // fila sin number, status ni customer_id (cotización antigua): toRecord no revienta y aplica los valores por defecto
    delete quotation().number;
    delete quotation().status;
    delete quotation().customer_id;
    const updated = await updateProposalSections(120, 'q-conv', { situacion: { ...base.situacion, content: 'EDITADO', edited: false } }, client());
    expect(updated?.sections?.situacion).toMatchObject({ content: 'EDITADO', edited: true });
    expect(updated?.sections?.problemas.edited).toBe(false);
    expect(updated).toMatchObject({ number: '', status: 'draft', customer_id: null });
  });
});
