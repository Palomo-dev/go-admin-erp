import type { SupabaseClient } from '@supabase/supabase-js';
import { reconcilePhonePack } from '../phoneConferenceReconcile';
import { phonePack, ACCOUNT_SID, CONFERENCE_SID, CALL_ID, CUSTOMER_SID } from './fixtures/phonePack';
import type { PhonePack } from '../phoneConferenceRepository';
import { getTwilioClientForOrg } from '../voiceContextService';
import { mutatePhonePack } from '../phoneConferenceRepository';
import { finishPhoneConference } from '../phoneConferenceEvents';
jest.mock('../voiceContextService', () => ({ getTwilioClientForOrg: jest.fn() }));
jest.mock('../phoneConferenceEvents', () => ({ finishPhoneConference: jest.fn(), joinedPhoneParticipant: jest.fn() }));
jest.mock('../phoneConferenceWebhook', () => ({ terminalPhoneInvitation: jest.fn() }));
jest.mock('../phoneConferenceControl', () => ({ phoneHeldSeconds: (pack: PhonePack) => pack.session.hold_seconds }));
jest.mock('../phoneConferenceRepository', () => ({ ...jest.requireActual('../phoneConferenceRepository'), mutatePhonePack: jest.fn(), readPhonePack: jest.fn() }));
const conference = jest.fn(); const participants = jest.fn(); const recordings = jest.fn(); const create = jest.fn();
const service = {} as SupabaseClient;
beforeEach(() => {
  jest.clearAllMocks(); conference.mockResolvedValue({ sid: CONFERENCE_SID, accountSid: ACCOUNT_SID, friendlyName: `go_7_${CALL_ID}`, status: 'in-progress' });
  participants.mockImplementation(async (sid: string) => ({ callSid: sid, conferenceSid: CONFERENCE_SID, status: 'connected', hold: true, muted: true }));
  recordings.mockResolvedValue([]);
  jest.mocked(getTwilioClientForOrg).mockResolvedValue({ creds: { accountSid: ACCOUNT_SID }, client: { conferences: () => ({ fetch: conference,
    participants: (sid: string) => ({ fetch: () => participants(sid) }) }), calls: Object.assign(() => ({ recordings: { list: recordings } }), { create }) } } as never);
  jest.mocked(mutatePhonePack).mockImplementation(async (_client, initial, producer) => { const patch = producer(initial); return { ...initial, session: { ...initial.session, ...patch.session } }; });
});
it('timeout hold se confirma desde proveedor sin repetir HTTP de mutación ni marcar', async () => {
  const pack = phonePack(); pack.session.phase = 'error'; pack.session.active_operation_id = 'op';
  pack.operation = { id: 'op', state: 'unknown', payload: { action: 'hold', held: true }, dispatched_at: '2026-10-02T10:02:00Z', result: null };
  const result = await reconcilePhonePack(service, pack);
  expect(result.session).toMatchObject({ phase: 'held', active_operation_id: null, held_at: '2026-10-02T10:02:00Z' });
  const patch = jest.mocked(mutatePhonePack).mock.calls[0][2](pack);
  expect(Object.keys(patch.session).sort()).toEqual(['active_operation_id', 'held_at', 'hold_seconds', 'phase']);
  expect(patch.operationState).toBe('succeeded'); expect(create).not.toHaveBeenCalled();
});
it('audio no acreditado mantiene operación unknown en lugar de fingir restitución', async () => {
  const pack = phonePack(); pack.session.phase = 'error'; pack.session.active_operation_id = 'op';
  pack.operation = { id: 'op', state: 'unknown', payload: { action: 'hold', held: true }, dispatched_at: '2026-10-02T10:02:00Z', result: null };
  participants.mockResolvedValue({ status: 'connected', hold: false, muted: true });
  expect(await reconcilePhonePack(service, pack)).toBe(pack); expect(mutatePhonePack).not.toHaveBeenCalled();
});
it('lease expirada en llamada viva no libera autorización', async () => {
  const pack = phonePack(); pack.session.recording_claim_state = 'unknown'; pack.session.recording_claim_until = '2020-01-01T00:00:00Z';
  await reconcilePhonePack(service, pack); expect(recordings).not.toHaveBeenCalled(); expect(mutatePhonePack).not.toHaveBeenCalled();
});
it('fin nativo real se entrega al cierre único que liquida; no crea otra reserva', async () => {
  const pack = phonePack(); conference.mockResolvedValue({ sid: CONFERENCE_SID, accountSid: ACCOUNT_SID, friendlyName: `go_7_${CALL_ID}`, status: 'completed' });
  jest.mocked(finishPhoneConference).mockResolvedValue(pack);
  await reconcilePhonePack(service, pack); expect(finishPhoneConference).toHaveBeenCalledWith(service, pack); expect(create).not.toHaveBeenCalled();
});
it('ausencia confirmada después del fin permite resolver acta incierta, ninguna expiración por sí sola', async () => {
  const pack = phonePack(); pack.session.phase = 'ended'; pack.call.ended_at = new Date(Date.now() - 180000).toISOString(); pack.session.recording_claim_state = 'unknown';
  const result = await reconcilePhonePack(service, pack); expect(recordings).toHaveBeenCalledWith({ limit: 1 });
  expect(result.session.recording_claim_state).toBe('absent'); expect(result.session.customer_sid).toBe(CUSTOMER_SID);
});
