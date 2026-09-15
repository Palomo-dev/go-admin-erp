/**
 * F3 ronda 7 · F5 ronda 5 — TESTER de la zona de voz (prefijo VOZR7T).
 *
 * Casos hostiles sobre los dos invariantes («nunca grabar sin acta» / «nunca
 * acta sin grabación») que las suites del constructor no recorren:
 *  - F-2 en las cuatro combinaciones `comm_settings` × fila `calls` ×
 *    `voice_agent_calls.call_id` (nulo/enlazado), con el módulo REAL de
 *    `agentRuntime` (no doblado) y la ruta `twiml/ai-agent`.
 *  - Reintentos de Twilio con el mismo `CallSid` en `inbound`, `ai-agent`,
 *    `consent-whisper` y `recording` (`completed` × 2, `absent` tardío).
 *  - Reconciliación: `VoiceNotConfiguredError` en la primera pasada y lista
 *    vacía en la segunda → `voided` (correcto); `processing` que nunca llega y
 *    sale de la ventana de 7 días → queda como acta sin grabación (hallazgo).
 *  - `readRecordingDeclaration` con `'yes'` / `'True'`.
 *
 * Ronda 8 (constructor): F2.6 (H-2) pasa a verde sin `.failing` y C.4 (H-1)
 * cambia de contrato: una llamada diferida sigue siendo candidata fuera de la
 * ventana de 7 días. El resto queda intacto. Cero llamadas reales.
 */
import Twilio from 'twilio';
import { FakeDb, type Row } from './fixtures/fakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));

const ORIGIN = 'https://webhooks.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-auth-token-0000000000000000';

const ORG = 139;
const USER = '99999999-9999-4999-8999-999999999999';
const SECRET = 'f3f5-r7-tester-secret-0123456789ab';
const CONSENT_TEXT = 'VOZR7T Esta llamada será grabada y monitoreada.';

let fake: FakeDb;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => fake.client()),
  assertServerOnly: jest.fn(),
}));

const reserveVoiceMinutes = jest.fn(async () => true);
const refundVoiceMinutes = jest.fn(async () => true);
jest.mock('@/lib/services/crm/callCreditsService', () => ({
  reserveVoiceMinutes: (...a: unknown[]) => reserveVoiceMinutes(...(a as [])),
  refundVoiceMinutes: (...a: unknown[]) => refundVoiceMinutes(...(a as [])),
  settleVoiceCall: jest.fn(async () => null),
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

const recordingsList = jest.fn(async (): Promise<Array<{ sid: string; status: string; uri: string; channels: number; duration: string }>> => []);
const getTwilioClientForOrg = jest.fn(async () => ({ client: { recordings: { list: recordingsList } } as unknown, creds: {} }));
jest.mock('@/lib/services/crm/voiceContextService', () => {
  const actual = jest.requireActual('@/lib/services/crm/voiceContextService');
  return { ...actual, getTwilioClientForOrg: (...a: unknown[]) => getTwilioClientForOrg(...(a as [])) };
});

import { POST as inboundPOST } from '@/app/api/voice/twiml/inbound/route';
import { POST as aiAgentTwimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as whisperPOST } from '@/app/api/voice/twiml/consent-whisper/route';
import { POST as recordingPOST } from '@/app/api/voice/recording/route';
import { buildRuntimeConfig } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { reconcileConsentsWithoutRecording } from '@/lib/services/crm/consentReconcileService';
import { readRecordingDeclaration } from '@/lib/services/crm/manualCallService';
import { VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';

function signed(p: string, params: Record<string, string>, token = MASTER_TOKEN): Request {
  const url = `${ORIGIN}${p}`;
  const body = new URLSearchParams(params).toString();
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body });
}

function extractConsentToken(xml: string): string {
  const url = xml.replace(/&amp;/g, '&');
  return decodeURIComponent(/[?&]ct=([^&"<\s]+)/.exec(url)?.[1] ?? '');
}

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000901';
const VAC = 'dddddddd-0000-4000-8000-000000000904';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000903';

function commSettings(patch: Row = {}): Row {
  return {
    organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT,
    voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null, is_active: true, voice_agent_enabled: true, ...patch,
  };
}

const agentRow = { id: 'ag-7', organization_id: ORG, is_active: true, name: 'VOZR7T', language: 'es', stt_provider: 'deepgram', tts_provider: 'google', voice_id: null, voice_ref_id: null, greeting: null, first_message: null, identity_disclosure: null, allowed_tools: [], system_prompt: 'x', guardrails: {}, llm_model: null, temperature: 0.5, max_turns: 10, max_duration_seconds: 120, purpose_type: 'sell_product', transfer_to_human_rules: null };

function seed(extra: Record<string, Row[]> = {}): FakeDb {
  return new FakeDb({
    unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] },
    tables: {
      comm_settings: [commSettings()],
      organizations: [{ id: ORG, name: 'Org de prueba' }],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: CUSTOMER_ID, organization_id: ORG, phone: '+573001112233', first_name: 'VOZR7T', last_name: 'Prueba' }],
      voice_agents: [agentRow],
      voices: [],
      phone_numbers: [],
      calls: [],
      call_consents: [],
      call_recordings: [],
      voice_agent_calls: [],
      outbound_jobs: [],
      activities: [],
      ...extra,
    },
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr7tcall01', direction: 'outbound', mode: 'browser', status: 'completed',
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
  delete process.env.VOICE_LEGACY_REST_OUTBOUND;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const aiAgent = (query: string, callSid = 'CAr7tagent01') =>
  aiAgentTwimlPOST(signed(`/api/voice/twiml/ai-agent?agentId=ag-7${query}`, { AccountSid: MASTER_SID, CallSid: callSid }));

const inbound = (query = '', callSid = 'CAr7tin01') =>
  inboundPOST(signed(`/api/voice/twiml/inbound${query}`, { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001112233', To: '+18506003708' }));

const whisper = (callId: string) => whisperPOST(signed(`/api/voice/twiml/consent-whisper?callId=${callId}`, { AccountSid: MASTER_SID, CallSid: 'CAr7tw01' }));

const recordingCallback = (params: Record<string, string>) => recordingPOST(signed('/api/voice/recording', { AccountSid: MASTER_SID, ...params }));
const completed = (callSid: string, sid = 'REr7tdone') =>
  recordingCallback({ CallSid: callSid, RecordingSid: sid, RecordingStatus: 'completed', RecordingUrl: `https://api.twilio.com/rec/${sid}`, RecordingChannels: '2', RecordingDuration: '40' });
const absent = (callSid: string, sid = 'REr7tabs') => recordingCallback({ CallSid: callSid, RecordingSid: sid, RecordingStatus: 'absent' });

/** Agente: fila `calls` enlazada (o no) y ajuste de la org. */
function seedAgent(p: { linked: boolean; rowRecording?: boolean | null; orgRecording?: boolean | null }) {
  fake = seed({
    comm_settings: [commSettings({ voice_recording_enabled: p.orgRecording ?? true })],
    voice_agent_calls: [
      { id: VAC, organization_id: ORG, voice_agent_id: 'ag-7', call_id: p.linked ? CALL_ID : null, provider_call_sid: null, status: 'dialing', started_at: null, consent_given: false, customer_id: null, opportunity_id: null, stage_agent_id: null },
    ],
    calls: p.linked ? [callRow({ provider_call_sid: 'CAr7tagent01', mode: 'ai_agent', status: 'dialing', consent_given: false, ended_at: null, recording_enabled: p.rowRecording === undefined ? true : p.rowRecording })] : [],
  });
}

/** Segunda pasada completa del agente (aviso → token → TwiML final). */
async function agentTwoPasses(): Promise<{ first: string; second: string }> {
  const r1 = await aiAgent(`&callId=${VAC}`);
  const first = await r1.text();
  const ct = extractConsentToken(first);
  const r2 = await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`);
  return { first, second: await r2.text() };
}

// ═══════════════════════════════════════════════════════════════════════════
// F-2 · agente IA: cuatro combinaciones con el módulo REAL
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7T-F2 · agente IA: ¿puede decir que graba y no grabar, o grabar y no avisar?', () => {
  it('F2.1 · enlazada + fila true + org true: aviso en su pasada, acta, <Start><Recording>, y el prompt habla de la grabación', async () => {
    seedAgent({ linked: true, rowRecording: true, orgRecording: true });
    const { first, second } = await agentTwoPasses();
    expect(first).toContain(CONSENT_TEXT);
    expect(first).toContain('<Redirect');
    expect(second).toContain('<Start>');
    expect(second).toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-7', callId: VAC });
    expect(cfg.recordingEnabled).toBe(true);
    expect(cfg.systemPrompt).toContain('AVISO DE GRABACIÓN');
  });

  it('F2.2 · enlazada + fila true + org false (apagaron al conectar): manda la fila → graba CON aviso y acta; el prompt coincide', async () => {
    seedAgent({ linked: true, rowRecording: true, orgRecording: false });
    const { first, second } = await agentTwoPasses();
    expect(first).toContain(CONSENT_TEXT);
    expect(second).toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(1);
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-7', callId: VAC });
    expect(cfg.recordingEnabled).toBe(true);
    expect(cfg.systemPrompt).toContain('AVISO DE GRABACIÓN');
  });

  it('F2.3 · enlazada + fila false + org true (encendieron al conectar): sin aviso, sin acta, sin <Recording>, y el prompt NO habla de grabación', async () => {
    seedAgent({ linked: true, rowRecording: false, orgRecording: true });
    const r = await aiAgent(`&callId=${VAC}`);
    const xml = await r.text();
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(xml).not.toContain('<Recording');
    expect(xml).toContain('<Connect');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-7', callId: VAC });
    expect(cfg.recordingEnabled).toBe(false);
    expect(cfg.systemPrompt).not.toContain('AVISO DE GRABACIÓN');
  });

  it('F2.4 · enlazada + fila NULL + org true: fallo cerrado en ruta y prompt', async () => {
    seedAgent({ linked: true, rowRecording: null, orgRecording: true });
    const xml = await (await aiAgent(`&callId=${VAC}`)).text();
    expect(xml).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-7', callId: VAC });
    expect(cfg.recordingEnabled).toBe(false);
  });

  it('F2.5 · SIN fila `calls` enlazada + org true: la ruta no graba ni escribe acta (V-2)', async () => {
    seedAgent({ linked: false, orgRecording: true });
    const xml = await (await aiAgent(`&callId=${VAC}`)).text();
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(xml).not.toContain('<Recording');
    expect(xml).toContain('<Connect');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('F2.6 · SIN fila `calls` enlazada + org true: el prompt NO le dice al agente que la llamada se está grabando (la ruta no graba)', async () => {
    seedAgent({ linked: false, orgRecording: true });
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-7', callId: VAC });
    // H-2 (ronda 8): antes `recordingEnabled=true` por el fallback a
    // comm_settings y el prompt decía «confirmas que la llamada se está
    // grabando» en una llamada que NO se graba. Ahora: fallo cerrado.
    expect(cfg.recordingEnabled).toBe(false);
    expect(cfg.systemPrompt).not.toContain('AVISO DE GRABACIÓN');
  });

  it('F2.7 · reintento de Twilio de la 2ª pasada (mismo CallSid y token): una sola acta, mismo TwiML con <Recording>', async () => {
    seedAgent({ linked: true, rowRecording: true, orgRecording: true });
    const r1 = await aiAgent(`&callId=${VAC}`);
    const ct = extractConsentToken(await r1.text());
    const a = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    const b = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(a).toContain('<Recording');
    expect(b).toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('F2.8 · el acta falla en la 2ª pasada: <Connect> sin <Recording>, fila en false; el reintento tampoco graba (la fila manda)', async () => {
    seedAgent({ linked: true, rowRecording: true, orgRecording: true });
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    fake.failOn['call_consents:insert'] = 'boom';
    const a = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(a).toContain('<Connect');
    expect(a).not.toContain('<Recording');
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    delete fake.failOn['call_consents:insert'];
    const b = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(b).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reintentos y callbacks tardíos
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7T-R · reintentos del mismo CallSid y callbacks tardíos', () => {
  it('R.1 · inbound: 2ª pasada dos veces con el mismo token → una acta, dos <Dial record=>', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    const a = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    const b = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(a).toMatch(/<Dial[^>]*record="record-from-answer-dual"/);
    expect(b).toMatch(/<Dial[^>]*record="record-from-answer-dual"/);
    expect(fake.rows('calls')).toHaveLength(1);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('R.2 · inbound: los agentes se desconectan entre el aviso y la 2ª pasada → <Hangup/> sin record= y SIN acta; y si vuelven en un reintento, acta + record= (coherente)', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    resolveInboundTargets.mockResolvedValueOnce({ organizationId: ORG, userIds: [], identities: [], phoneNumberId: null });
    const a = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(a).toContain('<Hangup/>');
    expect(a).not.toContain('record=');
    expect(fake.rows('call_consents')).toHaveLength(0);
    const b = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(b).toMatch(/record="record-from-answer-dual"/);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('R.3 · consent-whisper: dos veces → una acta con el MISMO announced_at; con la fila en false responde vacío sin acta', async () => {
    fake = seed({ calls: [callRow({ status: 'in_progress', consent_given: false, ended_at: null })] });
    const a = await (await whisper(CALL_ID)).text();
    const first = fake.rows('call_consents')[0].announced_at;
    await new Promise((r) => setTimeout(r, 5));
    const b = await (await whisper(CALL_ID)).text();
    expect(a).toContain(CONSENT_TEXT);
    expect(b).toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].announced_at).toBe(first);

    fake = seed({ calls: [callRow({ status: 'in_progress', consent_given: false, ended_at: null, recording_enabled: false })] });
    const c = await (await whisper(CALL_ID)).text();
    expect(c).not.toContain('<Say');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('R.4 · consent-whisper: el acta falla → <Hangup/> (no entra el cliente a un <Dial record=>)', async () => {
    fake = seed({ calls: [callRow({ status: 'in_progress', consent_given: false, ended_at: null })] });
    fake.failOn['call_consents:insert'] = 'boom';
    const xml = await (await whisper(CALL_ID)).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('R.5 · recording: `completed` dos veces → una grabación, dos encolados con el mismo dedupe; `absent` TARDÍO tras `completed` no retira el acta', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    await completed('CAr7tcall01');
    await completed('CAr7tcall01');
    expect(fake.rows('call_recordings')).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(new Set(enqueueJob.mock.calls.map((c) => (c as unknown as [{ dedupeKey: string }])[0].dedupeKey)).size).toBe(1);
    await absent('CAr7tcall01', 'REotra');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].recording_enabled).toBe(true);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('R.6 · recording: `absent` sin grabación registrada retira acta y flags; `completed` posterior (otra grabación de la misma llamada) deja acta no acreditada, nunca una acreditada', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    await absent('CAr7tcall01');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
    await completed('CAr7tcall01', 'REsegunda');
    expect(fake.rows('call_recordings')).toHaveLength(1);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].method).toBe('unverified_announcement');
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reconciliación: secuencias en varias pasadas
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7T-C · reconciliación en varias pasadas', () => {
  it('C.1 · 1ª pasada sin credenciales → deferred y nada tocado; 2ª pasada con Twilio y lista vacía → voided (evidencia positiva)', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    getTwilioClientForOrg.mockRejectedValueOnce(new VoiceNotConfiguredError('sin credenciales'));
    const r1 = await reconcileConsentsWithoutRecording(fake.client());
    expect(r1).toMatchObject({ candidates: 1, deferred: 1, voided: 0, recovered: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(recordingsList).not.toHaveBeenCalled();
    const r2 = await reconcileConsentsWithoutRecording(fake.client());
    expect(r2).toMatchObject({ candidates: 1, voided: 1, deferred: 0 });
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
    expect(fake.rows('calls')[0].metadata.recording_absent_reason).toBe('reconcile_no_recording');
  });

  it('C.2 · `processing` en la pasada 1 y `completed` en la pasada 2 → deferred y luego recovered con el acta intacta', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([{ sid: 'REproc', status: 'processing', uri: '/rec/REproc.json', channels: 2, duration: '0' }]);
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ deferred: 1, voided: 0 });
    recordingsList.mockResolvedValueOnce([{ sid: 'REproc', status: 'completed', uri: '/rec/REproc.json', channels: 2, duration: '40' }]);
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ recovered: 1, voided: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_recordings')).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'recording_fetch:REproc' }));
  });

  it('C.3 · Twilio con `absent` Y `processing` de la misma llamada: existe una real → deferred (no se retira por la absent)', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([
      { sid: 'REabs', status: 'absent', uri: '/rec/REabs.json', channels: 2, duration: '0' },
      { sid: 'REproc', status: 'processing', uri: '/rec/REproc.json', channels: 2, duration: '0' },
    ]);
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ deferred: 1, voided: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('C.4 · una llamada diferida SIGUE siendo candidata al salir de la ventana de 7 días (H-1, ronda 8): el acta no queda huérfana y se resuelve cuando Twilio responde', async () => {
    // Día 6: sin credenciales → deferred y marca en metadata. Día 8: fuera de
    // la ventana, pero diferida → sigue entrando en la consulta (antes:
    // `candidates: 0` y acta sin grabación permanente).
    fake = seed({ calls: [callRow({ ended_at: daysAgo(6) })], call_consents: [acta()] });
    getTwilioClientForOrg.mockRejectedValueOnce(new VoiceNotConfiguredError('sin credenciales'));
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ candidates: 1, deferred: 1 });
    expect((fake.rows('calls')[0].metadata as Row).consent_reconcile_deferrals).toBe(1);
    fake.rows('calls')[0].ended_at = daysAgo(8);
    getTwilioClientForOrg.mockRejectedValueOnce(new VoiceNotConfiguredError('sin credenciales'));
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ candidates: 1, deferred: 1 });
    expect((fake.rows('calls')[0].metadata as Row).consent_reconcile_deferrals).toBe(2);
    // Mientras no haya evidencia positiva, nada se retira.
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: true, consent_given: true });
    // Día 9: Twilio responde con lista vacía → voided (evidencia positiva).
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ candidates: 1, voided: 1 });
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
  });

  it('C.6 (r8) · la marca de diferimiento se escribe SOLO en la fila diferida: otra llamada de la MISMA org conserva su metadata intacta', async () => {
    const OTHER = 'aaaaaaaa-0000-4000-8000-000000000902';
    fake = seed({
      calls: [callRow({ metadata: { disposition_outcome: 'answered' } }), callRow({ id: OTHER, provider_call_sid: 'CAr7tother', recording_enabled: false, consent_given: false, metadata: { disposition_outcome: 'busy', cost_amount: 3 } })],
      call_consents: [acta()],
    });
    getTwilioClientForOrg.mockRejectedValueOnce(new VoiceNotConfiguredError('sin credenciales'));
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ candidates: 1, deferred: 1 });
    const mine = fake.rows('calls').find((c) => c.id === CALL_ID)!.metadata as Row;
    const other = fake.rows('calls').find((c) => c.id === OTHER)!.metadata as Row;
    expect(mine.consent_reconcile_deferrals).toBe(1);
    expect(mine.disposition_outcome).toBe('answered');
    expect(other).toEqual({ disposition_outcome: 'busy', cost_amount: 3 });
  });

  it('C.7 (r8) · con el lote lleno, las diferidas fuera de ventana van ANTES que las frescas (no las expulsa el lote)', async () => {
    const FRESH = 'aaaaaaaa-0000-4000-8000-000000000903';
    fake = seed({
      calls: [
        callRow({ ended_at: daysAgo(9), metadata: { consent_reconcile_deferred_at: daysAgo(1), consent_reconcile_deferrals: 3 } }),
        callRow({ id: FRESH, provider_call_sid: 'CAr7tfresh', ended_at: minutesAgo(30) }),
      ],
      call_consents: [acta(), acta({ id: 'k2', call_id: FRESH })],
    });
    // Twilio responde vacío para la diferida → voided; con batch 1 solo cabe una.
    expect(await reconcileConsentsWithoutRecording(fake.client(), { batch: 1 })).toMatchObject({ candidates: 1, voided: 1 });
    expect(fake.rows('calls').find((c) => c.id === CALL_ID)).toMatchObject({ recording_enabled: false, consent_given: false });
    expect(fake.rows('calls').find((c) => c.id === FRESH)).toMatchObject({ recording_enabled: true, consent_given: true });
  });

  it('C.5 · llamada terminada con acta pero `recording_enabled=false` (acta retirada a medias) no es candidata', async () => {
    fake = seed({ calls: [callRow({ recording_enabled: false })], call_consents: [acta()] });
    expect(await reconcileConsentsWithoutRecording(fake.client())).toMatchObject({ candidates: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-5 · declaración
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7T-D · readRecordingDeclaration', () => {
  const form = (v?: string) => {
    const f = new FormData();
    if (v !== undefined) f.set('recording_declaration', v);
    return f;
  };
  it('D.1 · `yes`, `si`, `checked`, `TRUEISH` no cuentan; `True`/`ON` sí (normaliza mayúsculas)', () => {
    expect(readRecordingDeclaration(form('yes'))).toBe(false);
    expect(readRecordingDeclaration(form('si'))).toBe(false);
    expect(readRecordingDeclaration(form('checked'))).toBe(false);
    expect(readRecordingDeclaration(form('trueish'))).toBe(false);
    expect(readRecordingDeclaration(form('0'))).toBe(false);
    expect(readRecordingDeclaration(form('True'))).toBe(true);
    expect(readRecordingDeclaration(form('ON'))).toBe(true);
    expect(readRecordingDeclaration(form(' true '))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Conducta donde el constructor solo dejó pruebas de cadena (M09, M20, M21)
// ═══════════════════════════════════════════════════════════════════════════

const createManualCallWithAudio = jest.fn(async () => ({ callId: 'call-m', recordingId: 'rec-m', storagePath: 'p', kind: 'wav', durationSeconds: 1, activityId: null }));
jest.mock('@/lib/services/crm/manualCallService', () => {
  const actual = jest.requireActual('@/lib/services/crm/manualCallService');
  return {
    ...actual,
    createManualCallWithAudio: (...a: unknown[]) => createManualCallWithAudio(...(a as [])),
    resolveManualAudioMaxBytes: jest.fn(async () => ({ maxBytes: 25_000_000, source: 'default', reason: null })),
  };
});
class OrgContextError extends Error {
  statusCode = 401;
}
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: USER, role: 'admin' })),
}));
// La ruta importa `callAnalysisService` → `stageGateService` → cliente de
// NAVEGADOR (`@/lib/supabase/config`), que crea el cliente al importar (deuda
// preexistente, ajena a esta ronda). Se doblan las clases de error que usa.
jest.mock('@/lib/services/crm/callAnalysisService', () => ({ AnalysisError: class AnalysisError extends Error {} }));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class TranscriptionError extends Error {} }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueTranscribe: jest.fn(async () => 'job-t'),
  runTranscribePipeline: jest.fn(async () => ({ transcript: { id: 't', status: 'done', provider: 'x', full_text: '', language: 'es', duration_seconds: 1 }, analysis: null })),
}));

import { POST as manualPOST } from '@/app/api/crm/calls/manual/route';
import { POST as transcribePOST } from '@/app/api/crm/transcribe/route';
import { assemble } from '@/lib/services/crm/timeline/assemble';
import type { NextRequest } from 'next/server';

function multipart(fields: Record<string, string>, path = '/api/crm/calls/manual'): NextRequest {
  const f = new FormData();
  f.set('audio', new Blob([new Uint8Array(64)], { type: 'audio/wav' }), 'a.wav');
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const req = new Request(`http://localhost${path}`, { method: 'POST', body: f });
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}

describe('VOZR7T-M · rutas manuales: la casilla se exige de verdad (no solo en el fuente)', () => {
  it('M.1 · /api/crm/calls/manual sin `recording_declaration` → 400 RECORDING_DECLARATION_REQUIRED y NO se crea nada', async () => {
    const res = await manualPOST(multipart({ opportunity_id: 'opp-1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'RECORDING_DECLARATION_REQUIRED' });
    expect(createManualCallWithAudio).not.toHaveBeenCalled();
  });
  it('M.2 · `yes` y `false` tampoco valen; `on` sí y llega al servicio como `recordingDeclaration: true`', async () => {
    expect((await manualPOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'yes' }))).status).toBe(400);
    expect((await manualPOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'false' }))).status).toBe(400);
    expect(createManualCallWithAudio).not.toHaveBeenCalled();
    const ok = await manualPOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'on' }));
    expect(ok.status).toBe(201);
    expect(createManualCallWithAudio).toHaveBeenCalledTimes(1);
    expect((createManualCallWithAudio.mock.calls[0] as unknown as [number, string, { recordingDeclaration: boolean }])[2].recordingDeclaration).toBe(true);
  });
  it('M.3 · /api/crm/transcribe: misma exigencia', async () => {
    const res = await transcribePOST(multipart({ opportunity_id: 'opp-1' }, '/api/crm/transcribe'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'RECORDING_DECLARATION_REQUIRED' });
    expect(createManualCallWithAudio).not.toHaveBeenCalled();
    expect((await transcribePOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'true' }, '/api/crm/transcribe'))).status).toBe(200);
    expect(createManualCallWithAudio).toHaveBeenCalledTimes(1);
  });
});

describe('VOZR7T-B · consent_method por conducta (timeline)', () => {
  // B.1 (isUnverifiedConsent / el componente) NO se puede probar aquí: el jest
  // del repo no compila JSX (tsconfig jsx=preserve, testMatch *.test.ts). Ver M20.
  it('B.2 · el timeline expone `consent_method` de la acta de grabación (y null sin acta)', () => {
    const h = { profiles: new Map(), stages: new Map(), events: new Map(), calls: new Map(), emails: new Map(), vaCalls: new Map(), events_cal: new Map(), notesByActivity: new Map() };
    const row = (call_consents: unknown) => ({ id: 'c1', direction: 'outbound', status: 'completed', mode: 'browser', duration_seconds: 10, from_number: null, to_number: null, recording_enabled: true, cost_amount: null, call_consents, call_recordings: [], call_transcripts: [], call_analyses: [] });
    const e1 = assemble({ kind: 'call', id: 'c1', occurred_at: minutesAgo(1), user_id: null, row: row([{ consent_type: 'marketing', method: 'sms' }, { consent_type: 'recording', method: 'unverified_announcement' }]) }, h) as unknown as { call: { consent_method: string | null } };
    expect(e1.call.consent_method).toBe('unverified_announcement');
    const e2 = assemble({ kind: 'call', id: 'c1', occurred_at: minutesAgo(1), user_id: null, row: row([]) }, h) as unknown as { call: { consent_method: string | null } };
    expect(e2.call.consent_method).toBeNull();
  });
});
