import { NextRequest } from 'next/server';
import { fakeSupabase, makeDb, seed, ORG, OTHER, U, type FakeDb } from '@/app/api/crm/referrals/__tests__/f12Fake';
const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
let db: FakeDb;
const permissions = new Set<string>();
const writes = { create: jest.fn<Promise<{ id: string }>, unknown[]>(async () => ({ id: U(100) })), update: jest.fn<Promise<{ id: string }>, unknown[]>(async () => ({ id: U(100) })), remove: jest.fn<unknown, unknown[]>(), enroll: jest.fn<Promise<{ created: boolean }>, unknown[]>(async () => ({ created: true })), resume: jest.fn<Promise<{ resumed: boolean }>, unknown[]>(async () => ({ resumed: true })), exit: jest.fn<Promise<{ id: string }>, unknown[]>(async () => ({ id: U(101) })) };
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.mock('@/lib/utils/orgContext', () => ({ OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: U(999), roleId: 99, isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx, code = 'admin.full_access') => permissions.has(code)),
}));
jest.mock('@/lib/services/crm/sequenceService', () => ({ ...jest.requireActual('@/lib/services/crm/sequenceService'),
  createSequence: (...a: unknown[]) => writes.create(...a), updateSequence: (...a: unknown[]) => writes.update(...a), deleteSequence: (...a: unknown[]) => writes.remove(...a), enrollInSequence: (...a: unknown[]) => writes.enroll(...a), resumeEnrollment: (...a: unknown[]) => writes.resume(...a), unenrollFromSequence: (...a: unknown[]) => writes.exit(...a),
}));
import { GET, POST } from '@/app/api/crm/sequences/route';
import { PATCH, DELETE } from '@/app/api/crm/sequences/[id]/route';
import { POST as enroll } from '@/app/api/crm/sequences/[id]/enroll/route';
import { PATCH as resume, DELETE as exit } from '@/app/api/crm/sequences/[id]/enrollments/route';
import { readSequenceOverview } from '@/lib/services/crm/sequenceOverview';
import type { SupabaseClient } from '@supabase/supabase-js';
const req = (path: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = { params: Promise.resolve({ id: U(100) }) };
beforeEach(() => { db = makeDb(seed()); permissions.clear(); Object.values(writes).forEach(m => m.mockClear()); jest.spyOn(console, 'warn').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());
const mutations = [
  () => POST(req('/api/crm/sequences', 'POST', { name: 'Seguimiento' })),
  () => PATCH(req('/api/crm/sequences/x', 'PATCH', { name: 'Seguimiento' }), params),
  () => DELETE(req('/api/crm/sequences/x', 'DELETE'), params),
  () => enroll(req('/api/crm/sequences/x/enroll', 'POST', { customer_id: U(1) }), params),
  () => resume(req('/api/crm/sequences/x/enrollments', 'PATCH', { enrollment_id: U(101), action: 'resume' })),
  () => exit(req(`/api/crm/sequences/x/enrollments?enrollment_id=${U(101)}`, 'DELETE')),
];
describe('Secuencias: resumen nativo y administración canónica', () => {
  it('incluye más de 1.000 inscripciones, separa activas/pausadas y cuenta sólo pausas por respuesta', async () => {
    db.tables.sequence_enrollments = Array.from({ length: 1205 }, (_, i) => ({ id: U(2000 + i), organization_id: ORG, sequence_id: U(100), status: i % 2 ? 'paused' : 'active', paused_reason: i === 1204 ? 'customer_replied_whatsapp' : null, exit_reason: 'replied' }));
    db.tables.sequence_enrollments.push({ id: U(9999), organization_id: OTHER, sequence_id: U(100), status: 'active', paused_reason: 'customer_replied_email' });
    const overview = await readSequenceOverview(ORG, fakeSupabase(db) as unknown as SupabaseClient, new Date('2026-10-01T02:00:00Z'));
    expect(overview.summary).toMatchObject({ active_enrollments: 603, paused_enrollments: 602, replied_enrollments: 1, meetings_30d: null, meetings_available: false, timezone: 'America/Bogota' });
    expect(overview.stats[U(100)]).toMatchObject({ active: 1205, total: 1205, replied: 1 });
    expect(new Date(overview.summary.from).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(overview.summary.until).toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });
  it('reuniones no atribuidas no se cuentan como resultado de secuencias', async () => {
    db.tables.calendar_events = [{ organization_id: ORG, event_type: 'meeting', start_at: new Date().toISOString(), metadata: { source: 'crm', opportunity_id: U(30) } }];
    const result = await (await GET(req('/api/crm/sequences'))).json();
    expect(result.summary.meetings_30d).toBeNull(); expect(result.summary.meetings_available).toBe(false);
    expect(result.can_manage).toBe(false);
  });
  it.each(['admin.full_access', 'crm.campaigns.manage'])('cargo personalizado con %s recibe can_manage', async code => {
    permissions.add(code); expect(await (await GET(req('/api/crm/sequences'))).json()).toMatchObject({ can_manage: true });
  });
  it.each(mutations.map((call, i) => [i, call] as const))('mutación %i denegada antes de llamar motor/jobs', async (_i, call) => {
    expect((await call()).status).toBe(403); Object.values(writes).forEach(m => expect(m).not.toHaveBeenCalled());
  });
  it.each(['admin.full_access', 'crm.campaigns.manage'])('%s autoriza las seis rutas sin cambiar el motor', async code => {
    permissions.add(code); const responses = await Promise.all(mutations.map(c => c()));
    expect(responses.map(r => r.status)).toEqual([201, 200, 200, 201, 200, 200]); Object.values(writes).forEach(m => expect(m).toHaveBeenCalledTimes(1));
  });
  it.each(['organization_id', 'organizationId', 'org_id', 'orgId'])('GET rechaza organización ajena por %s', async key => {
    expect((await GET(req(`/api/crm/sequences?${key}=${OTHER}`))).status).toBe(403);
  });
  it('lectura fallida devuelve error sin summary cero ni detalle privado', async () => {
    db.errors['sequence_enrollments:select'] = { code: 'XX000', message: 'private_database_details' };
    const response = await GET(req('/api/crm/sequences')); expect(response.status).toBe(500);
    const json = await response.json(); expect(json.summary).toBeUndefined(); expect(JSON.stringify(json)).not.toContain('private_database_details');
  });
});
