import { NextRequest } from 'next/server';
import { phoneControlRequest } from '../phoneConferenceApi';
import { phoneRpc, readPhonePack } from '../phoneConferenceRepository';
import { runPhoneControl } from '../phoneConferenceControl';
import { puedeGestionarLlamada } from '../callAccessService';
import { phonePack, CALL_ID, AGENT_SID } from './fixtures/phonePack';
import { CrmHttpError } from '../crmErrors';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
const ctx = { organizationId: 7, userId: 'actor', supabase: {} };
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn(async () => ctx), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({ elevated: true })) }));
jest.mock('../phoneConferenceRepository', () => ({ ...jest.requireActual('../phoneConferenceRepository'), phoneRpc: jest.fn(), readPhonePack: jest.fn() }));
jest.mock('../phoneConferenceControl', () => ({ runPhoneControl: jest.fn() }));
jest.mock('../phoneConferenceReconcile', () => ({ reconcilePhonePack: jest.fn() }));
jest.mock('../callAccessService', () => ({ puedeGestionarLlamada: jest.fn() }));
const state = { supported: true, phase: 'ready', held: false, heldAt: null, holdSeconds: 0, transfer: null, busy: false, error: null };
const original = process.env.CRM_PHONE_CONFERENCE_ENABLED;
beforeAll(() => { delete process.env.CRM_PHONE_CONFERENCE_ENABLED; });
afterAll(() => { if (original === undefined) delete process.env.CRM_PHONE_CONFERENCE_ENABLED; else process.env.CRM_PHONE_CONFERENCE_ENABLED = original; });
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(getServerOrgContext).mockResolvedValue(ctx as never); jest.mocked(phoneRpc).mockResolvedValue({ call_id: CALL_ID, state });
  const pack = phonePack(); pack.call.metadata = { note: 'Nota privada', caller_name: 'Contacto' };
  jest.mocked(readPhonePack).mockResolvedValue(pack); jest.mocked(puedeGestionarLlamada).mockResolvedValue(false); jest.mocked(runPhoneControl).mockResolvedValue(state as never);
});
function request(body?: object, query = '') { return new NextRequest(`https://app.example/api/voice/call/${AGENT_SID}/control${query}`, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}) }); }
it('GET expone DTO mínimo sin notas/SIDs/routing y no otorga edición a view_all', async () => {
  const response = await phoneControlRequest(request(), AGENT_SID); expect(response.status).toBe(200);
  const body = await response.json(); expect(body.data.call.can_edit_notes).toBe(false);
  expect(body.data.call.recording_started).toBe(false);
  const serialized = JSON.stringify(body); expect(serialized).not.toContain('Nota privada'); expect(serialized).not.toContain(AGENT_SID);
  expect(body.data.call).not.toHaveProperty('metadata'); expect(body.data.call).not.toHaveProperty('user_id');
});
it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('intento de otro tenant se rechaza antes de provider: %s', async (alias) => {
  const response = await phoneControlRequest(request({ [alias]: 8, idempotency_key: '11111111-1111-4111-8111-111111111116', command: { action: 'hold', held: true } }), AGENT_SID);
  expect(response.status).toBe(403); expect(runPhoneControl).not.toHaveBeenCalled();
});
it('tenant ajeno en query se rechaza antes de leer filas privadas', async () => {
  expect((await phoneControlRequest(request(undefined, '?org_id=8'), AGENT_SID)).status).toBe(403);
  expect(phoneRpc).not.toHaveBeenCalled(); expect(getServiceClient).not.toHaveBeenCalled();
});
it('SQL sin permiso/branch evita elevar o ejecutar control', async () => {
  jest.mocked(phoneRpc).mockRejectedValue({ code: '42501', message: 'sin_permiso' });
  expect((await phoneControlRequest(request(), AGENT_SID)).status).toBe(403);
  expect(getServiceClient).not.toHaveBeenCalled(); expect(runPhoneControl).not.toHaveBeenCalled();
});
it('POST toma organización exclusivamente de sesión y conserva UUID de intención', async () => {
  const key = '11111111-1111-4111-8111-111111111116';
  const response = await phoneControlRequest(request({ org_id: 7, idempotency_key: key, command: { action: 'hold', held: true } }), AGENT_SID);
  expect(response.status).toBe(200); expect(runPhoneControl).toHaveBeenCalledWith(ctx.supabase, expect.anything(), 7, CALL_ID, key, { action: 'hold', held: true });
});
it('error real de operación se devuelve sin success ni nuevo intento', async () => {
  jest.mocked(runPhoneControl).mockRejectedValue(new CrmHttpError(503, 'control_audio_incierto', 'Audio incierto'));
  const response = await phoneControlRequest(request({ idempotency_key: '11111111-1111-4111-8111-111111111116', command: { action: 'hold', held: true } }), AGENT_SID);
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ success: false, code: 'control_audio_incierto' });
});

it('banderas o metadata editables sin confirmación privada no encienden REC', async () => {
  const pack = phonePack(); pack.call.metadata = { recording_started_at: '2026-10-02T10:00:00Z' }; pack.session.recording_claim_state = 'pending';
  jest.mocked(readPhonePack).mockResolvedValue(pack);
  const response = await phoneControlRequest(request(), AGENT_SID);
  expect((await response.json()).data.call.recording_started).toBe(false);
});


it.each(['operacion_pendiente', 'reintento_con_datos_distintos'])('SQL P0001 %s responde 409 sin repetir la intención', async (message) => {
  jest.mocked(runPhoneControl).mockRejectedValue({ code: 'P0001', message });
  const response = await phoneControlRequest(request({ idempotency_key: '11111111-1111-4111-8111-111111111116', command: { action: 'hold', held: true } }), AGENT_SID);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ success: false, code: message });
  expect(runPhoneControl).toHaveBeenCalledTimes(1);
  expect(phoneRpc).toHaveBeenCalledTimes(1); // Solo resolución autorizada; nunca reintento.
});

it('sin sesión responde 401 antes de resolver llamada o elevar acceso', async () => {
  jest.mocked(getServerOrgContext).mockRejectedValue(new OrgContextError('Sesión requerida', 401, 'NO_SESSION'));
  const response = await phoneControlRequest(request(), AGENT_SID);
  expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ success: false });
  expect(phoneRpc).not.toHaveBeenCalled(); expect(getServiceClient).not.toHaveBeenCalled(); expect(runPhoneControl).not.toHaveBeenCalled();
});
