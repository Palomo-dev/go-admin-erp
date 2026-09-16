/// <reference types="jest" />
/**
 * F10 — contrato de `/api/crm/proposals` (generar / leer / editar / marcar enviada).
 * `@/lib/utils/orgContext` doblado; Supabase = f10FakeSupabase con señuelos org 121.
 */
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';

class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') { super(message); this.statusCode = statusCode; this.code = code; }
}

let db: FakeDb;

function seed(): FakeDb {
  const opp = (id: string, org: number, extra: Row = {}): Row => ({
    id, organization_id: org, name: `Oportunidad ${id}`, customer_id: `cust-${org}`, amount: 950000, currency: 'COP', salesperson_id: 'seller-1',
    vertical_id: `vert-${org}`, discovery_data: { who_is: `Gerente ${id}`, problem: `Problema de ${id}` }, billing_cycle_months: 12, status: 'open', next_contact_at: null, ...extra,
  });
  return {
    writes: [],
    rows: {
      opportunities: [opp('op-1', 120), opp('op-2', 120, { discovery_data: { problem: 'SECRETO-OP2' } }), opp('op-9', 121)],
      customers: [
        { id: 'cust-120', organization_id: 120, full_name: 'Cliente Uno', email: 'uno@x.co', company_name: null },
        { id: 'cust-121', organization_id: 121, full_name: 'Cliente Ajeno', email: 'ajeno@x.co', company_name: null },
      ],
      verticals: [{ id: 'vert-120', organization_id: 120, slug: 'restaurantes' }, { id: 'vert-121', organization_id: 121, slug: 'retail' }],
      discovery_templates: [
        { id: 'dt-1', organization_id: 120, vertical_id: 'vert-120', is_active: true, sections: [{ id: 'who_is', type: 'text', label: 'Quién es' }, { id: 'problem', type: 'textarea', label: 'Problema principal' }] },
        { id: 'dt-9', organization_id: 121, vertical_id: 'vert-121', is_active: true, sections: [{ id: 'problem', type: 'textarea', label: 'AJENO' }] },
      ],
      objections: [{ id: 'obj-1', organization_id: 120, title: 'Precio alto', recommended_response: 'Comparar con mermas' }],
      opportunity_objections: [
        { id: 'oo-1', organization_id: 120, opportunity_id: 'op-1', objection_id: 'obj-1', resolved: true },
        { id: 'oo-9', organization_id: 121, opportunity_id: 'op-1', objection_id: 'obj-1', resolved: false },
      ],
      products: [{ id: 7, organization_id: 120, name: 'Plan Pro', sku: 'PRO' }],
      opportunity_products: [{ id: 'opp-p1', opportunity_id: 'op-1', product_id: 7, quantity: 12, unit_price: 500000, total_price: 6000000 }],
      opportunity_custom_lines: [{ id: 'cl-1', opportunity_id: 'op-1', concept: 'Implementación', quantity: 1, unit_price: 800000, total_price: 800000 }],
      quotations: [
        { id: 'q-9', organization_id: 121, opportunity_id: 'op-9', number: 'COT-0009', status: 'draft', sections_json: null, customer_id: 'cust-121', total: 1 },
        { id: 'q-8', organization_id: 121, opportunity_id: null, number: 'COT-0008', status: 'draft', sections_json: null, customer_id: 'cust-121', total: 1 },
      ],
      quotation_items: [],
      activities: [],
      organizations: [{ id: 120, name: 'Org 120', timezone: 'America/Bogota' }, { id: 121, name: 'Org 121', timezone: 'UTC' }],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: FakeOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-admin', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));

import { NextRequest } from 'next/server';
import { GET as listGet, POST as createPost } from '../route';
import { GET as oneGet, PATCH as onePatch } from '../[id]/route';
import { POST as sentPost } from '../[id]/sent/route';

const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const writesTo = (table: string) => db.writes.filter((w) => w.table === table);

beforeEach(() => { db = seed(); });

describe('GET /api/crm/proposals?opportunity_id', () => {
  it('sin opportunity_id → 400', async () => {
    const res = await listGet(req('GET', '/api/crm/proposals'));
    expect(res.status).toBe(400);
  });

  it('oportunidad de otra organización → 404 (nunca se lee su discovery)', async () => {
    const res = await listGet(req('GET', '/api/crm/proposals?opportunity_id=op-9'));
    expect(res.status).toBe(404);
  });

  it('devuelve contexto (cliente, discovery con etiquetas, objeciones, pricing) y proposal null si no hay', async () => {
    const res = await listGet(req('GET', '/api/crm/proposals?opportunity_id=op-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.proposal).toBeNull();
    expect(json.data.context.customerName).toBe('Cliente Uno');
    expect(json.data.context.verticalSlug).toBe('restaurantes');
    expect(json.data.context.discoveryFields.map((f: { id: string }) => f.id)).toEqual(['who_is', 'problem']);
    expect(json.data.context.objections).toEqual([{ title: 'Precio alto', recommended_response: 'Comparar con mermas', resolved: true }]);
    expect(json.data.context.pricing.total).toBe(6800000);
    expect(json.data.context.pricing.lines).toHaveLength(2);
    expect(JSON.stringify(json)).not.toContain('SECRETO-OP2');
    expect(JSON.stringify(json)).not.toContain('AJENO');
  });
});

describe('POST /api/crm/proposals', () => {
  it('crea la cotización enlazada con las 5 secciones, total de productos y actividad; la segunda vez reutiliza', async () => {
    const res = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.isNew).toBe(true);
    const ins = writesTo('quotations').find((w) => w.op === 'insert');
    expect(ins?.row).toMatchObject({ organization_id: 120, opportunity_id: 'op-1', customer_id: 'cust-120', salesperson_id: 'seller-1', total: 6800000, currency: 'COP', status: 'draft' });
    expect(Object.keys((ins?.row as Row).sections_json as Row)).toEqual(['situacion', 'problemas', 'solucion', 'roi', 'pricing']);
    expect(((ins?.row as Row).sections_json as Row & { situacion: { content: string } }).situacion.content).toContain('Gerente op-1');
    expect(String((ins?.row as Row).number)).toMatch(/^COT-\d{4}$/);
    expect((ins?.row as Row).issue_date).toBeUndefined(); // lo pone el trigger en la tz de la organización
    const items = writesTo('quotation_items').find((w) => w.op === 'insert');
    expect(((items?.row as Row).__rows as Row[]).length).toBe(2);
    const act = writesTo('activities').find((w) => w.op === 'insert');
    expect(act?.row).toMatchObject({ organization_id: 120, related_type: 'opportunity', related_id: 'op-1', activity_type: 'system' });

    const res2 = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    expect(res2.status).toBe(200);
    expect((await res2.json()).data.isNew).toBe(false);
    expect(writesTo('quotations').filter((w) => w.op === 'insert')).toHaveLength(1);
  });

  it('oportunidad ajena → 404 sin escrituras; organización en el body distinta → 403', async () => {
    const res = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-9' }));
    expect(res.status).toBe(404);
    expect(db.writes).toHaveLength(0);
    const res2 = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1', organization_id: 121 }));
    expect(res2.status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });

  it('sin opportunity_id → 400', async () => {
    expect((await createPost(req('POST', '/api/crm/proposals', {}))).status).toBe(400);
  });

  // r2 (M33 del tester): sin cliente es un error del usuario, no del servidor
  it('oportunidad sin cliente → 400 claro con code CUSTOMER_REQUIRED, sin escrituras', async () => {
    db.rows.opportunities.push({ ...db.rows.opportunities[0], id: 'op-nc', customer_id: null });
    const res = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-nc' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, code: 'CUSTOMER_REQUIRED', error: expect.stringMatching(/no tiene cliente/) });
    expect(db.writes).toHaveLength(0);
  });

  // r2: «Regenerar» regenera de verdad lo no editado; lo editado a mano (PATCH → edited:true) se conserva salvo force
  it('regenerar conserva solo las secciones editadas por PATCH y las refresca con force:true', async () => {
    await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    const id = db.rows.quotations.find((q) => q.opportunity_id === 'op-1')!.id as string;
    await onePatch(req('PATCH', `/api/crm/proposals/${id}`, { sections: { situacion: { title: 'Situación', content: 'Editado a mano' } } }), params(id));
    const saved = db.rows.quotations.find((q) => q.id === id)!.sections_json as Row & { situacion: Row; problemas: Row };
    expect(saved.situacion).toMatchObject({ content: 'Editado a mano', edited: true });
    expect(saved.problemas.edited).toBe(false);
    // cambia el discovery: la sección no editada debe reflejarlo, la editada no
    db.rows.opportunities[0].discovery_data = { who_is: 'Gerente op-1', problem: 'NUEVO PROBLEMA' };
    const regen = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    expect(regen.status).toBe(200);
    const after = (await regen.json()).data.sections as { situacion: Row; problemas: Row };
    expect(after.situacion).toMatchObject({ content: 'Editado a mano', edited: true });
    expect(String(after.problemas.content)).toContain('NUEVO PROBLEMA');
    const forced = await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1', force: true }));
    const forcedSections = (await forced.json()).data.sections as { situacion: Row };
    expect(forcedSections.situacion.content).not.toBe('Editado a mano');
    expect(forcedSections.situacion.edited).toBe(false);
  });
});

describe('GET/PATCH /api/crm/proposals/[id]', () => {
  it('cotización de otra organización → 404 en GET y PATCH, sin escrituras', async () => {
    expect((await oneGet(req('GET', '/api/crm/proposals/q-9'), params('q-9'))).status).toBe(404);
    const res = await onePatch(req('PATCH', '/api/crm/proposals/q-9', { sections: { situacion: { title: 'a', content: 'b' } } }), params('q-9'));
    expect(res.status).toBe(404);
    expect(writesTo('quotations')).toHaveLength(0);
  });

  it('PATCH válido escribe sections_json filtrando por organización; inválido → 400', async () => {
    await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    const id = db.rows.quotations.find((q) => q.opportunity_id === 'op-1')!.id as string;
    const res = await onePatch(req('PATCH', `/api/crm/proposals/${id}`, { sections: { situacion: { title: 'Situación', content: 'Editado a mano' } } }), params(id));
    expect(res.status).toBe(200);
    const upd = writesTo('quotations').find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ id, organization_id: 120 });
    expect(((upd?.row as Row).sections_json as Row & { situacion: { content: string }; pricing: { total: number } }).situacion.content).toBe('Editado a mano');
    expect(((upd?.row as Row).sections_json as Row & { pricing: { total: number } }).pricing.total).toBe(6800000); // el resto se conserva
    const bad = await onePatch(req('PATCH', `/api/crm/proposals/${id}`, { sections: { situacion: { title: '', content: 1 } } }), params(id));
    expect(bad.status).toBe(400);
  });
});

describe('POST /api/crm/proposals/[id]/sent', () => {
  it('marca sent, crea la actividad «propuesta enviada» y programa next_contact_at a +24 h', async () => {
    await createPost(req('POST', '/api/crm/proposals', { opportunity_id: 'op-1' }));
    const id = db.rows.quotations.find((q) => q.opportunity_id === 'op-1')!.id as string;
    db.writes = [];
    const before = Date.now();
    const res = await sentPost(req('POST', `/api/crm/proposals/${id}/sent`, {}), params(id));
    expect(res.status).toBe(200);
    const q = writesTo('quotations').find((w) => w.op === 'update');
    expect(q?.row).toMatchObject({ status: 'sent' });
    expect(q?.filters).toMatchObject({ id, organization_id: 120 });
    const act = writesTo('activities').find((w) => w.op === 'insert');
    expect(act?.row).toMatchObject({ organization_id: 120, related_id: 'op-1', activity_type: 'system' });
    expect(String((act?.row as Row).notes)).toMatch(/propuesta enviada/i);
    const opp = writesTo('opportunities').find((w) => w.op === 'update');
    expect(opp?.filters).toMatchObject({ id: 'op-1', organization_id: 120 });
    const next = Date.parse(String((opp?.row as Row).next_contact_at));
    expect(next - before).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 5000);
    expect(next - before).toBeLessThanOrEqual(24 * 3600 * 1000 + 5000);
  });

  it('cotización ajena → 404 sin escrituras', async () => {
    const res = await sentPost(req('POST', '/api/crm/proposals/q-9/sent', {}), params('q-9'));
    expect(res.status).toBe(404);
    expect(db.writes).toHaveLength(0);
  });
});
