import { nativePhoneConference, setNativePhoneHold, dialNativePhoneTransfer } from '../phoneConferenceProvider';
import { getTwilioClientForOrg } from '../voiceContextService';
import { ACCOUNT_SID, AGENT_SID, CALL_ID, CONFERENCE_SID, CUSTOMER_SID, TARGET_SID } from './fixtures/phonePack';
jest.mock('../voiceContextService', () => ({ getTwilioClientForOrg: jest.fn() }));
const credentials = jest.mocked(getTwilioClientForOrg);
function provider() {
  const state = { hold: false, muted: false };
  const customer = { fetch: jest.fn(async () => ({ callSid: CUSTOMER_SID, conferenceSid: CONFERENCE_SID, status: 'connected', hold: state.hold })),
    update: jest.fn(async (patch: { hold: boolean }) => { state.hold = patch.hold; }) };
  const agent = { fetch: jest.fn(async () => ({ callSid: AGENT_SID, conferenceSid: CONFERENCE_SID, status: 'connected', muted: state.muted })),
    update: jest.fn(async (patch: { muted: boolean }) => { state.muted = patch.muted; }) };
  const conference = { fetch: jest.fn(async () => ({ accountSid: ACCOUNT_SID, friendlyName: `go_7_${CALL_ID}`, status: 'in-progress' })),
    participants: jest.fn((sid: string) => sid === CUSTOMER_SID ? customer : agent) };
  const client = { conferences: jest.fn(() => conference), calls: { create: jest.fn(async () => ({ sid: TARGET_SID, status: 'queued', accountSid: ACCOUNT_SID })) } };
  credentials.mockResolvedValue({ client, creds: { accountSid: ACCOUNT_SID } } as never);
  const binding = { organizationId: 7, callId: CALL_ID, conferenceSid: CONFERENCE_SID, customerSid: CUSTOMER_SID, agentSid: AGENT_SID };
  return { state, customer, agent, conference, client, binding };
}
beforeEach(() => jest.clearAllMocks());
it('acredita hold del cliente y mute real del agente mediante lecturas posteriores', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  expect(await setNativePhoneHold(native, true, 'https://app.example/music')).toEqual({ held: true, agentMuted: true, previousAgentMuted: false });
  expect(p.customer.update).toHaveBeenCalledWith({ hold: true, holdUrl: 'https://app.example/music', holdMethod: 'POST' });
  expect(p.agent.fetch).toHaveBeenCalledTimes(2);
  expect(await setNativePhoneHold(native, false, 'https://app.example/music')).toMatchObject({ held: false, agentMuted: false });
});
it('compensa un fallo parcial y distingue restitución confirmada', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  p.agent.update.mockRejectedValueOnce(new Error('fallo proveedor'));
  await expect(setNativePhoneHold(native, true, 'https://app.example/music')).rejects.toMatchObject({ code: 'control_audio_revertido', status: 502 });
  expect(p.state).toEqual({ hold: false, muted: false });
});
it('un fallo de compensación queda incierto y nunca devuelve held exitoso', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  p.agent.update.mockRejectedValue(new Error('sin respuesta'));
  await expect(setNativePhoneHold(native, true, 'https://app.example/music')).rejects.toMatchObject({ code: 'control_audio_incierto', status: 503 });
});
it.each(['account', 'name', 'ended'])('rechaza conferencia de otro ámbito o terminada: %s', async (kind) => {
  const p = provider(); p.conference.fetch.mockResolvedValue({ accountSid: kind === 'account' ? 'otra' : ACCOUNT_SID,
    friendlyName: kind === 'name' ? 'otra' : `go_7_${CALL_ID}`, status: kind === 'ended' ? 'completed' : 'in-progress' });
  await expect(nativePhoneConference(p.binding)).rejects.toMatchObject({ code: 'conferencia_no_disponible' });
  expect(p.customer.update).not.toHaveBeenCalled();
});
it('no modifica audio si un participante no es la pata ligada', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  p.customer.fetch.mockResolvedValue({ callSid: TARGET_SID, conferenceSid: CONFERENCE_SID, status: 'connected', hold: false });
  await expect(setNativePhoneHold(native, true, 'https://app.example/music')).rejects.toMatchObject({ code: 'participante_no_disponible' });
  expect(p.customer.update).not.toHaveBeenCalled();
});
it('preserva el mute de servidor anterior al reanudar', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  expect(await setNativePhoneHold(native, false, 'https://app.example/music', true)).toMatchObject({ held: false, agentMuted: true });
});
it('el destino client pertenece a la organización antes de hacer REST', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  const input = { destination: `client:u_${'6'.repeat(32)}_o_8`, callerId: '+573001234567', joinUrl: 'https://app.example/join', callbackUrl: 'https://app.example/status', timeout: 30 };
  await expect(dialNativePhoneTransfer(native, input)).rejects.toMatchObject({ code: 'destino_otro_ambito' });
  expect(p.client.calls.create).not.toHaveBeenCalled();
  input.destination = '+573001234568'; await dialNativePhoneTransfer(native, input);
  expect(p.client.calls.create).toHaveBeenCalledWith(expect.objectContaining({ record: false, to: input.destination, statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] }));
});
it('una respuesta REST de otra cuenta nunca acredita el intento', async () => {
  const p = provider(); const native = await nativePhoneConference(p.binding);
  p.client.calls.create.mockResolvedValue({ sid: TARGET_SID, status: 'queued', accountSid: 'otra' });
  await expect(dialNativePhoneTransfer(native, { destination: '+573001234568', callerId: '+573001234567', joinUrl: 'https://app.example/join', callbackUrl: 'https://app.example/status', timeout: 30 })).rejects.toMatchObject({ code: 'transferencia_incierta' });
});
