/**
 * F3 ronda 6 · F5 ronda 4 — TESTER de la zona de voz (prefijo VOZR6T).
 *
 * Ataca los dos invariantes («nunca grabar sin acta» / «nunca acta sin
 * grabación») por los caminos que la ronda 6 abrió o tocó: la reconciliación
 * diaria, el `completed` sin acta, el agente IA como segunda fuente de verdad,
 * el `inbound` en la segunda pasada, la acta `manual` y la bandera REST.
 *
 * Los casos marcados [ROJO ESPERADO] documentaban un hallazgo del tester: la
 * aserción describe el comportamiento correcto, no el que había. Iban con
 * `it.failing`; la ronda 7 (constructor) corrigió los seis (R.1, R.2, R.3, A.1,
 * I.1, M.2) y les quitó el `.failing`: ahora son verdes por derecho propio.
 * Se conserva la etiqueta en el nombre como trazabilidad del hallazgo.
 *
 * Todo contra los route handlers REALES con firma `X-Twilio-Signature` real.
 * CERO llamadas telefónicas: webhooks entrantes firmados y dobles.
 */
import fs from 'fs';
import path from 'path';
import Twilio from 'twilio';
import { FakeDb, type Row } from './fixtures/fakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));

const ORIGIN = 'https://webhooks.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-auth-token-0000000000000000';

const ORG = 135;
const ORG_B = 136;
const USER = '66666666-6666-4666-8666-666666666666';
const SECRET = 'f3f5-r6-tester-secret-0123456789ab';
const CONSENT_TEXT = 'VOZR6T Esta llamada será grabada y monitoreada.';

let fake: FakeDb;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => fake.client()),
  assertServerOnly: jest.fn(),
}));

const reserveVoiceMinutes = jest.fn(async () => true);
const refundVoiceMinutes = jest.fn(async () => true);
const settleVoiceCall = jest.fn(async () => null);
jest.mock('@/lib/services/crm/callCreditsService', () => ({
  reserveVoiceMinutes: (...a: unknown[]) => reserveVoiceMinutes(...(a as [])),
  refundVoiceMinutes: (...a: unknown[]) => refundVoiceMinutes(...(a as [])),
  settleVoiceCall: (...a: unknown[]) => settleVoiceCall(...(a as [])),
}));

const enqueueJob = jest.fn(async () => ({ id: 'job-1' }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...(a as [])) }));

const resolveInboundTargets = jest.fn(async () => ({
  organizationId: ORG,
  userIds: [USER],
  identities: [`u_${USER}_o_${ORG}`],
  phoneNumberId: null,
}));
jest.mock('@/lib/services/crm/phoneNumberService', () => ({
  resolveInboundTargets: (...a: unknown[]) => resolveInboundTargets(...(a as [])),
}));

const buildRuntimeConfig = jest.fn(async () => ({
  orgId: ORG,
  recordingEnabled: true,
  consentMessage: CONSENT_TEXT,
  greeting: 'Hola, soy el asistente.',
  consent: null,
  voice: { ttsProvider: 'Google', voice: 'es-US-Neural2-A' },
  agent: { language: 'es', stt_provider: 'deepgram' },
}));
class AgentRuntimeError extends Error {
  reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  buildRuntimeConfig: (...a: unknown[]) => buildRuntimeConfig(...(a as [])),
  AgentRuntimeError,
  twilioLanguage: () => 'es-MX',
}));

const recordingsList = jest.fn(async (): Promise<Array<{ sid: string; status: string; uri: string; channels: number; duration: string }>> => []);
const getTwilioClientForOrg = jest.fn(async () => ({ client: { recordings: { list: recordingsList } } as unknown, creds: {} }));
jest.mock('@/lib/services/crm/voiceContextService', () => {
  const actual = jest.requireActual('@/lib/services/crm/voiceContextService');
  return { ...actual, getTwilioClientForOrg: (...a: unknown[]) => getTwilioClientForOrg(...(a as [])) };
});

import { POST as inboundPOST } from '@/app/api/voice/twiml/inbound/route';
import { POST as outboundPOST } from '@/app/api/voice/twiml/outbound/route';
import { POST as aiAgentTwimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as recordingPOST } from '@/app/api/voice/recording/route';
import { createManualCallWithAudio } from '@/lib/services/crm/manualCallService';
import { reconcileConsentsWithoutRecording } from '@/lib/services/crm/consentReconcileService';
import { VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';

function signed(p: string, params: Record<string, string>, token = MASTER_TOKEN): Request {
  const url = `${ORIGIN}${p}`;
  const body = new URLSearchParams(params).toString();
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body,
  });
}

function extractConsentToken(xml: string): string {
  const url = xml.replace(/&amp;/g, '&');
  return decodeURIComponent(/[?&]ct=([^&"<\s]+)/.exec(url)?.[1] ?? '');
}

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000701';
const CALL_B = 'bbbbbbbb-0000-4000-8000-000000000702';
const VAC = 'dddddddd-0000-4000-8000-000000000704';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000703';

function commSettings(patch: Row = {}): Row {
  return {
    organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT,
    voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null, voice_bridge_confirm_digit: true,
    voice_bridge_agent_timeout: 25, voice_mobile_ivr_enabled: false, is_active: true, ...patch,
  };
}

function seed(extra: Record<string, Row[]> = {}): FakeDb {
  return new FakeDb({
    unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] },
    tables: {
      comm_settings: [commSettings()],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: CUSTOMER_ID, organization_id: ORG, phone: '+573001112233', first_name: 'VOZR6T', last_name: 'Prueba' }],
      opportunities: [],
      phone_numbers: [],
      calls: [],
      call_consents: [],
      call_recordings: [],
      voice_agent_calls: [],
      mobile_call_bridges: [],
      user_comm_preferences: [],
      outbound_jobs: [],
      crm_events: [],
      activities: [],
      ...extra,
    },
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr6tcall01', direction: 'outbound', mode: 'browser', status: 'completed',
  from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: true, started_at: minutesAgo(35), ended_at: minutesAgo(30), metadata: {}, ...patch,
});

const acta = (patch: Row = {}): Row => ({
  id: 'k1', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: minutesAgo(34), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT, ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  reserveVoiceMinutes.mockResolvedValue(true);
  recordingsList.mockResolvedValue([]);
  getTwilioClientForOrg.mockResolvedValue({ client: { recordings: { list: recordingsList } } as unknown, creds: {} });
  process.env.TWILIO_WEBHOOK_BASE_URL = ORIGIN;
  process.env.TWILIO_MASTER_ACCOUNT_SID = MASTER_SID;
  process.env.TWILIO_MASTER_AUTH_TOKEN = MASTER_TOKEN;
  process.env.VOICE_CALLBACK_SECRET = SECRET;
  process.env.WS_SESSION_SECRET = 'ws-secret-for-tests-0123456789abcdef0123456789abcdef';
  process.env.WS_SERVER_URL = 'wss://ws.test';
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.VOICE_ALLOW_PLATFORM_CALLER_ID;
  delete process.env.VOICE_LEGACY_REST_OUTBOUND;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const inbound = (query = '', callSid = 'CAr6tin01') =>
  inboundPOST(signed(`/api/voice/twiml/inbound${query}`, { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001112233', To: '+18506003708' }));

const outboundRest = (callSid: string) =>
  outboundPOST(signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001234567', To: '+573001112233' }));

const aiAgent = (query: string, callSid = 'CAr6tagent01') =>
  aiAgentTwimlPOST(signed(`/api/voice/twiml/ai-agent?agentId=ag-1${query}`, { AccountSid: MASTER_SID, CallSid: callSid }));

const recordingCallback = (params: Record<string, string>) => recordingPOST(signed('/api/voice/recording', { AccountSid: MASTER_SID, ...params }));

const completed = (callSid: string, sid = 'REr6tdone') =>
  recordingCallback({ CallSid: callSid, RecordingSid: sid, RecordingStatus: 'completed', RecordingUrl: `https://api.twilio.com/rec/${sid}`, RecordingChannels: '2', RecordingDuration: '40' });

function seedAgent(callPatch: Row = {}) {
  fake = seed({
    voice_agent_calls: [
      { id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', call_id: CALL_ID, provider_call_sid: null, status: 'dialing', started_at: null, consent_given: false, customer_id: null },
    ],
    calls: [callRow({ provider_call_sid: 'CAr6tagent01', mode: 'ai_agent', status: 'dialing', consent_given: false, ended_at: null, ...callPatch })],
  });
}

const WAV = (() => {
  const b = Buffer.alloc(44 + 16000);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + 16000, 4);
  b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(16000, 40);
  return b;
})();

// ═══════════════════════════════════════════════════════════════════════════
// R · Reconciliación: ¿puede retirar un acta legítima?
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-R · reconciliación: un acta legítima no se retira por un estado transitorio', () => {
  it('R.1 [ROJO ESPERADO] · Twilio devuelve la grabación en `processing` (aún no terminada): se difiere, NO se retira el acta', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([{ sid: 'REprocessing', status: 'processing', uri: '/2010-04-01/Accounts/AC/Recordings/REprocessing.json', channels: 2, duration: '0' }]);
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: true, recording_enabled: true });
  });

  it('R.2 [ROJO ESPERADO] · sin credenciales REST (VoiceNotConfiguredError) no se puede verificar: se difiere, NO se retira el acta', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    getTwilioClientForOrg.mockRejectedValueOnce(new VoiceNotConfiguredError('VOZR6T sin credenciales'));
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('R.3 [ROJO ESPERADO] · consecuencia de R.1: si se retira el acta mientras Twilio procesa, el `completed` posterior degrada un aviso REAL a `unverified_announcement`', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([{ sid: 'REtarde', status: 'processing', uri: '/x/REtarde.json', channels: 2, duration: '0' }]);
    await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    // Twilio termina de procesar y manda el `completed` (firmado) de la misma grabación.
    const res = await completed('CAr6tcall01', 'REtarde');
    expect(res.status).toBe(200);
    expect(fake.rows('call_recordings')).toHaveLength(1);
    // Correcto: el aviso sonó y el acta original debe seguir siendo la acreditada.
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].method).toBe('voice_announcement');
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('R.4 · aislamiento: el candidato de la org B se retira sin tocar actas ni grabaciones de la org A', async () => {
    fake = seed({
      comm_settings: [commSettings(), commSettings({ organization_id: ORG_B })],
      calls: [
        callRow({ provider_call_sid: 'CAr6tA' }),
        callRow({ id: CALL_B, organization_id: ORG_B, provider_call_sid: 'CAr6tB' }),
      ],
      call_consents: [acta(), acta({ id: 'k2', organization_id: ORG_B, call_id: CALL_B })],
      call_recordings: [{ id: 'r1', organization_id: ORG, call_id: CALL_ID, provider_recording_sid: 'REa', status: 'ready' }],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 1 });
    expect(fake.rows('call_consents').map((c) => c.organization_id)).toEqual([ORG]);
    expect(fake.rows('calls').find((c) => c.id === CALL_ID)).toMatchObject({ consent_given: true, recording_enabled: true });
    expect(fake.rows('calls').find((c) => c.id === CALL_B)).toMatchObject({ consent_given: false, recording_enabled: false });
    expect(fake.rows('call_recordings')).toHaveLength(1);
  });

  it('R.5 · Twilio solo tiene una grabación `absent` de la llamada: nunca existió, se retira (correcto)', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([{ sid: 'REabsent', status: 'absent', uri: '/x/REabsent.json', channels: 2, duration: '0' }]);
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ voided: 1, recovered: 0 });
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('R.6 · señal abortada antes de empezar: no se pregunta a Twilio ni se toca nada', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    const ac = new AbortController();
    ac.abort();
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date(), signal: ac.signal });
    expect(r).toMatchObject({ candidates: 1, voided: 0, recovered: 0, deferred: 0 });
    expect(recordingsList).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('R.7 · llamada con acta y sin `provider_call_sid` (no hay a quién preguntar): se retira sin consultar a Twilio', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: null })], call_consents: [acta()] });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ voided: 1 });
    expect(getTwilioClientForOrg).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A · Agente IA: ¿la fila `calls` manda también aquí? (gemelo de N-1)
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-A · ai-agent y la fila `calls.recording_enabled`', () => {
  it('A.1 [ROJO ESPERADO] · fila `calls` con recording_enabled=false (fijada al marcar) y org con grabación encendida al contestar: el agente NO debe grabar (una sola fuente de verdad, como el puente)', async () => {
    seedAgent({ recording_enabled: false });
    const first = await (await aiAgent(`&callId=${VAC}`)).text();
    const ct = extractConsentToken(first);
    const xml = ct ? await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text() : first;
    expect(xml).toContain('<ConversationRelay');
    expect(xml).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
  });

  it('A.2 · el camino normal (fila true, org true) sigue igual: aviso, acta, <Start><Recording>', async () => {
    seedAgent();
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toMatch(/<Start>\s*<Recording/);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: true, consent_given: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I · inbound, segunda pasada: acta escrita y luego <Hangup/> por falta de agentes
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-I · inbound: acta determinista sin grabación (gemelo de N-2)', () => {
  it('I.1 [ROJO ESPERADO] · 2ª pasada con token válido y sin agentes conectados: <Hangup/> sin `record=`; el acta no debe quedar (o debe retirarse ahí mismo)', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    resolveInboundTargets.mockResolvedValueOnce({ organizationId: ORG, userIds: [], identities: [], phoneNumberId: null });
    const xml = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('record=');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// M · manualCallService: compensación y honestidad de la evidencia
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-M · manualCallService', () => {
  const manualDb = () => seed({ opportunities: [{ id: 'opp-1', organization_id: ORG, customer_id: CUSTOMER_ID }] });

  it('M.1 · si la subida del audio falla DESPUÉS del acta, la fila `calls` se retira (el acta cae por FK ON DELETE CASCADE, verificado por MCP) y no queda grabación', async () => {
    fake = manualDb();
    fake.failOn['storage:upload'] = 'VOZR6T storage caído';
    await expect(createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000 }, fake.client())).rejects.toMatchObject({ status: 500 });
    expect(fake.rows('calls')).toHaveLength(0);
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(fake.calls.some((c) => c.table === 'calls' && c.op === 'delete')).toBe(true);
  });

  it('M.2 [ROJO ESPERADO] · el acta `manual` no debe atribuir al usuario una declaración que la API nunca le pidió', async () => {
    fake = manualDb();
    await createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000 }, fake.client());
    const text = String(fake.rows('call_consents')[0].recorded_announcement_text);
    // Evidencia honesta: quién, cuándo, origen, y que el sistema no reprodujo aviso.
    expect(text).toContain(USER);
    expect(text).toContain('no reprodujo');
    // Deshonesto: «El usuario declara…» sin un campo de declaración en `ManualCallInput` ni en la ruta.
    expect(text).not.toMatch(/el usuario declara/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-5 · bandera REST: solo el literal 'true' del entorno
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-N5 · VOICE_LEGACY_REST_OUTBOUND', () => {
  it.each(['TRUE', '1', 'yes', ' true'])('N5.1 · con el valor %p la rama REST sigue cerrada (<Hangup/>, sin fila tocada)', async (v) => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = v;
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6trest', status: 'dialing', consent_given: false, ended_at: null })] });
    const xml = await (await outboundRest('CAr6trest')).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Dial');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('N5.2 · la bandera no está definida en `.env.example` como true y solo la leen `outbound` y `voice/call` (F-6, ronda 7)', () => {
    const env = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    expect(env).toMatch(/^VOICE_LEGACY_REST_OUTBOUND=false$/m);
    const readers = walk('src').filter((f) => /VOICE_LEGACY_REST_OUTBOUND/.test(fs.readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/')).sort();
    // Ronda 7 (F-6): `POST /api/voice/call` se cierra con la MISMA bandera
    // (410 sin ella); es la segunda y única otra lectura permitida.
    expect(readers).toEqual(['src/app/api/voice/call/route.ts', 'src/app/api/voice/twiml/outbound/route.ts']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P · mapa estático: quién sigue decidiendo grabación por `comm_settings`
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR6T-P · mapa de lectores de `voice_recording_enabled` que deciden grabación', () => {
  it('P.1 · el mapa es exactamente el esperado (crear la fila) y ninguna ruta del puente ni el whisper aparecen', () => {
    const readers = walk('src')
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('src/components/') && !/telephonySettingsService|voiceContextService|twilioTypes/.test(f))
      .filter((f) => /voice_recording_enabled/.test(stripped(f)))
      .sort();
    expect(readers).toEqual([
      'src/app/api/voice/call/route.ts', // fila `calls` al marcar por REST (rama cerrada por N-5)
      'src/app/api/voice/twiml/inbound/route.ts', // 1ª pasada: crea la fila; con fila, manda la fila (N-6)
      'src/app/api/voice/twiml/outbound/route.ts', // 1ª respuesta: crea la fila; con fila, manda la fila (N-3)
      'src/lib/services/crm/mobileBridgeService.ts', // `initiateBridge`: fija la fila al marcar
      'src/lib/services/crm/voiceAgent/agentRuntime.ts', // solo sin fila `calls` enlazada (prompt); con fila manda `recordingEnabledForCall` (A.1, ronda 7)
      'src/lib/services/crm/voiceAgentService.ts', // fila `calls` al marcar la campaña (`=== true` desde la ronda 7, A.1)
    ]);
  });
});

function stripped(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}
