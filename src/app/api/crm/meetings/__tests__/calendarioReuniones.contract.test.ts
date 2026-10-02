import { NextRequest } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), hasOrgAdminOrPermission: jest.fn(), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
import { GET, PATCH } from '../[id]/route';
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const creator = '33333333-3333-4333-8333-333333333333';
const customer = '44444444-4444-4444-8444-444444444444';
const activityId = '55555555-5555-4555-8555-555555555555';
const eventBase = { id, organization_id: 120, title: 'Reunión', description: 'Contexto completo', location: 'Sala', start_at: '2026-10-01T20:00:00Z', end_at: '2026-10-01T20:30:00Z', timezone: 'America/Bogota', assigned_to: actor, customer_id: customer, opportunity_id: null, event_type: 'meeting', status: 'confirmed', metadata: { source: 'crm', activity_id: activityId }, created_by: creator };
const activityBase = { id: activityId, activity_type: 'meeting', related_type: 'customer', related_id: customer, user_id: creator, occurred_at: '2026-10-01T15:00:00-05:00', outcome: 'done', metadata: { event_id: id } };
let event: Record<string, unknown> | null;
let activities: Record<string, unknown>[];
const from = jest.fn(), rpc = jest.fn();
const queries: Array<{ table: string; eq: jest.Mock }> = [];
const context = jest.mocked(getServerOrgContext);
const permission = jest.mocked(hasOrgAdminOrPermission);
const params = { params: Promise.resolve({ id }) };
const request = (method = 'GET', query = '') => new NextRequest(`http://localhost/api/crm/meetings/${id}${query}`, method === 'PATCH' ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Nuevo título' }) } : { method });
beforeEach(() => {
  jest.clearAllMocks(); queries.length = 0;
  event = { ...eventBase }; activities = [{ ...activityBase }];
  context.mockResolvedValue({ organizationId: 120, userId: actor, roleId: 2, isSuperAdmin: false, supabase: { from, rpc } } as never);
  permission.mockResolvedValue(true);
  from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    const eq = jest.fn(() => query); queries.push({ table, eq });
    query.select = jest.fn(() => query); query.eq = eq; query.ilike = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({ data: table === 'customers' ? { id: customer, organization_id: 120 } : table === 'opportunities' ? { id: id, organization_id: 120, customer_id: customer } : event, error: null }));
    query.limit = jest.fn(async () => ({ data: activities, error: null }));
    return query;
  });
  rpc.mockResolvedValue({ data: { event: eventBase, activity_id: activityId, reused: false }, error: null });
});
test('GET hidrata campos completos, outcome real y permiso del administrador con sesión scoped', async () => {
  const response = await GET(request(), params);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toMatchObject({ success: true, data: { event: { location: 'Sala', description: 'Contexto completo', customer_id: customer }, can_edit: true, outcome: 'done' } });
  for (const query of queries) expect(query.eq).toHaveBeenCalledWith('organization_id', 120);
  expect(permission).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 120, userId: actor }), 'crm.activities.edit_any');
  expect(rpc).not.toHaveBeenCalled();
});
test('lector sin edit_any recibe sólo lectura; NULL creator no concede autoría', async () => {
  event = { ...eventBase, created_by: null }; activities = [{ ...activityBase, user_id: null }];
  permission.mockImplementation(async (_ctx, code) => code !== 'crm.activities.edit_any');
  const response = await GET(request(), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { can_edit: false } });
  expect((await PATCH(request('PATCH'), params)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test('propietario edita con su sesión, sin resolver un permiso adicional de terceros', async () => {
  event = { ...eventBase, created_by: actor }; activities = [{ ...activityBase, user_id: actor }];
  permission.mockResolvedValue(false);
  const response = await PATCH(request('PATCH'), params);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('fn_crm_guardar_reunion', { p_org: 120, p_event_id: id, p_payload: { title: 'Nuevo título' } });
  expect(permission).not.toHaveBeenCalled();
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('GET rechaza alias ajeno %s antes de consultar entidades', async alias => {
  expect((await GET(request('GET', `?${alias}=999`), params)).status).toBe(403);
  expect(from).not.toHaveBeenCalled();
});
test.each(['missing', 'duplicate', 'wrong-kind', 'wrong-related', 'wrong-author', 'wrong-instant', 'wrong-pointer', 'unknown-outcome'])('GET y PATCH rechazan historial %s sin escoger otra fila ni escribir', async kind => {
  if (kind === 'missing') activities = [];
  if (kind === 'duplicate') activities.push({ ...activityBase, id: 'other', activity_type: 'note' });
  if (kind === 'wrong-kind') activities[0].activity_type = 'note';
  if (kind === 'wrong-related') activities[0].related_id = id;
  if (kind === 'wrong-author') activities[0].user_id = actor;
  if (kind === 'wrong-instant') activities[0].occurred_at = '2026-10-01T20:00:01Z';
  if (kind === 'wrong-pointer') event = { ...eventBase, metadata: { source: 'crm', activity_id: 'foreign' } };
  if (kind === 'unknown-outcome') activities[0].outcome = 'confirmed';
  const response = await GET(request(), params);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'historial_incoherente' });
  expect((await PATCH(request('PATCH'), params)).status).toBe(409);
  expect(rpc).not.toHaveBeenCalled();
});
test('ID ajeno o reunión manual no se interpreta como CRM', async () => {
  event = null;
  expect((await GET(request(), params)).status).toBe(404);
  event = { ...eventBase, metadata: { event_type: 'meeting' } };
  expect((await GET(request(), params)).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});
test('sesión vencida conserva 401 y no consulta ni escribe', async () => {
  context.mockRejectedValueOnce(new OrgContextError('No hay sesión', 401, 'UNAUTHENTICATED'));
  const response = await GET(request(), params);
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(from).not.toHaveBeenCalled();
});

test('permiso de oportunidades no concede lectura de una reunión ligada sólo al cliente', async () => {
  permission.mockImplementation(async (_ctx, code) => code === 'crm.opportunities.view');
  const response = await GET(request(), params);
  expect(response.status).toBe(403);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).not.toHaveProperty('data');
});
test('una reunión de oportunidad exige permiso de oportunidades y verifica el cliente de la oportunidad', async () => {
  event = { ...eventBase, opportunity_id: id }; activities = [{ ...activityBase, related_type: 'opportunity', related_id: id }];
  permission.mockImplementation(async (_ctx, code) => code === 'crm.opportunities.view');
  expect((await GET(request(), params)).status).toBe(200);
  permission.mockImplementation(async (_ctx, code) => code === 'crm.customers.view');
  expect((await GET(request(), params)).status).toBe(403);
});
test.each(['foreign-customer', 'foreign-opportunity', 'opportunity-customer'])('GET no revela una referencia comercial incoherente: %s', async kind => {
  if (kind !== 'foreign-customer') {
    event = { ...eventBase, opportunity_id: id }; activities = [{ ...activityBase, related_type: 'opportunity', related_id: id }];
  }
  const standard = from.getMockImplementation()!;
  from.mockImplementation((table: string) => {
    const query = standard(table) as Record<string, unknown>;
    if (table === (kind === 'foreign-customer' ? 'customers' : 'opportunities')) query.maybeSingle = jest.fn(async () => ({
      data: kind === 'opportunity-customer' ? { id, organization_id: 120, customer_id: actor } : null, error: null,
    }));
    return query;
  });
  const response = await GET(request(), params);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'entidad_incoherente' });
  expect(rpc).not.toHaveBeenCalled();
});
test('el path UUID en mayúsculas consulta el event_id canónico, sin perder ni ocultar referencias', async () => {
  const canonical = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
  event = { ...eventBase, id: canonical };
  activities = [{ ...activityBase, metadata: { event_id: canonical } }];
  const ilike = jest.fn();
  const standard = from.getMockImplementation()!;
  from.mockImplementation((table: string) => {
    const query = standard(table) as Record<string, unknown>;
    query.ilike = ilike.mockImplementation(() => query);
    return query;
  });
  const response = await GET(new NextRequest('http://localhost/api/crm/meetings/' + canonical.toUpperCase()), { params: Promise.resolve({ id: canonical.toUpperCase() }) });
  expect(response.status).toBe(200);
  expect(ilike).toHaveBeenCalledWith('metadata->>event_id', canonical);
});

test.each([false, true])('una referencia de historial no canónica no anuncia edición válida (duplicada=%s)', async duplicated => {
  const canonical = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
  event = { ...eventBase, id: canonical };
  activities = [{ ...activityBase, metadata: { event_id: canonical.toUpperCase() } }];
  if (duplicated) activities.push({ ...activityBase, metadata: { event_id: canonical } });
  expect((await GET(request(), params)).status).toBe(409);
  expect((await PATCH(request('PATCH'), params)).status).toBe(409);
  expect(rpc).not.toHaveBeenCalled();
});
