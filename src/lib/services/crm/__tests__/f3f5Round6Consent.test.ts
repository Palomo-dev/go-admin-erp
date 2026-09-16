/**
 * F3 ronda 6 · F5 ronda 4 — ZONA DE VOZ: una sola fuente de verdad para
 * «nunca grabar sin acta» y su simétrico «nunca acta sin grabación».
 *
 *  · N-1 [F5] El puente lee `record=` de la MISMA fila `calls` que lee el
 *        whisper. Encender la grabación entre marcar y conectar no produce
 *        `<Dial record=>` con un whisper que responde vacío.
 *  · N-2 [F3] Agente IA: si algo falla DESPUÉS del acta, el acta se retira
 *        (`voidConsentWithoutRecording`) y la respuesta es `<Hangup/>`.
 *  · N-3 `outbound` (idempotencia): la fila manda; con `recording_enabled=false`
 *        no hay `record=` aunque la org tenga la grabación encendida.
 *  · N-4 `manualCallService`: la grabación subida lleva acta por `recordConsent`
 *        con `method='manual'` y la evidencia (usuario, fecha); sin acta no se
 *        guarda la grabación. G.4 recorre TODO `src/`.
 *  · N-5 Rama REST de `outbound`: cerrada con `<Hangup/>` salvo bandera de
 *        entorno; con bandera, `accountSidMatchesOrg` obligatorio.
 *  · (b) `<Start><Recording>` y `<Dial record=>` suscriben `in-progress`;
 *        reconciliación diaria (`runMaintenance`) de llamadas terminadas con
 *        acta y sin grabación → recuperar desde Twilio o retirar el acta.
 *  · (a) `/api/voice/recording` con `completed` SIN acta: la grabación se
 *        registra y queda un acta `unverified_announcement` sin `consent_given`.
 *  · N-6 `inbound`: un reintento tras una caída respeta la fila (`false`).
 *  · N-7 `ai-agent`: callbacks desde `getTwilioWebhookOrigin()`, no de la URL.
 *  · N-9 `agentRuntime` sin fila `comm_settings` → no graba (fallo cerrado).
 *
 * Todo contra los route handlers REALES con firma `X-Twilio-Signature` real.
 * CERO llamadas telefónicas: webhooks entrantes firmados y dobles. Prefijo VOZR6T.
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
const USER = '66666666-6666-4666-8666-666666666666';
const USER_HEX = USER.replace(/-/g, '');
const SECRET = 'f3f5-r6-secret-0123456789abcdef';
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

/** Cliente REST doblado: NUNCA se marca a nadie. `recordings.list` sirve a la reconciliación. */
const recordingsList = jest.fn(async (): Promise<Array<{ sid: string; status: string; uri: string; channels: number; duration: string }>> => []);
const callsCreate = jest.fn(async () => ({ sid: 'CAr6agentleg' }));
const twilioCallsFn = Object.assign(
  jest.fn(() => ({ recordings: { create: jest.fn(async () => ({ sid: 'REviaRest' })) } })),
  { create: (...a: unknown[]) => callsCreate(...(a as [])) }
);
const getTwilioClientForOrg = jest.fn(async () => ({ client: { calls: twilioCallsFn, recordings: { list: recordingsList } } as unknown, creds: {} }));
jest.mock('@/lib/services/crm/voiceContextService', () => {
  const actual = jest.requireActual('@/lib/services/crm/voiceContextService');
  return { ...actual, getTwilioClientForOrg: (...a: unknown[]) => getTwilioClientForOrg(...(a as [])) };
});

import { POST as inboundPOST } from '@/app/api/voice/twiml/inbound/route';
import { POST as outboundPOST } from '@/app/api/voice/twiml/outbound/route';
import { POST as aiAgentTwimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as whisperPOST } from '@/app/api/voice/twiml/consent-whisper/route';
import { POST as recordingPOST } from '@/app/api/voice/recording/route';
import { POST as customerLegPOST } from '@/app/api/voice/twiml/customer-leg/route';
import { POST as agentLegPOST } from '@/app/api/voice/twiml/agent-leg/route';
import { signBridgeToken } from '@/lib/services/crm/bridgeTokens';
import { initiateBridge } from '@/lib/services/crm/mobileBridgeService';
import { createManualCallWithAudio } from '@/lib/services/crm/manualCallService';
import { reconcileConsentsWithoutRecording } from '@/lib/services/crm/consentReconcileService';
import { runMaintenance } from '@/lib/jobs/handlers/maintenance';
import { RECORDING_EVENTS } from '@/lib/services/crm/twimlBuilders';
// N-9 ejerce el módulo REAL (arriba está doblado para las rutas).
const { buildRuntimeConfig: realBuildRuntimeConfig } = jest.requireActual('@/lib/services/crm/voiceAgent/agentRuntime') as typeof import('@/lib/services/crm/voiceAgent/agentRuntime');

/**
 * La firma se calcula sobre `TWILIO_WEBHOOK_BASE_URL` + path (así verifica
 * `verifyTwilioWebhook`, que NO mira el host de la petición). `requestOrigin`
 * permite ENVIAR la petición a otro host con una firma válida (N-7).
 */
function signed(p: string, params: Record<string, string>, token = MASTER_TOKEN, requestOrigin = ORIGIN): Request {
  const url = `${ORIGIN}${p}`;
  const body = new URLSearchParams(params).toString();
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  return new Request(`${requestOrigin}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body,
  });
}

function extractConsentToken(xml: string): string {
  const url = xml.replace(/&amp;/g, '&');
  return decodeURIComponent(/[?&]ct=([^&"<\s]+)/.exec(url)?.[1] ?? '');
}

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000601';
const VAC = 'dddddddd-0000-4000-8000-000000000604';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000603';
const IDENTITY = `client:u_${USER_HEX}_o_${ORG}`;

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

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr6call01', direction: 'outbound', mode: 'browser', status: 'dialing',
  from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: false, metadata: {}, ...patch,
});

const acta = (patch: Row = {}): Row => ({
  id: 'k1', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: new Date().toISOString(), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT, ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  reserveVoiceMinutes.mockResolvedValue(true);
  recordingsList.mockResolvedValue([]);
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

const whisper = (callId: string, callSid = 'CAr6child01') =>
  whisperPOST(signed(`/api/voice/twiml/consent-whisper?callId=${callId}`, { AccountSid: MASTER_SID, CallSid: callSid }));

const outboundBrowser = (callSid: string) =>
  outboundPOST(signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: callSid, From: IDENTITY, To: '+573001112233' }));

const outboundRest = (callSid: string, query = '', sid = MASTER_SID, token = MASTER_TOKEN) =>
  outboundPOST(signed(`/api/voice/twiml/outbound${query}`, { AccountSid: sid, CallSid: callSid, From: '+573001234567', To: '+573001112233' }, token));

const inbound = (query = '', callSid = 'CAr6in01') =>
  inboundPOST(signed(`/api/voice/twiml/inbound${query}`, { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001112233', To: '+18506003708' }));

const aiAgent = (query: string, callSid = 'CAr6agent01', origin = ORIGIN) =>
  aiAgentTwimlPOST(signed(`/api/voice/twiml/ai-agent?agentId=ag-1${query}`, { AccountSid: MASTER_SID, CallSid: callSid }, MASTER_TOKEN, origin));

const customerLeg = (bridgeId: string, digits = '1') =>
  customerLegPOST(signed(`/api/voice/twiml/customer-leg?bridgeId=${bridgeId}&t=${signBridgeToken(bridgeId)}`, { AccountSid: MASTER_SID, CallSid: 'CAr6bridge', Digits: digits }));

const agentLeg = (bridgeId: string) =>
  agentLegPOST(signed(`/api/voice/twiml/agent-leg?bridgeId=${bridgeId}&t=${signBridgeToken(bridgeId)}`, { AccountSid: MASTER_SID, CallSid: 'CAr6agentleg' }));

const recordingCallback = (params: Record<string, string>) => recordingPOST(signed('/api/voice/recording', { AccountSid: MASTER_SID, ...params }));

/** Fuente sin líneas de comentario (se mira el código, no lo que dice de sí mismo). */
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

async function bridgeFromInitiate(settingsPatch: Row = {}): Promise<{ bridgeId: string; callId: string }> {
  fake = seed({
    comm_settings: [commSettings(settingsPatch)],
    user_comm_preferences: [{ id: 'ucp-1', user_id: USER, organization_id: ORG, mobile_phone_e164: '+573999999999', mobile_verified_at: '2026-09-01T10:00:00Z' }],
  });
  const result = await initiateBridge({ organizationId: ORG, userId: USER, supabase: fake.client() }, { to: '+573001112233' });
  // Twilio contestó el leg del vendedor: el bridge ya está en `agent_answered`.
  const bridge = fake.rows('mobile_call_bridges')[0];
  bridge.status = 'agent_answered';
  return { bridgeId: bridge.id as string, callId: result.callId };
}

// ═══════════════════════════════════════════════════════════════════════════
// N-1 · el puente tiene UNA fuente de verdad: la fila `calls`
// ═══════════════════════════════════════════════════════════════════════════

describe('N-1 · bridge: `record=` sale de la fila `calls`, la misma que lee el whisper', () => {
  it('N-1.1 · grabación apagada al marcar y encendida antes de conectar: NO hay record=, el vendedor no oye «se grabará» y el whisper no anuncia ni deja acta', async () => {
    const { bridgeId, callId } = await bridgeFromInitiate({ voice_recording_enabled: false });
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    // La organización enciende la grabación entre marcar y conectar (10–60 s).
    fake.rows('comm_settings')[0].voice_recording_enabled = true;

    const xml = await (await customerLeg(bridgeId)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('consent-whisper');
    expect(xml).not.toContain('se grabará');

    const w = await (await whisper(callId)).text();
    expect(w).not.toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
  });

  it('N-1.2 · grabación encendida al marcar y apagada antes de conectar: la fila manda, hay record= CON whisper y el whisper escribe el acta', async () => {
    const { bridgeId, callId } = await bridgeFromInitiate({ voice_recording_enabled: true });
    fake.rows('comm_settings')[0].voice_recording_enabled = false;

    const xml = await (await customerLeg(bridgeId)).text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain(`consent-whisper?callId=${callId}`);
    expect(xml).toContain('se grabará');

    await whisper(callId);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('N-1.3 · agent-leg sin confirmación por dígito: misma fuente (la fila), mismo resultado', async () => {
    const { bridgeId } = await bridgeFromInitiate({ voice_recording_enabled: false, voice_bridge_confirm_digit: false });
    fake.rows('mobile_call_bridges')[0].status = 'agent_ringing';
    fake.rows('comm_settings')[0].voice_recording_enabled = true;
    const xml = await (await agentLeg(bridgeId)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('consent-whisper');
  });

  it('N-1.4 · si la fila `calls` no se puede leer, el puente conecta SIN grabar (fallo cerrado)', async () => {
    const { bridgeId } = await bridgeFromInitiate({ voice_recording_enabled: true });
    fake.failOn['calls:select'] = 'VOZR6T caída simulada';
    const xml = await (await customerLeg(bridgeId)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
  });

  it('N-1.6 · fila `calls` de OTRA organización, o con recording_enabled NULL: no se graba (fallo cerrado, no `!== false`)', async () => {
    const { bridgeId, callId } = await bridgeFromInitiate({ voice_recording_enabled: true });
    fake.rows('calls')[0].recording_enabled = null;
    expect(await (await customerLeg(bridgeId)).text()).not.toContain('record=');
    fake.rows('calls')[0].recording_enabled = true;
    fake.rows('calls')[0].organization_id = 136; // el bridge apunta a una fila ajena
    const xml = await (await customerLeg(bridgeId)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain(`consent-whisper?callId=${callId}`);
  });

  it('N-1.5 · las dos rutas del puente ya no deciden `record=` releyendo comm_settings', () => {
    for (const f of ['src/app/api/voice/twiml/customer-leg/route.ts', 'src/app/api/voice/twiml/agent-leg/route.ts']) {
      const src = stripped(f);
      expect(src).not.toMatch(/settings\.voice_recording_enabled/);
      expect(src).toMatch(/recordingEnabledForCall\(/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-2 · agente IA: nada falla «después del acta» sin que el acta se retire
// ═══════════════════════════════════════════════════════════════════════════

function seedAgent(patch: { vac?: Row; call?: Row | null } = {}) {
  fake = seed({
    voice_agent_calls: [
      { id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', call_id: CALL_ID, provider_call_sid: null, status: 'dialing', started_at: null, consent_given: false, customer_id: null, ...(patch.vac ?? {}) },
    ],
    calls: patch.call === null ? [] : [callRow({ provider_call_sid: 'CAr6agent01', mode: 'ai_agent', ...(patch.call ?? {}) })],
  });
}

describe('N-2 · ai-agent: acta sin grabación determinista', () => {
  beforeEach(() => seedAgent());

  it('N-2.1 · si `voice_agent_calls.update` falla tras el acta: <Hangup/>, acta retirada, fila sin consent_given ni recording_enabled', async () => {
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    fake.failOn['voice_agent_calls:update'] = 'VOZR6T fallo simulado';
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Recording');
    expect(xml).not.toContain('<ConversationRelay');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect((fake.rows('calls')[0].metadata as Row).recording_absent_reason).toBe('ai_agent_twiml_failed_after_consent');
  });

  it('N-2.2 · el camino feliz sigue igual: acta + <Start><Recording> + ConversationRelay', async () => {
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).toMatch(/<Start>\s*<Recording[^>]*channels="dual"/);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-3 · outbound, rama de idempotencia: la fila manda
// ═══════════════════════════════════════════════════════════════════════════

describe('N-3 · outbound: la rama de idempotencia respeta `recording_enabled=false` de la fila', () => {
  it('N-3.1 · fila preexistente con recording_enabled=false y org con grabación encendida: sin record=, sin whisper, sin «se grabará»', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6out01', recording_enabled: false })] });
    const xml = await (await outboundBrowser('CAr6out01')).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('consent-whisper');
    expect(xml).not.toContain('se grabará');
    expect(fake.rows('calls')).toHaveLength(1);
    // Y el whisper (si Twilio lo pidiera igualmente) no anuncia ni deja acta.
    const w = await (await whisper(CALL_ID)).text();
    expect(w).not.toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-4 · manualCallService: la grabación subida lleva acta
// ═══════════════════════════════════════════════════════════════════════════

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

describe('N-4 · manualCallService: acta con method=manual y la evidencia de quién declara', () => {
  const manualDb = () => seed({ opportunities: [{ id: 'opp-1', organization_id: ORG, customer_id: CUSTOMER_ID }] });

  it('N-4.1 · camino feliz: acta `manual` con usuario y fecha en la evidencia; consent_given lo pone recordConsent', async () => {
    fake = manualDb();
    const out = await createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', occurredAt: '2026-09-04T08:00:00Z', maxBytes: 10_000_000 }, fake.client());
    const actas = fake.rows('call_consents');
    expect(actas).toHaveLength(1);
    expect(actas[0]).toMatchObject({ organization_id: ORG, call_id: out.callId, consent_type: 'recording', method: 'manual' });
    expect(String(actas[0].recorded_announcement_text)).toContain(USER);
    expect(String(actas[0].recorded_announcement_text)).toContain('2026-09-04');
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: true, recording_enabled: true });
    expect(fake.rows('call_recordings')).toHaveLength(1);
  });

  it('N-4.2 · sin acta no se guarda la grabación: la llamada se retira, no hay fila call_recordings ni objeto en Storage', async () => {
    fake = manualDb();
    fake.failOn['call_consents:insert'] = 'VOZR6T fallo simulado';
    await expect(createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000 }, fake.client())).rejects.toMatchObject({ status: 500 });
    expect(fake.rows('calls')).toHaveLength(0);
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(fake.storageCalls.some((c) => c.op === 'upload')).toBe(false);
  });

  it('N-4.3 · G.4 en TODO src/: nadie pone `consent_given` en true a mano fuera de consentService (voice_agent_calls aparte)', () => {
    const offenders = walk('src')
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.endsWith('src/lib/services/crm/consentService.ts'))
      .filter((f) => {
        const src = stripped(f);
        // `voice_agent_calls.consent_given` (tabla del agente IA, no `calls`) se
        // marca en `ai-agent/route.ts` DESPUÉS de que recordConsent escribió el acta.
        const withoutVacPatch = src.replace(/patch\.consent_given\s*=\s*true/g, '');
        return /consent_given\s*[:=]\s*true/.test(withoutVacPatch);
      });
    expect(offenders).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-5 · rama REST de outbound: cerrada salvo bandera; con bandera, accountSidMatchesOrg
// ═══════════════════════════════════════════════════════════════════════════

describe('N-5 · outbound REST (From=número): cerrada por defecto', () => {
  it('N-5.1 · sin bandera: <Hangup/>, sin <Dial>, sin aviso, sin acta, la fila no cambia', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6rest01', mode: 'manual' })] });
    const xml = await (await outboundRest('CAr6rest01')).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Dial ');
    expect(xml).not.toContain('<Redirect');
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('N-5.2 · con bandera pero AccountSid ajeno a la org: 403, sin acta', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true';
    const OTHER_SID = 'ACother00000000000000000000000000';
    const OTHER_TOKEN = 'other-auth-token-00000000000000000';
    fake = seed({
      comm_settings: [commSettings(), commSettings({ organization_id: 136, voice_caller_id: '+573009999999', twilio_subaccount_sid: OTHER_SID, twilio_subaccount_auth_token: OTHER_TOKEN })],
      calls: [callRow({ provider_call_sid: 'CAr6rest02', mode: 'manual' })],
    });
    const res = await outboundRest('CAr6rest02', '', OTHER_SID, OTHER_TOKEN);
    expect(res.status).toBe(403);
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('N-5.3 · con bandera y la cuenta de la org: dos pasadas (aviso → acta → record=)', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true';
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6rest03', mode: 'manual' })] });
    const first = await (await outboundRest('CAr6rest03')).text();
    expect(first).toContain('<Redirect');
    expect(first).not.toContain('record=');
    const ct = extractConsentToken(first);
    const xml = await (await outboundRest('CAr6rest03', `?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) · in-progress suscrito + reconciliación de actas sin grabación
// ═══════════════════════════════════════════════════════════════════════════

describe('(b) · in-progress suscrito y reconciliación «nunca acta sin grabación»', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  it('b.1 · RECORDING_EVENTS suscribe in-progress, completed y absent en los tres TwiML que graban', async () => {
    expect(RECORDING_EVENTS.split(' ').sort()).toEqual(['absent', 'completed', 'in-progress']);
    seedAgent();
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toMatch(/<Recording[^>]*recordingStatusCallbackEvent="[^"]*in-progress[^"]*"/);
  });

  it('b.2 · `in-progress` deja `metadata.recording_started_at` en la fila (evidencia de que la grabación arrancó)', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6ip01', consent_given: true })], call_consents: [acta()] });
    const res = await recordingCallback({ CallSid: 'CAr6ip01', RecordingSid: 'REip01', RecordingStatus: 'in-progress' });
    expect(res.status).toBe(200);
    expect((fake.rows('calls')[0].metadata as Row).recording_started_at).toBeTruthy();
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('b.3 · llamada terminada hace > 10 min, con acta y sin grabación, y Twilio no tiene ninguna → acta retirada y flags en false', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr6rec01', status: 'completed', consent_given: true, ended_at: minutesAgo(30) })],
      call_consents: [acta()],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 1, recovered: 0, deferred: 0 });
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: false, recording_enabled: false });
    expect((fake.rows('calls')[0].metadata as Row).recording_absent_reason).toBe('reconcile_no_recording');
  });

  it('b.4 · llamada terminada hace 2 min: todavía no (el callback puede estar en camino)', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr6rec02', status: 'completed', consent_given: true, ended_at: minutesAgo(2) })],
      call_consents: [acta()],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r.candidates).toBe(0);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('b.5 · con fila en call_recordings o en curso (sin ended_at) no se toca nada', async () => {
    const OTHER_CALL = 'aaaaaaaa-0000-4000-8000-000000000699';
    fake = seed({
      calls: [
        callRow({ provider_call_sid: 'CAr6rec03', status: 'completed', consent_given: true, ended_at: minutesAgo(60) }),
        callRow({ id: OTHER_CALL, provider_call_sid: 'CAr6rec04', status: 'in_progress', consent_given: true, ended_at: null }),
      ],
      call_consents: [acta(), acta({ id: 'k2', call_id: OTHER_CALL })],
      call_recordings: [{ id: 'r1', organization_id: ORG, call_id: CALL_ID, provider_recording_sid: 'REok', status: 'ready' }],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r.voided).toBe(0);
    expect(fake.rows('call_consents')).toHaveLength(2);
  });

  it('b.6 · Twilio SÍ tiene la grabación (el callback se perdió): se registra call_recordings, se encola recording_fetch y el acta se conserva', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr6rec05', status: 'completed', consent_given: true, ended_at: minutesAgo(30), started_at: minutesAgo(35) })],
      call_consents: [acta()],
    });
    recordingsList.mockResolvedValueOnce([{ sid: 'RErecovered', status: 'completed', uri: '/2010-04-01/Accounts/AC/Recordings/RErecovered.json', channels: 2, duration: '58' }]);
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 0, recovered: 1 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
    expect(fake.rows('call_recordings')).toHaveLength(1);
    expect(fake.rows('call_recordings')[0]).toMatchObject({ provider_recording_sid: 'RErecovered', status: 'processing', organization_id: ORG, call_id: CALL_ID, channels: '2' });
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recording_fetch', dedupeKey: 'recording_fetch:RErecovered', organizationId: ORG }));
    expect(recordingsList).toHaveBeenCalledWith(expect.objectContaining({ callSid: 'CAr6rec05' }));
  });

  it('b.7 · si Twilio no responde, se difiere (nada se retira) y se cuenta', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr6rec06', status: 'completed', consent_given: true, ended_at: minutesAgo(30) })],
      call_consents: [acta()],
    });
    recordingsList.mockRejectedValueOnce(new Error('VOZR6T twilio caído'));
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 0, recovered: 0, deferred: 1 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('b.8 · runMaintenance (cron diario de F0) ejecuta la reconciliación y la reporta', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr6rec07', status: 'completed', consent_given: true, ended_at: minutesAgo(30) })],
      call_consents: [acta()],
    });
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const result = await runMaintenance(fake.client(), log as never, new AbortController().signal);
    expect(result.consents_reconciled).toMatchObject({ candidates: 1, voided: 1 });
    expect(fake.rows('call_consents')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) · /api/voice/recording: `completed` SIN acta
// ═══════════════════════════════════════════════════════════════════════════

describe('(a) · recording completed sin acta: se registra y queda dicho que el aviso no se pudo acreditar', () => {
  const completed = (callSid: string, sid = 'REr6done') =>
    recordingCallback({ CallSid: callSid, RecordingSid: sid, RecordingStatus: 'completed', RecordingUrl: `https://api.twilio.com/rec/${sid}`, RecordingChannels: '2', RecordingDuration: '40' });

  it('a.1 · sin acta: call_recordings + job, acta `unverified_announcement`, consent_given sigue en false y metadata lo dice', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6done01', started_at: new Date().toISOString() })] });
    const res = await completed('CAr6done01');
    expect(res.status).toBe(200);
    expect(fake.rows('call_recordings')).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const actas = fake.rows('call_consents');
    expect(actas).toHaveLength(1);
    expect(actas[0]).toMatchObject({ call_id: CALL_ID, consent_type: 'recording', method: 'unverified_announcement' });
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect((fake.rows('calls')[0].metadata as Row).consent_unverified_reason).toBe('recording_completed_without_consent');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('sin acta'), expect.anything());
  });

  it('a.2 · con acta previa: no se toca el acta ni consent_given (camino normal)', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6done02', consent_given: true, started_at: new Date().toISOString() })], call_consents: [acta()] });
    await completed('CAr6done02');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].method).toBe('voice_announcement');
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('a.3 · el reintento de Twilio del mismo `completed` sin acta no duplica el acta', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr6done03', started_at: new Date().toISOString() })] });
    await completed('CAr6done03');
    await completed('CAr6done03');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_recordings')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-6 · inbound: coherencia fila ↔ TwiML en el reintento
// ═══════════════════════════════════════════════════════════════════════════

describe('N-6 · inbound: tras una caída a recording_enabled=false, el reintento del mismo token no graba', () => {
  it('N-6.1 · 2ª pasada falla → fila false; Twilio reintenta con la BD recuperada → sin record=, sin acta, fila sigue en false', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    fake.failOn['call_consents:insert'] = 'VOZR6T caída simulada';
    const down = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(down).not.toContain('record=');
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    delete fake.failOn['call_consents:insert'];
    const retry = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(retry).toContain('<Dial ');
    expect(retry).not.toContain('record=');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-7 · ai-agent: origen de los callbacks
// ═══════════════════════════════════════════════════════════════════════════

describe('N-7 · ai-agent saca el origen de los callbacks de getTwilioWebhookOrigin(), no de request.url', () => {
  it('N-7.1 · petición firmada contra otro host: Redirect, Recording callback y Connect action apuntan al origen configurado', async () => {
    seedAgent();
    const OTHER = 'https://otro-host.test';
    const first = await (await aiAgent(`&callId=${VAC}`, 'CAr6agent01', OTHER)).text();
    expect(first).toContain(`<Redirect method="POST">${ORIGIN}/api/voice/twiml/ai-agent?`);
    expect(first).not.toContain(OTHER);
    const ct = extractConsentToken(first);
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`, 'CAr6agent01', OTHER)).text();
    expect(xml).toContain(`recordingStatusCallback="${ORIGIN}/api/voice/recording"`);
    expect(xml).toContain(`<Connect action="${ORIGIN}/api/voice/ai-agent/status?`);
    expect(xml).not.toContain(OTHER);
    expect(stripped('src/app/api/voice/twiml/ai-agent/route.ts')).not.toMatch(/new URL\(request\.url\)\.origin/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// N-9 · agentRuntime: sin fila comm_settings no se graba
// ═══════════════════════════════════════════════════════════════════════════

describe('N-9 · agentRuntime falla cerrado como getTelephonySettings', () => {
  const agentRow = { id: 'ag-9', organization_id: ORG, is_active: true, name: 'VOZR6T', language: 'es', stt_provider: 'deepgram', tts_provider: 'google', voice_id: null, greeting: null, identity_disclosure: null, tools: [], system_prompt: 'x' };

  it('N-9.1 · sin fila comm_settings → recordingEnabled=false', async () => {
    fake = seed({ comm_settings: [], voice_agents: [agentRow], organizations: [{ id: ORG, name: 'Org' }] });
    const cfg = await realBuildRuntimeConfig(fake.client(), { agentId: 'ag-9', callId: null });
    expect(cfg.recordingEnabled).toBe(false);
  });

  it('N-9.2 · sin fila `calls` enlazada → false aunque comm_settings diga true (H-2, ronda 8); con null → false', async () => {
    // Contrato cambiado en la ronda 8: este caso afirmaba `true` con
    // `voice_recording_enabled=true` y `callId: null`, es decir, codificaba
    // como correcto que el prompt hablara de una grabación que la ruta
    // `twiml/ai-agent` NO arranca sin fila enlazada (V-2). La única fuente de
    // verdad es `calls.recording_enabled`; sin fila, fallo cerrado.
    fake = seed({ comm_settings: [commSettings({ voice_recording_enabled: true })], voice_agents: [agentRow], organizations: [{ id: ORG, name: 'Org' }] });
    expect((await realBuildRuntimeConfig(fake.client(), { agentId: 'ag-9', callId: null })).recordingEnabled).toBe(false);
    fake = seed({ comm_settings: [commSettings({ voice_recording_enabled: null })], voice_agents: [agentRow], organizations: [{ id: ORG, name: 'Org' }] });
    expect((await realBuildRuntimeConfig(fake.client(), { agentId: 'ag-9', callId: null })).recordingEnabled).toBe(false);
  });
});
