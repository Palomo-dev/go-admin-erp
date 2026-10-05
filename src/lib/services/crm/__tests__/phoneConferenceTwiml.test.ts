import { buildPhoneConferenceTwiml } from '../phoneConferenceTwiml';
import { CALL_ID } from './fixtures/phonePack';
const original = process.env.VOICE_CALLBACK_SECRET;
beforeAll(() => { process.env.VOICE_CALLBACK_SECRET = 'prueba-firma-conferencia-local'; });
afterAll(() => { if (original === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = original; });
it('cliente espera música y el agente inicia la conferencia con callbacks firmados', () => {
  const input = { origin: 'https://app.example', organizationId: 7, callId: CALL_ID, inviteId: '11111111-1111-4111-8111-111111111113', muted: false };
  const customer = buildPhoneConferenceTwiml({ ...input, role: 'customer', recording: false });
  expect(customer).toContain('startConferenceOnEnter="false"');
  expect(customer).toContain('endConferenceOnExit="false"');
  expect(customer).toContain('/api/voice/conference/music');
  expect(customer).not.toContain('<Recording');
  const agent = buildPhoneConferenceTwiml({ ...input, role: 'agent', announcement: 'Aviso <seguro>' });
  expect(agent).toContain('startConferenceOnEnter="true"');
  expect(agent.indexOf('<Say')).toBeLessThan(agent.indexOf('<Conference'));
  expect(agent).toContain('Aviso &lt;seguro&gt;');
});
it('emite la grabación nativa Start.Recording sólo con lease acreditada por el llamador', () => {
  const xml = buildPhoneConferenceTwiml({ origin: 'https://app.example', organizationId: 7, callId: CALL_ID,
    inviteId: '11111111-1111-4111-8111-111111111113', role: 'customer', muted: false, recording: true });
  expect(xml).toContain('<Start><Recording');
  expect(xml).toContain('record="do-not-record"');
  expect(xml).toContain('/api/voice/recording?callId=');
  expect(xml).toContain('recordingStatusCallbackEvent="in-progress completed absent"');
});
