/**
 * F3 ronda 5 · F5 ronda 3 — ZONA DE VOZ: «nunca grabar sin acta», en UN solo sitio.
 *
 * La ronda 4 dejó verificado que `consentService.recordConsent` existía y no lo
 * llamaba nadie, mientras cuatro rutas escribían `call_consents` a mano y
 * divergían (V-1…V-5 del informe). Esta suite fija el contrato nuevo:
 *
 *  · G   GEMELOS: cero escrituras a mano de `call_consents` fuera de
 *        `consentService.ts`. Las rutas que graban importan `recordConsent`.
 *  · V-1 `twiml/outbound`: toda respuesta con `record=` lleva el mecanismo que
 *        escribe el acta (`<Number url=consent-whisper>`), también en la rama de
 *        idempotencia (fila `calls` preexistente). La rama REST (`From`=número,
 *        la pata única ES el cliente) usa las dos pasadas con token, como
 *        `inbound`: sin acta no hay `record=`.
 *  · V-2 `twiml/ai-agent` sin `callId` (o sin fila `calls` enlazada): no hay
 *        dónde colgar el acta → no se graba, el agente atiende igual.
 *  · V-3 `twiml/inbound`: si el acta no se puede escribir, NO hay `record=` y
 *        la fila dice `recording_enabled=false`. Simétrico con `ai-agent`.
 *  · V-4 el saliente por navegador y el bridge ya NO escriben acta al marcar:
 *        una llamada no contestada no deja acta. `announced_at` lo pone quien
 *        sirve el aviso.
 *  · V-5 `consent-whisper` escribe el acta (con `announced_at`) por
 *        `recordConsent`, es idempotente frente a los reintentos de Twilio y
 *        falla cerrado con `<Hangup/>`: si no hay acta, el cliente no entra en
 *        una llamada que se está grabando.
 *  · R   Grabación del agente IA por `<Start><Recording>` (vía documentada por
 *        Twilio para `<Connect><ConversationRelay>`), nunca antes del acta; y
 *        si Twilio reporta la grabación `absent`, no queda ni
 *        `recording_enabled=true` ni acta.
 *
 * Todo ejerce los route handlers REALES con firma `X-Twilio-Signature` real.
 * CERO llamadas telefónicas: solo webhooks entrantes firmados y dobles.
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
const USER = '55555555-5555-4555-8555-555555555555';
const USER_HEX = USER.replace(/-/g, '');
const SECRET = 'f3f5-r5-secret-0123456789abcdef';
const CONSENT_TEXT = 'VOZR5T Esta llamada será grabada y monitoreada.';

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

/** Cliente REST doblado: NUNCA se marca a nadie. */
const recordingsCreate = jest.fn(async () => ({ sid: 'REviaRest' }));
const callsCreate = jest.fn(async () => ({ sid: 'CAr5agentleg' }));
const twilioCallsFn = Object.assign(
  jest.fn(() => ({ recordings: { create: recordingsCreate } })),
  { create: (...a: unknown[]) => callsCreate(...(a as [])) }
);
const getTwilioClientForOrg = jest.fn(async () => ({ client: { calls: twilioCallsFn } as unknown, creds: {} }));
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
import { signBridgeToken, verifyConsentToken } from '@/lib/services/crm/bridgeTokens';
import { initiateBridge } from '@/lib/services/crm/mobileBridgeService';
import { recordConsent, voidConsentWithoutRecording, CONSENT_CONFLICT_TARGET } from '@/lib/services/crm/consentService';
import { buildCustomerLegTwiml } from '@/lib/services/crm/bridgeTwimlBuilders';

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

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000501';
const VAC = 'dddddddd-0000-4000-8000-000000000504';
const BRIDGE_ID = 'bbbbbbbb-0000-4000-8000-000000000502';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000503';
const IDENTITY = `client:u_${USER_HEX}_o_${ORG}`;

function seed(extra: Record<string, Row[]> = {}): FakeDb {
  return new FakeDb({
    // El índice real `call_consents_org_call_type_uidx` (verificado por MCP).
    unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] },
    tables: {
      comm_settings: [
        { organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT, voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null, voice_bridge_confirm_digit: true, voice_bridge_agent_timeout: 25, voice_mobile_ivr_enabled: false },
      ],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: CUSTOMER_ID, organization_id: ORG, phone: '+573001112233', first_name: 'VOZR5T', last_name: 'Prueba' }],
      opportunities: [],
      phone_numbers: [],
      calls: [],
      call_consents: [],
      call_recordings: [],
      voice_agent_calls: [],
      mobile_call_bridges: [],
      user_comm_preferences: [],
      ...extra,
    },
  });
}

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr5call01', direction: 'outbound', mode: 'browser', status: 'dialing',
  from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: false, metadata: {}, ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  reserveVoiceMinutes.mockResolvedValue(true);
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
  // Ronda 6 (N-5): la rama REST de `outbound` está CERRADA salvo bandera. Las
  // pruebas V-1.2…V-1.5 la activan a propósito para ejercer las dos pasadas.
  delete process.env.VOICE_LEGACY_REST_OUTBOUND;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const whisper = (callId: string, callSid = 'CAr5child01') =>
  whisperPOST(signed(`/api/voice/twiml/consent-whisper?callId=${callId}`, { AccountSid: MASTER_SID, CallSid: callSid }));

const outboundBrowser = (callSid: string) =>
  outboundPOST(signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: callSid, From: IDENTITY, To: '+573001112233' }));

const outboundRest = (callSid: string, query = '') =>
  outboundPOST(signed(`/api/voice/twiml/outbound${query}`, { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001234567', To: '+573001112233' }));

const inbound = (query = '', callSid = 'CAr5in01') =>
  inboundPOST(signed(`/api/voice/twiml/inbound${query}`, { AccountSid: MASTER_SID, CallSid: callSid, From: '+573001112233', To: '+18506003708' }));

const aiAgent = (query: string, callSid = 'CAr5agent01') =>
  aiAgentTwimlPOST(signed(`/api/voice/twiml/ai-agent?agentId=ag-1${query}`, { AccountSid: MASTER_SID, CallSid: callSid }));

// ═══════════════════════════════════════════════════════════════════════════
// G · Gemelos: un solo sitio escribe el acta
// ═══════════════════════════════════════════════════════════════════════════

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

const HAND_WRITE = /from\(\s*['"]call_consents['"]\s*\)\s*\.\s*(insert|upsert)\s*\(/;

describe('G · gemelos: cero escrituras a mano de call_consents', () => {
  it('G.1 · en TODO src/ solo consentService.ts escribe call_consents', () => {
    const offenders = walk('src')
      .filter((f) => !f.replace(/\\/g, '/').endsWith('src/lib/services/crm/consentService.ts'))
      .filter((f) => HAND_WRITE.test(stripped(f)))
      .map((f) => f.replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('G.2 · consentService.ts sí escribe, y lo hace con upsert sobre el índice único', () => {
    const src = stripped('src/lib/services/crm/consentService.ts');
    expect(src).toMatch(HAND_WRITE);
    expect(src).toMatch(/onConflict:\s*CONSENT_CONFLICT_TARGET/);
    expect(CONSENT_CONFLICT_TARGET).toBe('organization_id,call_id,consent_type');
  });

  it('G.3 · las cuatro rutas que graban y el whisper pasan por recordConsent', () => {
    for (const f of [
      'src/app/api/voice/twiml/inbound/route.ts',
      'src/app/api/voice/twiml/outbound/route.ts',
      'src/app/api/voice/twiml/ai-agent/route.ts',
      'src/app/api/voice/twiml/consent-whisper/route.ts',
    ]) {
      expect(stripped(f)).toMatch(/recordConsent\(/);
    }
    // El bridge ya no escribe acta: la escribe el whisper cuando el cliente contesta.
    expect(stripped('src/lib/services/crm/mobileBridgeService.ts')).not.toMatch(/call_consents/);
  });

  it('G.4 · ninguna ruta pone `consent_given: true` a mano fuera de consentService (voice_agent_calls aparte)', () => {
    for (const f of [
      'src/app/api/voice/twiml/inbound/route.ts',
      'src/app/api/voice/twiml/outbound/route.ts',
      'src/app/api/voice/twiml/consent-whisper/route.ts',
      'src/lib/services/crm/mobileBridgeService.ts',
    ]) {
      expect(stripped(f)).not.toMatch(/consent_given:\s*true/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V-5 · consent-whisper: acta por recordConsent, idempotente, fail-closed
// ═══════════════════════════════════════════════════════════════════════════

describe('V-5 · consent-whisper escribe el acta cuando sirve el aviso', () => {
  beforeEach(() => {
    fake = seed({ calls: [callRow()] });
  });

  it('V-5.1 · sirve el aviso, escribe UNA acta con announced_at y marca consent_given', async () => {
    const before = Date.now();
    const res = await whisper(CALL_ID);
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain(CONSENT_TEXT);
    const actas = fake.rows('call_consents');
    expect(actas).toHaveLength(1);
    expect(actas[0]).toMatchObject({ organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT });
    // `announced_at` lo pone el servidor en el momento de servir el aviso, no
    // el DEFAULT now() de la columna en el momento de marcar.
    expect(typeof actas[0].announced_at).toBe('string');
    expect(new Date(actas[0].announced_at as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('V-5.2 · un reintento de Twilio no duplica el acta ni mueve su fecha', async () => {
    await whisper(CALL_ID);
    const first = fake.rows('call_consents')[0].announced_at;
    await new Promise((r) => setTimeout(r, 5));
    const res = await whisper(CALL_ID);
    expect(res.status).toBe(200);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].announced_at).toBe(first);
  });

  it('V-5.3 · si el acta NO se puede escribir, el cliente NO entra en la llamada grabada (<Hangup/>)', async () => {
    fake.failOn['call_consents:insert'] = 'VOZR5T fallo simulado';
    const xml = await (await whisper(CALL_ID)).text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('V-5.4 · si la fila NO se graba, el whisper no anuncia ni escribe acta', async () => {
    fake = seed({ calls: [callRow({ recording_enabled: false })] });
    const xml = await (await whisper(CALL_ID)).text();
    expect(xml).not.toContain(CONSENT_TEXT);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V-1 / V-4 · twiml/outbound
// ═══════════════════════════════════════════════════════════════════════════

describe('V-1 · outbound: nunca `record=` sin el mecanismo del acta', () => {
  it('V-1.1 · fila `calls` PREEXISTENTE con grabación (rama de idempotencia): record= ⇒ url=consent-whisper con ESE callId, y el whisper escribe el acta', async () => {
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr5out01', mode: 'browser' })] });
    const xml = await (await outboundBrowser('CAr5out01')).text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toMatch(new RegExp(`<Number[^>]*url="[^"]*consent-whisper\\?callId=${CALL_ID}`));
    expect(fake.rows('calls')).toHaveLength(1); // idempotente: no duplica la fila
    // Hasta aquí NO hay acta (V-4): el cliente todavía no contestó.
    expect(fake.rows('call_consents')).toHaveLength(0);
    // El cliente contesta → Twilio pide el whisper → acta.
    await whisper(CALL_ID);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('V-1.2 · rama REST (From=número, la pata única ES el cliente): 1ª pasada aviso + <Redirect> firmado, sin record= ni acta', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true'; // [CONTRATO r6] rama heredada, solo con bandera
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr5rest01', mode: 'manual' })] });
    const xml = await (await outboundRest('CAr5rest01')).text();
    expect(xml).toContain(CONSENT_TEXT);
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(xml).not.toContain('<Dial ');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(verifyConsentToken('CAr5rest01', extractConsentToken(xml))).toBe(true);
  });

  it('V-1.3 · rama REST, 2ª pasada con el token: acta por recordConsent y AHORA sí record=', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true'; // [CONTRATO r6] rama heredada, solo con bandera
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr5rest02', mode: 'manual' })] });
    const ct = extractConsentToken(await (await outboundRest('CAr5rest02')).text());
    const xml = await (await outboundRest('CAr5rest02', `?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('V-1.4 · rama REST, 2ª pasada con el acta fallando: se conecta SIN grabar y la fila lo dice', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true'; // [CONTRATO r6] rama heredada, solo con bandera
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr5rest03', mode: 'manual' })] });
    const ct = extractConsentToken(await (await outboundRest('CAr5rest03')).text());
    fake.failOn['call_consents:insert'] = 'VOZR5T fallo simulado';
    const xml = await (await outboundRest('CAr5rest03', `?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('consent-whisper');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('V-1.5 · rama REST con `?ct=` inventado: se trata como primera pasada (aviso, sin record=)', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true'; // [CONTRATO r6] rama heredada, solo con bandera
    fake = seed({ calls: [callRow({ provider_call_sid: 'CAr5rest04', mode: 'manual' })] });
    const xml = await (await outboundRest('CAr5rest04', '?ct=1799999999.deadbeefdeadbeefdeadbeefdeadbeef')).text();
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('record=');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });
});

describe('V-4 · el acta no se escribe al marcar', () => {
  it('V-4.1 · saliente por navegador: la primera pasada crea la fila sin acta ni consent_given', async () => {
    const xml = await (await outboundBrowser('CAr5out02')).text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain('consent-whisper');
    expect(fake.rows('calls')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('V-4.2 · bridge móvil: initiateBridge no deja acta (una llamada no contestada no puede tener acta)', async () => {
    fake = seed({
      user_comm_preferences: [{ id: 'ucp-1', user_id: USER, organization_id: ORG, mobile_phone_e164: '+573999999999', mobile_verified_at: '2026-09-01T10:00:00Z' }],
    });
    const result = await initiateBridge({ organizationId: ORG, userId: USER, supabase: fake.client() }, { to: '+573001112233' });
    expect(result.callId).toBeTruthy();
    expect(callsCreate).toHaveBeenCalledTimes(1);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(fake.rows('calls')[0].recording_enabled).toBe(true);
  });

  it('V-4.3 · bridge: el `<Dial>` del cliente solo graba si lleva el whisper (sin callId no hay acta posible → no record=)', () => {
    const base = {
      to: '+573001112233', callerId: '+573001234567', recordingEnabled: true,
      recordingCallbackUrl: `${ORIGIN}/api/voice/recording`, statusCallbackUrl: `${ORIGIN}/api/voice/bridge/status`,
      dialCompleteUrl: `${ORIGIN}/api/voice/dial-complete`,
    };
    const withWhisper = buildCustomerLegTwiml({ ...base, consentUrl: `${ORIGIN}/api/voice/twiml/consent-whisper?callId=${CALL_ID}` });
    expect(withWhisper).toContain('record="record-from-answer-dual"');
    expect(withWhisper).toContain('consent-whisper');
    const without = buildCustomerLegTwiml({ ...base, consentUrl: null });
    expect(without).not.toContain('record=');
    expect(without).not.toContain('recordingStatusCallback');
  });

  it('V-4.4 · customer-leg de un bridge sin `call_id`: se conecta sin grabar y sin prometerle al vendedor que se graba', async () => {
    fake = seed({
      mobile_call_bridges: [{ id: BRIDGE_ID, organization_id: ORG, user_id: USER, customer_id: null, opportunity_id: null, call_id: null, agent_phone: '+573999999999', target_phone: '+573001112233', status: 'agent_answered', confirm_digit_required: true, whisper_text: null }],
    });
    const res = await customerLegPOST(
      signed(`/api/voice/twiml/customer-leg?bridgeId=${BRIDGE_ID}&t=${signBridgeToken(BRIDGE_ID)}`, { AccountSid: MASTER_SID, CallSid: 'CAr5bridge', Digits: '1' })
    );
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain('<Dial ');
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('se grabará');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V-3 · inbound: sin acta no hay record= (simétrico con ai-agent)
// ═══════════════════════════════════════════════════════════════════════════

describe('V-3 · inbound falla cerrado cuando el acta no se puede escribir', () => {
  it('V-3.1 · 2ª pasada con el acta fallando: <Dial> sin record=, fila recording_enabled=false, consent_given=false', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    fake.failOn['call_consents:insert'] = 'VOZR5T fallo simulado';
    const xml = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<Dial ');
    expect(xml).toContain('<Client');
    expect(xml).not.toContain('record=');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('V-3.2 · 2ª pasada normal: acta por recordConsent (con announced_at) y record=', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    const xml = await (await inbound(`?ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(typeof fake.rows('call_consents')[0].announced_at).toBe('string');
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('V-3.3 · un tercer POST con el mismo token (reintento) no duplica el acta', async () => {
    const ct = extractConsentToken(await (await inbound()).text());
    await inbound(`?ct=${encodeURIComponent(ct)}`);
    await inbound(`?ct=${encodeURIComponent(ct)}`);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V-2 / R · agente IA
// ═══════════════════════════════════════════════════════════════════════════

function seedAgent(patch: { vac?: Row; call?: Row | null } = {}) {
  fake = seed({
    voice_agent_calls: [
      { id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', call_id: CALL_ID, provider_call_sid: null, status: 'dialing', started_at: null, consent_given: false, customer_id: null, ...(patch.vac ?? {}) },
    ],
    calls: patch.call === null ? [] : [callRow({ provider_call_sid: 'CAr5agent01', mode: 'ai_agent', ...(patch.call ?? {}) })],
  });
}

describe('V-2 · ai-agent sin dónde colgar el acta no graba', () => {
  it('V-2.1 · sin callId: ni aviso, ni grabación, ni acta; el agente atiende', async () => {
    seedAgent();
    const xml = await (await aiAgent('')).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).not.toContain('<Redirect');
    expect(xml).not.toContain('<Recording');
    expect(recordingsCreate).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('V-2.2 · con callId pero voice_agent_calls.call_id nulo: tampoco', async () => {
    seedAgent({ vac: { call_id: null }, call: null });
    const xml = await (await aiAgent(`&callId=${VAC}`)).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).not.toContain('<Redirect');
    expect(xml).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('voice_agent_calls')[0].consent_given).toBe(false);
  });
});

describe('R · grabación del agente IA por <Start><Recording>, nunca antes del acta', () => {
  beforeEach(() => seedAgent());

  it('R.1 · 1ª pasada: aviso + <Redirect>, sin <Start><Recording>, sin acta', async () => {
    const xml = await (await aiAgent(`&callId=${VAC}`)).text();
    expect(xml).toContain(CONSENT_TEXT);
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('<Start>');
    expect(xml).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('R.2 · 2ª pasada: acta por recordConsent y <Start><Recording channels="dual"> ANTES del <Connect>, sin REST', async () => {
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).toMatch(/<Start>\s*<Recording[^>]*channels="dual"[^>]*\/>\s*<\/Start>/);
    expect(xml).toMatch(/<Recording[^>]*recordingStatusCallback="https:\/\/webhooks\.test\/api\/voice\/recording"/);
    expect(xml).toMatch(/<Recording[^>]*recordingStatusCallbackEvent="[^"]*absent[^"]*"/);
    expect(xml.indexOf('<Start>')).toBeLessThan(xml.indexOf('<Connect'));
    expect(recordingsCreate).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(typeof fake.rows('call_consents')[0].announced_at).toBe('string');
    expect(fake.rows('calls')[0].consent_given).toBe(true);
    expect(fake.rows('voice_agent_calls')[0].consent_given).toBe(true);
  });

  it('R.3 · 2ª pasada con el acta fallando: el agente atiende SIN <Start><Recording> y la fila dice recording_enabled=false', async () => {
    const ct = extractConsentToken(await (await aiAgent(`&callId=${VAC}`)).text());
    fake.failOn['call_consents:insert'] = 'VOZR5T fallo simulado';
    const xml = await (await aiAgent(`&callId=${VAC}&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).not.toContain('<Recording');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(fake.rows('voice_agent_calls')[0].consent_given).toBe(false);
  });

  it('R.4 · el código ya no arranca la grabación por REST (recordings.create) en el TwiML del agente', () => {
    expect(stripped('src/app/api/voice/twiml/ai-agent/route.ts')).not.toMatch(/recordings\s*\.\s*create/);
  });
});

describe('R-abs · si Twilio reporta la grabación `absent`, no queda ni recording_enabled ni acta', () => {
  const absent = (callSid: string) =>
    recordingPOST(signed('/api/voice/recording', { AccountSid: MASTER_SID, CallSid: callSid, RecordingSid: 'REabsent', RecordingStatus: 'absent' }));

  it('R-abs.1 · acta y flags se retiran cuando la llamada no tiene ninguna grabación', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr5abs01', consent_given: true, recording_enabled: true, started_at: new Date().toISOString() })],
      call_consents: [{ id: 'k1', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: new Date().toISOString(), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT }],
    });
    const res = await absent('CAr5abs01');
    expect(res.status).toBe(200);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect((fake.rows('calls')[0].metadata as Row).recording_absent_at).toBeTruthy();
  });

  it('R-abs.2 · con una grabación real ya registrada, un `absent` posterior NO toca el acta', async () => {
    fake = seed({
      calls: [callRow({ provider_call_sid: 'CAr5abs02', consent_given: true, recording_enabled: true, started_at: new Date().toISOString() })],
      call_consents: [{ id: 'k2', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: new Date().toISOString(), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT }],
      call_recordings: [{ id: 'r1', organization_id: ORG, call_id: CALL_ID, provider_recording_sid: 'REok', status: 'ready' }],
    });
    await absent('CAr5abs02');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].recording_enabled).toBe(true);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('R-abs.3 · un firmante ajeno no puede retirar actas de otra organización', async () => {
    const OTHER_SID = 'ACother00000000000000000000000000';
    const OTHER_TOKEN = 'other-auth-token-00000000000000000';
    fake = seed({
      comm_settings: [
        { organization_id: ORG, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT, twilio_subaccount_sid: null },
        { organization_id: 136, voice_caller_id: '+573009999999', voice_recording_enabled: false, twilio_subaccount_sid: OTHER_SID, twilio_subaccount_auth_token: OTHER_TOKEN },
      ],
      calls: [callRow({ provider_call_sid: 'CAr5abs03', consent_given: true, recording_enabled: true })],
      call_consents: [{ id: 'k3', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: new Date().toISOString(), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT }],
    });
    const res = await recordingPOST(
      signed('/api/voice/recording', { AccountSid: OTHER_SID, CallSid: 'CAr5abs03', RecordingSid: 'REabsent', RecordingStatus: 'absent' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// S · consentService: el único escritor
// ═══════════════════════════════════════════════════════════════════════════

describe('S · recordConsent / voidConsentWithoutRecording', () => {
  const params = { callId: CALL_ID, consentType: 'recording', consentGiven: true, consentMessage: CONSENT_TEXT, locale: 'es-MX' };

  it('S.1 · dos llamadas seguidas → una sola acta (índice único), la primera fecha se conserva', async () => {
    fake = seed({ calls: [callRow()] });
    const a = await recordConsent(ORG, params, fake.client());
    await new Promise((r) => setTimeout(r, 5));
    const b = await recordConsent(ORG, params, fake.client());
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(a?.id).toBe(b?.id);
    expect(b?.announced_at).toBe(a?.announced_at);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('S.2 · si la fila `calls` no se puede marcar, recordConsent LANZA (no se traga el error)', async () => {
    fake = seed({ calls: [callRow()] });
    fake.failOn['calls:update'] = 'VOZR5T fallo simulado';
    await expect(recordConsent(ORG, params, fake.client())).rejects.toBeTruthy();
  });

  it('S.3 · una llamada de OTRA organización no se marca aunque el id exista', async () => {
    fake = seed({ calls: [callRow({ organization_id: 136 })] });
    await expect(recordConsent(ORG, params, fake.client())).rejects.toBeTruthy();
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('S.4 · voidConsentWithoutRecording retira el acta y deja la fila honesta, scoped por organización', async () => {
    fake = seed({
      calls: [callRow({ consent_given: true, recording_enabled: true })],
      call_consents: [{ id: 'k9', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: new Date().toISOString(), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT }],
    });
    await voidConsentWithoutRecording(CALL_ID, 136, fake.client(), 'prueba');
    expect(fake.rows('call_consents')).toHaveLength(1);
    await voidConsentWithoutRecording(CALL_ID, ORG, fake.client(), 'prueba');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: false, recording_enabled: false });
  });
});
