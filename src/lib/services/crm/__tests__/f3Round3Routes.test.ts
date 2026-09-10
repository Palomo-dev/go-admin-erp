/**
 * F3 · ronda 3 — PRUEBAS DE RUTA de telefonía (webhooks firmados de verdad).
 *
 * Hasta esta ronda, A2 (`filterOrgOwnedRefs`), M1 (`accountSidMatchesOrg`),
 * M2 (`pickCallerId` / caller id de la plataforma), M5 (`consent_given`) y
 * B1 (E.164 marcable) solo estaban verificados a mano por el tester: revertir
 * cualquiera de ellos dejaba `npx jest` en verde. Estas pruebas ejercen los
 * route handlers REALES con firma de Twilio calculada con el algoritmo real
 * (`getExpectedTwilioSignature`), sobre una base falsa en memoria.
 *
 * CERO llamadas telefónicas reales: solo webhooks entrantes.
 */
import Twilio from 'twilio';
import { FakeDb, type Row } from './fixtures/fakeSupabase';

// `webhookSignatures` importa svix (solo ESM) para Resend; aquí solo se usa la
// verificación de Twilio, que sí es real. Mismo doble que en SEC y en jobs.
jest.mock('svix', () => ({ Webhook: class {} }));

const ORIGIN = 'https://webhooks.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-auth-token-0000000000000000';
/** Subcuenta de la org 135: firma válida para Twilio, ajena a la org 134. */
const OTHER_SID = 'ACother00000000000000000000000000';
const OTHER_TOKEN = 'other-auth-token-00000000000000000';

const ORG = 134;
const OTHER_ORG = 135;

const CUSTOMER_OWN = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ALIEN = '22222222-2222-4222-8222-222222222222';
const OPP_OWN = '33333333-3333-4333-8333-333333333333';
const OPP_ALIEN = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';

let fake: FakeDb;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => fake.client()),
  assertServerOnly: jest.fn(),
}));

const reserveVoiceMinutes = jest.fn(async () => true);
const settleVoiceCall = jest.fn(async () => null);
jest.mock('@/lib/services/crm/callCreditsService', () => ({
  reserveVoiceMinutes: (...a: unknown[]) => reserveVoiceMinutes(...(a as [])),
  settleVoiceCall: (...a: unknown[]) => settleVoiceCall(...(a as [])),
}));

const upsertCallActivity = jest.fn(async () => null);
const touchOpportunityAfterCall = jest.fn(async () => null);
jest.mock('@/lib/services/crm/callActivitySync', () => ({
  upsertCallActivity: (...a: unknown[]) => upsertCallActivity(...(a as [])),
  touchOpportunityAfterCall: (...a: unknown[]) => touchOpportunityAfterCall(...(a as [])),
}));

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
  greeting: 'Hola',
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

import { POST as outboundPOST } from '@/app/api/voice/twiml/outbound/route';
import { POST as inboundPOST } from '@/app/api/voice/twiml/inbound/route';
import { POST as statusPOST } from '@/app/api/voice/status/route';
import { POST as dialCompletePOST } from '@/app/api/voice/dial-complete/route';
import { POST as consentWhisperPOST } from '@/app/api/voice/twiml/consent-whisper/route';
import { POST as aiAgentStatusPOST } from '@/app/api/voice/ai-agent/status/route';
import { POST as aiAgentTwimlPOST } from '@/app/api/voice/twiml/ai-agent/route';
import { signConsentToken } from '@/lib/services/crm/bridgeTokens';

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

function seed(overrides: { commSettings?: Row[]; calls?: Row[]; extra?: Record<string, Row[]> } = {}): FakeDb {
  return new FakeDb({
    tables: {
      comm_settings: overrides.commSettings ?? [
        { organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: 'Esta llamada será grabada.', voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null },
        { organization_id: OTHER_ORG, phone_number: null, voice_caller_id: '+573009999999', voice_recording_enabled: false, twilio_subaccount_sid: OTHER_SID, twilio_subaccount_auth_token: OTHER_TOKEN },
      ],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [
        { id: CUSTOMER_OWN, organization_id: ORG, phone: '+573001112233' },
        { id: CUSTOMER_ALIEN, organization_id: OTHER_ORG, phone: '+573004445566' },
      ],
      opportunities: [
        { id: OPP_OWN, organization_id: ORG },
        { id: OPP_ALIEN, organization_id: OTHER_ORG },
      ],
      phone_numbers: [],
      calls: overrides.calls ?? [],
      call_consents: [],
      voice_agent_calls: [],
      ...(overrides.extra ?? {}),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  reserveVoiceMinutes.mockResolvedValue(true);
  process.env.TWILIO_WEBHOOK_BASE_URL = ORIGIN;
  process.env.TWILIO_MASTER_ACCOUNT_SID = MASTER_SID;
  process.env.TWILIO_MASTER_AUTH_TOKEN = MASTER_TOKEN;
  // Ronda 4 (A-1): el acta de grabación exige un HMAC que acuñe el servidor.
  // Sin este secreto la grabación queda inhibida a propósito (nunca grabar sin
  // acta), que es justamente lo que comprueba `f3f5Round4Consent`.
  process.env.VOICE_CALLBACK_SECRET = 'f3-r3-secret-0123456789abcdef';
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

// ─────────────────────────────────────────────────────────────────────────────
// M1 / N-2 · Aislamiento por AccountSid en TODAS las rutas que mutan por id externo
// ─────────────────────────────────────────────────────────────────────────────

describe('M1 · accountSidMatchesOrg cableado en las rutas', () => {
  const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

  function seedCall(extra: Row = {}) {
    fake = seed({
      calls: [
        {
          id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAf3r3aaa', direction: 'outbound', mode: 'browser',
          status: 'ringing', from_number: '+573001234567', to_number: '+573001112233', customer_id: null,
          opportunity_id: null, user_id: USER, started_at: new Date().toISOString(), answered_at: null,
          ended_at: null, duration_seconds: null, recording_enabled: true, consent_given: false,
          customer_leg_sid: null, metadata: {}, ...extra,
        },
      ],
    });
  }

  it('M1.1 · /api/voice/status firmado por la subcuenta de OTRA org → 403 y la fila no cambia', async () => {
    seedCall();
    const res = await statusPOST(
      signed('/api/voice/status', { AccountSid: OTHER_SID, CallSid: 'CAf3r3aaa', CallStatus: 'completed', CallDuration: '120', SequenceNumber: '3' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('calls')[0].status).toBe('ringing');
  });

  it('M1.2 · /api/voice/dial-complete con subcuenta ajena → 403', async () => {
    seedCall();
    const res = await dialCompletePOST(
      signed(`/api/voice/dial-complete?callId=${CALL_ID}`, { AccountSid: OTHER_SID, CallSid: 'CAf3r3aaa', DialCallStatus: 'completed', DialCallDuration: '90' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('calls')[0].duration_seconds).toBeNull();
  });

  it('M1.3 · /api/voice/twiml/consent-whisper con subcuenta ajena → 403 y consent_given intacto', async () => {
    seedCall();
    const res = await consentWhisperPOST(
      signed(`/api/voice/twiml/consent-whisper?callId=${CALL_ID}`, { AccountSid: OTHER_SID, CallSid: 'CAf3r3aaa' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('M1.4 · /api/voice/twiml/inbound con subcuenta ajena al número → 403 y ninguna fila creada', async () => {
    const res = await inboundPOST(
      signed('/api/voice/twiml/inbound', { AccountSid: OTHER_SID, CallSid: 'CAf3r3in1', From: '+573001112233', To: '+18506003708' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('M1.5 (N-2) · /api/voice/ai-agent/status con subcuenta ajena → 403 y voice_agent_calls intacto', async () => {
    fake = seed({
      extra: {
        voice_agent_calls: [
          { id: 'vac-1', organization_id: ORG, voice_agent_id: 'ag-1', call_id: null, provider_call_sid: 'CAf3r3vac', status: 'in_progress', started_at: null, outcome: null, customer_id: null, opportunity_id: null, credits_reserved: 0, credits_settled_at: null },
        ],
      },
    });
    const res = await aiAgentStatusPOST(
      signed('/api/voice/ai-agent/status?callId=vac-1', { AccountSid: OTHER_SID, CallSid: 'CAf3r3vac', CallStatus: 'completed', CallDuration: '75' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(fake.rows('voice_agent_calls')[0].status).toBe('in_progress');
  });

  it('M1.6 (N-2) · /api/voice/twiml/ai-agent con subcuenta ajena → 403 y no entrega el TwiML de la otra org', async () => {
    fake = seed({
      extra: {
        voice_agent_calls: [
          { id: 'vac-2', organization_id: ORG, voice_agent_id: 'ag-1', call_id: null, provider_call_sid: null, status: 'dialing', started_at: null, customer_id: null },
        ],
      },
    });
    const res = await aiAgentTwimlPOST(
      signed('/api/voice/twiml/ai-agent?agentId=ag-1&callId=vac-2', { AccountSid: OTHER_SID, CallSid: 'CAf3r3vac2' }, OTHER_TOKEN)
    );
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('ConversationRelay');
    expect(fake.rows('voice_agent_calls')[0].status).toBe('dialing');
  });

  it('M1.7 · contraprueba: la MASTER sí puede cerrar la llamada de la org', async () => {
    seedCall();
    const res = await statusPOST(
      signed('/api/voice/status', { AccountSid: MASTER_SID, CallSid: 'CAf3r3aaa', CallStatus: 'completed', CallDuration: '120', SequenceNumber: '3' })
    );
    expect(res.status).toBe(200);
    expect(fake.rows('calls')[0].status).not.toBe('ringing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 · filterOrgOwnedRefs cableado en twiml/outbound
// ─────────────────────────────────────────────────────────────────────────────

describe('A2 · ids de otra organización en el TwiML saliente', () => {
  const clientFrom = `client:u_${USER.replace(/-/g, '')}_o_${ORG}`;

  it('A2.1 · customerId/opportunityId ajenos → se descartan a null y quedan en rejected_refs', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', {
        AccountSid: MASTER_SID, CallSid: 'CAf3r3out1', From: clientFrom, To: '+573001112233',
        customerId: CUSTOMER_ALIEN, opportunityId: OPP_ALIEN,
      })
    );
    expect(res.status).toBe(200);
    const row = fake.rows('calls')[0];
    expect(row).toBeDefined();
    expect(row.customer_id).toBeNull();
    expect(row.opportunity_id).toBeNull();
    expect((row.metadata as Row).rejected_refs).toEqual([`customer:${CUSTOMER_ALIEN}`, `opportunity:${OPP_ALIEN}`]);
  });

  it('A2.2 · contraprueba: ids propios se conservan', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', {
        AccountSid: MASTER_SID, CallSid: 'CAf3r3out2', From: clientFrom, To: '+573001112233',
        customerId: CUSTOMER_OWN, opportunityId: OPP_OWN,
      })
    );
    expect(res.status).toBe(200);
    const row = fake.rows('calls')[0];
    expect(row.customer_id).toBe(CUSTOMER_OWN);
    expect(row.opportunity_id).toBe(OPP_OWN);
    expect((row.metadata as Row).rejected_refs).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 · caller id de la plataforma · B1 · E.164 marcable
// ─────────────────────────────────────────────────────────────────────────────

describe('M2 · caller id propio de la organización', () => {
  const clientFrom = `client:u_${USER.replace(/-/g, '')}_o_${ORG}`;

  it('M2.1 · sin caller id propio (solo el número global) → cuelga y NO crea la llamada', async () => {
    process.env.TWILIO_PHONE_NUMBER = '+15005550006';
    fake = seed({
      commSettings: [
        { organization_id: ORG, phone_number: null, voice_caller_id: null, voice_recording_enabled: false, twilio_subaccount_sid: null },
      ],
    });
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3m2', From: clientFrom, To: '+573001112233' })
    );
    const xml = await res.text();
    expect(xml).toContain('no tiene un número de salida configurado');
    expect(xml).not.toContain('<Dial');
    expect(fake.rows('calls')).toHaveLength(0);
    expect(reserveVoiceMinutes).not.toHaveBeenCalled();
  });

  it('M2.2 · contraprueba: con voice_caller_id propio sí marca', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3m2b', From: clientFrom, To: '+573001112233' })
    );
    const xml = await res.text();
    expect(xml).toContain('<Dial callerId="+573001234567"');
    expect(fake.rows('calls')).toHaveLength(1);
  });
});

describe('B1 · destino E.164 marcable', () => {
  const clientFrom = `client:u_${USER.replace(/-/g, '')}_o_${ORG}`;

  it('B1.1 · To="12345" → número inválido, sin fila y sin reserva de créditos', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3b1', From: clientFrom, To: '12345' })
    );
    const xml = await res.text();
    expect(xml).toContain('El número de destino no es válido.');
    expect(fake.rows('calls')).toHaveLength(0);
    expect(reserveVoiceMinutes).not.toHaveBeenCalled();
  });

  it('B1.2 · contraprueba: To="+573001112233" sí marca', async () => {
    const res = await outboundPOST(
      signed('/api/voice/twiml/outbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3b1b', From: clientFrom, To: '+573001112233' })
    );
    expect(await res.text()).toContain('<Number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M5 / N-4 · consentimiento SOLO cuando el aviso se ha reproducido
// ─────────────────────────────────────────────────────────────────────────────

describe('M5/N-4 · consent_given en llamadas entrantes', () => {
  it('N-4.1 · entrante con grabación: nace consent_given=false mientras timbra, y el TwiML anuncia y vuelve', async () => {
    const res = await inboundPOST(
      signed('/api/voice/twiml/inbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3in2', From: '+573001112233', To: '+18506003708' })
    );
    const xml = await res.text();
    const row = fake.rows('calls')[0];
    expect(row.status).toBe('ringing');
    expect(row.recording_enabled).toBe(true);
    expect(row.consent_given).toBe(false);
    // El aviso todavía no ha sonado: no puede haber acta de consentimiento.
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(xml).toContain('<Say');
    expect(xml).toContain('<Redirect');
    expect(xml).not.toContain('<Dial');
  });

  it('N-4.2 · segunda pasada (el aviso YA sonó) → consent_given=true, acta de consentimiento y <Dial>', async () => {
    await inboundPOST(
      signed('/api/voice/twiml/inbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3in3', From: '+573001112233', To: '+18506003708' })
    );
    // Ronda 4 (A-1): la prueba de que el aviso sonó ya no es `?announced=1`
    // —que controla quien firma la petición— sino el token del <Redirect> que
    // acuñó la primera pasada.
    const ct = signConsentToken('CAf3r3in3');
    const res = await inboundPOST(
      signed(`/api/voice/twiml/inbound?ct=${encodeURIComponent(ct)}`, { AccountSid: MASTER_SID, CallSid: 'CAf3r3in3', From: '+573001112233', To: '+18506003708' })
    );
    const xml = await res.text();
    const row = fake.rows('calls')[0];
    expect(row.consent_given).toBe(true);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(xml).toContain('<Dial');
  });

  it('N-4.3 · sin grabación: no hay aviso, no hay consentimiento y se marca directo', async () => {
    fake = seed({
      commSettings: [{ organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: false, twilio_subaccount_sid: null }],
    });
    const res = await inboundPOST(
      signed('/api/voice/twiml/inbound', { AccountSid: MASTER_SID, CallSid: 'CAf3r3in4', From: '+573001112233', To: '+18506003708' })
    );
    const xml = await res.text();
    expect(fake.rows('calls')[0].consent_given).toBe(false);
    expect(xml).toContain('<Dial');
    expect(xml).not.toContain('<Redirect');
  });

  it('N-4.4 · saliente: consent-whisper es quien pone consent_given=true', async () => {
    const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000009';
    fake = seed({
      calls: [{ id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAf3r3w', direction: 'outbound', mode: 'browser', status: 'dialing', from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: false, metadata: {} }],
    });
    const res = await consentWhisperPOST(
      signed(`/api/voice/twiml/consent-whisper?callId=${CALL_ID}`, { AccountSid: MASTER_SID, CallSid: 'CAf3r3w' })
    );
    expect(res.status).toBe(200);
    expect(fake.rows('calls')[0].consent_given).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1 / A3 · cableado de la máquina de estados en las rutas
// ─────────────────────────────────────────────────────────────────────────────

describe('A1/A3 · cableado de mergeTerminalOutcome y de la liquidación', () => {
  const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

  function seedCompleted() {
    fake = seed({
      calls: [
        {
          id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAf3r3a1', direction: 'outbound', mode: 'browser',
          status: 'completed', from_number: '+573001234567', to_number: '+573001112233', customer_id: null,
          opportunity_id: null, user_id: USER, started_at: new Date(Date.now() - 200000).toISOString(),
          answered_at: new Date(Date.now() - 190000).toISOString(), ended_at: new Date().toISOString(),
          duration_seconds: 120, recording_enabled: false, consent_given: false, customer_leg_sid: null, metadata: {},
        },
      ],
    });
  }

  it('A1.1 · dial-complete "no-answer" SIN duración no pisa una llamada ya completada de 120 s', async () => {
    seedCompleted();
    const res = await dialCompletePOST(
      signed(`/api/voice/dial-complete?callId=${CALL_ID}`, { AccountSid: MASTER_SID, CallSid: 'CAf3r3a1', DialCallStatus: 'no-answer' })
    );
    expect(res.status).toBe(200);
    const row = fake.rows('calls')[0];
    expect(row.status).toBe('completed');
    expect(row.duration_seconds).toBe(120);
  });

  it('A3.1 · buzón detectado por AMD: marca voicemail pero NO liquida (la llamada sigue viva)', async () => {
    fake = seed({
      calls: [
        {
          id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAf3r3a3', direction: 'outbound', mode: 'browser',
          status: 'ringing', from_number: '+573001234567', to_number: '+573001112233', customer_id: null,
          opportunity_id: null, user_id: USER, started_at: new Date().toISOString(), answered_at: null,
          ended_at: null, duration_seconds: null, recording_enabled: false, consent_given: false,
          customer_leg_sid: null, metadata: {},
        },
      ],
    });
    const res = await statusPOST(
      signed('/api/voice/status', { AccountSid: MASTER_SID, CallSid: 'CAf3r3a3', CallStatus: 'in-progress', AnsweredBy: 'machine_start', SequenceNumber: '2' })
    );
    expect(res.status).toBe(200);
    expect(fake.rows('calls')[0].status).toBe('voicemail');
    expect(settleVoiceCall).not.toHaveBeenCalled();
    expect(upsertCallActivity).not.toHaveBeenCalled();
  });

  it('A3.2 · el cierre real del buzón sí liquida, con la duración del proveedor', async () => {
    fake = seed({
      calls: [
        {
          id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAf3r3a3b', direction: 'outbound', mode: 'browser',
          status: 'voicemail', from_number: '+573001234567', to_number: '+573001112233', customer_id: null,
          opportunity_id: null, user_id: USER, started_at: new Date(Date.now() - 60000).toISOString(),
          answered_at: new Date(Date.now() - 55000).toISOString(), ended_at: null, duration_seconds: null,
          recording_enabled: false, consent_given: false, customer_leg_sid: null, metadata: {},
        },
      ],
    });
    const res = await statusPOST(
      signed('/api/voice/status', { AccountSid: MASTER_SID, CallSid: 'CAchildf3r3', ParentCallSid: 'CAf3r3a3b', CallStatus: 'completed', CallDuration: '35', SequenceNumber: '4' })
    );
    expect(res.status).toBe(200);
    const row = fake.rows('calls')[0];
    expect(row.duration_seconds).toBe(35);
    expect(settleVoiceCall).toHaveBeenCalledTimes(1);
  });
});
