import type { SupabaseClient } from '@supabase/supabase-js';
import { finishPhoneConference, joinedPhoneParticipant, leftPhoneParticipant } from '../phoneConferenceEvents';
import { terminalPhoneInvitation } from '../phoneConferenceWebhook';
import { phonePack, phoneInvite, ACCOUNT_SID, AGENT_SID, TARGET_SID, CONFERENCE_SID } from './fixtures/phonePack';
import type { PhonePack, PhonePatch } from '../phoneConferenceRepository';
import { getTwilioClientForOrg } from '../voiceContextService';
import { settleVoiceCall } from '../callCreditsService';
jest.mock('../voiceContextService', () => ({ getTwilioClientForOrg: jest.fn() }));
jest.mock('../callCreditsService', () => ({ settleVoiceCall: jest.fn() }));
jest.mock('../phoneConferenceProvider', () => ({ nativePhoneConference: jest.fn(), setNativePhoneHold: jest.fn() }));
jest.mock('../phoneConferenceWebhookContext', () => ({}));
jest.mock('../phoneConferenceControl', () => ({ phoneHeldSeconds: jest.fn((pack) => pack.session.hold_seconds), phoneCallback: jest.fn(() => 'https://app.example/music') }));
jest.mock('../phoneConferenceRepository', () => ({ ...jest.requireActual('../phoneConferenceRepository'), mutatePhonePack: jest.fn(), readPhonePack: jest.fn() }));
import { mutatePhonePack, readPhonePack } from '../phoneConferenceRepository';
const mutation = jest.mocked(mutatePhonePack);
let current: PhonePack;
let patches: PhonePatch[];
const service = {} as SupabaseClient;
const conferenceFetch = jest.fn(); const conferenceUpdate = jest.fn(); const callsFetch = jest.fn();
const participantRemove = jest.fn(); const participantsList = jest.fn();
const participants = Object.assign(jest.fn(() => ({ remove: participantRemove })), { list: participantsList });
beforeEach(() => {
  jest.clearAllMocks(); patches = []; current = phonePack();
  mutation.mockImplementation(async (_client, _initial, producer) => {
    const patch = producer(current); patches.push(patch);
    current = { ...current, call: { ...current.call, ...patch.call }, session: { ...current.session, ...patch.session } };
    if (patch.inviteId) current.invites = current.invites?.map((row) => row.id === patch.inviteId ? { ...row, ...patch.invite } : row);
    if (patch.operationState && current.operation) current.operation = { ...current.operation, state: patch.operationState };
    return current;
  });
  jest.mocked(readPhonePack).mockImplementation(async () => current);
  conferenceFetch.mockResolvedValue({ sid: CONFERENCE_SID, accountSid: ACCOUNT_SID, status: 'completed', dateUpdated: new Date('2026-10-02T10:03:00Z') });
  conferenceUpdate.mockResolvedValue({}); callsFetch.mockResolvedValue({ accountSid: ACCOUNT_SID, duration: '180', status: 'completed', dateUpdated: new Date('2026-10-02T10:03:00Z') });
  jest.mocked(getTwilioClientForOrg).mockResolvedValue({ creds: { accountSid: ACCOUNT_SID }, client: { conferences: () => ({ fetch: conferenceFetch, update: conferenceUpdate, participants }), calls: () => ({ fetch: callsFetch }) } } as never);
});
it('duración conversada excluye el minuto de aviso/espera y liquida una sola vez', async () => {
  const result = await finishPhoneConference(service, current);
  expect(result.call.duration_seconds).toBe(120);
  expect(result.call.status).toBe('completed');
  await finishPhoneConference(service, current);
  expect(settleVoiceCall).toHaveBeenCalledTimes(1);
});
it('pata atendida por IVR sin agente conserva canceled y cero segundos conversados', async () => {
  current.call.answered_at = null; current.call.status = 'ringing';
  const result = await finishPhoneConference(service, current);
  expect(result.call.duration_seconds).toBe(0);
  expect(result.call.status).toBe('canceled');
});
it('salida del iniciador durante directa no corta cliente ni liquida', async () => {
  current.session.transfer_mode = 'direct'; current.session.transfer_status = 'connected'; current.session.phase = 'transferring';
  await leftPhoneParticipant(service, current, AGENT_SID);
  expect(conferenceUpdate).not.toHaveBeenCalled(); expect(settleVoiceCall).not.toHaveBeenCalled();
});
it('callback duplicado de destino directo confirmado conserva dueño sin REST destructivo', async () => {
  const target = phoneInvite('transfer', TARGET_SID); current.invites!.push(target);
  Object.assign(current.session, { transfer_invite_id: target.id, transfer_mode: 'direct', transfer_status: 'confirmed', agent_sid: TARGET_SID });
  const result = await joinedPhoneParticipant(service, current, target.id, TARGET_SID, CONFERENCE_SID);
  expect(result.session).toMatchObject({ transfer_status: 'confirmed', phase: 'active', agent_sid: TARGET_SID });
  expect(participantRemove).not.toHaveBeenCalled();
});
it('consulta confirmada 3→2 limpia invitado y deja conversación y autor íntegros en la misma RPC', async () => {
  const target = phoneInvite('transfer', TARGET_SID); current.invites!.push(target);
  Object.assign(current.session, { transfer_invite_id: target.id, transfer_mode: 'consult', transfer_status: 'confirmed' });
  const initiator = current.call.user_id;
  await terminalPhoneInvitation(service, current, target, TARGET_SID);
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({ session: { transfer_invite_id: null, transfer_mode: null, transfer_status: null }, inviteId: target.id, invite: { state: 'failed' } });
  expect(current.session.agent_sid).toBe(AGENT_SID); expect(current.call.user_id).toBe(initiator);
  expect(current.session.phase).toBe('active'); expect(conferenceUpdate).not.toHaveBeenCalled(); expect(settleVoiceCall).not.toHaveBeenCalled();
});
it('conferencia no terminada o de otra cuenta no altera histórico ni dinero', async () => {
  conferenceFetch.mockResolvedValue({ status: 'in-progress', accountSid: ACCOUNT_SID });
  await expect(finishPhoneConference(service, current)).rejects.toThrow();
  expect(mutation).not.toHaveBeenCalled(); expect(settleVoiceCall).not.toHaveBeenCalled();
});
