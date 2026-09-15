/**
 * F3 ronda 8 (cierre) — CONSTRUCTOR de la zona de voz (prefijo VOZR8B).
 *
 * Cierra los cinco hallazgos del tester r7 (F3 9,2):
 *  - H-1: la reconciliación NO pierde candidatas diferidas. La ventana de 7 d
 *    solo evita mirar llamadas antiguas que nunca se marcaron; una llamada
 *    diferida (`calls.metadata.consent_reconcile_deferred_at`) sigue siendo
 *    candidata hasta resolverse, y a partir de N diferimientos o M días se
 *    registra un aviso SIN retirar el acta a ciegas. Reloj controlado (`now`).
 *  - H-2: `agentRuntime` sin fila `calls` enlazada → `recordingEnabled=false`
 *    (fallo cerrado), ya no cae a `comm_settings`.
 *  - H-3: las rutas manual/transcribe pasan al servicio la casilla REAL
 *    (`readRecordingDeclaration(form)`), no `true` cableado; con el servicio
 *    REAL (no doblado) una petición sin casilla no crea llamada ni sube audio.
 *  - H-4: `isUnverifiedConsent` vive en un `.ts` puro que importa el literal
 *    de `consentService`; `listCallsWithRelations` mapea `consent_method` del
 *    embed `call_consents(consent_type, method)`. Ambas por conducta.
 *  - Nota 6: importar `callAnalysisService` ya no arrastra el cliente de
 *    NAVEGADOR (`@/lib/supabase/config`) a un route handler.
 *
 * CERO llamadas reales, cero escrituras en BD: `FakeDb` en memoria.
 */
import { FakeDb, type Row } from './fixtures/fakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));

const ORG = 140;
const USER = '77777777-7777-4777-8777-777777777777';

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

class OrgContextError extends Error {
  statusCode = 401;
}
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: USER, role: 'admin' })),
}));
// Servicio REAL con espía delante: registra con qué `recordingDeclaration`
// lo llama la ruta y ejecuta la implementación de verdad (H-3).
const createManualSpy = jest.fn();
jest.mock('@/lib/services/crm/manualCallService', () => {
  const actual = jest.requireActual('@/lib/services/crm/manualCallService');
  return {
    ...actual,
    createManualCallWithAudio: (...a: unknown[]) => {
      createManualSpy(...(a as []));
      return actual.createManualCallWithAudio(...(a as []));
    },
    resolveManualAudioMaxBytes: jest.fn(async () => ({ maxBytes: 25_000_000, source: 'default', reason: null })),
  };
});
jest.mock('@/lib/services/crm/callAnalysisService', () => ({ AnalysisError: class AnalysisError extends Error {} }));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class TranscriptionError extends Error {} }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueTranscribe: jest.fn(async () => 'job-t'),
  runTranscribePipeline: jest.fn(async () => ({ transcript: { id: 't', status: 'done', provider: 'x', full_text: '', language: 'es', duration_seconds: 1 }, analysis: null })),
}));

import type { NextRequest } from 'next/server';
import {
  reconcileConsentsWithoutRecording,
  RECONCILE_ALERT_AFTER_DEFERRALS,
  RECONCILE_ALERT_AFTER_DAYS,
  RECONCILE_DEFERRED_AT_KEY,
  RECONCILE_DEFERRALS_KEY,
} from '@/lib/services/crm/consentReconcileService';
import { VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';
import { buildRuntimeConfig } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { POST as manualPOST } from '@/app/api/crm/calls/manual/route';
import { POST as transcribePOST } from '@/app/api/crm/transcribe/route';
import { isUnverifiedConsent } from '@/lib/services/crm/consentMethod';
import { UNVERIFIED_CONSENT_METHOD } from '@/lib/services/crm/consentService';
import { listCallsWithRelations } from '@/lib/services/crm/callManagementService';

const CALL_ID = 'aaaaaaaa-0000-4000-8000-000000000101';
const CALL_B = 'bbbbbbbb-0000-4000-8000-000000000102';
const VAC = 'dddddddd-0000-4000-8000-000000000104';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000103';
const CONSENT_TEXT = 'VOZR8B Esta llamada será grabada y monitoreada.';

const agentRow = { id: 'ag-8', organization_id: ORG, is_active: true, name: 'VOZR8B', language: 'es', stt_provider: 'deepgram', tts_provider: 'google', voice_id: null, voice_ref_id: null, greeting: null, first_message: null, identity_disclosure: null, allowed_tools: [], system_prompt: 'x', guardrails: {}, llm_model: null, temperature: 0.5, max_turns: 10, max_duration_seconds: 120, purpose_type: 'sell_product', transfer_to_human_rules: null };

function seed(extra: Record<string, Row[]> = {}): FakeDb {
  return new FakeDb({
    unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] },
    tables: {
      comm_settings: [{ organization_id: ORG, voice_recording_enabled: true, voice_consent_message: CONSENT_TEXT, voice_caller_id: '+573001234567', is_active: true, voice_agent_enabled: true }],
      organizations: [{ id: ORG, name: 'Org de prueba' }],
      organization_members: [{ id: 'm1', organization_id: ORG, user_id: USER, is_active: true }],
      customers: [{ id: CUSTOMER_ID, organization_id: ORG, phone: '+573001112233', first_name: 'VOZR8B', last_name: 'Prueba' }],
      opportunities: [{ id: 'opp-1', organization_id: ORG, customer_id: CUSTOMER_ID }],
      voice_agents: [agentRow],
      voices: [],
      calls: [],
      call_consents: [],
      call_recordings: [],
      voice_agent_calls: [],
      outbound_jobs: [],
      activities: [],
      profiles: [],
      ...extra,
    },
  });
}

/** Reloj controlado: todo se mide desde T0, nunca desde `Date.now()`. */
const T0 = new Date('2026-09-15T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;
const at = (base: Date, days: number) => new Date(base.getTime() + days * DAY);
const iso = (d: Date) => d.toISOString();

const callRow = (patch: Row = {}): Row => ({
  id: CALL_ID, organization_id: ORG, provider_call_sid: 'CAr8bcall01', direction: 'outbound', mode: 'browser', status: 'completed',
  from_number: '+573001234567', to_number: '+573001112233', recording_enabled: true, consent_given: true,
  started_at: iso(at(T0, -6)), ended_at: iso(at(T0, -6)), metadata: { disposition_outcome: 'answered' }, ...patch,
});
const acta = (patch: Row = {}): Row => ({
  id: 'k1', organization_id: ORG, call_id: CALL_ID, consent_type: 'recording', announced_at: iso(at(T0, -6)), method: 'voice_announcement', locale: 'es-MX', recorded_announcement_text: CONSENT_TEXT, ...patch,
});
const mkLog = () => ({ info: jest.fn(), warn: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  recordingsList.mockResolvedValue([]);
  getTwilioClientForOrg.mockResolvedValue({ client: { recordings: { list: recordingsList } } as unknown, creds: {} });
  process.env.WS_SESSION_SECRET = 'ws-secret-for-tests-0123456789abcdef0123456789abcdef';
  process.env.WS_SERVER_URL = 'wss://ws.test';
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// H-1 · la reconciliación no pierde candidatas diferidas
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR8B-H1 · reconciliación: una llamada diferida sigue siendo candidata fuera de la ventana', () => {
  it('H1.1 · día 6 diferida (sin credenciales) → marca en metadata; día 8 SIGUE candidata; día 35 avisa y NO retira el acta', async () => {
    fake = seed({ calls: [callRow()], call_consents: [acta()] });
    getTwilioClientForOrg.mockRejectedValue(new VoiceNotConfiguredError('sin credenciales'));
    const log = mkLog();

    // Día 0 (la llamada terminó hace 6 d): deferred y marca persistida.
    const r1 = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log });
    expect(r1).toMatchObject({ candidates: 1, deferred: 1, voided: 0, recovered: 0, stale: 0 });
    const md1 = fake.rows('calls')[0].metadata as Row;
    expect(md1[RECONCILE_DEFERRED_AT_KEY]).toBe(iso(T0));
    expect(md1[RECONCILE_DEFERRALS_KEY]).toBe(1);
    expect(md1.disposition_outcome).toBe('answered'); // el resto de metadata se conserva

    // Día +2 (la llamada terminó hace 8 d): FUERA de la ventana de 7 d, pero
    // diferida → sigue siendo candidata (antes: candidates 0, acta huérfana).
    const r2 = await reconcileConsentsWithoutRecording(fake.client(), { now: at(T0, 2), log });
    expect(r2).toMatchObject({ candidates: 1, deferred: 1, voided: 0, stale: 0 });
    expect((fake.rows('calls')[0].metadata as Row)[RECONCILE_DEFERRALS_KEY]).toBe(2);
    expect((fake.rows('calls')[0].metadata as Row)[RECONCILE_DEFERRED_AT_KEY]).toBe(iso(at(T0, 2)));

    // Día +29 (la llamada terminó hace 35 d ≥ 30): aviso registrado, acta y
    // flags intactos: nunca se retira a ciegas.
    const r3 = await reconcileConsentsWithoutRecording(fake.client(), { now: at(T0, 29), log });
    expect(r3).toMatchObject({ candidates: 1, deferred: 1, voided: 0, stale: 1 });
    expect(log.warn).toHaveBeenCalledWith('consent_reconcile_stale_candidate', expect.objectContaining({ org_id: ORG, call_id: CALL_ID, deferrals: 3 }));
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_recordings')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: true, consent_given: true });
    expect((fake.rows('calls')[0].metadata as Row).recording_absent_reason).toBeUndefined();
  });

  it('H1.2 · una llamada de 8 d que NUNCA se difirió no es candidata (la ventana sigue evitando el histórico)', async () => {
    fake = seed({ calls: [callRow({ ended_at: iso(at(T0, -8)), started_at: iso(at(T0, -8)) })], call_consents: [acta()] });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log: mkLog() });
    expect(r).toMatchObject({ candidates: 0, deferred: 0, voided: 0 });
    expect(getTwilioClientForOrg).not.toHaveBeenCalled();
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it(`H1.3 · a partir de ${RECONCILE_ALERT_AFTER_DEFERRALS} diferimientos avisa aunque la llamada sea reciente; y nunca retira`, async () => {
    fake = seed({
      calls: [callRow({ ended_at: iso(at(T0, -1)), metadata: { [RECONCILE_DEFERRED_AT_KEY]: iso(at(T0, -1)), [RECONCILE_DEFERRALS_KEY]: RECONCILE_ALERT_AFTER_DEFERRALS - 1 } })],
      call_consents: [acta()],
    });
    getTwilioClientForOrg.mockRejectedValue(new VoiceNotConfiguredError('sin credenciales'));
    const log = mkLog();
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log });
    expect(r).toMatchObject({ candidates: 1, deferred: 1, stale: 1, voided: 0 });
    expect((fake.rows('calls')[0].metadata as Row)[RECONCILE_DEFERRALS_KEY]).toBe(RECONCILE_ALERT_AFTER_DEFERRALS);
    expect(log.warn).toHaveBeenCalledWith('consent_reconcile_stale_candidate', expect.objectContaining({ deferrals: RECONCILE_ALERT_AFTER_DEFERRALS }));
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: true, consent_given: true });
  });

  it('H1.4 · diferida fuera de la ventana y luego Twilio responde: lista vacía → voided (evidencia positiva); `completed` → recovered y se limpia la marca', async () => {
    // (a) voided
    fake = seed({ calls: [callRow({ ended_at: iso(at(T0, -12)), metadata: { [RECONCILE_DEFERRED_AT_KEY]: iso(at(T0, -1)), [RECONCILE_DEFERRALS_KEY]: 5 } })], call_consents: [acta()] });
    const ra = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log: mkLog() });
    expect(ra).toMatchObject({ candidates: 1, voided: 1, deferred: 0, stale: 0 });
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.rows('calls')[0]).toMatchObject({ recording_enabled: false, consent_given: false });
    expect((fake.rows('calls')[0].metadata as Row).recording_absent_reason).toBe('reconcile_no_recording');

    // (b) recovered: la marca de diferimiento se retira para que la fila no
    // vuelva a entrar en la consulta de diferidas cada día.
    fake = seed({ calls: [callRow({ ended_at: iso(at(T0, -12)), metadata: { [RECONCILE_DEFERRED_AT_KEY]: iso(at(T0, -1)), [RECONCILE_DEFERRALS_KEY]: 5 } })], call_consents: [acta()] });
    recordingsList.mockResolvedValueOnce([{ sid: 'REr8b', status: 'completed', uri: '/rec/REr8b.json', channels: 2, duration: '16' }]);
    const rb = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log: mkLog() });
    expect(rb).toMatchObject({ candidates: 1, recovered: 1, voided: 0 });
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_recordings')).toHaveLength(1);
    const md = fake.rows('calls')[0].metadata as Row;
    expect(md[RECONCILE_DEFERRED_AT_KEY]).toBeUndefined();
    expect(md[RECONCILE_DEFERRALS_KEY]).toBe(5); // el contador queda como evidencia
    expect(md.consent_reconcile_resolved_at).toBe(iso(T0));
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ dedupeKey: 'recording_fetch:REr8b' }));
  });

  it('H1.5 · caso real de la org 125: acta de 16 s terminada el 2026-09-13 03:25 UTC, diferida el 19, sigue candidata el 21 (ya fuera de la ventana)', async () => {
    const ended = new Date('2026-09-13T03:25:02.254Z');
    fake = seed({ calls: [callRow({ ended_at: iso(ended), started_at: iso(new Date(ended.getTime() - 16_000)), metadata: {} })], call_consents: [acta({ announced_at: iso(ended) })] });
    getTwilioClientForOrg.mockRejectedValue(new VoiceNotConfiguredError('sin credenciales'));
    expect(await reconcileConsentsWithoutRecording(fake.client(), { now: new Date('2026-09-19T04:00:00Z'), log: mkLog() })).toMatchObject({ candidates: 1, deferred: 1 });
    expect(await reconcileConsentsWithoutRecording(fake.client(), { now: new Date('2026-09-21T04:00:00Z'), log: mkLog() })).toMatchObject({ candidates: 1, deferred: 1 });
    expect(fake.rows('call_consents')).toHaveLength(1);
  });

  it('H1.6 · dos orgs: la diferida de una no arrastra a la otra, y cada marca se escribe SOLO en su fila', async () => {
    fake = seed({
      calls: [callRow(), callRow({ id: CALL_B, organization_id: ORG + 1, provider_call_sid: 'CAr8bcall02' })],
      call_consents: [acta(), acta({ id: 'k2', call_id: CALL_B, organization_id: ORG + 1 })],
    });
    (getTwilioClientForOrg as jest.Mock).mockImplementation(async (orgId: unknown) => {
      if (orgId === ORG) throw new VoiceNotConfiguredError('sin credenciales');
      return { client: { recordings: { list: recordingsList } } as unknown, creds: {} };
    });
    const r = await reconcileConsentsWithoutRecording(fake.client(), { now: T0, log: mkLog() });
    expect(r).toMatchObject({ candidates: 2, deferred: 1, voided: 1 });
    const a = fake.rows('calls').find((c) => c.id === CALL_ID)!;
    const b = fake.rows('calls').find((c) => c.id === CALL_B)!;
    expect((a.metadata as Row)[RECONCILE_DEFERRALS_KEY]).toBe(1);
    expect((b.metadata as Row)[RECONCILE_DEFERRALS_KEY]).toBeUndefined();
    expect(b).toMatchObject({ recording_enabled: false, consent_given: false });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H-2 · agentRuntime sin fila enlazada: fallo cerrado
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR8B-H2 · agentRuntime sin fila `calls` enlazada no promete grabación', () => {
  it('H2.1 · `voice_agent_calls.call_id` nulo + org con grabación encendida → recordingEnabled=false y el prompt no habla de grabación', async () => {
    fake = seed({ voice_agent_calls: [{ id: VAC, organization_id: ORG, voice_agent_id: 'ag-8', call_id: null, provider_call_sid: null, status: 'dialing', consent_given: false, customer_id: null, opportunity_id: null, stage_agent_id: null }] });
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-8', callId: VAC });
    expect(cfg.recordingEnabled).toBe(false);
    expect(cfg.systemPrompt).not.toContain('AVISO DE GRABACIÓN');
  });

  it('H2.2 · sin `callId` (config por agente) → false aunque comm_settings diga true', async () => {
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-8', callId: null });
    expect(cfg.recordingEnabled).toBe(false);
  });

  it('H2.3 · contraprueba: con fila enlazada en true, el prompt sí habla de la grabación (la fila manda, no comm_settings)', async () => {
    fake = seed({
      comm_settings: [{ organization_id: ORG, voice_recording_enabled: false, voice_consent_message: CONSENT_TEXT, is_active: true, voice_agent_enabled: true }],
      voice_agent_calls: [{ id: VAC, organization_id: ORG, voice_agent_id: 'ag-8', call_id: CALL_ID, provider_call_sid: null, status: 'dialing', consent_given: false, customer_id: null, opportunity_id: null, stage_agent_id: null }],
      calls: [callRow({ mode: 'ai_agent', status: 'in_progress', ended_at: null, consent_given: false })],
    });
    const cfg = await buildRuntimeConfig(fake.client(), { agentId: 'ag-8', callId: VAC });
    expect(cfg.recordingEnabled).toBe(true);
    expect(cfg.systemPrompt).toContain('AVISO DE GRABACIÓN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H-3 · las rutas pasan la casilla REAL al servicio (servicio real, no doblado)
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

function multipart(fields: Record<string, string>, path = '/api/crm/calls/manual'): NextRequest {
  const f = new FormData();
  f.set('audio', new Blob([new Uint8Array(WAV)], { type: 'audio/wav' }), 'a.wav');
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const req = new Request(`http://localhost${path}`, { method: 'POST', body: f });
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}

describe('VOZR8B-H3 · rutas manual/transcribe con el servicio REAL', () => {
  it('D.5 · /api/crm/calls/manual sin casilla → 400, cero filas en calls/call_consents y cero subidas; con `on` → 201 y el servicio recibe `recordingDeclaration: true` leído del formulario', async () => {
    const no = await manualPOST(multipart({ opportunity_id: 'opp-1' }));
    expect(no.status).toBe(400);
    expect(await no.json()).toMatchObject({ code: 'RECORDING_DECLARATION_REQUIRED' });
    // Defensa en profundidad: si el servicio llegara a ejecutarse, lo haría con
    // la casilla real (false) y lanzaría; nunca con `true` cableado.
    for (const call of createManualSpy.mock.calls) expect((call as unknown as [number, string, { recordingDeclaration: boolean }])[2].recordingDeclaration).toBe(false);
    expect(fake.rows('calls')).toHaveLength(0);
    expect(fake.rows('call_consents')).toHaveLength(0);
    expect(fake.storageCalls.filter((s) => s.op === 'upload')).toHaveLength(0);

    const ok = await manualPOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'on' }));
    expect(ok.status).toBe(201);
    const last = createManualSpy.mock.calls.at(-1) as unknown as [number, string, { recordingDeclaration: boolean }];
    expect(last[2].recordingDeclaration).toBe(true);
    expect(fake.rows('calls')).toHaveLength(1);
    expect(fake.rows('call_consents')).toHaveLength(1);
    expect(fake.rows('call_consents')[0].method).toBe('manual');
    expect(String(fake.rows('call_consents')[0].recorded_announcement_text)).toContain('Declaración marcada por el usuario');
  });

  it('D.5c · ninguna de las dos rutas lleva `recordingDeclaration: true` cableado (única forma de ver el mutante, equivalente mientras la guarda exista)', () => {
    // Complemento de cadena a D.5/D.5b: con la guarda de la ruta intacta, un
    // `true` cableado es indistinguible por conducta; sin la guarda (M09) lo
    // atrapan D.5/D.5b con el servicio real. Aquí se documenta H-3 tal cual.
    const fs = jest.requireActual('fs') as typeof import('fs');
    for (const f of ['src/app/api/crm/calls/manual/route.ts', 'src/app/api/crm/transcribe/route.ts']) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s).not.toContain('recordingDeclaration: true');
      expect(s).toContain('const recordingDeclaration = readRecordingDeclaration(form);');
    }
  });

  it('D.5b · /api/crm/transcribe: misma conducta con el servicio real', async () => {
    const no = await transcribePOST(multipart({ opportunity_id: 'opp-1' }, '/api/crm/transcribe'));
    expect(no.status).toBe(400);
    expect(fake.rows('calls')).toHaveLength(0);
    expect(fake.storageCalls.filter((s) => s.op === 'upload')).toHaveLength(0);
    const ok = await transcribePOST(multipart({ opportunity_id: 'opp-1', recording_declaration: 'true' }, '/api/crm/transcribe'));
    expect(ok.status).toBe(200);
    const last = createManualSpy.mock.calls.at(-1) as unknown as [number, string, { recordingDeclaration: boolean }];
    expect(last[2].recordingDeclaration).toBe(true);
    expect(fake.rows('call_consents')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H-4 · F-4 por conducta
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR8B-H4 · consent_method por conducta', () => {
  it('B.1 · isUnverifiedConsent reconoce el literal de consentService y nada más', () => {
    expect(isUnverifiedConsent(UNVERIFIED_CONSENT_METHOD)).toBe(true);
    expect(isUnverifiedConsent('unverified_announcement')).toBe(true);
    expect(isUnverifiedConsent('voice_announcement')).toBe(false);
    expect(isUnverifiedConsent('manual')).toBe(false);
    expect(isUnverifiedConsent(null)).toBe(false);
    expect(isUnverifiedConsent(undefined)).toBe(false);
    expect(isUnverifiedConsent('')).toBe(false);
  });

  it('B.3 · listCallsWithRelations mapea `consent_method` de la acta de grabación del embed (y null sin acta o con acta de otro tipo)', async () => {
    fake = seed({
      calls: [
        callRow({ id: CALL_ID, user_id: null, call_consents: [{ consent_type: 'marketing', method: 'sms' }, { consent_type: 'recording', method: 'unverified_announcement' }], call_recordings: [] }),
        callRow({ id: CALL_B, user_id: null, call_consents: [{ consent_type: 'marketing', method: 'sms' }], call_recordings: [] }),
        callRow({ id: 'cccccccc-0000-4000-8000-000000000105', user_id: null, call_consents: null, call_recordings: [] }),
      ],
    });
    const { data } = await listCallsWithRelations(ORG, fake.client());
    const byId = new Map(data.map((r) => [r.id, r.consent_method]));
    expect(byId.get(CALL_ID)).toBe('unverified_announcement');
    expect(byId.get(CALL_B)).toBeNull();
    expect(byId.get('cccccccc-0000-4000-8000-000000000105')).toBeNull();
    expect(isUnverifiedConsent(byId.get(CALL_ID))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Nota 6 · callAnalysisService no arrastra el cliente de navegador
// ═══════════════════════════════════════════════════════════════════════════

describe('VOZR8B-N6 · importar callAnalysisService no crea el cliente de navegador', () => {
  it('N6.1 · con `@/lib/supabase/config` reventando al cargarse, el módulo REAL se importa igual (stageGateService se carga bajo demanda)', () => {
    jest.isolateModules(() => {
      jest.doMock('@/lib/supabase/config', () => {
        throw new Error('cliente de navegador importado desde un route handler');
      });
      jest.doMock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
      jest.doMock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(), InsufficientCreditsError: class extends Error {} }));
      jest.doMock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(), round6: (n: number) => n }));
      const mod = jest.requireActual('@/lib/services/crm/callAnalysisService') as { AnalysisError: unknown };
      expect(typeof mod.AnalysisError).toBe('function');
    });
  });
});
