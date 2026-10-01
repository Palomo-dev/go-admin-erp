import { NextRequest } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), hasOrgAdminOrPermission: jest.fn(), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
import { getTimeline, TimelineEntityNotFoundError } from '@/lib/services/crm/timelineService';
jest.mock('@/lib/services/crm/timelineService', () => ({ ...jest.requireActual('@/lib/services/crm/timelineService'), getTimeline: jest.fn() }));
import { GET } from '../route';
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const context = jest.mocked(getServerOrgContext);
const permission = jest.mocked(hasOrgAdminOrPermission);
const timeline = jest.mocked(getTimeline);
const sb = {};
let permisos: Set<string>;
const get = (type = 'customer', query = '') => GET(new NextRequest(`http://localhost/api/crm/timeline/${type}/${id}${query}`), { params: Promise.resolve({ type, id }) });
beforeEach(() => {
  jest.clearAllMocks();
  permisos = new Set(['crm.customers.view']);
  context.mockResolvedValue({ organizationId: 120, userId: actor, roleId: 3, isSuperAdmin: false, supabase: sb } as never);
  permission.mockImplementation(async (_ctx, code) => permisos.has(code ?? ''));
  timeline.mockResolvedValue({ entries: [], next_cursor: null });
});
test('visibilidad de llamadas se decide por sesión, un parámetro no concede ver todas', async () => {
  const response = await get('customer', '?callUserId=otro&onlyLeads=false');
  expect(response.status).toBe(200);
  expect(timeline).toHaveBeenCalledWith(120, 'customer', id, sb, {}, { callUserId: actor });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
test('ver todas exige permiso real del servidor', async () => {
  permisos.add('crm.calls.view_all');
  await get();
  expect(timeline).toHaveBeenCalledWith(120, 'customer', id, sb, {}, {});
});
test('permiso leads se transmite como restricción interna, no como filtro editable', async () => {
  permisos = new Set(['crm.leads.view']);
  await get('customer', '?onlyLeads=false');
  expect(timeline).toHaveBeenCalledWith(120, 'customer', id, sb, {}, { onlyLeads: true, callUserId: actor });
});
test.each(['customer', 'opportunity'])('sin permiso %s rechaza antes de leer historial', async type => {
  permisos.clear();
  expect((await get(type)).status).toBe(403);
  expect(timeline).not.toHaveBeenCalled();
});
test('una oportunidad exige su permiso, no basta el de clientes', async () => {
  expect((await get('opportunity')).status).toBe(403);
  permisos.add('crm.opportunities.view');
  expect((await get('opportunity')).status).toBe(200);
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('organización ajena en %s no llega al servicio', async alias => {
  expect((await get('customer', `?${alias}=125`)).status).toBe(403);
  expect(timeline).not.toHaveBeenCalled();
});
test('cursor inválido no se convierte en una primera página silenciosa', async () => {
  expect((await get('customer', '?cursor=roto')).status).toBe(400);
  expect(timeline).not.toHaveBeenCalled();
});
test('sesión ausente conserva el 401 y su código', async () => {
  context.mockRejectedValue(new OrgContextError('No hay sesión', 401, 'UNAUTHENTICATED'));
  const response = await get();
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(timeline).not.toHaveBeenCalled();
});
test('entidad ajena/inexistente responde 404 y error SQL permanece 500', async () => {
  timeline.mockRejectedValueOnce(new TimelineEntityNotFoundError());
  expect((await get()).status).toBe(404);
  timeline.mockRejectedValueOnce({ message: 'SQL privado' });
  const response = await get();
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('SQL privado');
});
