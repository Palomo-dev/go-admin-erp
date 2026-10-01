/** Rutas reales: firma → cuenta propia → reserva del intento → escritor financiero único. */
const VAC = '20000000-0000-4000-8000-000000000001';
const CALL = '20000000-0000-4000-8000-000000000002';
const RESERVA = '20000000-0000-4000-8000-000000000003';
const SID = `CA${'1'.repeat(32)}`;
const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
const updates: string[] = [];
const rpc = jest.fn();
let answeredBy: string | undefined;
let providerStatus: string | undefined;
let accountAllowed = true;
let reservationExists = true;
let reservationSid: string | null = null;
let previousAttempt = false;
let legacyCredits = 0;
let requestSid = SID;

function fakeClient() {
  return {
    rpc,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters[key] = value; return q; },
        maybeSingle: async () => {
          reads.push({ table, filters });
          return { error: null, data: table === 'voice_agent_calls' ? {
            id: VAC, organization_id: 7, attempts: previousAttempt ? 2 : 1, started_at: null,
            provider_call_sid: SID, call_id: CALL, customer_id: null, status: 'in_progress',
            credits_reserved: legacyCredits, credits_settled_at: null,
          } : reservationExists ? {
            id: RESERVA, organization_id: 7, voice_agent_call_id: VAC, call_id: CALL,
            attempt_no: 1, provider_call_sid: reservationSid, state: 'reserved',
          } : null };
        },
        update: () => { updates.push(table); return q; },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
      };
      return q;
    },
  };
}

jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyTwilioWebhook: jest.fn(async () => ({ params: {
    CallSid: requestSid, ...(answeredBy ? { AnsweredBy: answeredBy } : {}),
    ...(providerStatus ? { CallStatus: providerStatus } : {}),
  }, accountSid: 'AC1' })),
  WebhookError: class extends Error { statusCode = 403; code = 'invalid_signature'; },
  getTwilioWebhookOrigin: () => 'https://app.example.com',
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient() }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: () => 'x'.repeat(40), issueWsSessionToken: () => 'tok' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  AgentRuntimeError: class extends Error {},
  twilioLanguage: () => 'es-MX',
  buildRuntimeConfig: jest.fn(async () => ({
    orgId: 7, recordingEnabled: false, consentMessage: '', greeting: 'Hola',
    agent: { language: 'es-CO', stt_provider: 'google' }, voice: { ttsProvider: 'Google', voice: null },
  })),
}));
jest.mock('@/lib/services/crm/voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(async () => accountAllowed) }));
jest.mock('@/lib/services/crm/bridgeTokens', () => ({ isBridgeSigningConfigured: () => false, signConsentToken: () => 't', verifyConsentToken: () => false }));
jest.mock('@/lib/services/crm/consentService', () => ({ recordConsent: jest.fn(), recordingEnabledForCall: jest.fn(async () => false), voidConsentWithoutRecording: jest.fn() }));
const updateCall = jest.fn(async () => null);
jest.mock('@/lib/services/crm/callManagementService', () => ({ updateCall: (...a: unknown[]) => updateCall(...(a as [])) }));

import { POST as twiml } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as status } from '@/app/api/voice/ai-agent/status/route';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
const req = (kind = 'twiml/ai-agent', token: string | null = RESERVA) => new Request(
  `https://app.example.com/api/voice/${kind}?agentId=agent-1&callId=${VAC}${token === null ? '' : `&reservationId=${token}`}`,
  { method: 'POST', body: 'x' }
);

beforeEach(() => {
  reads.length = 0; updates.length = 0; rpc.mockReset(); updateCall.mockClear();
  answeredBy = undefined; providerStatus = undefined; accountAllowed = true;
  reservationExists = true; reservationSid = null; previousAttempt = false; legacyCredits = 0; requestSid = SID;
  rpc.mockImplementation(async (name: string) => ({ error: null, data:
    name === 'crm_voice_dispatch_accept' ? { reservation_id: RESERVA, call_id: CALL, voice_agent_call_id: VAC, attempt_no: 1 }
      : { applied: true, refunded: false, current_attempt: !previousAttempt },
  }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test.each(['machine_start', 'machine_end_beep', 'fax'])('AMD %s cuelga y registra el cierre mediante el token del intento', async valor => {
  answeredBy = valor;
  const res = await twiml(req());
  const xml = await res.text();
  expect(res.status).toBe(200);
  expect(xml).toContain('<Hangup/>'); expect(xml).not.toContain('ConversationRelay');
  expect(rpc.mock.calls.map(c => c[0])).toEqual(['crm_voice_dispatch_accept', 'crm_voice_callback_apply']);
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_org: 7, p_reservation: RESERVA, p_sid: SID,
    p_status: valor === 'fax' ? 'no_answer' : 'voicemail', p_outcome: valor === 'fax' ? 'fax' : 'buzon' });
  expect(updates).toEqual([]); expect(updateCall).not.toHaveBeenCalled();
});

test.each(['human', 'unknown', undefined])('%s abre ConversationRelay y conserva el token en Connect action', async valor => {
  answeredBy = valor;
  const xml = await (await twiml(req())).text();
  expect(xml).toContain('<ConversationRelay');
  expect(xml).toContain(`reservationId=${RESERVA}`);
  expect(rpc).toHaveBeenLastCalledWith('crm_voice_callback_apply', expect.objectContaining({ p_status: 'in_progress' }));
  expect(updates).toEqual([]);
});

test('TwiML anterior al REST binds SID en la misma reserva; todas las lecturas privadas filtran org e intento', async () => {
  await twiml(req());
  expect(rpc).toHaveBeenCalledWith('crm_voice_dispatch_accept', { p_org: 7, p_reservation: RESERVA, p_sid: SID });
  expect(reads.find(r => r.table === 'crm_voice_credit_reservations')?.filters).toEqual({ organization_id: 7, voice_agent_call_id: VAC, id: RESERVA });
});

test.each([twiml, status])('una cuenta ajena no consulta la reserva ni escribe', async handler => {
  accountAllowed = false;
  expect((await handler(req())).status).toBe(403);
  expect(reads.some(r => r.table === 'crm_voice_credit_reservations')).toBe(false);
  expect(rpc).not.toHaveBeenCalled(); expect(updates).toEqual([]);
});

test.each([twiml, status])('token desconocido nunca usa el escritor antiguo', async handler => {
  reservationExists = false;
  expect((await handler(req())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled(); expect(updates).toEqual([]);
});

test.each([twiml, status])('SID distinto al ya vinculado se rechaza', async handler => {
  reservationSid = `CA${'2'.repeat(32)}`;
  expect((await handler(req())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled(); expect(updates).toEqual([]);
});

test('un TwiML de otro intento no abre el modelo ni toca el nuevo', async () => {
  previousAttempt = true;
  const res = await twiml(req());
  expect(res.status).toBe(403); expect(await res.text()).not.toContain('ConversationRelay');
  expect(rpc).not.toHaveBeenCalled();
});

test('el callback tardío usa su propia reserva y permite a SQL preservar el intento nuevo', async () => {
  previousAttempt = true; providerStatus = 'no-answer';
  expect((await status(req('ai-agent/status'))).status).toBe(200);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('crm_voice_callback_apply', expect.objectContaining({ p_reservation: RESERVA, p_status: 'no_answer' }));
  expect(updates).toEqual([]);
});

test('un callback repetido conserva la misma clave transaccional y devuelve TwiML válido', async () => {
  providerStatus = 'busy';
  for (let i = 0; i < 2; i++) {
    const res = await status(req('ai-agent/status'));
    expect(res.status).toBe(200); expect(await res.text()).toContain('<Response/>');
  }
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]); expect(updates).toEqual([]);
});

test('un error del escritor financiero devuelve 500 para que Twilio reintente', async () => {
  providerStatus = 'failed'; rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'reembolso_no_disponible' } });
  expect((await status(req('ai-agent/status'))).status).toBe(500);
  expect(updates).toEqual([]);
});

test('los flags antiguos no prueban un débito: no reembolsar ni abrir sesión', async () => {
  reservationExists = false; legacyCredits = 1; providerStatus = 'no-answer';
  expect((await status(req('ai-agent/status', null))).status).toBe(500);
  expect((await twiml(req('twiml/ai-agent', null))).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled(); expect(updates).toEqual([]);
});

test.each([twiml, status])('firma inválida se rechaza antes de leer datos', async handler => {
  jest.mocked(verifyTwilioWebhook).mockRejectedValueOnce(new WebhookError(403, 'invalid_signature', 'Firma inválida'));
  expect((await handler(req())).status).toBe(403);
  expect(reads).toEqual([]); expect(rpc).not.toHaveBeenCalled();
});
