/**
 * F3 ronda 7 · F5 ronda 5 — CONSTRUCTOR de la zona de voz (prefijo VOZR7B).
 *
 * Complementa `f3f5Round6Tester` (que ya cubre F-1a/F-1b, F-2 en la ruta,
 * F-3 y M.2) con lo que el tester pidió además:
 *  - F-7 T03/T04: la ventana de 7 días de la reconciliación y el `.eq('call_id')`
 *    de `voidConsentWithoutRecording` (sin él borraría todas las actas de la org).
 *  - F-4: la acta `unverified_announcement` dice lo que NO consta y `announced_at`
 *    va acompañado de la nota en `calls.metadata`; la UI lee `consent_method`.
 *  - F-5: campo de declaración en la entrada y en las rutas.
 *  - F-2: `voiceAgentService` fija la fila con `=== true` (nunca `!== false`).
 *
 * CERO llamadas reales: webhooks firmados y dobles. Los helpers de firma son los
 * mismos del tester.
 */
import fs from 'fs';
import path from 'path';
import Twilio from 'twilio';
import { FakeDb, type Row } from './fixtures/fakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));

const ORIGIN = 'https://webhooks.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-auth-token-0000000000000000';

const ORG = 138;
const USER = '88888888-8888-4888-8888-888888888888';
const CONSENT_TEXT = 'VOZR7B Esta llamada será grabada y monitoreada.';

let fake: FakeDb;

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => fake.client()),
  assertServerOnly: jest.fn(),
}));

const enqueueJob = jest.fn(async () => ({ id: 'job-1' }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...(a as [])) }));

const recordingsList = jest.fn(async (): Promise<Array<{ sid: string; status: string; uri: string; channels: number; duration: string }>> => []);
const getTwilioClientForOrg = jest.fn(async () => ({ client: { recordings: { list: recordingsList } } as unknown, creds: {} }));
jest.mock('@/lib/services/crm/voiceContextService', () => {
  const actual = jest.requireActual('@/lib/services/crm/voiceContextService');
  return { ...actual, getTwilioClientForOrg: (...a: unknown[]) => getTwilioClientForOrg(...(a as [])) };
});

// D.5 (ronda 8, H-3): las rutas manual/transcribe se ejercen con el servicio
// REAL (`createManualCallWithAudio` sin doblar) sobre la FakeDb. Solo se
// doblan la sesión y los módulos ajenos (transcripción/análisis).
class OrgContextError extends Error {
  statusCode = 401;
}
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: USER, role: 'admin' })),
}));
jest.mock('@/lib/services/crm/callAnalysisService', () => ({ AnalysisError: class AnalysisError extends Error {} }));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class TranscriptionError extends Error {} }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueTranscribe: jest.fn(async () => 'job-t'),
  runTranscribePipeline: jest.fn(async () => ({ transcript: { id: 't', status: 'done', provider: 'x', full_text: '', language: 'es', duration_seconds: 1 }, analysis: null })),
}));
jest.mock('@/lib/services/crm/manualCallService', () => {
  const actual = jest.requireActual('@/lib/services/crm/manualCallService');
  return { ...actual, resolveManualAudioMaxBytes: jest.fn(async () => ({ maxBytes: 25_000_000, source: 'default', reason: null })) };
});

import type { NextRequest } from 'next/server';
import { POST as recordingPOST } from '@/app/api/voice/recording/route';
import { POST as manualPOST } from '@/app/api/crm/calls/manual/route';
import { POST as transcribePOST } from '@/app/api/crm/transcribe/route';
import { createManualCallWithAudio, readRecordingDeclaration, MANUAL_DECLARATION_REQUIRED_ERROR } from '@/lib/services/crm/manualCallService';
import { reconcileConsentsWithoutRecording } from '@/lib/services/crm/consentReconcileService';
import { voidConsentWithoutRecording, MANUAL_RECORDING_DECLARATION_TEXT, UNVERIFIED_ANNOUNCED_AT_NOTE } from '@/lib/services/crm/consentService';

function signed(p: string, params: Record<string, string>, token = MASTER_TOKEN): Request {
  const url = `${ORIGIN}${p}`;
  const body = new URLSearchParams(params).toString();
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body });
}

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000801';
const CALL_B = 'bbbbbbbb-0000-4000-8000-000000000802';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000803';

function commSettings(patch: Row = {}): Row {
  return {
    organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT,
    voice_ring_timeout_seconds: 30, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null, is_active: true, ...patch,
  };
}

function seed(extra: Record<string, Row[]> = {}): FakeDb {
  return new FakeDb({
    unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] },
    tables: {
      comm_settings: [commSettings()],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: CUSTOMER_ID, organization_id: ORG, phone: '+573001112233', first_name: 'VOZR7B', last_name: 'Prueba' }],
      opportunities: [{ id: 'opp-1', organization_id: ORG, customer_id: CUSTOMER_ID }],
      calls: [],
      call_consents: [],
      call_recordings: [],
      outbound_jobs: [],
      activities: [],
      ...extra,
    },
  });
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr7bcall01', direction: 'outbound', mode: 'browser', status: 'completed',
  from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: true, started_at: minutesAgo(35), ended_at: minutesAgo(30), metadata: {}, ...patch,
});

const acta = (patch: Row = {}): Row => ({
  id: 'k1', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: minutesAgo(34), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT, ...patch,
});

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

beforeEach(() => {
  jest.clearAllMocks();
  recordingsList.mockResolvedValue([]);
  getTwilioClientForOrg.mockResolvedValue({ client: { recordings: { list: recordingsList } } as unknown, creds: {} });
  process.env.TWILIO_WEBHOOK_BASE_URL = ORIGIN;
  process.env.TWILIO_MASTER_ACCOUNT_SID = MASTER_SID;
  process.env.TWILIO_MASTER_AUTH_TOKEN = MASTER_TOKEN;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// F-7 · T03 / T04
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7B-T · reconciliación: ventana y aislamiento por llamada', () => {
  it('T03 · una llamada terminada hace más de 7 días NO es candidata (ni se pregunta a Twilio ni se retira su acta)', async () => {
    fake = seed({
      calls: [callRow({ started_at: daysAgo(8), ended_at: daysAgo(8) })],
      call_consents: [acta({ announced_at: daysAgo(8) })],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 0, voided: 0, recovered: 0, deferred: 0 });
    expect(getTwilioClientForOrg).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: true, recording_enabled: true });
  });

  it('T03b · contraprueba: a 6 días sí es candidata', async () => {
    fake = seed({
      calls: [callRow({ started_at: daysAgo(6), ended_at: daysAgo(6) })],
      call_consents: [acta({ announced_at: daysAgo(6) })],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r.candidates).toBe(1);
  });

  it('T04 · dos actas en la MISMA org, una candidata y otra no: solo cae la candidata (`voidConsentWithoutRecording` filtra por call_id)', async () => {
    fake = seed({
      calls: [
        callRow(),
        callRow({ id: CALL_B, provider_call_sid: 'CAr7bcall02', started_at: minutesAgo(3), ended_at: minutesAgo(2) }),
      ],
      call_consents: [acta(), acta({ id: 'k2', call_id: CALL_B })],
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: new Date() });
    expect(r).toMatchObject({ candidates: 1, voided: 1 });
    expect(fake.rows('call_consents').map((c) => c.call_id)).toEqual([CALL_B]);
    expect(fake.rows('calls').find((c) => c.id === CALL_B)).toMatchObject({ consent_given: true, recording_enabled: true });
    expect(fake.rows('calls').find((c) => c.id === CALL_ID)).toMatchObject({ consent_given: false, recording_enabled: false });
  });

  it('T04b · `voidConsentWithoutRecording` directo: borra SOLO la acta de esa llamada y de esa org', async () => {
    fake = seed({
      calls: [callRow(), callRow({ id: CALL_B, provider_call_sid: 'CAr7bcall02' })],
      call_consents: [acta(), acta({ id: 'k2', call_id: CALL_B }), acta({ id: 'k3', call_id: CALL_ID, consent_type: 'marketing' })],
    });
    await voidConsentWithoutRecording(CALL_ID, ORG, fake.client(), 'VOZR7B');
    expect(fake.rows('call_consents').map((c) => c.id).sort()).toEqual(['k2', 'k3']);
    const del = fake.calls.find((c) => c.table === 'call_consents' && c.op === 'delete');
    expect(del).toBeDefined();
    // Otra org con el mismo call_id: no toca nada.
    await voidConsentWithoutRecording(CALL_B, ORG + 1, fake.client(), 'VOZR7B');
    expect(fake.rows('call_consents')).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-4 · la acta no acreditada dice lo que consta
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7B-U · unverified_announcement', () => {
  const completed = (callSid: string, sid: string) =>
    recordingPOST(signed('/api/voice/recording', { AccountSid: MASTER_SID, CallSid: callSid, RecordingSid: sid, RecordingStatus: 'completed', RecordingUrl: `https://api.twilio.com/rec/${sid}`, RecordingChannels: '2', RecordingDuration: '40' }));

  it('U.1 · `completed` sin acta: la acta dice explícitamente que NO consta el aviso y no copia el aviso como reproducido; `announced_at` lleva su nota en metadata', async () => {
    fake = seed({ calls: [callRow({ consent_given: false })] });
    const res = await completed('CAr7bcall01', 'REunv');
    expect(res.status).toBe(200);
    const actas = fake.rows('call_consents');
    expect(actas).toHaveLength(1);
    expect(actas[0].method).toBe('unverified_announcement');
    const text = String(actas[0].recorded_announcement_text);
    expect(text).toMatch(/AVISO NO ACREDITADO/);
    expect(text).toContain('no consta que el aviso');
    expect(text).toContain('NO acreditado como reproducido');
    expect(text).not.toBe(CONSENT_TEXT);
    expect(actas[0].announced_at).toBeTruthy();
    const md = fake.rows('calls')[0].metadata as Row;
    expect(md.consent_unverified_reason).toBe('recording_completed_without_consent');
    expect(md.consent_unverified_announced_at_note).toBe(UNVERIFIED_ANNOUNCED_AT_NOTE);
    expect(String(md.consent_unverified_announced_at_note)).toContain('no consta que el aviso sonara');
    expect(fake.rows('calls')[0].consent_given).toBe(false);
  });

  it('U.2 · la UI marca la grabación no acreditada: `consent_method` viaja en la lista y en el timeline, y CallPlayer/CallRow/CallEntry lo enseñan con icono + texto', () => {
    const list = src('src/lib/services/crm/callManagementService.ts');
    expect(list).toContain('call_consents(consent_type, method)');
    expect(list).toContain('consent_method:');
    const tl = src('src/lib/services/crm/timeline/sources.ts');
    expect(tl).toContain('call_consents(consent_type, method)');
    expect(src('src/lib/services/crm/timeline/assemble.ts')).toContain('consent_method:');
    const badge = src('src/components/voice/ConsentBadge.tsx');
    // H-4 (ronda 8): el literal vive SOLO en consentService; el distintivo
    // decide con `isUnverifiedConsent` del módulo puro (probado por conducta
    // en f3f5Round8Builder B.1/B.3), no con una copia del literal.
    expect(badge).not.toContain("'unverified_announcement'");
    expect(badge).toContain("from '@/lib/services/crm/consentMethod'");
    expect(src('src/lib/services/crm/consentMethod.ts')).toContain("import { UNVERIFIED_CONSENT_METHOD } from './consentService'");
    expect(badge).toContain('Aviso no acreditado');
    expect(badge).toMatch(/<ShieldAlert/); // icono + texto, nunca solo color
    const player = src('src/components/voice/CallPlayer.tsx');
    expect(player).toContain('UnverifiedConsentBadge');
    expect(player).toMatch(/consents/); // relee la acta del detalle
    for (const f of ['src/components/voice/CallRow.tsx', 'src/components/voice/CallRowDetail.tsx', 'src/components/crm/timeline/entries/CallEntry.tsx']) {
      expect(src(f)).toContain('consentMethod={call.consent_method}');
    }
    for (const f of ['src/components/voice/ConsentBadge.tsx', 'src/components/voice/CallPlayer.tsx', 'src/components/voice/CallRow.tsx', 'src/components/voice/CallRowDetail.tsx']) {
      expect(src(f).split(/\r?\n/).length).toBeLessThanOrEqual(300);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-5 · declaración explícita en la acta manual
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7B-D · declaración de la grabación manual', () => {
  it('D.1 · con `recordingDeclaration: true` la acta recoge la declaración marcada (texto Habeas Data) y sigue diciendo que el sistema no reprodujo aviso', async () => {
    await createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000, recordingDeclaration: true }, fake.client());
    const text = String(fake.rows('call_consents')[0].recorded_announcement_text);
    expect(text).toContain(USER);
    expect(text).toContain('no reprodujo');
    expect(text).toContain('Declaración marcada por el usuario');
    expect(text).toContain(MANUAL_RECORDING_DECLARATION_TEXT);
    expect(fake.rows('calls')[0]).toMatchObject({ consent_given: true, recording_enabled: true });
  });

  it('D.2 · sin el campo la acta deja constancia de que NO consta declaración (nunca la inventa)', async () => {
    await createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000 }, fake.client());
    const text = String(fake.rows('call_consents')[0].recorded_announcement_text);
    expect(text).toContain('No consta declaración');
    expect(text).not.toContain(MANUAL_RECORDING_DECLARATION_TEXT);
    expect(text).not.toMatch(/el usuario declara/i);
  });

  it('D.3 · `recordingDeclaration: false` explícito → 400 con el texto que hay que marcar, sin fila `calls` ni audio', async () => {
    await expect(createManualCallWithAudio(ORG, USER, { audio: WAV, opportunityId: 'opp-1', maxBytes: 10_000_000, recordingDeclaration: false }, fake.client())).rejects.toMatchObject({ status: 400 });
    expect(fake.rows('calls')).toHaveLength(0);
    expect(fake.storageCalls).toHaveLength(0);
  });

  it('D.4 · `readRecordingDeclaration`: solo la casilla marcada cuenta', () => {
    const form = (v?: string) => {
      const f = new FormData();
      if (v !== undefined) f.set('recording_declaration', v);
      return f;
    };
    expect(readRecordingDeclaration(form('true'))).toBe(true);
    expect(readRecordingDeclaration(form('on'))).toBe(true);
    expect(readRecordingDeclaration(form('1'))).toBe(true);
    expect(readRecordingDeclaration(form('false'))).toBe(false);
    expect(readRecordingDeclaration(form(''))).toBe(false);
    expect(readRecordingDeclaration(form())).toBe(false);
    expect(MANUAL_DECLARATION_REQUIRED_ERROR).toContain('recording_declaration');
    expect(MANUAL_DECLARATION_REQUIRED_ERROR).toContain(MANUAL_RECORDING_DECLARATION_TEXT);
  });

  it('D.5 · (conducta, ronda 8) las dos rutas con el servicio REAL: sin casilla → 400 y nada creado ni subido; con casilla → acta `manual` que dice «Declaración marcada por el usuario»', async () => {
    const multipart = (fields: Record<string, string>, p: string): NextRequest => {
      const f = new FormData();
      f.set('audio', new Blob([new Uint8Array(WAV)], { type: 'audio/wav' }), 'a.wav');
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      const req = new Request(`http://localhost${p}`, { method: 'POST', body: f });
      return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
    };
    for (const [post, p, okStatus] of [
      [manualPOST, '/api/crm/calls/manual', 201],
      [transcribePOST, '/api/crm/transcribe', 200],
    ] as const) {
      fake = seed();
      for (const bad of [{}, { recording_declaration: 'yes' }, { recording_declaration: 'false' }] as Record<string, string>[]) {
        const res = await post(multipart({ opportunity_id: 'opp-1', ...bad }, p));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'RECORDING_DECLARATION_REQUIRED' });
      }
      expect(fake.rows('calls')).toHaveLength(0);
      expect(fake.rows('call_consents')).toHaveLength(0);
      expect(fake.rows('call_recordings')).toHaveLength(0);
      expect(fake.storageCalls.filter((s) => s.op === 'upload')).toHaveLength(0);

      const ok = await post(multipart({ opportunity_id: 'opp-1', recording_declaration: 'on' }, p));
      expect(ok.status).toBe(okStatus);
      expect(fake.rows('calls')).toHaveLength(1);
      expect(fake.rows('call_consents')).toHaveLength(1);
      expect(fake.rows('call_consents')[0].method).toBe('manual');
      expect(String(fake.rows('call_consents')[0].recorded_announcement_text)).toContain('Declaración marcada por el usuario');
      expect(fake.storageCalls.filter((s) => s.op === 'upload')).toHaveLength(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-2 · una sola fuente de verdad en el agente IA
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR7B-A · agente IA: la fila `calls` manda y se fija con fallo cerrado', () => {
  it('A.1 · `voiceAgentService` fija `calls.recording_enabled` con `=== true` (nunca `!== false`)', () => {
    const s = stripped('src/lib/services/crm/voiceAgentService.ts');
    expect(s).toContain('voice_recording_enabled === true');
    expect(s).not.toMatch(/voice_recording_enabled\s*!==\s*false/);
  });

  it('A.2 · `twiml/ai-agent` y `agentRuntime` deciden por `recordingEnabledForCall` (la fila), no por una relectura de comm_settings', () => {
    expect(stripped('src/app/api/voice/twiml/ai-agent/route.ts')).toMatch(/recordingEnabledForCall\(consentCallId, agentOrgId, supabase\)/);
    const rt = stripped('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(rt).toMatch(/recordingEnabledForCall\(consentCallId, orgId, supabase\)/);
    expect(rt).not.toMatch(/voice_recording_enabled\s*!==\s*false/);
  });
});

function src(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function stripped(file: string): string {
  return src(file)
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}
