/**
 * F4 — casos estables consolidados el 2026-09-21 a partir de `f4Adversarial`
 * (grupos C, D y F) y `f4Round2` (R-C): lo que NO estaba ya afirmado por
 * `callChannelRoles.test`, `callActivityService.test` ni ningún otro estable.
 *
 *  - Roles por canal: `bridge` como outbound, hablante repartido entre canales
 *    → unknown, sin segmentos → single.
 *  - Actividad idempotente sobre `FakeDb` con el UNIQUE real
 *    (`activities_call_id_uidx`): concurrencia, carrera entre procesos,
 *    disposición manual que no se pisa, `related_type=customer`, y el canal
 *    de `bridge` idéntico por las dos rutas (F3 `callActivitySync` y F4).
 *  - Llamada manual con audio (`manualCallService`): única batería del servicio.
 *
 * Sin red ni BD.
 */
import { FakeDb } from './fixtures/fakeSupabase';

const chargeAiCredits = jest.fn();
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({})), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: (...a: unknown[]) => chargeAiCredits(...a), refundAiCredits: jest.fn(async () => true), InsufficientCreditsError: class extends Error {} }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.22), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));

import { buildRoleMap, assignSpeakerRoles, channelRoleMap } from '@/lib/services/crm/callChannelRoles';
import { upsertCallActivity, callChannel } from '@/lib/services/crm/callActivityService';
import { activityChannelForMode } from '@/lib/services/crm/callActivitySync';
import { STT_MAX_AUDIO_BYTES } from '@/lib/services/crm/transcriptionService';
import { detectAudioKind, estimateDurationSeconds, createManualCallWithAudio, MANUAL_AUDIO_MAX_BYTES } from '@/lib/services/crm/manualCallService';

const ACTIVITY_TYPES = ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'];
const CALL = { id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 60, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'usr-1' };

function actDb(call: Record<string, unknown> = CALL, activities: any[] = []) {
  return new FakeDb({ tables: { calls: [call], activities }, checks: { activities: { activity_type: ACTIVITY_TYPES } }, unique: { activities: ['call_id'] } });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('roles por canal: bordes (adversarial C3, C10, C12)', () => {
  const seg = (label: string, ch: number | null, start = 0, end = 1000) => ({ speaker_label: label, start_ms: start, end_ms: end, text: 't', confidence: 0.9, channel_index: ch });

  it('C3 · bridge (outbound) se comporta como outbound: canal 0 = agente', () => {
    expect(assignSpeakerRoles([seg('s0', 0), seg('s1', 1, 1000, 2000)], { direction: 'outbound', mode: 'bridge' }).segments[0].speaker_role).toBe('agent');
    expect(channelRoleMap({ direction: 'outbound', mode: 'bridge' })).toEqual({ '0': 'agent', '1': 'customer' });
  });

  it('C10 · un hablante repartido por igual entre canales → unknown; C12 · sin segmentos → single sin hablantes', () => {
    expect(buildRoleMap([seg('a', 0, 0, 1000), seg('a', 1, 1000, 2000)], { direction: 'outbound' }).bySpeaker.a).toBe('unknown');
    const empty = buildRoleMap([], { direction: 'outbound' });
    expect(empty.method).toBe('single');
    expect(Object.keys(empty.bySpeaker)).toHaveLength(0);
  });
});

describe('actividad idempotente con el UNIQUE real por call_id (adversarial D4, D5, D10; r2 R20-R24)', () => {
  it('R20/R21 · cinco upserts CONCURRENTES → UNA actividad, un solo `created` y ninguna excepción', async () => {
    const db = actDb();
    const sb = db.client();
    const res = await Promise.all(Array.from({ length: 5 }, () => upsertCallActivity(7, 'call-1', { supabase: sb })));
    expect(db.tables.activities).toHaveLength(1);
    expect(new Set(res.map((r) => r!.activityId)).size).toBe(1);
    expect(res.filter((r) => r!.created)).toHaveLength(1);
  });

  it('R22 · conflicto de UNIQUE entre procesos: el INSERT perdedor relee y reutiliza la fila ganadora', async () => {
    const db = actDb(CALL, [{ id: 'act-ganadora', organization_id: 7, call_id: 'call-1', activity_type: 'call', metadata: {}, notes: null, created_at: '2026-09-01T09:00:00Z' }]);
    db.failOn['activities:insert'] = 'duplicate key value violates unique constraint "activities_call_id_uidx"';
    expect(await upsertCallActivity(7, 'call-1', { supabase: db.client(), call: db.tables.calls[0] as any })).toEqual({ activityId: 'act-ganadora', created: false });
    expect(db.tables.activities).toHaveLength(1);
  });

  it('R23 · si el INSERT falla y NO hay fila ganadora, el error sí se propaga', async () => {
    const db = actDb();
    db.failOn['activities:insert'] = 'columna inexistente';
    await expect(upsertCallActivity(7, 'call-1', { supabase: db.client() })).rejects.toThrow(/activities insert falló/);
  });

  it('D4 · una disposición manual previa (F3) NO se pisa con el resultado del análisis', async () => {
    const db = actDb(CALL, [{ id: 'act-1', organization_id: 7, call_id: 'call-1', notes: 'n', metadata: { disposition_outcome: 'voicemail' }, outcome: 'voicemail' }]);
    await upsertCallActivity(7, 'call-1', { supabase: db.client(), enrich: { summary: 'resumen IA' } });
    expect(db.rows('activities')[0].outcome).toBe('voicemail');
  });

  it('D5 · sin oportunidad → related_type=customer con el id del cliente', async () => {
    const db = actDb({ ...CALL, opportunity_id: null });
    await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(db.rows('activities')[0]).toMatchObject({ related_type: 'customer', related_id: 'cus-1' });
  });

  it('D10/R24 · mode=bridge escribe channel "mobile" y da el MISMO canal por las dos rutas (F3 y F4)', async () => {
    const db = actDb({ ...CALL, mode: 'bridge' });
    await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(db.tables.activities[0].channel).toBe('mobile');
    expect(callChannel('bridge')).toBe('mobile');
    expect(activityChannelForMode('bridge')).toBe(callChannel('bridge'));
    expect(activityChannelForMode('ai_agent')).toBe('voice_ai');
    expect(activityChannelForMode('browser')).toBe('phone');
  });
});

describe('llamada manual con audio (adversarial F1-F16)', () => {
  const WAV = (() => {
    const b = Buffer.alloc(2048);
    b.write('RIFF', 0, 'latin1');
    b.write('WAVE', 8, 'latin1');
    b.writeUInt32LE(16000, 28); // byteRate
    b.write('data', 36, 'latin1');
    b.writeUInt32LE(1000, 40);
    return b;
  })();
  const bigWav = (bytes: number) => { const b = Buffer.alloc(bytes); b.write('RIFF', 0, 'latin1'); b.write('WAVE', 8, 'latin1'); return b; };
  function manualDb() {
    return new FakeDb({
      tables: { calls: [], call_recordings: [], activities: [], opportunities: [{ id: 'opp-1', organization_id: 7, customer_id: 'cus-1' }], customers: [{ id: 'cus-1', organization_id: 7, phone: '+573001112233' }] },
      checks: { activities: { activity_type: ACTIVITY_TYPES } },
    });
  }
  const create = (db: FakeDb, orgId: number, input: Record<string, unknown>) => createManualCallWithAudio(orgId, 'usr-1', { audio: WAV, ...input } as any, db.client());

  it('F1 · magic bytes: .txt renombrado a .wav → 415 y no crea nada', async () => {
    const fake = Buffer.from('esto es texto plano, no audio, aunque se llame call.wav');
    expect(detectAudioKind(fake)).toBeNull();
    const db = manualDb();
    await expect(create(db, 7, { audio: fake, opportunityId: 'opp-1', originalFilename: 'call.wav' })).rejects.toMatchObject({ status: 415 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F3/F4/F5/F6 · sin oportunidad ni cliente → 400; audio vacío → 400; oportunidad o cliente de OTRA organización → 404', async () => {
    const db = manualDb();
    await expect(create(db, 7, {})).rejects.toMatchObject({ status: 400 });
    await expect(create(db, 7, { audio: Buffer.alloc(0), opportunityId: 'opp-1' })).rejects.toMatchObject({ status: 400 });
    await expect(create(db, 999, { opportunityId: 'opp-1' })).rejects.toMatchObject({ status: 404 });
    await expect(create(db, 999, { customerId: 'cus-1' })).rejects.toMatchObject({ status: 404 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F7 · camino feliz: crea call+recording+activity y sube al path org_{id}/{yyyy}/{mm}/{callId}.wav', async () => {
    const db = manualDb();
    const out = await create(db, 7, { opportunityId: 'opp-1', occurredAt: '2026-03-04T08:00:00Z' });
    expect(out.storagePath).toBe(`org_7/2026/03/${out.callId}.wav`);
    expect(db.storageCalls.some((c) => c.op === 'upload' && c.bucket === 'crm-call-recordings')).toBe(true);
    expect(db.rows('call_recordings')[0]).toMatchObject({ status: 'ready', channels: '1', storage_provider: 'supabase' });
    expect(db.rows('activities')).toHaveLength(1);
  });

  it('F8/F9/F10 · from/to nunca nulos: outbound usa "manual"→teléfono del cliente, inbound invierte, cliente sin teléfono → "manual"', async () => {
    const db = manualDb();
    await create(db, 7, { opportunityId: 'opp-1' });
    expect(db.rows('calls')[0]).toMatchObject({ from_number: 'manual', to_number: '+573001112233', mode: 'manual', duration_source: 'manual' });
    await create(db, 7, { opportunityId: 'opp-1', direction: 'inbound' });
    expect(db.rows('calls')[1]).toMatchObject({ from_number: '+573001112233', to_number: 'manual', direction: 'inbound' });
    db.tables.customers = [{ id: 'cus-1', organization_id: 7, phone: null }];
    await create(db, 7, { opportunityId: 'opp-1' });
    expect(db.rows('calls')[2].to_number).toBe('manual');
  });

  it('F11 · fallo al subir el audio → 500 y se borra la llamada creada (sin huérfanos)', async () => {
    const db = manualDb();
    db.failOn['storage:upload'] = 'bucket lleno';
    await expect(create(db, 7, { opportunityId: 'opp-1' })).rejects.toMatchObject({ status: 500 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F12 · fallo al registrar la grabación → borra llamada y objeto de storage', async () => {
    const db = manualDb();
    db.failOn['call_recordings:insert'] = 'boom';
    await expect(create(db, 7, { opportunityId: 'opp-1' })).rejects.toMatchObject({ status: 500 });
    expect(db.rows('calls')).toHaveLength(0);
    expect(Object.keys(db.storageFiles)).toHaveLength(0);
  });

  it('F13 · detectAudioKind reconoce wav/ogg/webm/m4a/mp3(ID3)/mp3(framesync) y rechaza el resto', () => {
    const mk = (fn: (b: Buffer) => void) => { const b = Buffer.alloc(16); fn(b); return b; };
    expect(detectAudioKind(mk((b) => { b.write('RIFF', 0, 'latin1'); b.write('WAVE', 8, 'latin1'); }))).toBe('wav');
    expect(detectAudioKind(mk((b) => b.write('OggS', 0, 'latin1')))).toBe('ogg');
    expect(detectAudioKind(mk((b) => { b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3; }))).toBe('webm');
    expect(detectAudioKind(mk((b) => b.write('ftyp', 4, 'latin1')))).toBe('m4a');
    expect(detectAudioKind(mk((b) => b.write('ID3', 0, 'latin1')))).toBe('mp3');
    expect(detectAudioKind(mk((b) => { b[0] = 0xff; b[1] = 0xfb; }))).toBe('mp3');
    expect(detectAudioKind(Buffer.alloc(4))).toBeNull();
  });

  it('F14 · estimateDurationSeconds lee la cabecera WAV y no devuelve 0', () => {
    expect(estimateDurationSeconds(WAV, 'wav')).toBeGreaterThanOrEqual(1);
    expect(estimateDurationSeconds(Buffer.alloc(160000), 'mp3')).toBeGreaterThan(0);
  });

  it('F15/F16 · el tope de subida es el que la cascada puede transcribir (25 MB); 30 MB → 413 ANTES de subir, crear la llamada y cobrar', async () => {
    expect(MANUAL_AUDIO_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(MANUAL_AUDIO_MAX_BYTES).toBe(STT_MAX_AUDIO_BYTES);
    const db = manualDb();
    await expect(create(db, 7, { audio: bigWav(30 * 1024 * 1024), opportunityId: 'opp-1' })).rejects.toMatchObject({ status: 413 });
    expect(db.rows('calls')).toHaveLength(0);
    expect(db.rows('call_recordings')).toHaveLength(0);
    expect(db.storageCalls).toHaveLength(0);
    expect(chargeAiCredits).not.toHaveBeenCalled();
  });
});
