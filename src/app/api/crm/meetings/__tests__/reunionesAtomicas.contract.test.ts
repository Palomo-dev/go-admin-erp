import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { createMeeting, updateMeeting, meetingInputSchema, meetingPatchSchema } from '@/lib/services/crm/meetingsService';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('@/lib/services/crm/reunionCorreo.server', () => ({ notificarReunion: jest.fn() }));
import { notificarReunion } from '@/lib/services/crm/reunionCorreo.server';
import { POST } from '../route';
import { PATCH } from '../[id]/route';

const user = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const activity = '33333333-3333-4333-8333-333333333333';
const body = { title: 'Reunión de prueba', customer_id: id, start_at: '2026-10-02T20:00:00Z', end_at: '2026-10-02T20:30:00Z' };
const rpc = jest.fn();
const from = jest.fn();
const sb = { rpc, from } as unknown as SupabaseClient;
const context = jest.mocked(getServerOrgContext);
const params = { params: Promise.resolve({ id }) };
const request = (method: string, payload: unknown, query = '') => new NextRequest(`http://localhost/api/crm/meetings/${id}${query}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(notificarReunion).mockResolvedValue({ cliente: true, responsable: false });
  context.mockResolvedValue({ organizationId: 120, userId: user, roleId: 2, isSuperAdmin: false, supabase: sb } as never);
  rpc.mockResolvedValue({ data: { event: { id, metadata: { activity_id: activity } }, activity_id: activity, reused: false }, error: null });
  from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'ilike']) query[method] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({ data: { id, ...body, organization_id: 120, event_type: 'meeting', status: 'confirmed', created_by: user, opportunity_id: null, metadata: { source: 'crm', activity_id: activity } }, error: null }));
    query.limit = jest.fn(async () => ({ data: [{ id: activity, activity_type: 'meeting', related_type: 'customer', related_id: id, user_id: user, occurred_at: body.start_at, outcome: 'scheduled', metadata: { event_id: id } }], error: null }));
    if (!['calendar_events', 'activities', 'customers'].includes(table)) throw new Error('Tabla inesperada');
    return query;
  });
});
test('crear usa una sola RPC del usuario y no transmite un actor suplantable', async () => {
  const result = await createMeeting(120, user, body, sb);
  expect(result.activityId).toBe(activity);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('fn_crm_guardar_reunion', { p_org: 120, p_event_id: null, p_payload: body });
  expect(from).not.toHaveBeenCalled();
});
test('la invitación usa el evento persistido después del guardado atómico', async () => {
  const event = { id, ...body, organization_id: 120, customer_id: id, assigned_to: user, timezone: 'Europe/Madrid' };
  rpc.mockResolvedValue({ data: { event, activity_id: activity, reused: false }, error: null });
  const response = await POST(request('POST', body));
  expect(response.status).toBe(201);
  expect(notificarReunion).toHaveBeenCalledWith(120, expect.objectContaining({ userId: user }),
    expect.objectContaining({ id, title: body.title, customer_id: id, timezone: 'Europe/Madrid' }), sb);
  expect(await response.json()).toMatchObject({ data: { activity_id: activity, invite_sent: true } });
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(notificarReunion).mock.invocationCallOrder[0]);
});
test('send_invite=false conserva el guardado y no envía correo', async () => {
  const response = await POST(request('POST', { ...body, send_invite: false }));
  expect(response.status).toBe(201);
  expect(notificarReunion).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ data: { invite_sent: false } });
});
test('si falla la RPC no intenta enviar invitaciones', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
  expect((await POST(request('POST', body))).status).toBe(403);
  expect(notificarReunion).not.toHaveBeenCalled();
});
test('actualizar usa la misma RPC y propaga íntegro un error tardío', async () => {
  const error = { code: '23514', message: 'prueba_fallo' };
  rpc.mockResolvedValue({ data: null, error });
  await expect(updateMeeting(120, id, { status: 'done' }, sb)).rejects.toEqual(error);
  expect(from).not.toHaveBeenCalled();
});
test.each([
  { title: '   ' }, { start_at: '2026-02-30T20:00:00Z' }, { created_by: user }, { metadata: { activity_id: id } },
])('entrada inválida no llega a la RPC: %p', async invalid => {
  expect(meetingInputSchema.safeParse({ ...body, ...invalid }).success).toBe(false);
  const response = await POST(request('POST', { ...body, ...invalid }));
  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([{}, { assigned_to: user }, { status: 'confirmed' }, { start_at: null }])('parche inválido: %p', async patch => {
  expect(meetingPatchSchema.safeParse(patch).success).toBe(false);
  expect((await PATCH(request('PATCH', patch), params)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('alias de organización propia %s se comprueba y se retira', async alias => {
  expect((await POST(request('POST', { ...body, [alias]: 120 }))).status).toBe(201);
  expect(rpc.mock.calls[0][1].p_payload).toEqual(body);
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('PATCH rechaza organización ajena en %s', async alias => {
  expect((await PATCH(request('PATCH', { status: 'done', [alias]: 999 }), params)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([
  ['42501', 'sin_permiso', 403], ['P0002', 'reunion_no_encontrada', 404],
  ['22023', 'rango_invalido', 400], ['23505', 'clave_reutilizada', 409], ['40001', 'historial_incoherente', 409],
])('SQLSTATE %s conserva diagnóstico seguro y estado %s', async (code, message, status) => {
  rpc.mockResolvedValue({ data: null, error: { code, message } });
  const response = await PATCH(request('PATCH', { status: 'done' }), params);
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ code: message });
});
test('sesión vencida se conserva para recuperar cookies antes de escribir', async () => {
  context.mockRejectedValue(new OrgContextError('No hay sesión', 401, 'UNAUTHENTICATED'));
  const response = await PATCH(request('PATCH', { status: 'done' }), params);
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(rpc).not.toHaveBeenCalled();
});
test('UUID inválido y clave extra no escriben', async () => {
  expect((await PATCH(request('PATCH', { status: 'done' }), { params: Promise.resolve({ id: 'incorrecto' }) })).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
