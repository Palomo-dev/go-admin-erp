import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { createMeeting } from '@/lib/services/crm/meetingsService';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('@/lib/services/crm/meetingsService', () => ({ ...jest.requireActual('@/lib/services/crm/meetingsService'), createMeeting: jest.fn() }));
import { POST } from '../route';
const context = jest.mocked(getServerOrgContext);
const create = jest.mocked(createMeeting);
const userId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const sb = {} as never;
const body = { title: 'Reunión de prueba', customer_id: customerId,
  start_at: '2026-10-02T20:00:00.000Z', end_at: '2026-10-02T20:30:00.000Z' };
const request = (input: unknown = body, query = '') => new NextRequest('http://localhost/api/crm/meetings'+query,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => {
  jest.clearAllMocks();
  context.mockResolvedValue({ organizationId: 120, userId, roleId: 2, isSuperAdmin: false, supabase: sb } as never);
  create.mockResolvedValue({ event: { id: 'event' }, activityId: 'activity' } as never);
});
test('administrador de organización agenda usando su sesión, sin exigir superadmin', async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(create).toHaveBeenCalledWith(120, userId, expect.objectContaining(body), sb);
});
test('401 conserva UNAUTHENTICATED para recuperación segura anterior a cualquier escritura', async () => {
  context.mockRejectedValue(new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED'));
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(create).not.toHaveBeenCalled();
});
test('incoherencia de organización conserva su diagnóstico 403', async () => {
  context.mockRejectedValue(new OrgContextError('Organización incoherente', 403, 'ORG_AMBIGUOUS'));
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'ORG_AMBIGUOUS' });
  expect(create).not.toHaveBeenCalled();
});
test.each(['body', 'query'])('organización ajena en %s no agenda nada', async source => {
  const response = await POST(request(source==='body'?{ ...body, organization_id: 999 }:body, source==='query'?'?orgId=999':''));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
  expect(create).not.toHaveBeenCalled();
});
