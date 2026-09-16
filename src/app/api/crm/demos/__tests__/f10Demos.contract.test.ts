/// <reference types="jest" />
/**
 * F10 — contrato de `/api/crm/demos` (agendar, editar) + validación pura `demoInput`.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import { validateCreateDemo, validateUpdateDemo } from '@/lib/services/crm/demoInput';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { PATCH } from '../[id]/route';

const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

beforeEach(() => {
  db = {
    writes: [],
    rows: {
      opportunities: [{ id: 'op-1', organization_id: 120 }, { id: 'op-9', organization_id: 121 }],
      demo_sessions: [
        { id: 'd-1', organization_id: 120, opportunity_id: 'op-1', status: 'scheduled', scheduled_at: future, checklist: [] },
        { id: 'd-9', organization_id: 121, opportunity_id: 'op-9', status: 'scheduled', scheduled_at: future, checklist: [] },
      ],
    },
  };
});

describe('demoInput (puro)', () => {
  const now = Date.parse('2026-09-15T15:00:00Z');
  it('crear: instante ISO no pasado, duración 5–480, asistentes con nombre, checklist saneado', () => {
    const ok = validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-16T14:00:00-05:00', duration_minutes: '30', attendees: [{ name: ' Ana ', email: 'ANA@x.co' }], checklist: [{ label: 'a', done: false }] }, now);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ scheduled_at: '2026-09-16T19:00:00.000Z', duration_minutes: 30, attendees: [{ name: 'Ana', email: 'ana@x.co' }] });
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: '2026-09-10T10:00:00Z' }, now).ok).toBe(false); // pasado
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: 'mañana' }, now).ok).toBe(false);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: future, duration_minutes: 2 }, now).ok).toBe(false);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: future, attendees: [{ email: 'x@x.co' }] }, now).ok).toBe(false);
    expect(validateCreateDemo({ opportunity_id: 'op-1', scheduled_at: future, video_url: 'javascript:alert(1)' }, now).ok).toBe(false);
    expect(validateCreateDemo({ opportunity_id: '../x', scheduled_at: future }, now).ok).toBe(false);
  });

  it('editar: lista blanca; status fuera del CHECK → error; sin campos → error', () => {
    expect(validateUpdateDemo({ status: 'done' }, now).ok).toBe(false);
    expect(validateUpdateDemo({ organization_id: 5 }, now).ok).toBe(false);
    const ok = validateUpdateDemo({ status: 'completed', checklist: [{ label: 'x', done: true }], notes: '  hola ' }, now);
    expect(ok).toEqual({ ok: true, value: { status: 'completed', checklist: [{ label: 'x', done: true }], notes: 'hola' } });
  });
});

describe('/api/crm/demos', () => {
  it('POST agenda en la organización con la oportunidad verificada; ajena → 404; body con otra organización → 403', async () => {
    const res = await POST(req('POST', '/api/crm/demos', { opportunity_id: 'op-1', scheduled_at: future, duration_minutes: 40, attendees: [{ name: 'Ana' }], checklist: [{ label: 'Paso', done: false }] }));
    expect(res.status).toBe(201);
    const ins = db.writes.find((w) => w.table === 'demo_sessions' && w.op === 'insert');
    expect(ins?.row).toMatchObject({ organization_id: 120, opportunity_id: 'op-1', status: 'scheduled', duration_minutes: 40, checklist: [{ label: 'Paso', done: false }] });
    expect((await POST(req('POST', '/api/crm/demos', { opportunity_id: 'op-9', scheduled_at: future }))).status).toBe(404);
    expect((await POST(req('POST', '/api/crm/demos', { opportunity_id: 'op-1', scheduled_at: future, organization_id: 121 }))).status).toBe(403);
    expect(db.writes.filter((w) => w.op === 'insert')).toHaveLength(1);
  });

  it('POST inválido → 400 sin escrituras', async () => {
    expect((await POST(req('POST', '/api/crm/demos', { opportunity_id: 'op-1', scheduled_at: 'x' }))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('GET lista solo las de la organización', async () => {
    const json = await (await GET(req('GET', '/api/crm/demos?opportunity_id=op-1'))).json();
    expect(json.data.map((d: { id: string }) => d.id)).toEqual(['d-1']);
  });

  it('PATCH filtra por id + organización; demo ajena → 404; status inválido → 400', async () => {
    const res = await PATCH(req('PATCH', '/api/crm/demos/d-1', { status: 'completed', checklist: [{ label: 'a', done: true }] }), { params: Promise.resolve({ id: 'd-1' }) });
    expect(res.status).toBe(200);
    const upd = db.writes.find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'd-1', organization_id: 120 });
    expect(upd?.row).toEqual({ status: 'completed', checklist: [{ label: 'a', done: true }] });
    expect((await PATCH(req('PATCH', '/x', { status: 'completed' }), { params: Promise.resolve({ id: 'd-9' }) })).status).toBe(404);
    expect((await PATCH(req('PATCH', '/x', { status: 'hacked' }), { params: Promise.resolve({ id: 'd-1' }) })).status).toBe(400);
  });
});
