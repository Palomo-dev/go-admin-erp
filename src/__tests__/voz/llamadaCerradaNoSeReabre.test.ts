/**
 * Una llamada del agente que ya terminó NO vuelve a `in_progress`.
 *
 * Incidente 2026-10-06 (org 125): cinco llamadas cortas (7–13 s, atendidas por
 * una persona que colgó durante o justo después del aviso de grabación)
 * quedaron con `calls.ended_at` puesto pero con `voice_agent_calls.status` y
 * `calls.status` en `in_progress`, y `calls.answered_at` POSTERIOR a `ended_at`.
 * Secuencia: Twilio pide la 2ª pasada del TwiML → la ruta tarda (config, acta,
 * token) → la persona cuelga → el `statusCallback completed` cierra la fila →
 * la 2ª pasada termina y escribe `in_progress` sin condición. Las cinco filas
 * ocuparon los cinco cupos de concurrencia de la organización para siempre.
 *
 * Se ejercitan las rutas REALES contra `FakeDb`, en el orden del incidente.
 */

import { FakeDb, type Row } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

let db: FakeDb;
let twilioParams: Record<string, string> = {};

jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyTwilioWebhook: jest.fn(async () => ({ params: twilioParams, accountSid: 'AC1' })),
  WebhookError: class extends Error {},
  getTwilioWebhookOrigin: () => 'https://app.example.com',
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => db.client() }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: () => 'x'.repeat(40), issueWsSessionToken: () => 'tok' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  AgentRuntimeError: class extends Error {},
  twilioLanguage: () => 'es-MX',
  buildRuntimeConfig: jest.fn(async () => ({
    orgId: 125,
    recordingEnabled: false,
    consentMessage: '',
    greeting: 'Hola',
    agent: { language: 'es-CO', stt_provider: 'google' },
    voice: { ttsProvider: 'Google', voice: null },
  })),
}));
jest.mock('@/lib/services/crm/voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(async () => true) }));
jest.mock('@/lib/services/crm/bridgeTokens', () => ({ isBridgeSigningConfigured: () => false, signConsentToken: () => 't', verifyConsentToken: () => false }));
jest.mock('@/lib/services/crm/consentService', () => ({
  recordConsent: jest.fn(),
  recordingEnabledForCall: jest.fn(async () => false),
  voidConsentWithoutRecording: jest.fn(),
}));

import { POST as twimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as statusPOST } from '@/app/api/voice/ai-agent/status/route';
import { updateCall } from '@/lib/services/crm/callManagementService';

const ORG = 125;
const VAC = 'vac-incidente';
const CALL = 'call-incidente';
const ENDED = '2026-10-06T19:21:07.430Z';

function sembrar(vac: Partial<Row> = {}, call: Partial<Row> = {}) {
  db = new FakeDb({
    tables: {
      voice_agent_calls: [
        {
          id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', campaign_id: 'camp-1', call_id: CALL,
          provider_call_sid: 'CA1', status: 'in_progress', started_at: '2026-10-06T19:20:36Z', outcome: null,
          completed_at: null, credits_reserved: 1, credits_settled_at: null, customer_id: 'cust-1', ...vac,
        },
      ],
      calls: [
        {
          id: CALL, organization_id: ORG, provider_call_sid: 'CA1', mode: 'ai_agent', status: 'in_progress',
          answered_by: null, answered_at: null, ended_at: null, metadata: {}, ...call,
        },
      ],
    },
    rpc: { deduct_comm_credits: () => true },
  });
}

const vacRow = () => db.rows('voice_agent_calls')[0];
const callRow = () => db.rows('calls')[0];

const twiml = () =>
  twimlPOST(new Request(`https://app.example.com/api/voice/twiml/ai-agent?agentId=ag-1&callId=${VAC}`, { method: 'POST', body: 'x' }));
const status = (params: Record<string, string>, query = `callId=${VAC}`) => {
  twilioParams = { CallSid: 'CA1', ...params };
  return statusPOST(new Request(`https://app.example.com/api/voice/ai-agent/status?${query}`, { method: 'POST', body: 'x' }));
};

/** Estado tras el `completed` del statusCallback (lo que dejó la base el 2026-10-06). */
const CERRADA = {
  vac: { status: 'completed', outcome: 'answered_by_human', completed_at: ENDED, duration_seconds: 13 },
  call: { status: 'completed', answered_by: 'human', ended_at: ENDED, duration_seconds: 13 },
};

describe('TwiML del agente: la 2ª pasada que llega tarde no reabre la llamada', () => {
  test('fila ya cerrada por el statusCallback → <Hangup/>, sin ConversationRelay, y todo sigue cerrado', async () => {
    sembrar(CERRADA.vac, CERRADA.call);
    twilioParams = { CallSid: 'CA1', AnsweredBy: 'human', CallStatus: 'in-progress' };

    const xml = await (await twiml()).text();

    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('ConversationRelay');
    expect(vacRow().status).toBe('completed');
    expect(callRow().status).toBe('completed');
    expect(callRow().answered_at).toBeNull(); // el incidente dejaba answered_at > ended_at
    expect(callRow().ended_at).toBe(ENDED);
  });

  test.each(['failed', 'no_answer', 'voicemail', 'canceled', 'transferred', 'skipped'])(
    'tampoco reabre una fila en %s',
    async (estado) => {
      sembrar({ status: estado, completed_at: ENDED }, { status: 'completed', ended_at: ENDED });
      twilioParams = { CallSid: 'CA1', AnsweredBy: 'human' };
      const xml = await (await twiml()).text();
      expect(xml).not.toContain('ConversationRelay');
      expect(vacRow().status).toBe(estado);
    }
  );

  test('camino normal (fila viva): abre el ConversationRelay y marca in_progress en las dos tablas', async () => {
    sembrar({}, { status: 'ringing' });
    twilioParams = { CallSid: 'CA1', AnsweredBy: 'human' };
    const xml = await (await twiml()).text();
    expect(xml).toContain('<ConversationRelay');
    expect(vacRow().status).toBe('in_progress');
    expect(callRow().status).toBe('in_progress');
    expect(callRow().answered_at).toEqual(expect.any(String));
  });

  test('si el cierre llega entre la escritura de voice_agent_calls y la de calls, calls no se reabre', async () => {
    // `calls` ya tiene ended_at (el statusCallback ganó en esa tabla) pero la
    // fila del agente aún estaba viva: la de calls no debe volver atrás.
    sembrar({}, CERRADA.call);
    twilioParams = { CallSid: 'CA1', AnsweredBy: 'human' };
    await twiml();
    expect(callRow().status).toBe('completed');
    expect(callRow().answered_at).toBeNull();
  });
});

describe('statusCallback / action del <Connect>: un estado vivo nunca pisa un cierre', () => {
  test('orden del incidente: completed y DESPUÉS in-progress (callback desordenado) → sigue completed', async () => {
    sembrar();
    await status({ CallStatus: 'completed', AnsweredBy: 'human', CallDuration: '13' });
    expect(vacRow().status).toBe('completed');
    expect(callRow().status).toBe('completed');
    const endedAt = callRow().ended_at;
    expect(endedAt).toEqual(expect.any(String));

    await status({ CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(vacRow().status).toBe('completed');
    expect(callRow().status).toBe('completed');
    expect(callRow().ended_at).toBe(endedAt);
  });

  test('la action del <Connect> (CallStatus=in-progress, SessionStatus=ended) tras el cierre conserva el estado y guarda el HandoffData', async () => {
    sembrar(CERRADA.vac, CERRADA.call);
    await status({ CallStatus: 'in-progress', SessionStatus: 'ended', HandoffData: 'agendar' }, `callId=${VAC}&handoff=1`);
    expect(vacRow().status).toBe('completed');
    expect(vacRow().outcome).toBe('agendar');
    expect(callRow().status).toBe('completed');
  });

  test('orden normal: ringing → in-progress → completed', async () => {
    sembrar({ status: 'queued' }, { status: 'dialing' });
    await status({ CallStatus: 'ringing' });
    expect(vacRow().status).toBe('in_progress');
    expect(callRow().status).toBe('ringing');
    await status({ CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(callRow().status).toBe('in_progress');
    await status({ CallStatus: 'completed', AnsweredBy: 'human', CallDuration: '40' });
    expect(vacRow().status).toBe('completed');
    expect(vacRow().completed_at).toEqual(expect.any(String));
    expect(callRow().status).toBe('completed');
  });

  test('un cierre real que llega después de otro cierre sí se aplica (p. ej. tras el recolector)', async () => {
    sembrar({ status: 'failed', completed_at: ENDED, outcome: null }, { status: 'failed', ended_at: ENDED });
    await status({ CallStatus: 'completed', AnsweredBy: 'human', CallDuration: '20' });
    expect(vacRow().status).toBe('completed');
    expect(callRow().status).toBe('completed');
  });
});

describe('updateCall({ soloSiNoTerminada })', () => {
  test('no escribe sobre una llamada con ended_at y devuelve null', async () => {
    sembrar({}, CERRADA.call);
    const r = await updateCall(CALL, ORG, { status: 'in_progress' }, db.client(), { soloSiNoTerminada: true });
    expect(r).toBeNull();
    expect(callRow().status).toBe('completed');
  });

  test('sí escribe sobre una llamada viva; sin la opción, el comportamiento es el de siempre', async () => {
    sembrar({}, { status: 'ringing' });
    await updateCall(CALL, ORG, { status: 'in_progress' }, db.client(), { soloSiNoTerminada: true });
    expect(callRow().status).toBe('in_progress');
    await updateCall(CALL, ORG, { status: 'completed', ended_at: ENDED }, db.client());
    expect(callRow().status).toBe('completed');
  });
});
