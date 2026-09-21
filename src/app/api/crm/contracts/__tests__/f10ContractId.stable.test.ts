/// <reference types="jest" />
/**
 * F10 — contrato de `/api/crm/contracts/[id]` (GET, PATCH): la ruta pasa por
 * `f10RouteHelpers` (403 + registro con `organization_id` ajeno) y marcar
 * «firmado» a mano (sin proveedor ni webhook) queda reservado a admin/manager
 * por id de rol, con actividad `system` (`manual_signed_by`) en la oportunidad
 * (`contract_signatures` no tiene columna `metadata`: verificado por MCP).
 * Consolidado el 2026-09-21 desde el tester r1/r2 (`f10ContractIdTester`);
 * ningún estable ejercía esta ruta. Fixtures sin datos reales (org 120 / 121).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';

let db: FakeDb;
let roleId = 2;

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      activities: [],
      contract_signatures: [
        { id: 'c-1', organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-1', provider: 'documenso', provider_document_id: 'doc-1', status: 'sent', signers: [] },
        { id: 'c-9', organization_id: 121, opportunity_id: 'op-9', quotation_id: null, provider: 'documenso', provider_document_id: 'doc-9', status: 'sent', signers: [] },
      ],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError, // la clase real: `readOrgBody` la lanza y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { GET, PATCH } from '../[id]/route';

const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/crm/contracts/x', { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => { db = seed(); roleId = 2; });

describe('/api/crm/contracts/[id] (tester r1/r2)', () => {
  it('GET/PATCH de un contrato de otra organización → 404 sin escrituras', async () => {
    expect((await GET(req('GET'), params('c-9'))).status).toBe(404);
    expect((await PATCH(req('PATCH', { status: 'viewed' }), params('c-9'))).status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('transición inválida → 409; status libre → 400; body no JSON o sin status → 400', async () => {
    db.rows.contract_signatures[0].status = 'signed';
    expect((await PATCH(req('PATCH', { status: 'viewed' }), params('c-1'))).status).toBe(409);
    expect((await PATCH(req('PATCH', { status: 'hackeado' }), params('c-1'))).status).toBe(400);
    const bad = new NextRequest('http://localhost/api/crm/contracts/x', { method: 'PATCH', body: '{no json', headers: { 'content-type': 'application/json' } });
    expect((await PATCH(bad, params('c-1'))).status).toBe(400);
    expect((await PATCH(req('PATCH', {}), params('c-1'))).status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it('regla 5: organization_id ajeno en el body → 403, se registra (warn) y no se escribe; la propia organización en el body no molesta', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await PATCH(req('PATCH', { status: 'viewed', organization_id: 121 }), params('c-1'));
      expect(res.status).toBe(403);
      expect(db.writes).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: 120, body: 121 }));
      expect((await PATCH(req('PATCH', { status: 'viewed', organization_id: 120 }), params('c-1'))).status).toBe(200);
    } finally {
      warn.mockRestore();
    }
  });

  it('«signed» a mano: un vendedor (rol 4) → 403 sin escrituras; admin (rol 2) → 200 con signed_at, UPDATE condicionado al estado leído y actividad system con manual_signed_by', async () => {
    roleId = 4;
    const denied = await PATCH(req('PATCH', { status: 'signed' }), params('c-1'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ success: false, error: expect.stringMatching(/administrador|manager/i) });
    expect(db.writes).toEqual([]);

    roleId = 2;
    const res = await PATCH(req('PATCH', { status: 'signed' }), params('c-1'));
    expect(res.status).toBe(200);
    const upd = db.writes.find((w) => w.table === 'contract_signatures' && w.op === 'update');
    expect(upd).toMatchObject({ filters: { id: 'c-1', organization_id: 120, status: 'sent' } });
    expect(upd?.row).toMatchObject({ status: 'signed', signed_at: expect.any(String) });
    const act = db.writes.find((w) => w.table === 'activities' && w.op === 'insert');
    expect(act?.row).toMatchObject({ organization_id: 120, activity_type: 'system', related_type: 'opportunity', related_id: 'op-1', user_id: 'u-1', metadata: expect.objectContaining({ action: 'contract_manual_signed', contract_id: 'c-1', manual_signed_by: 'u-1' }) });
  });

  it('manager (rol 5) también puede; «viewed»/«declined» a mano siguen abiertos a cualquier miembro', async () => {
    roleId = 5;
    expect((await PATCH(req('PATCH', { status: 'signed' }), params('c-1'))).status).toBe(200);
    roleId = 4;
    db.rows.contract_signatures[0].status = 'sent';
    expect((await PATCH(req('PATCH', { status: 'declined' }), params('c-1'))).status).toBe(200);
  });

  it('el UPDATE condicionado por el estado leído no afecta filas (carrera) → 409', async () => {
    const base = createFakeSupabase(db);
    let armed = true;
    const patched = { ...base, from: (t: string) => { const c = base.from(t); if (t === 'contract_signatures' && armed) { const upd = c.update as (r: Record<string, unknown>) => unknown; c.update = (r: Record<string, unknown>) => { armed = false; db.rows.contract_signatures[0] = { ...db.rows.contract_signatures[0], status: 'declined' }; return upd(r); }; } return c; } };
    const { getServerOrgContext } = jest.requireMock('@/lib/utils/orgContext') as { getServerOrgContext: jest.Mock };
    getServerOrgContext.mockResolvedValueOnce({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: patched });
    expect((await PATCH(req('PATCH', { status: 'viewed' }), params('c-1'))).status).toBe(409);
  });
});
