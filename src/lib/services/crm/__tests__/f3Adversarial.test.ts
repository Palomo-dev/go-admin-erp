/**
 * F3 adversarial (tester, ronda 1) — cubre los caminos que los tests de F3 no tocan:
 * `storeRecording` real (Basic Auth, dual/mono, path, retención), `recording_cleanup`
 * con Twilio caído, escapado XML del TwiML y pegajosidad de los estados terminales.
 */

jest.mock('@/lib/services/crm/callManagementService', () => ({ updateCallRecording: jest.fn(async () => null) }));
jest.mock('@/lib/services/crm/voiceContextService', () => ({
  getVoiceCredentials: jest.fn(async () => ({ apiKey: 'SKtest', apiSecret: 'sec', accountSid: 'ACtest', authToken: 'tok' })),
  basicAuthHeader: (c: { apiKey?: string; apiSecret?: string; accountSid?: string; authToken?: string }) =>
    c.apiKey && c.apiSecret
      ? `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64')}`
      : c.accountSid && c.authToken
        ? `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`
        : null,
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  getTwilioClientForOrg: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildStoragePath,
  buildTwilioDownloadUrl,
  computeRetentionUntil,
  storeRecording,
  TwilioDownloadError,
} from '@/lib/services/crm/recordingStorageService';
import { updateCallRecording } from '@/lib/services/crm/callManagementService';
import { recordingCleanupHandler } from '@/lib/jobs/handlers/recordingCleanup';
import { getTwilioClientForOrg, VoiceNotConfiguredError } from '@/lib/services/crm/voiceContextService';
import {
  buildOutboundBrowserTwiml,
  buildInboundTwiml,
  buildHangupTwiml,
  clampTimeout,
  escapeXml,
  MAX_CLIENTS_PER_DIAL,
} from '@/lib/services/crm/twimlBuilders';
import { applyStatusEvent, applyDialComplete, isTerminalStatus, mergeTerminalOutcome } from '@/lib/services/crm/callStateMachine';
import { billableMinutes, classifyDestinationSku, computeSettlement } from '@/lib/services/crm/callCreditsService';
import type { OutboundJob } from '@/lib/jobs/types';

const mockUpdateRec = updateCallRecording as jest.MockedFunction<typeof updateCallRecording>;

// ─── storeRecording (descarga real mockeada) ─────────────────────────────────

function storageStub() {
  const uploads: { path: string; bytes: number; contentType?: string }[] = [];
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string, buf: Buffer, opts: { contentType?: string }) => {
          uploads.push({ path, bytes: buf.length, contentType: opts?.contentType });
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, uploads };
}

describe('storeRecording — descarga Twilio → Storage (FASE-03 §4.4)', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    jest.clearAllMocks();
  });

  test('dual: pide ?RequestedChannels=2 con Basic Auth de la API Key y sube al path org_/yyyy/mm/callId.mp3', async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    global.fetch = jest.fn(async (url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization });
      return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(8) } as never;
    }) as never;
    const { client, uploads } = storageStub();

    const out = await storeRecording(
      {
        recordingId: 'r1',
        organizationId: 134,
        callId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/ACx/Recordings/RE1',
        channels: '2',
        retentionDays: 30,
        startedAt: '2026-03-04T10:00:00.000Z',
      },
      client
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACx/Recordings/RE1.mp3?RequestedChannels=2');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('SKtest:sec').toString('base64')}`);
    expect(uploads[0].path).toBe('org_134/2026/03/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp3');
    expect(uploads[0].contentType).toBe('audio/mpeg');
    expect(out.storagePath).toBe('org_134/2026/03/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp3');
    expect(mockUpdateRec).toHaveBeenCalledWith(
      'r1',
      134,
      expect.objectContaining({ status: 'ready', storage_provider: 'supabase', retention_until: out.retentionUntil }),
      client
    );
    // retention_until = hoy + retentionDays (NO la fecha de la llamada)
    expect(out.retentionUntil).toBe(computeRetentionUntil(30));
    // nunca escribe updated_at (C5)
    expect(mockUpdateRec.mock.calls[0][2]).not.toHaveProperty('updated_at');
  });

  test('400 en dual → reintenta en mono', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(String(url));
      if (urls.length === 1) return { ok: false, status: 400, statusText: 'Bad Request', headers: { get: () => null } } as never;
      return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(4) } as never;
    }) as never;
    const { client } = storageStub();
    await storeRecording(
      { recordingId: 'r2', organizationId: 7, callId: 'c2', recordingUrl: 'https://api.twilio.com/x/RE2.mp3', channels: 2, retentionDays: 90 },
      client
    );
    expect(urls[0]).toContain('RequestedChannels=2');
    expect(urls[1]).toBe('https://api.twilio.com/x/RE2.mp3');
  });

  test('404 de Twilio se propaga como TwilioDownloadError(404) (el job lo reintenta)', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null } }) as never) as never;
    const { client } = storageStub();
    await expect(
      storeRecording({ recordingId: 'r3', organizationId: 7, callId: 'c3', recordingUrl: 'https://api.twilio.com/x/RE3', channels: '1', retentionDays: 90 }, client)
    ).rejects.toMatchObject({ name: 'TwilioDownloadError', status: 404 });
    expect(mockUpdateRec).not.toHaveBeenCalled();
  });

  test('dos grabaciones de la MISMA llamada comparten path (la segunda pisa a la primera)', () => {
    const at = new Date('2026-01-15T00:00:00.000Z');
    expect(buildStoragePath(9, 'call-1', 'mp3', at)).toBe(buildStoragePath(9, 'call-1', 'mp3', at));
  });

  test('buildStoragePath sanea el callId y rellena el mes', () => {
    expect(buildStoragePath(3, '../../etc/passwd', 'mp3', new Date('2026-09-01T00:00:00Z'))).toBe('org_3/2026/09/etcpasswd.mp3');
  });

  test('buildTwilioDownloadUrl no duplica extensión', () => {
    expect(buildTwilioDownloadUrl('https://x/RE1.json', { dual: false })).toBe('https://x/RE1.mp3');
    expect(buildTwilioDownloadUrl('https://x/RE1', { dual: true })).toBe('https://x/RE1.mp3?RequestedChannels=2');
  });

  test('computeRetentionUntil: 0 y NaN caen al default de 90 días (0 NO significa "no retener")', () => {
    const today = new Date('2026-05-10T00:00:00.000Z');
    expect(computeRetentionUntil(0, today)).toBe('2026-08-08');
    expect(computeRetentionUntil(Number.NaN, today)).toBe('2026-08-08');
    expect(computeRetentionUntil(1, today)).toBe('2026-05-11');
  });
});

// ─── recording_cleanup ───────────────────────────────────────────────────────

function cleanupSupabase(rows: { id: string; provider_recording_sid: string | null }[], onDelete: (id: string) => void) {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.lt = () => q;
  q.order = () => q;
  q.limit = async () => ({ data: rows, error: null, count: rows.length });
  const recordFor = (id: string) => ({ storage_path: `p/${id}`, storage_provider: 'supabase', provider_recording_sid: `RE_${id}`, status: 'ready' });
  const single: Record<string, unknown> = {};
  single.select = () => single;
  single.eq = () => single;
  single.maybeSingle = async () => ({ data: recordFor(String(single.__id)), error: null });
  return {
    from: (table: string) => {
      if (table !== 'call_recordings') return q;
      return {
        ...q,
        select: (cols: string) => (cols.includes('storage_path') ? single : q),
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          onDelete(paths[0]);
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

describe('job recording_cleanup (FASE-03 §4.4)', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const job = (): OutboundJob => ({
    id: 'j', organization_id: 5, kind: 'recording_cleanup', payload: {}, status: 'running', run_at: '', attempts: 1,
    max_attempts: 3, last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '',
  });

  beforeEach(() => jest.clearAllMocks());

  test('sin credenciales de Twilio no aborta el lote (VoiceNotConfiguredError se traga)', async () => {
    (getTwilioClientForOrg as jest.Mock).mockRejectedValue(new (VoiceNotConfiguredError as new () => Error)());
    const deleted: string[] = [];
    const sb = cleanupSupabase([], (p) => deleted.push(p));
    const out = await recordingCleanupHandler({ job: job(), supabase: sb, orgId: 5, log, signal: new AbortController().signal });
    expect(out).toMatchObject({ deleted: 0, failed: 0, remaining: 0 });
  });

  // INVERTIDO en la ronda 2 (F3): si Storage o el proveedor fallan, `deleteRecording`
  // lanza y la fila sigue `ready` (el lote la cuenta en `failed` y la reintenta).
  test('si el DELETE en Twilio falla (no-404), NO se marca `deleted`: se lanza para reintentar', async () => {
    const { deleteRecording } = jest.requireActual<typeof import('@/lib/services/crm/recordingStorageService')>(
      '@/lib/services/crm/recordingStorageService'
    );
    const sb = {
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({
          data: { storage_path: 'org_5/2026/09/c.mp3', storage_provider: 'supabase', provider_recording_sid: 'RE1', status: 'ready' },
          error: null,
        });
        return q;
      },
      storage: { from: () => ({ remove: async () => ({ error: { message: 'boom storage' } }) }) },
    } as unknown as SupabaseClient;
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('401 Unauthorized'); } }) };

    await expect(deleteRecording('r1', 5, sb, twilio)).rejects.toThrow(/no se pudo eliminar/i);
    // NI Storage NI Twilio borraron nada ⇒ la fila NO se marca `deleted`.
    expect(mockUpdateRec).not.toHaveBeenCalled();
  });

  test('si todo borra bien, sí marca `deleted`', async () => {
    const { deleteRecording } = jest.requireActual<typeof import('@/lib/services/crm/recordingStorageService')>(
      '@/lib/services/crm/recordingStorageService'
    );
    const sb = {
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({
          data: { storage_path: 'org_5/2026/09/c.mp3', storage_provider: 'supabase', provider_recording_sid: 'RE1', status: 'ready' },
          error: null,
        });
        return q;
      },
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    } as unknown as SupabaseClient;
    const twilio = { recordings: () => ({ remove: async () => undefined }) };

    await expect(deleteRecording('r1', 5, sb, twilio)).resolves.toBeUndefined();
    expect(mockUpdateRec).toHaveBeenCalledWith('r1', 5, { status: 'deleted' }, sb);
  });

  test('un 404 del proveedor cuenta como borrado (ya no existe)', async () => {
    const { deleteRecording } = jest.requireActual<typeof import('@/lib/services/crm/recordingStorageService')>(
      '@/lib/services/crm/recordingStorageService'
    );
    const sb = {
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({
          data: { storage_path: 'org_5/2026/09/c.mp3', storage_provider: 'supabase', provider_recording_sid: 'RE1', status: 'ready' },
          error: null,
        });
        return q;
      },
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    } as unknown as SupabaseClient;
    const twilio = { recordings: () => ({ remove: async () => { throw new Error('404 Not Found'); } }) };

    await expect(deleteRecording('r1', 5, sb, twilio)).resolves.toBeUndefined();
    expect(mockUpdateRec).toHaveBeenCalledWith('r1', 5, { status: 'deleted' }, sb);
  });
});

// ─── TwiML: escapado e inyección ─────────────────────────────────────────────

describe('twimlBuilders — escapado e inyección (C9)', () => {
  test('escapa comillas y & en callerId, destino y mensaje de consentimiento', () => {
    const xml = buildOutboundBrowserTwiml({
      origin: 'https://app.test',
      callId: 'c"1&2',
      to: '+57300"/><Say>pwn</Say>',
      callerId: '+1<script>',
      recordingEnabled: true,
      ringTimeoutSeconds: 30,
      agentPrompt: 'Se grabará & punto',
    });
    expect(xml).not.toMatch(/<Say>pwn<\/Say>/);
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/[^&]&(?!amp;|quot;|lt;|gt;|apos;)/);
  });

  test('sin grabación: no hay record, ni recordingStatusCallback, ni whisper de consentimiento', () => {
    const xml = buildOutboundBrowserTwiml({ origin: 'https://a', callId: 'c1', to: '+573001112233', callerId: '+1', recordingEnabled: false, ringTimeoutSeconds: 30 });
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('recordingStatusCallback');
    expect(xml).not.toContain('consent-whisper');
    expect(xml).toContain('<Dial ');
  });

  test('clampTimeout acota a [10,60] y tolera basura', () => {
    expect(clampTimeout(3)).toBe(10);
    expect(clampTimeout(999)).toBe(60);
    expect(clampTimeout(null)).toBe(30);
    expect(clampTimeout(Number.NaN, 25)).toBe(25);
  });

  test('entrante: trunca a 10 <Client> y cuelga con mensaje si no hay agentes', () => {
    const many = Array.from({ length: 25 }, (_, i) => `u_${i}`);
    const xml = buildInboundTwiml({ origin: 'https://a', callId: 'c', from: '+1', identities: many, recordingEnabled: false, consentMessage: 'x', ringTimeoutSeconds: 25 });
    expect((xml.match(/<Client /g) ?? []).length).toBe(MAX_CLIENTS_PER_DIAL);

    const none = buildInboundTwiml({ origin: 'https://a', callId: 'c', from: '+1', identities: [], recordingEnabled: false, consentMessage: 'x', ringTimeoutSeconds: 25 });
    expect(none).toContain('<Hangup/>');
    expect(none).not.toContain('<Dial');
  });

  test('buildHangupTwiml sin texto solo cuelga', () => {
    expect(buildHangupTwiml()).toContain('<Hangup/>');
    expect(buildHangupTwiml()).not.toContain('<Say');
  });

  test('escapeXml es idempotente sobre texto ya escapado (doble escape detectable)', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
    expect(escapeXml(escapeXml('a & b'))).toBe('a &amp;amp; b');
  });
});

// ─── Máquina de estados: desorden ────────────────────────────────────────────

describe('callStateMachine — desorden y terminales pegajosos', () => {
  const snap = (status: string, extra: Record<string, unknown> = {}) =>
    ({ status, answered_at: null, started_at: '2026-09-08T10:00:00.000Z', metadata: {}, ...extra }) as never;

  test('completed → ringing posterior NO degrada el estado', () => {
    const u = applyStatusEvent(snap('completed'), { CallStatus: 'ringing', SequenceNumber: '9' }, 'child');
    expect(u?.status).toBeUndefined();
  });

  test('SequenceNumber repetido o anterior se ignora por completo', () => {
    const meta = { last_seq: { child: 5 } };
    expect(applyStatusEvent(snap('ringing', { metadata: meta }), { CallStatus: 'completed', SequenceNumber: '5' }, 'child')).toBeNull();
    expect(applyStatusEvent(snap('ringing', { metadata: meta }), { CallStatus: 'completed', SequenceNumber: '4' }, 'child')).toBeNull();
    expect(applyStatusEvent(snap('ringing', { metadata: meta }), { CallStatus: 'completed', SequenceNumber: '6' }, 'child')?.status).toBe('completed');
  });

  test('padre completed sin respuesta → canceled; hijo completed sin respuesta → completed', () => {
    expect(applyStatusEvent(snap('ringing'), { CallStatus: 'completed' }, 'parent')?.status).toBe('canceled');
    expect(applyStatusEvent(snap('ringing'), { CallStatus: 'completed' }, 'child')?.status).toBe('completed');
  });

  test('CallDuration solo se toma del leg hijo', () => {
    expect(applyStatusEvent(snap('ringing'), { CallStatus: 'completed', CallDuration: '42' }, 'child')?.duration_seconds).toBe(42);
    expect(applyStatusEvent(snap('ringing'), { CallStatus: 'completed', CallDuration: '42' }, 'parent')?.duration_seconds).toBeUndefined();
  });

  test('AnsweredBy=machine_* marca voicemail y answered_by=machine', () => {
    const u = applyStatusEvent(snap('ringing'), { CallStatus: 'in-progress', AnsweredBy: 'machine_end_beep' }, 'child');
    expect(u?.status).toBe('voicemail');
    expect(u?.answered_by).toBe('machine');
  });

  // Ronda 2 (A3): el buzón NO cierra la llamada; el cierre posterior aporta
  // `ended_at` + duración real aunque el estado ya sea terminal.
  test('el buzón no cierra la llamada: sin ended_at y con awaiting_close', () => {
    const u = applyStatusEvent(snap('ringing'), { CallStatus: 'in-progress', AnsweredBy: 'machine_start' }, 'child');
    expect(u?.ended_at).toBeUndefined();
    expect(u?.duration_seconds).toBeUndefined();
    expect((u?.metadata as { awaiting_close?: boolean }).awaiting_close).toBe(true);
  });

  test('el cierre posterior sobre un terminal aporta ended_at y duración sin degradar el estado', () => {
    const u = applyStatusEvent(snap('voicemail', { metadata: { awaiting_close: true } }), { CallStatus: 'completed', CallDuration: '35' }, 'child');
    expect(u).not.toBeNull();
    expect(u?.status).toBeUndefined(); // pegajoso
    expect(u?.ended_at).toBeTruthy();
    expect(u?.duration_seconds).toBe(35);
    expect((u?.metadata as { awaiting_close?: boolean }).awaiting_close).toBe(false);
  });

  test('un CallStatus desconocido se ignora (no mata la llamada como failed)', () => {
    expect(applyStatusEvent(snap('in_progress'), { CallStatus: 'chupacabra' }, 'child')).toBeNull();
    expect(applyStatusEvent(snap('in_progress'), { CallStatus: '' }, 'child')).toBeNull();
  });

  test('mergeTerminalOutcome: no degrada el terminal ni pisa la duración con 0 (A1)', () => {
    // completed 120 s + dial-complete no-answer sin duración
    expect(
      mergeTerminalOutcome({
        currentStatus: 'completed',
        currentDuration: 120,
        currentAnsweredAt: '2026-09-08T10:00:00.000Z',
        incomingStatus: 'no_answer',
        incomingDuration: 0,
      })
    ).toEqual({});

    // estado vivo: el desenlace del <Dial> manda
    expect(
      mergeTerminalOutcome({ currentStatus: 'in_progress', currentDuration: null, currentAnsweredAt: null, incomingStatus: 'no_answer', incomingDuration: 0 })
    ).toEqual({ status: 'no_answer' });

    // terminal "sin información" + conversación demostrada por el <Dial>
    expect(
      mergeTerminalOutcome({ currentStatus: 'canceled', currentDuration: 0, currentAnsweredAt: null, incomingStatus: 'completed', incomingDuration: 42 })
    ).toEqual({ status: 'completed', duration_seconds: 42 });

    // el buzón manda sobre cualquier desenlace, pero la duración real entra
    expect(
      mergeTerminalOutcome({ currentStatus: 'voicemail', currentDuration: null, currentAnsweredAt: null, incomingStatus: 'completed', incomingDuration: 30 })
    ).toEqual({ duration_seconds: 30 });
  });

  test('applyDialComplete mapea todos los DialCallStatus dentro del CHECK de calls.status', () => {
    const valid = ['dialing', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'canceled', 'voicemail'];
    for (const ds of ['completed', 'answered', 'busy', 'no-answer', 'failed', 'canceled', 'cualquier-cosa']) {
      const u = applyDialComplete(snap('in_progress'), { DialCallStatus: ds });
      expect(valid).toContain(u.status);
      expect(isTerminalStatus(u.status)).toBe(true);
    }
  });

  test('applyDialComplete sin DialCallDuration devuelve 0 (el llamador NO debe pisar una duración ya conocida)', () => {
    expect(applyDialComplete(snap('completed'), { DialCallStatus: 'no-answer' }).duration_seconds).toBe(0);
  });
});

// ─── Créditos ────────────────────────────────────────────────────────────────

describe('callCreditsService', () => {
  test('billableMinutes redondea hacia arriba y trata 0/negativos', () => {
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(null)).toBe(0);
    expect(billableMinutes(-5)).toBe(0);
  });

  test('classifyDestinationSku distingue móvil/fijo CO y entrante', () => {
    expect(classifyDestinationSku('+573001112233')).toBe('voice_out_co_mobile');
    expect(classifyDestinationSku('+5716012345')).toBe('voice_out_co_landline');
    expect(classifyDestinationSku('+18506003708')).toBe('voice_out_co_mobile'); // estimación fuera de CO
    expect(classifyDestinationSku('+573001112233', 'inbound')).toBe('voice_in_local_co');
  });

  test('computeSettlement: SDK solo en browser/inbound y grabación solo si está activa', () => {
    const unitCosts = { pstn: 0.0377, sdk: 0.004, recording: 0.0025 };
    const browser = computeSettlement({ durationSeconds: 61, reservedMinutes: 1, mode: 'browser', recordingEnabled: true, unitCosts });
    expect(browser).toMatchObject({ minutes: 2, extraMinutes: 1 });
    expect(browser.costUsd).toBeCloseTo(0.0884, 6);

    const bridge = computeSettlement({ durationSeconds: 61, reservedMinutes: 0, mode: 'bridge', recordingEnabled: false, unitCosts });
    expect(bridge.breakdown.sdk).toBe(0);
    expect(bridge.breakdown.recording).toBe(0);
  });

  test('computeSettlement con precios nulos (SKU ausente en provider_pricing) no rompe: coste 0', () => {
    const s = computeSettlement({ durationSeconds: 120, reservedMinutes: 1, mode: 'browser', recordingEnabled: true, unitCosts: { pstn: null, sdk: null, recording: null } });
    expect(s.costUsd).toBe(0);
    expect(s.minutes).toBe(2);
  });
});
