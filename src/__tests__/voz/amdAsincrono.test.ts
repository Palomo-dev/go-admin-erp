/**
 * AMD ASÍNCRONO del agente de voz (`/api/voice/ai-agent/amd`).
 *
 * Llamada de prueba del 2026-10-07 (org 125): con AMD síncrono Twilio retuvo
 * la llamada ~30 s en silencio esperando veredicto (`unknown`) y, con el aviso
 * de grabación, la persona oyó ~37 s de nada antes del agente. Ahora el TwiML
 * arranca al contestar y el veredicto llega aparte.
 *
 * Se ejercitan las rutas REALES (AMD, TwiML del agente y statusCallback) contra
 * `FakeDb`, en los dos órdenes posibles del veredicto respecto del TwiML.
 */

import { FakeDb, type Row } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

let db: FakeDb;
let twilioParams: Record<string, string> = {};
let firmaValida = true;

jest.mock('@/lib/security/webhookSignatures', () => {
  class WebhookError extends Error {
    constructor(public statusCode: number, public code: string) {
      super(code);
    }
  }
  return {
    WebhookError,
    verifyTwilioWebhook: jest.fn(async () => {
      if (!firmaValida) throw new WebhookError(403, 'twilio_signature_invalid');
      return { params: twilioParams, accountSid: 'AC1' };
    }),
    getTwilioWebhookOrigin: () => 'https://app.example.com',
  };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => db.client() }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: () => 'x'.repeat(40), issueWsSessionToken: () => 'tok' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  AgentRuntimeError: class extends Error {},
  twilioLanguage: () => 'es-MX',
  buildRuntimeConfig: jest.fn(async () => ({
    orgId: 125,
    recordingEnabled: false,
    consentMessage: '',
    greeting: 'Hola. Le habla Pedro.',
    agent: { language: 'es-CO', stt_provider: 'deepgram' },
    voice: { ttsProvider: 'ElevenLabs', voice: 'v-flash_v2_5' },
  })),
}));
let mismaOrg = true;
jest.mock('@/lib/services/crm/voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(async () => mismaOrg) }));
jest.mock('@/lib/services/crm/bridgeTokens', () => ({ isBridgeSigningConfigured: () => false, signConsentToken: () => 't', verifyConsentToken: () => false }));
jest.mock('@/lib/services/crm/consentService', () => ({
  recordConsent: jest.fn(),
  recordingEnabledForCall: jest.fn(async () => false),
  voidConsentWithoutRecording: jest.fn(),
}));
const colgar = jest.fn<Promise<boolean>, [number, string, unknown]>(async () => true);
jest.mock('@/lib/services/crm/voiceAgentService', () => ({
  colgarLlamadaDelAgente: (org: number, sid: string, sb: unknown) => colgar(org, sid, sb),
}));

import { POST as amdPOST } from '@/app/api/voice/ai-agent/amd/route';
import { POST as twimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as statusPOST } from '@/app/api/voice/ai-agent/status/route';

const ORG = 125;
const VAC = 'vac-amd';
const CALL = 'call-amd';

function sembrar(vac: Partial<Row> = {}, call: Partial<Row> = {}) {
  db = new FakeDb({
    tables: {
      voice_agent_calls: [
        {
          id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', campaign_id: 'camp-1', call_id: CALL,
          provider_call_sid: 'CA1', status: 'in_progress', started_at: '2026-10-07T16:25:04Z', outcome: null,
          completed_at: null, credits_reserved: 2, credits_settled_at: null, customer_id: 'cust-1', locked_by: 'w1', ...vac,
        },
      ],
      calls: [
        {
          id: CALL, organization_id: ORG, provider_call_sid: 'CA1', mode: 'ai_agent', status: 'ringing',
          answered_by: null, answered_at: null, ended_at: null, metadata: {}, ...call,
        },
      ],
    },
    rpc: { deduct_comm_credits: () => true },
  });
}

const vacRow = () => db.rows('voice_agent_calls')[0];
const callRow = () => db.rows('calls')[0];
const reembolsos = () => db.rpcCalls.filter((c) => c.name === 'deduct_comm_credits');

const amd = (answeredBy: string, extra: Record<string, string> = {}, query = `callId=${VAC}`) => {
  twilioParams = { CallSid: 'CA1', AccountSid: 'AC1', AnsweredBy: answeredBy, MachineDetectionDuration: '2900', ...extra };
  return amdPOST(new Request(`https://app.example.com/api/voice/ai-agent/amd?${query}`, { method: 'POST', body: 'x' }));
};
const twiml = () => {
  // Con AMD asíncrono la petición del TwiML NO trae `AnsweredBy`.
  twilioParams = { CallSid: 'CA1', CallStatus: 'in-progress' };
  return twimlPOST(new Request(`https://app.example.com/api/voice/twiml/ai-agent?agentId=ag-1&callId=${VAC}`, { method: 'POST', body: 'x' }));
};
const status = (params: Record<string, string>) => {
  twilioParams = { CallSid: 'CA1', ...params };
  return statusPOST(new Request(`https://app.example.com/api/voice/ai-agent/status?callId=${VAC}`, { method: 'POST', body: 'x' }));
};

beforeEach(() => {
  firmaValida = true;
  mismaOrg = true;
  colgar.mockClear();
  colgar.mockImplementation(async () => true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('TwiML del agente con AMD asíncrono', () => {
  test('sin AnsweredBy (asíncrono): abre el ConversationRelay de inmediato, con el saludo que dice Twilio', async () => {
    sembrar();
    const xml = await (await twiml()).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).toContain('welcomeGreeting="Hola. Le habla Pedro."');
    // La presentación no se corta con el «¿Aló?» de quien contesta.
    expect(xml).toContain('welcomeGreetingInterruptible="none"');
    expect(xml).toContain('interruptible="any"');
    expect(vacRow().status).toBe('in_progress');
  });
});

describe('veredicto de máquina o fax → cuelga y cierra sin cobrar conversación', () => {
  test.each([
    ['machine_start', 'voicemail', 'buzon', 'machine'],
    ['machine_end_beep', 'voicemail', 'buzon', 'machine'],
    ['fax', 'no_answer', 'fax', 'fax'],
  ])('%s DESPUÉS del TwiML: cuelga por la API, fila %s/%s y reserva devuelta', async (veredicto, estado, desenlace, quien) => {
    sembrar();
    await twiml(); // la conversación ya arrancó
    const res = await amd(veredicto);
    expect(res.status).toBe(200);

    expect(colgar).toHaveBeenCalledWith(ORG, 'CA1', expect.anything());
    expect(vacRow()).toMatchObject({ status: estado, outcome: desenlace, credits_reserved: 0, locked_by: null });
    expect(vacRow().credits_settled_at).toEqual(expect.any(String));
    expect(vacRow().completed_at).toEqual(expect.any(String));
    expect(reembolsos()).toEqual([{ name: 'deduct_comm_credits', args: { p_org_id: ORG, p_channel: 'voice', p_amount: -2 } }]);
    expect(callRow()).toMatchObject({ status: 'voicemail', answered_by: quien });
    expect(callRow().ended_at).toEqual(expect.any(String));
  });

  test('ANTES del TwiML: la 2ª pasada ya no encuentra la fila viva y cuelga sin abrir el ConversationRelay', async () => {
    sembrar();
    await amd('machine_start');
    expect(vacRow().status).toBe('voicemail');

    const xml = await (await twiml()).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('ConversationRelay');
    expect(vacRow()).toMatchObject({ status: 'voicemail', outcome: 'buzon' });
    expect(callRow().answered_at).toBeNull();
  });

  test('el completed posterior del statusCallback no lo convierte en contacto ni devuelve dos veces', async () => {
    sembrar();
    await twiml();
    await amd('fax');
    await status({ CallStatus: 'completed', CallDuration: '9' });
    expect(vacRow()).toMatchObject({ status: 'no_answer', outcome: 'fax' });
    expect(callRow()).toMatchObject({ status: 'voicemail', answered_by: 'fax', duration_seconds: 9 });
    expect(reembolsos()).toHaveLength(1);
  });

  test('veredicto repetido (reintento de Twilio): no cuelga ni devuelve otra vez', async () => {
    sembrar();
    await amd('machine_start');
    await amd('machine_start');
    expect(colgar).toHaveBeenCalledTimes(1);
    expect(reembolsos()).toHaveLength(1);
  });

  test('la llamada ya había terminado (completed antes del veredicto): no cuelga ni reescribe', async () => {
    sembrar({ status: 'completed', outcome: 'completed', completed_at: '2026-10-07T16:25:30Z' });
    await amd('machine_start');
    expect(colgar).not.toHaveBeenCalled();
    expect(vacRow()).toMatchObject({ status: 'completed', outcome: 'completed' });
    expect(reembolsos()).toHaveLength(0);
  });

  test('la reserva ya conciliada por el ws-server: cierra y cuelga, sin devolver nada', async () => {
    sembrar({ credits_settled_at: '2026-10-07T16:25:40Z', credits_reserved: 2 });
    await amd('machine_start');
    expect(vacRow().status).toBe('voicemail');
    expect(colgar).toHaveBeenCalledTimes(1);
    expect(reembolsos()).toHaveLength(0);
  });

  test('si colgar falla en Twilio, la fila queda cerrada igual y responde 200 (sin reintentos inútiles)', async () => {
    sembrar();
    colgar.mockRejectedValueOnce(new Error('Twilio 500'));
    const res = await amd('machine_start');
    expect(res.status).toBe(200);
    expect(vacRow().status).toBe('voicemail');
  });
});

describe('veredicto de persona → no toca nada', () => {
  test.each(['human', 'unknown', ''])('AnsweredBy=%p: no cuelga, no cierra, no devuelve', async (veredicto) => {
    sembrar();
    await twiml();
    const antes = { ...vacRow() };
    const res = await amd(veredicto);
    expect(res.status).toBe(200);
    expect(colgar).not.toHaveBeenCalled();
    expect(vacRow()).toEqual(antes);
    expect(reembolsos()).toHaveLength(0);
  });
});

describe('seguridad de la ruta AMD (fail-closed)', () => {
  test('firma inválida → 401 y no toca la base ni cuelga', async () => {
    sembrar();
    firmaValida = false;
    const res = await amd('machine_start');
    expect(res.status).toBe(401);
    expect(colgar).not.toHaveBeenCalled();
    expect(vacRow().status).toBe('in_progress');
    expect(db.calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  test('AccountSid de otra organización → 403 y no cuelga', async () => {
    sembrar();
    mismaOrg = false;
    const res = await amd('machine_start');
    expect(res.status).toBe(403);
    expect(colgar).not.toHaveBeenCalled();
    expect(vacRow().status).toBe('in_progress');
  });

  test('CallSid distinto al de la fila → se ignora', async () => {
    sembrar();
    const res = await amd('machine_start', { CallSid: 'CA-OTRA' });
    expect(res.status).toBe(200);
    expect(colgar).not.toHaveBeenCalled();
    expect(vacRow().status).toBe('in_progress');
  });

  test('sin callId en la query → 200 sin efecto', async () => {
    sembrar();
    const res = await amd('machine_start', {}, '');
    expect(res.status).toBe(200);
    expect(colgar).not.toHaveBeenCalled();
  });

  test('la ruta es pública en el middleware por el prefijo de webhooks de voz', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync(require.resolve('@/middleware'), 'utf8');
    expect(src).toContain("'/api/voice/'");
    expect(src).toMatch(/\|api\/voice\|/);
  });
});
