import type { SupabaseClient } from '@supabase/supabase-js';
import { runPhoneControl } from '../phoneConferenceControl';
import { claimPhoneOperation, mutatePhonePack, phoneRpc, readPhonePack, publicPhoneState, type PhonePack } from '../phoneConferenceRepository';
import { nativePhoneConference, setNativePhoneHold, dialNativePhoneTransfer } from '../phoneConferenceProvider';
import { phonePack, CALL_ID, TARGET_SID } from './fixtures/phonePack';
jest.mock('../phoneConferenceRepository', () => ({ ...jest.requireActual('../phoneConferenceRepository'), claimPhoneOperation: jest.fn(), mutatePhonePack: jest.fn(), phoneRpc: jest.fn(), readPhonePack: jest.fn() }));
jest.mock('../phoneConferenceProvider', () => ({ nativePhoneConference: jest.fn(), setNativePhoneHold: jest.fn(), dialNativePhoneTransfer: jest.fn() }));
jest.mock('../voiceContextService', () => ({ getTelephonySettings: jest.fn(), orgOwnsCallerId: jest.fn(), pickCallerId: jest.fn() }));
jest.mock('../humanCallCompliance', () => ({ requireHumanCallCompliance: jest.fn() }));
jest.mock('@/lib/security/webhookSignatures', () => ({ getTwilioWebhookOrigin: () => 'https://app.example' }));
import { getTelephonySettings, orgOwnsCallerId, pickCallerId } from '../voiceContextService';
let current: PhonePack;
const client = {} as SupabaseClient;
const original = process.env.VOICE_CALLBACK_SECRET;
beforeAll(() => { process.env.VOICE_CALLBACK_SECRET = 'prueba-control-hmac-local'; });
afterAll(() => { if (original === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = original; });
beforeEach(() => {
  jest.clearAllMocks(); current = phonePack(); current.session.active_operation_id = 'op'; current.operation = { id: 'op', state: 'reserved', payload: { action: 'hold', held: true }, dispatched_at: null, result: null };
  jest.mocked(claimPhoneOperation).mockResolvedValue({ operation_id: 'op', revision: 1, replay: false });
  jest.mocked(readPhonePack).mockImplementation(async () => current);
  jest.mocked(phoneRpc).mockImplementation(async (_client, name) => {
    if (name === 'fn_phone_dispatch') { current.operation!.state = 'dispatched'; return current as never; }
    throw new Error(`RPC inesperada ${name}`);
  });
  jest.mocked(mutatePhonePack).mockImplementation(async (_client, _initial, producer) => {
    const patch = producer(current); current = { ...current, session: { ...current.session, ...patch.session }, call: { ...current.call, ...patch.call } };
    if (patch.operationState) current.operation!.state = patch.operationState;
    return current;
  });
  jest.mocked(nativePhoneConference).mockResolvedValue({ binding: {}, client: {} } as never);
  jest.mocked(setNativePhoneHold).mockResolvedValue({ held: true, agentMuted: true, previousAgentMuted: false });
});
it('replay devuelve resultado original sin otra lectura privada ni REST', async () => {
  const original = publicPhoneState(current);
  jest.mocked(claimPhoneOperation).mockResolvedValue({ operation_id: 'op', revision: 4, replay: true, response: original });
  expect(await runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'hold', held: true })).toEqual(original);
  expect(readPhonePack).not.toHaveBeenCalled(); expect(nativePhoneConference).not.toHaveBeenCalled();
});
it('dispatched/unknown no repite la intención ni vuelve a marcar', async () => {
  current.operation!.state = 'unknown';
  await expect(runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'hold', held: true })).rejects.toMatchObject({ code: 'operacion_pendiente' });
  expect(phoneRpc).not.toHaveBeenCalled(); expect(setNativePhoneHold).not.toHaveBeenCalled(); expect(dialNativePhoneTransfer).not.toHaveBeenCalled();
});
it('dispatch durable precede cualquier operación nativa y sólo ella acredita held', async () => {
  jest.mocked(setNativePhoneHold).mockImplementation(async () => {
    expect(current.operation!.state).toBe('dispatched'); expect(current.session.held_at).toBeNull();
    return { held: true, agentMuted: true, previousAgentMuted: false };
  });
  const result = await runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'hold', held: true });
  expect(result).toMatchObject({ held: true, busy: false }); expect(current.operation!.state).toBe('succeeded');
});
it('hold repetido conserva mute previo, sin reescribirlo al mute forzado actual', async () => {
  current.session.held_at = '2026-10-02T10:02:00Z'; current.session.pre_hold_muted = false;
  jest.mocked(setNativePhoneHold).mockResolvedValue({ held: true, agentMuted: true, previousAgentMuted: true });
  await runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'hold', held: true });
  expect(current.session.pre_hold_muted).toBe(false); expect(current.session.held_at).toBe('2026-10-02T10:02:00Z');
});
it('timeout conserva lease unknown y no afirma éxito de audio', async () => {
  jest.mocked(setNativePhoneHold).mockRejectedValue(new Error('timeout'));
  await expect(runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'hold', held: true })).rejects.toThrow('timeout');
  expect(current.session.phase).toBe('error'); expect(current.session.held_at).toBeNull();
  expect(current.operation!.state).toBe('unknown'); expect(current.session.active_operation_id).toBe('op');
});
it('destino no disponible falla antes de dispatch y no origina REST', async () => {
  jest.mocked(phoneRpc).mockResolvedValue(null);
  await expect(runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'transfer', mode: 'direct', target: { userId: '11111111-1111-4111-8111-111111111119' } })).rejects.toMatchObject({ code: 'destinatario_no_disponible' });
  expect(current.operation!.state).toBe('failed'); expect(nativePhoneConference).not.toHaveBeenCalled();
});
it('callback que ya unió destino durante REST no vuelve a ringing al guardar SID', async () => {
  const target = { user_id: '11111111-1111-4111-8111-111111111119', name: 'Agente', destination: `client:u_${'1'.repeat(32)}_o_7`, mode: 'browser' };
  const invite = { id: 'target', role: 'transfer', state: 'reserved', call_sid: null };
  jest.mocked(phoneRpc).mockImplementation(async (_client, name) => {
    if (name === 'fn_phone_target') return target as never;
    if (name === 'fn_phone_dispatch') { current.operation!.state = 'dispatched'; return current as never; }
    if (name === 'fn_phone_invite') { current.invites!.push(invite as never); return { invite } as never; }
    throw new Error(name);
  });
  jest.mocked(getTelephonySettings).mockResolvedValue({ voice_ring_timeout_seconds: 30 } as never);
  jest.mocked(pickCallerId).mockResolvedValue({ e164: '+573001234567' } as never); jest.mocked(orgOwnsCallerId).mockResolvedValue(true);
  jest.mocked(dialNativePhoneTransfer).mockImplementation(async () => {
    Object.assign(invite, { state: 'joined', call_sid: TARGET_SID }); return { sid: TARGET_SID, status: 'in-progress' };
  });
  // El mock de CAS refleja también el patch de invitación, como la RPC real.
  jest.mocked(mutatePhonePack).mockImplementation(async (_client, _initial, producer) => {
    const patch = producer(current); current.session = { ...current.session, ...patch.session };
    if (patch.invite) Object.assign(invite, patch.invite); return current;
  });
  await runPhoneControl(client, client, 7, CALL_ID, 'key', { action: 'transfer', mode: 'direct', target: { userId: target.user_id } });
  expect(invite.state).toBe('joined'); expect(dialNativePhoneTransfer).toHaveBeenCalledTimes(1);
});
