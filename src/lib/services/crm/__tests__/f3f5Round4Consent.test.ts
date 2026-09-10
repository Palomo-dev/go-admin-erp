/**
 * F3 ronda 4 · F5 ronda 2 — ZONA DE VOZ (una sola suite, un solo encargo).
 *
 * F3 y F5 comparten rutas y builders, así que sus pruebas viven juntas para que
 * nadie sobrescriba el trabajo del otro. Todo aquí ejerce los **route handlers
 * reales** con firma `X-Twilio-Signature` calculada con el algoritmo real de
 * Twilio y con `voiceContextService` SIN doblar: `accountSidMatchesOrg` es el
 * de producción, no un doble que ignore el `orgId`.
 *
 * Cubre:
 *  · A-1 el acta de grabación ya no la fabrica `?announced=1` (token HMAC).
 *  · A-1b degradación sin `VOICE_CALLBACK_SECRET`: no se graba, nunca se graba
 *    sin acta, y la llamada sigue conectando.
 *  · A-2 el agente IA no marca consentimiento antes de emitir el aviso.
 *  · A-3 `twiml/outbound` usa `accountSidMatchesOrg` (una org SIN subcuenta ya
 *    no acepta cualquier AccountSid resoluble).
 *  · A-4 guardas de F3 que ninguna prueba cubría (`customer-leg`, `outbound`,
 *    `/api/voice/recording`).
 *  · A-5 el saludo no se oye dos veces en el flujo de dos pasadas.
 *  · B-2 token HMAC de `customer-leg` y `agent-leg`, y `accountSidMatchesOrg`
 *    REAL contra la forma real de los datos (0 de 83 orgs con subcuenta).
 *  · B-3 `getVerifiedMobile` scoped, 503 `VOICE_CALLBACK_SECRET_MISSING`, 400
 *    `SAME_NUMBER`.
 *
 * CERO llamadas telefónicas reales: solo webhooks entrantes firmados.
 */
import Twilio from 'twilio';
import { FakeDb, type Row } from './fixtures/fakeSupabase';

// `webhookSignatures` importa svix (solo ESM) para Resend; aquí solo se usa la
// verificación de Twilio, que sí es real. Mismo doble que en f3Round3Routes.
jest.mock('svix', () => ({ Webhook: class {} }));

const ORIGIN = 'https://webhooks.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-auth-token-0000000000000000';
/** Subcuenta de la org 135: firma válida para Twilio, ajena a la org 134. */
const OTHER_SID = 'ACother00000000000000000000000000';
const OTHER_TOKEN = 'other-auth-token-00000000000000000';

const ORG = 134;
const OTHER_ORG = 135;
const USER = '55555555-5555-4555-8555-555555555555';
/** Misma identidad sin guiones: el formato que viaja en `client:u_…_o_…`. */
const USER_HEX = USER.replace(/-/g, '');
const SECRET = 'f3f5-r4-secret-0123456789abcdef';

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
  consentMessage: 'Esta llamada será grabada.',
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

/** Cliente REST de Twilio para arrancar la grabación DESPUÉS del aviso (A-2). */
const recordingsCreate = jest.fn(async (_opts: Record<string, unknown>) => ({ sid: 'REafteranuncio' }));
const twilioCallsFn = jest.fn((_sid: string) => ({ recordings: { create: recordingsCreate } }));
const getTwilioClientForOrg = jest.fn(async () => ({
  client: { calls: twilioCallsFn } as unknown,
  creds: {},
}));
jest.mock('@/lib/services/crm/voiceContextService', () => {
  const actual = jest.requireActual('@/lib/services/crm/voiceContextService');
  return {
    ...actual,
    // Solo se dobla el cliente REST (no se marca a nadie). `accountSidMatchesOrg`,
    // `getTelephonySettings`, `pickCallerId` e `isActiveMember` son los REALES:
    // esa es justamente la barrera que B-2 exige ejercer de verdad.
    getTwilioClientForOrg: (...a: unknown[]) => getTwilioClientForOrg(...(a as [])),
  };
});

import { POST as inboundPOST } from '@/app/api/voice/twiml/inbound/route';
import { POST as outboundPOST } from '@/app/api/voice/twiml/outbound/route';
import { POST as aiAgentTwimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { POST as recordingPOST } from '@/app/api/voice/recording/route';
import { POST as customerLegPOST } from '@/app/api/voice/twiml/customer-leg/route';
import { POST as agentLegPOST } from '@/app/api/voice/twiml/agent-leg/route';
import { signBridgeToken, signConsentToken, verifyConsentToken } from '@/lib/services/crm/bridgeTokens';
import { getVerifiedMobile, initiateBridge, BridgeError } from '@/lib/services/crm/mobileBridgeService';
import { buildInboundTwiml } from '@/lib/services/crm/twimlBuilders';

/** Petición POST form-urlencoded con firma X-Twilio-Signature REAL. */
function signed(path: string, params: Record<string, string>, token = MASTER_TOKEN): Request {
  const url = `${ORIGIN}${path}`;
  const body = new URLSearchParams(params).toString();
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body,
  });
}

/** `ct` del `<Redirect>` (el TwiML escapa los `&` como `&amp;`). */
function extractConsentToken(xml: string): string {
  const url = xml.replace(/&amp;/g, '&');
  return decodeURIComponent(/[?&]ct=([^&"<\s]+)/.exec(url)?.[1] ?? '');
}

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRIDGE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

function seed(overrides: { commSettings?: Row[]; extra?: Record<string, Row[]> } = {}): FakeDb {
  return new FakeDb({
    tables: {
      comm_settings: overrides.commSettings ?? [
        // La org 134 NO tiene subcuenta: la forma REAL de los datos hoy
        // (0 de 83 organizaciones tienen `twilio_subaccount_sid`, MCP 2026-09-10).
        { organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: 'Esta llamada será grabada.', voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null },
        { organization_id: OTHER_ORG, phone_number: null, voice_caller_id: '+573009999999', voice_recording_enabled: false, twilio_subaccount_sid: OTHER_SID, twilio_subaccount_auth_token: OTHER_TOKEN },
      ],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: 'cccccccc-0000-4000-8000-000000000003', organization_id: ORG, phone: '+573001112233', first_name: 'Juan', last_name: 'Pérez' }],
      opportunities: [],
      phone_numbers: [],
      calls: [],
      call_consents: [],
      call_recordings: [],
      voice_agent_calls: [],
      mobile_call_bridges: [],
      user_comm_preferences: [],
      ...(overrides.extra ?? {}),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  reserveVoiceMinutes.mockResolvedValue(true);
  recordingsCreate.mockResolvedValue({ sid: 'REafteranuncio' });
  process.env.TWILIO_WEBHOOK_BASE_URL = ORIGIN;
  process.env.TWILIO_MASTER_ACCOUNT_SID = MASTER_SID;
  process.env.TWILIO_MASTER_AUTH_TOKEN = MASTER_TOKEN;
  process.env.VOICE_CALLBACK_SECRET = SECRET;
  process.env.WS_SESSION_SECRET = 'ws-secret-for-tests';
  process.env.WS_SERVER_URL = 'wss://ws.test';
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.VOICE_ALLOW_PLATFORM_CALLER_ID;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// A-1 · El acta de grabación no se fabrica desde la barra de direcciones
// ═══════════════════════════════════════════════════════════════════════════

const inbound = (query: string, params: Record<string, string> = {}, token = MASTER_TOKEN) =>
  inboundPOST(
    signed(`/api/voice/twiml/inbound${query}`, {
      AccountSid: MASTER_SID, CallSid: 'CAr4inbound01', From: '+573001112233', To: '+18506003708', ...params,
    }, token)
  );

describe('A-1 · el acta de grabación exige un token que acuñó el servidor', () => {
  it('A-1.1 · una pasada DIRECTA a ?announced=1 no graba ni escribe acta', async () => {
    const res = await inbound('?announced=1');
    const xml = await res.text();
    // Sin aviso reproducido no puede haber grabación (regla que no se negocia).
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]?.consent_given).toBe(false);
  });

  it('A-1.2 · un token de consentimiento inventado tampoco vale', async () => {
    const res = await inbound('?ct=1799999999.deadbeefdeadbeefdeadbeefdeadbeef');
    const xml = await res.text();
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('A-1.3 · la PRIMERA pasada emite el aviso, no graba y devuelve un <Redirect> firmado', async () => {
    const res = await inbound('');
    const xml = await res.text();
    expect(xml).toContain('Esta llamada será grabada.');
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(0);
    const ct = decodeURIComponent(/[?&]ct=([^&"<]+)/.exec(xml)?.[1] ?? '');
    expect(ct).not.toBe('');
    expect(verifyConsentToken('CAr4inbound01', ct)).toBe(true);
    // Y el token está LIGADO a ese CallSid: no sirve para otra llamada.
    expect(verifyConsentToken('CAotroCallSid', ct)).toBe(false);
  });

  it('A-1.4 · la SEGUNDA pasada, con el token del servidor, sí graba y sí escribe el acta', async () => {
    const first = await (await inbound('')).text();
    const ct = extractConsentToken(first);
    const res = await inbound(`?ct=${encodeURIComponent(ct)}`);
    const xml = await res.text();
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].recorded_announcement_text).toBe('Esta llamada será grabada.');
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('A-1.6 · A-6 · si la lectura del acta previa falla, NO se inserta otra copia', async () => {
    const first = await (await inbound('')).text();
    const ct = extractConsentToken(first);
    // `call_consents` no tiene UNIQUE (org, call, tipo): la unicidad la sostiene
    // esa lectura. Si el `error` se descarta, un duplicado previo hace que
    // `maybeSingle()` falle, `data` vuelva null y se inserte OTRA copia.
    fake.failOn['call_consents:select'] = 'JSON object requested, multiple rows returned';
    await inbound(`?ct=${encodeURIComponent(ct)}`);
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('A-1.7 · sin CallSid no hay nada a lo que ligar el token: no se graba y NO se entra en bucle', async () => {
    // El token va ligado al CallSid. Sin él, `verifyConsentToken` diría siempre
    // `false` y la segunda pasada repetiría el aviso indefinidamente.
    const res = await inboundPOST(
      signed('/api/voice/twiml/inbound', { AccountSid: MASTER_SID, CallSid: '', From: '+573001112233', To: '+18506003708' })
    );
    const xml = await res.text();
    expect(xml).not.toContain('<Redirect');
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(xml).toContain('<Dial ');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });

  it('A-1.5 · un token caducado no acredita nada (el acta es de un momento, no del día)', () => {
    const past = Date.now() - 20 * 60 * 1000;
    const stale = signConsentToken('CAr4inbound01', past);
    expect(verifyConsentToken('CAr4inbound01', stale)).toBe(false);
  });
});

describe('A-1b · degradación sin VOICE_CALLBACK_SECRET: no se graba, pero se atiende', () => {
  beforeEach(() => {
    delete process.env.VOICE_CALLBACK_SECRET;
  });

  it('A-1b.1 · sin secreto la llamada entra y se conecta al agente', async () => {
    const res = await inbound('');
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain('<Dial ');
    expect(xml).toContain(`<Client`);
  });

  it('A-1b.2 · sin secreto NO se graba y NO se escribe acta (nunca grabar sin acta)', async () => {
    const xml = await (await inbound('')).text();
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(0);
    // La fila refleja lo que de verdad pasó: no se grabó.
    expect(fake.rows('calls')[0].recording_enabled).toBe(false);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('A-1b.3 · sin secreto tampoco cuela `?announced=1`', async () => {
    const xml = await (await inbound('?announced=1')).text();
    expect(xml).not.toContain('record="record-from-answer-dual"');
    expect(fake.rows('call_consents')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A-2 · Agente IA: mismo token, y la grabación no arranca antes del aviso
// ═══════════════════════════════════════════════════════════════════════════

const VAC = 'dddddddd-0000-4000-8000-000000000004';

function seedAgentCall() {
  fake = seed({
    extra: {
      voice_agent_calls: [
        { id: VAC, organization_id: ORG, voice_agent_id: 'ag-1', call_id: CALL_ID, provider_call_sid: null, status: 'dialing', started_at: null, consent_given: false, customer_id: null },
      ],
      calls: [
        { id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr4agent01', direction: 'outbound', mode: 'ai_agent', status: 'dialing', from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: false, metadata: {} },
      ],
    },
  });
}

const aiAgent = (query: string, params: Record<string, string> = {}, token = MASTER_TOKEN) =>
  aiAgentTwimlPOST(
    signed(`/api/voice/twiml/ai-agent?agentId=ag-1&callId=${VAC}${query}`, {
      AccountSid: MASTER_SID, CallSid: 'CAr4agent01', ...params,
    }, token)
  );

describe('A-2 · el agente IA no firma el acta antes de que suene el aviso', () => {
  beforeEach(seedAgentCall);

  it('A-2.1 · la primera pasada emite el aviso y NO marca consentimiento', async () => {
    const xml = await (await aiAgent('')).text();
    expect(xml).toContain('Esta llamada será grabada.');
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(fake.rows('voice_agent_calls')[0].consent_given).toBe(false);
  });

  it('A-2.2 · la primera pasada NO abre todavía el ConversationRelay: primero el aviso', async () => {
    const xml = await (await aiAgent('')).text();
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('<ConversationRelay');
  });

  it('A-2.3 · la segunda pasada, con el token del servidor, sí abre ConversationRelay y sí firma el acta', async () => {
    const first = await (await aiAgent('')).text();
    const ct = extractConsentToken(first);
    expect(verifyConsentToken('CAr4agent01', ct)).toBe(true);
    const xml = await (await aiAgent(`&ct=${encodeURIComponent(ct)}`)).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).toContain('<Parameter name="agentId"');
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });

  it('A-2.4 · la grabación arranca DESPUÉS del aviso, no en el calls.create', async () => {
    // `record: true` en el `calls.create` graba desde que contestan, es decir
    // ANTES del aviso: separar las pasadas arreglaría la fecha del acta pero no
    // la existencia de la grabación. Se mira el CÓDIGO, no los comentarios.
    const src = require('fs').readFileSync('src/lib/services/crm/voiceAgentService.ts', 'utf8') as string;
    const code = src
      .split(/\r?\n/)
      .filter((l: string) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/record:\s*true/);

    const first = await (await aiAgent('')).text();
    const ct = extractConsentToken(first);
    expect(recordingsCreate).not.toHaveBeenCalled();
    await aiAgent(`&ct=${encodeURIComponent(ct)}`);
    expect(recordingsCreate).toHaveBeenCalledTimes(1);
    expect(recordingsCreate.mock.calls[0][0]).toMatchObject({ recordingChannels: 'dual' });
    expect(twilioCallsFn).toHaveBeenCalledWith('CAr4agent01');
  });

  it('A-2.6 · GEMELO · ningún `calls.create` de la zona de voz arranca la grabación antes del aviso', () => {
    // Pasada de gemelos de A-2: `voiceAgentService` no era el único sitio que
    // pedía `record: true` al crear la llamada. `/api/voice/call` hacía lo
    // mismo, y encima duplicaba la grabación que ya pide el `<Dial>` del TwiML.
    const strip = (s: string) =>
      s.split(/\r?\n/).filter((l: string) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    for (const f of [
      'src/lib/services/crm/voiceAgentService.ts',
      'src/app/api/voice/call/route.ts',
    ]) {
      expect(strip(require('fs').readFileSync(f, 'utf8') as string)).not.toMatch(/record:\s*true/);
    }
  });

  it('A-2.5 · sin VOICE_CALLBACK_SECRET el agente atiende pero NO graba', async () => {
    delete process.env.VOICE_CALLBACK_SECRET;
    const xml = await (await aiAgent('')).text();
    expect(xml).toContain('<ConversationRelay');
    expect(recordingsCreate).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A-3 / A-4 · Guardas de F3 que ninguna prueba cubría
// ═══════════════════════════════════════════════════════════════════════════

describe('A-3 · twiml/outbound comprueba el AccountSid como las demás rutas', () => {
  const identity = `client:u_${USER_HEX}_o_${ORG}`;

  it('A-3.1 · subcuenta AJENA + org SIN subcuenta → se rechaza (antes se aceptaba)', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: OTHER_SID, CallSid: 'CAr4out01', From: identity, To: '+573001112233' }, OTHER_TOKEN)
    );
    const xml = await res.text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Dial ');
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('A-3.2 · la cuenta master sí marca (la degradación no rompe el caso normal)', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAr4out02', From: identity, To: '+573001112233' }, MASTER_TOKEN)
    );
    const xml = await res.text();
    expect(xml).toContain('<Dial ');
    expect(fake.rows('calls')).toHaveLength(1);
  });
});

describe('A-4 · guardas de F3 sin cobertura', () => {
  it('A-4.1 · outbound · una identity de otra organización sin membresía activa no marca', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAr4out03', From: `client:u_${USER_HEX}_o_${OTHER_ORG}`, To: '+573001112233' }, MASTER_TOKEN)
    );
    const xml = await res.text();
    expect(xml).toContain('No tiene permisos para llamar desde esta organización.');
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('A-4.2 · /api/voice/recording · firmante ajeno a la org de la llamada → 403 y sin fila', async () => {
    fake = seed({
      extra: {
        calls: [{ id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr4rec01', started_at: new Date().toISOString(), status: 'completed' }],
      },
    });
    const res = await recordingPOST(
      signed('/api/voice/recording', { AccountSid: OTHER_SID, CallSid: 'CAr4rec01', RecordingSid: 'REx', RecordingStatus: 'completed', RecordingUrl: 'https://api.twilio.com/REx', RecordingChannels: '2' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('A-4.3 · /api/voice/recording · el firmante correcto sí registra la grabación', async () => {
    fake = seed({
      extra: {
        calls: [{ id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr4rec01', started_at: new Date().toISOString(), status: 'completed' }],
      },
    });
    const res = await recordingPOST(
      signed('/api/voice/recording', { AccountSid: MASTER_SID, CallSid: 'CAr4rec01', RecordingSid: 'REok', RecordingStatus: 'completed', RecordingUrl: 'https://api.twilio.com/REok', RecordingChannels: '2' }, MASTER_TOKEN)
    );
    expect(res.status).toBe(200);
    expect(fake.rows('call_recordings')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A-5 · El saludo se oye UNA vez, no una por pasada
// ═══════════════════════════════════════════════════════════════════════════

describe('A-5 · el saludo no se emite dos veces en el flujo de dos pasadas', () => {
  const base = {
    origin: ORIGIN,
    callId: CALL_ID,
    from: '+573001112233',
    identities: [`u_${USER}_o_${ORG}`],
    recordingEnabled: true,
    consentMessage: 'Aviso de grabación.',
    ringTimeoutSeconds: 30,
    greeting: 'Bienvenido a GO Admin.',
  };

  it('A-5.1 · pasada 1 (aviso + redirect) lleva el saludo', () => {
    const xml = buildInboundTwiml({ ...base, consentRedirectUrl: `${ORIGIN}/api/voice/twiml/inbound?ct=x` });
    expect(xml.match(/Bienvenido a GO Admin\./g)).toHaveLength(1);
  });

  it('A-5.2 · pasada 2 (el <Dial>) ya NO lo repite', () => {
    const xml = buildInboundTwiml({ ...base, consentRedirectUrl: null, announced: true });
    expect(xml).not.toContain('Bienvenido a GO Admin.');
    expect(xml).toContain('<Dial ');
  });

  it('A-5.3 · sin dos pasadas (sin grabación) el saludo sí se dice una vez', () => {
    const xml = buildInboundTwiml({ ...base, recordingEnabled: false, consentRedirectUrl: null });
    expect(xml.match(/Bienvenido a GO Admin\./g)).toHaveLength(1);
    expect(xml).toContain('<Dial ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-2 · La única barrera real entre organizaciones es el HMAC: pruébalo
// ═══════════════════════════════════════════════════════════════════════════

function seedBridge(patch: Row = {}) {
  fake = seed({
    extra: {
      mobile_call_bridges: [
        { id: BRIDGE_ID, organization_id: ORG, user_id: USER, customer_id: 'cccccccc-0000-4000-8000-000000000003', opportunity_id: null, call_id: CALL_ID, agent_phone: '+573999999999', target_phone: '+573001112233', status: 'agent_answered', confirm_digit_required: true, whisper_text: null, ...patch },
      ],
      calls: [
        { id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr4bridge', direction: 'outbound', mode: 'bridge', status: 'dialing', from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: false, metadata: {} },
      ],
    },
  });
}

const customerLeg = (query: string, params: Record<string, string> = {}, token = MASTER_TOKEN) =>
  customerLegPOST(
    signed(`/api/voice/twiml/customer-leg?${query}`, { AccountSid: MASTER_SID, CallSid: 'CAr4bridge', Digits: '1', ...params }, token)
  );

const agentLeg = (query: string, params: Record<string, string> = {}, token = MASTER_TOKEN) =>
  agentLegPOST(
    signed(`/api/voice/twiml/agent-leg?${query}`, { AccountSid: MASTER_SID, CallSid: 'CAr4bridge', CallStatus: 'in-progress', ...params }, token)
  );

describe('B-2 · token HMAC de customer-leg y agent-leg (la barrera que de verdad aísla)', () => {
  beforeEach(() => seedBridge());

  it('B-2.1 · customer-leg SIN token → 403 y ninguna escritura', async () => {
    const res = await customerLeg(`bridgeId=${BRIDGE_ID}`);
    expect(res.status).toBe(403);
    expect(fake.rows('mobile_call_bridges')[0].status).toBe('agent_answered');
    expect(fake.rows('calls')[0].status).toBe('dialing');
  });

  it('B-2.2 · customer-leg con token de OTRO bridge → 403 (el token liga la URL a su bridge)', async () => {
    const res = await customerLeg(`bridgeId=${BRIDGE_ID}&t=${signBridgeToken('otro-bridge')}`);
    expect(res.status).toBe(403);
    expect(fake.rows('mobile_call_bridges')[0].status).toBe('agent_answered');
  });

  it('B-2.3 · customer-leg con el token correcto marca al cliente con el caller id de la org', async () => {
    const res = await customerLeg(`bridgeId=${BRIDGE_ID}&t=${signBridgeToken(BRIDGE_ID)}`);
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain('callerId="+573001234567"');
    expect(xml).toContain('+573001112233');
    expect(fake.rows('mobile_call_bridges')[0].status).toBe('customer_dialing');
  });

  it('B-2.4 · customer-leg · accountSidMatchesOrg REAL: subcuenta ajena a una org SIN subcuenta → 403', async () => {
    const res = await customerLeg(`bridgeId=${BRIDGE_ID}&t=${signBridgeToken(BRIDGE_ID)}`, { AccountSid: OTHER_SID }, OTHER_TOKEN);
    expect(res.status).toBe(403);
    expect(fake.rows('mobile_call_bridges')[0].status).toBe('agent_answered');
    expect(fake.rows('calls')[0].status).toBe('dialing');
  });

  it('B-2.5 · agent-leg SIN token → 403 y el nombre del cliente no se filtra', async () => {
    const res = await agentLeg(`bridgeId=${BRIDGE_ID}`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('Juan');
  });

  it('B-2.6 · agent-leg con token de OTRO bridge → 403', async () => {
    const res = await agentLeg(`bridgeId=${BRIDGE_ID}&t=${signBridgeToken('otro-bridge')}`);
    expect(res.status).toBe(403);
  });

  it('B-2.7 · agent-leg con el token correcto sí responde el whisper', async () => {
    const res = await agentLeg(`bridgeId=${BRIDGE_ID}&t=${signBridgeToken(BRIDGE_ID)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Gather');
  });

  it('B-2.8 · queda ESCRITO en el código que hoy el HMAC es la única barrera de organización', () => {
    const src = require('fs').readFileSync('src/lib/services/crm/voiceContextService.ts', 'utf8') as string;
    expect(src).toContain('subcuenta');
    expect(src.toLowerCase()).toContain('hmac');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-3 · Guardas del bridge sin prueba
// ═══════════════════════════════════════════════════════════════════════════

describe('B-3 · guardas de initiateBridge sin cobertura', () => {
  const seedMobile = (orgId: number, phone = '+573999999999') => {
    fake = seed({
      extra: {
        user_comm_preferences: [
          { id: 'ucp-1', user_id: USER, organization_id: orgId, mobile_phone_e164: phone, mobile_verified_at: '2026-09-01T10:00:00Z' },
        ],
      },
    });
  };

  it('B-3.1 · getVerifiedMobile filtra por organización: el celular de otra org no sirve', async () => {
    seedMobile(OTHER_ORG);
    expect(await getVerifiedMobile(USER, ORG, fake.client())).toBeNull();
    expect(await getVerifiedMobile(USER, OTHER_ORG, fake.client())).toBe('+573999999999');
  });

  it('B-3.2 · sin VOICE_CALLBACK_SECRET → 503 VOICE_CALLBACK_SECRET_MISSING y sin reservar créditos', async () => {
    seedMobile(ORG);
    delete process.env.VOICE_CALLBACK_SECRET;
    const err = await initiateBridge(
      { organizationId: ORG, userId: USER, supabase: fake.client() },
      { to: '+573001112233' }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe('VOICE_CALLBACK_SECRET_MISSING');
    expect((err as BridgeError).statusCode).toBe(503);
    expect(reserveVoiceMinutes).not.toHaveBeenCalled();
  });

  it('B-3.3 · llamarse a uno mismo → 400 SAME_NUMBER y sin reservar créditos', async () => {
    seedMobile(ORG, '+573001112233');
    const err = await initiateBridge(
      { organizationId: ORG, userId: USER, supabase: fake.client() },
      { to: '+573001112233' }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe('SAME_NUMBER');
    expect((err as BridgeError).statusCode).toBe(400);
    expect(reserveVoiceMinutes).not.toHaveBeenCalled();
  });
});
