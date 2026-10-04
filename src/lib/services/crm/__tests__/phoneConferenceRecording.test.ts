import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePhoneRecordingScope, confirmPhoneRecordingScope } from '../phoneConferenceRecording';
import { getTwilioClientForOrg, accountSidMatchesOrg } from '../voiceContextService';
import { readPhonePack, mutatePhonePack } from '../phoneConferenceRepository';
import { signBridgeToken } from '../bridgeTokens';
import { phonePack, ACCOUNT_SID, CALL_ID, CUSTOMER_SID, AGENT_SID } from './fixtures/phonePack';
jest.mock('../voiceContextService', () => ({ getTwilioClientForOrg: jest.fn(), accountSidMatchesOrg: jest.fn() }));
jest.mock('../phoneConferenceRepository', () => ({ readPhonePack: jest.fn(), mutatePhonePack: jest.fn() }));
const actualRecording = jest.fn(); const actualCall = jest.fn(); const list = jest.fn();
const recordingSid = `RE${'8'.repeat(32)}`;
const params = { CallSid: CUSTOMER_SID, RecordingSid: recordingSid, RecordingStatus: 'in-progress' };
const client = { from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: 7 }, error: null }) }) }) })) } as unknown as SupabaseClient;
const original = process.env.VOICE_CALLBACK_SECRET;
beforeAll(() => { process.env.VOICE_CALLBACK_SECRET = 'prueba-recording-hmac-local'; });
afterAll(() => { if (original === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = original; });
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(readPhonePack).mockResolvedValue(phonePack()); jest.mocked(accountSidMatchesOrg).mockResolvedValue(true);
  actualCall.mockResolvedValue({ accountSid: ACCOUNT_SID }); actualRecording.mockResolvedValue({ sid: recordingSid, callSid: CUSTOMER_SID, accountSid: ACCOUNT_SID }); list.mockResolvedValue([]);
  jest.mocked(getTwilioClientForOrg).mockResolvedValue({ creds: { accountSid: ACCOUNT_SID }, client: { calls: () => ({ fetch: actualCall, recordings: { list } }), recordings: () => ({ fetch: actualRecording }) } } as never);
});
function request(token = signBridgeToken(`phone-call:${CALL_ID}`)) { return new Request(`https://app.example/api/voice/recording?callId=${CALL_ID}&token=${encodeURIComponent(token)}`); }
it('firma de aplicación y relación nativa RE→CA→cuenta acreditan scope antes del escritor', async () => {
  expect(await resolvePhoneRecordingScope(request(), params, ACCOUNT_SID, client)).toEqual({ callId: CALL_ID, org: 7 });
  expect(mutatePhonePack).not.toHaveBeenCalled();
  await confirmPhoneRecordingScope(client, { callId: CALL_ID, org: 7 }, 'in-progress');
  const producer = jest.mocked(mutatePhonePack).mock.calls[0][2];
  expect(producer(phonePack())).toEqual({ session: { recording_claim_state: 'confirmed', recording_claim_until: null } });
});
it.each(['token', 'customer', 'account', 'recording', 'recordingAccount'])('rechaza binding inválido sin metadata REC: %s', async (kind) => {
  if (kind === 'account') actualCall.mockResolvedValue({ accountSid: 'otra' });
  if (kind === 'recording') actualRecording.mockResolvedValue({ sid: recordingSid, callSid: AGENT_SID, accountSid: ACCOUNT_SID });
  if (kind === 'recordingAccount') actualRecording.mockResolvedValue({ sid: recordingSid, callSid: CUSTOMER_SID, accountSid: 'otra' });
  await expect(resolvePhoneRecordingScope(request(kind === 'token' ? 'falso' : undefined), { ...params, CallSid: kind === 'customer' ? AGENT_SID : CUSTOMER_SID }, ACCOUNT_SID, client)).rejects.toThrow();
  expect(mutatePhonePack).not.toHaveBeenCalled();
});
it('absent con llamada viva mantiene unknown y bloqueo legal; no declara ausencia por caducar lease', async () => {
  await resolvePhoneRecordingScope(request(), { ...params, RecordingStatus: 'absent' }, ACCOUNT_SID, client);
  expect(jest.mocked(mutatePhonePack).mock.calls[0][2](phonePack())).toEqual({ session: { recording_claim_state: 'unknown' } });
});
it('absent no elimina grabación que el proveedor aún conserva', async () => {
  list.mockResolvedValue([{ sid: recordingSid }]);
  await expect(resolvePhoneRecordingScope(request(), { ...params, RecordingStatus: 'absent' }, ACCOUNT_SID, client)).rejects.toThrow();
  expect(mutatePhonePack).not.toHaveBeenCalled();
});
