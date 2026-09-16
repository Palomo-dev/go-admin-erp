/**
 * Tester F0-JOBS r3 — handlers de envío (idempotencia real de `whatsapp`,
 * `signal` a mitad de camino), presupuesto del productor (`budgetMs`,
 * `truncated`, aborto externo, consultas previas al corte), fechas por zona de
 * la organización en el borde de medianoche, permisos de `canViewJobs` y la
 * migración pendiente `crm_v4_f00_41` frente a `schedule.ts`.
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Los `it.failing` documentan huecos:
 * pasan mientras el hueco exista y fallan cuando el builder lo cierre.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));
jest.mock('../handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ jobs_deleted: 0 })) }));
jest.mock('../scheduled/healthRecalculate', () => ({ runHealthRecalculate: jest.fn() }));
jest.mock('../scheduled/renewalsSync', () => ({ runRenewalsSync: jest.fn() }));
jest.mock('@/lib/services/crm/whatsapp/outboundService', () => {
  const actual = jest.requireActual('@/lib/services/crm/whatsapp/outboundService');
  return { findByClientRequestId: jest.fn(actual.findByClientRequestId), sendWhatsApp: jest.fn() };
});
jest.mock('@/lib/services/crm/email/sendService', () => ({ dispatchScheduledEmail: jest.fn(async () => ({ sent: true })) }));
jest.mock('@/lib/services/crm/email/batchService', () => ({ sendPendingBatch: jest.fn() }));
jest.mock('@/lib/services/crm/email/inboundService', () => ({ ingestReceivedEmail: jest.fn() }));
jest.mock('@/lib/services/crm/email/types', () => ({ isEmailError: () => false }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({ runTranscribePipeline: jest.fn(async () => ({ transcript: { id: 't', status: 'done', provider: 'p', raw_response: {} }, analyzeJobId: null })) }));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class TranscriptionError extends Error {} }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ InsufficientCreditsError: class InsufficientCreditsError extends Error {} }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ deleteRecording: jest.fn(async () => undefined) }));
jest.mock('@/lib/services/crm/voiceContextService', () => ({
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  getTwilioClientForOrg: jest.fn(async () => { throw new Error('sin twilio'); }),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));

import { findByClientRequestId, sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { runMaintenance } from '../handlers/maintenance';
import { runHealthRecalculate } from '../scheduled/healthRecalculate';
import { runRenewalsSync } from '../scheduled/renewalsSync';
import { whatsappJobHandler } from '../handlers/whatsapp';
import { emailJobHandler } from '../handlers/email';
import { transcribeHandler } from '../handlers/transcribe';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { enqueueRecordingCleanup, runScheduledKinds } from '../scheduler';
import { makeJobLogger } from '../runner';
import { DRAIN_SCHEDULE, VERCEL_SCHEDULE_KINDS } from '../schedule';
import { JobRetryableError, type JobContext, type OutboundJob } from '../types';
import { canRetryJobs, canViewJobs, retryJob } from '@/lib/services/crm/jobsService';
import { whatsappJobClientRequestId } from '../handlers/whatsapp';
import { ORG_ADMIN_ROLE_IDS } from '@/lib/utils/orgAdmin';

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeJob(kind: OutboundJob['kind'], payload: Record<string, unknown>, id = 'job-1'): OutboundJob {
  return {
    id, organization_id: 105, kind, payload, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
    last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '',
  };
}
const ctx = (job: OutboundJob, sb: SupabaseClient, signal = new AbortController().signal): JobContext => ({ job, supabase: sb, orgId: job.organization_id, log, signal });

/**
 * `messages` en memoria: `findByClientRequestId` REAL (de outboundService) consulta
 * este store por `metadata->>client_request_id`; `sendWhatsApp` (mock) inserta.
 */
function makeMessagesStore(opts: { failSelect?: boolean; nowMs?: () => number } = {}) {
  const rows: { id: string; conversation_id: string; organization_id: number; direction: string; created_at: string; client_request_id: string }[] = [];
  const sb = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, v: unknown) => { filters[col] = v; return chain; };
      chain.gte = (col: string, v: unknown) => { filters[`gte:${col}`] = v; return chain; };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => {
        if (table !== 'messages') return { data: null, error: null };
        if (opts.failSelect) return { data: null, error: { message: 'canceling statement due to statement timeout' } };
        const since = String(filters['gte:created_at'] ?? '');
        const hit = rows.find((r) => r.organization_id === filters.organization_id && r.direction === filters.direction && r.client_request_id === filters['metadata->>client_request_id'] && r.created_at >= since);
        return { data: hit ? { id: hit.id, conversation_id: hit.conversation_id } : null, error: null };
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { sb, rows };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('tester r3 — whatsapp idempotente de verdad (findByClientRequestId real + store)', () => {
  const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };

  it('dos ejecuciones del MISMO job (timeout advisory / reclaim / complete_failed) ⇒ un solo sendWhatsApp; la 2ª devuelve skipped con el message_id original', async () => {
    const { sb, rows } = makeMessagesStore();
    (sendWhatsApp as jest.Mock).mockImplementation(async (input: { clientRequestId: string; orgId: number }) => {
      rows.push({ id: 'm-1', conversation_id: 'c-1', organization_id: input.orgId, direction: 'outbound', created_at: new Date().toISOString(), client_request_id: input.clientRequestId });
      return { message_id: 'm-1', conversation_id: 'c-1', activity_id: 'a-1' };
    });
    const job = makeJob('whatsapp', { message_request: req });
    const first = await whatsappJobHandler(ctx(job, sb));
    const second = await whatsappJobHandler(ctx(job, sb));
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ message_id: 'm-1' });
    expect(second).toEqual({ skipped: true, reason: 'already_sent', message_id: 'm-1', conversation_id: 'c-1' });
  });

  it('retry manual (job-2 con retried_from job-1) tras un envío de job-1 ⇒ skipped; un job-3 SIN retried_from sí envía (clave distinta)', async () => {
    const { sb, rows } = makeMessagesStore();
    (sendWhatsApp as jest.Mock).mockImplementation(async (input: { clientRequestId: string; orgId: number }) => {
      rows.push({ id: `m-${rows.length + 1}`, conversation_id: 'c', organization_id: input.orgId, direction: 'outbound', created_at: new Date().toISOString(), client_request_id: input.clientRequestId });
      return { message_id: `m-${rows.length}`, conversation_id: 'c', activity_id: null };
    });
    await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }, 'job-1'), sb));
    const retry = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req, retried_from: 'job-1' }, 'job-2'), sb));
    expect(retry).toMatchObject({ skipped: true, reason: 'already_sent' });
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }, 'job-3'), sb));
    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect((sendWhatsApp as jest.Mock).mock.calls.map((c) => c[0].clientRequestId)).toEqual(['job:job-1', 'job:job-3']);
  });

  it('otra org con la misma clave job:{id} NO cuenta como enviado (la búsqueda filtra por organization_id)', async () => {
    const { sb, rows } = makeMessagesStore();
    rows.push({ id: 'm-x', conversation_id: 'c', organization_id: 999, direction: 'outbound', created_at: new Date().toISOString(), client_request_id: 'job:job-1' });
    (sendWhatsApp as jest.Mock).mockResolvedValue({ message_id: 'm-new', conversation_id: 'c', activity_id: null });
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb));
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ message_id: 'm-new' });
  });

  it('si la consulta de idempotencia FALLA (timeout de BD) ⇒ JobRetryableError y sendWhatsApp NO se invoca (r4: fail-closed, nunca «no enviado»)', async () => {
    const { sb, rows } = makeMessagesStore({ failSelect: true });
    rows.push({ id: 'm-prev', conversation_id: 'c', organization_id: 105, direction: 'outbound', created_at: new Date().toISOString(), client_request_id: 'job:job-1' });
    (sendWhatsApp as jest.Mock).mockResolvedValue({ message_id: 'm-dup', conversation_id: 'c', activity_id: null });
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb))).rejects.toMatchObject({ name: 'JobRetryableError', message: expect.stringMatching(/^idempotency_check_failed: .*statement timeout/) });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('HUECO: la ventana de idempotencia es de 7 días: un retry manual del job a los 8 días vuelve a enviar', async () => {
    const { sb, rows } = makeMessagesStore();
    rows.push({ id: 'm-prev', conversation_id: 'c', organization_id: 105, direction: 'outbound', created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), client_request_id: 'job:job-1' });
    (sendWhatsApp as jest.Mock).mockResolvedValue({ message_id: 'm-dup', conversation_id: 'c', activity_id: null });
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req, retried_from: 'job-1' }, 'job-9'), sb));
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ message_id: 'm-dup' });
  });
});

describe('tester r3 — retry de un retry (cadena retried_from)', () => {
  it('retry de un retry conserva la raíz: retried_from = job-1 en la 3.ª generación y la clave whatsapp sigue siendo job:{job-1} (r4)', async () => {
    const rpc = jest.fn(async () => ({ data: 'job-3', error: null }));
    const job2 = {
      id: 'job-2', organization_id: 105, kind: 'whatsapp' as const, payload: { message_request: { orgId: 105 }, retried_from: 'job-1' }, status: 'failed' as const,
      run_at: '', attempts: 1, max_attempts: 3, last_error: 'x', result: null, locked_at: null, locked_by: null, dedupe_key: null, created_at: '', updated_at: '',
    };
    const from = jest.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'update']) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () => ({ data: job2, error: null }));
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
      return chain;
    });
    await retryJob({ rpc, from } as unknown as SupabaseClient, 105, 'job-2', 'admin');
    const payload = (rpc.mock.calls[0] as unknown[])[1] as { p_payload: Record<string, unknown> };
    expect(payload.p_payload.retried_from).toBe('job-1'); // la raíz se hereda, no el intermedio
    expect(whatsappJobClientRequestId('job-3', {}, payload.p_payload)).toBe('job:job-1');
    // Si job-1 fue el que envió (p. ej. complete_failed) y job-2 falló por otra causa, job-3 encuentra el mensaje de job-1 y salta.
  });
});

describe('tester r3 — signal a MITAD del handler (no solo al entrar)', () => {
  const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };

  it('whatsapp: abort mientras se consulta la clave ⇒ JobRetryableError y sendWhatsApp NO se invoca (r4: segundo punto de decisión)', async () => {
    const controller = new AbortController();
    (findByClientRequestId as jest.Mock).mockImplementation(async () => { controller.abort(); await sleep(5); return null; });
    (sendWhatsApp as jest.Mock).mockResolvedValue({ message_id: 'm', conversation_id: 'c', activity_id: null });
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), {} as SupabaseClient, controller.signal))).rejects.toBeInstanceOf(JobRetryableError);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('whatsapp: sendWhatsApp NO recibe el signal (no hay cancelación cooperativa del envío)', async () => {
    (findByClientRequestId as jest.Mock).mockResolvedValue(null);
    (sendWhatsApp as jest.Mock).mockResolvedValue({ message_id: 'm', conversation_id: 'c', activity_id: null });
    await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), {} as SupabaseClient));
    const input = (sendWhatsApp as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(input.signal).toBeUndefined();
  });

  it('email: abort durante la comprobación de pertenencia (tras la inicial, antes de dispatchScheduledEmail) ⇒ JobRetryableError y NO envía (r4)', async () => {
    const controller = new AbortController();
    // r4: el handler comprueba `email_messages` (id + organization_id) antes del
    // envío y vuelve a mirar `signal` después; el abort llega durante esa consulta.
    const sb = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          controller.abort();
          await sleep(5);
          return { data: table === 'email_messages' ? { id: 'em-1' } : null, error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    (dispatchScheduledEmail as jest.Mock).mockResolvedValue({ sent: true });
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), sb, controller.signal))).rejects.toBeInstanceOf(JobRetryableError);
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
  });

  it('transcribe: runTranscribePipeline no recibe el signal (una transcripción en curso no se cancela)', async () => {
    await transcribeHandler(ctx(makeJob('transcribe', { call_id: 'call-1' }), {} as SupabaseClient));
    const opts = (runTranscribePipeline as jest.Mock).mock.calls[0][2] as Record<string, unknown>;
    expect(opts.signal).toBeUndefined();
  });
});

/** Productor: `comm_settings`, `call_recordings`, `organizations` y `fn_enqueue_job` con latencia. */
function makeProducerSb(orgs: number[], opts: { enqueueMs?: number; expired?: number[]; timezones?: Record<number, string>; selectMs?: number } = {}) {
  const queries: string[] = [];
  const rpc = jest.fn(async (_fn: string, args: Record<string, unknown>) => {
    if (opts.enqueueMs) await sleep(opts.enqueueMs);
    return { data: `job-${args.p_org}`, error: null };
  });
  const from = jest.fn((table: string) => {
    queries.push(table);
    const ops: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'in', 'limit']) chain[m] = (...args: unknown[]) => { ops.push([m, args]); return chain; };
    chain.then = async (resolve: (v: unknown) => void) => {
      if (opts.selectMs) await sleep(opts.selectMs);
      if (table === 'comm_settings') return resolve({ data: orgs.map((organization_id) => ({ organization_id })), error: null });
      if (table === 'call_recordings') return resolve({ data: (opts.expired ?? orgs).map((organization_id) => ({ organization_id })), error: null });
      if (table === 'organizations') {
        const ids = (ops.find(([m]) => m === 'in')?.[1][1] as number[]) ?? [];
        return resolve({ data: ids.map((id) => ({ id, timezone: opts.timezones?.[id] ?? 'America/Bogota' })), error: null });
      }
      return resolve({ data: [], error: null });
    };
    return chain;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, from, queries };
}

describe('tester r3 — presupuesto del productor (N-1)', () => {
  const orgs = Array.from({ length: 40 }, (_, i) => i + 1);

  it('aborto EXTERNO a mitad del bucle ⇒ ningún enqueue posterior, truncated y pending_org_ids = las no encoladas, en orden', async () => {
    const { sb, rpc } = makeProducerSb(orgs, { enqueueMs: 20 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 130); // ≈ 5–6 enqueues
    const out = await enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: controller.signal, budgetMs: 60_000 });
    expect(out.truncated).toBe(true);
    expect(out.enqueued).toBeGreaterThan(0);
    expect(out.enqueued).toBeLessThan(40);
    expect(out.enqueued + (out.pending_org_ids?.length ?? 0)).toBe(40);
    expect(out.pending_org_ids).toEqual(orgs.slice(out.enqueued));
    const callsAtAbort = rpc.mock.calls.length;
    await sleep(80);
    expect(rpc.mock.calls.length).toBe(callsAtAbort); // nada se encola tras el aborto
  });

  it('budgetMs SIN signal abortada: el reloj propio corta el bucle (Date.now() >= deadline) aunque el timer externo no dispare', async () => {
    const { sb } = makeProducerSb(orgs, { enqueueMs: 15 });
    const out = await enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: new AbortController().signal, budgetMs: 100 });
    expect(out.truncated).toBe(true);
    expect(out.enqueued).toBeLessThan(15);
  });

  it('con presupuesto 0 y signal YA abortada el productor NO hace ninguna consulta (r4, T-3): queries = []', async () => {
    const { sb, queries, rpc } = makeProducerSb(orgs, { selectMs: 30 });
    const controller = new AbortController();
    controller.abort();
    const out = await enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: controller.signal, budgetMs: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(out).toMatchObject({ enqueued: 0, orgs: 0, truncated: true, reason: 'budget_exhausted' });
    expect(out.pending_org_ids).toBeUndefined(); // sin consultar no se sabe qué orgs quedaron fuera
    expect(queries).toEqual([]);
  });

  it('con presupuesto 0 y signal SIN abortar: el reloj propio corta antes de consultar (T-3)', async () => {
    const { sb, queries } = makeProducerSb(orgs);
    const out = await enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: new AbortController().signal, budgetMs: 0 });
    expect(out).toMatchObject({ enqueued: 0, truncated: true, reason: 'budget_exhausted' });
    expect(queries).toEqual([]);
  });

  it('las tareas F11 NO reciben un mínimo de 1 000 ms: con totalBudgetMs agotado se saltan con reason budget_exhausted y el productor termina en < 500 ms (r4, T-4)', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    (runMaintenance as jest.Mock).mockImplementation(async (_sb: unknown, _log: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return { jobs_deleted: 0 };
    });
    const waitAbort = async (_sb: unknown, _now: unknown, _log: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return { orgs: 0, processed: 0, errors: 0, aborted: true, by_org: [] };
    };
    (runHealthRecalculate as jest.Mock).mockImplementation(waitAbort);
    (runRenewalsSync as jest.Mock).mockImplementation(waitAbort);
    const { sb } = makeProducerSb([]);
    const t0 = Date.now();
    const out = await runScheduledKinds({ kinds: ['maintenance', 'recording_cleanup', 'health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, totalBudgetMs: 300, worker: 't', supabase: sb });
    const elapsed = Date.now() - t0;
    expect(out.maintenance?.ok).toBe(true);
    // total 300 ms ⇒ maintenance ≈ 300 y lo demás ni arranca (antes: max(1000, ≤0) por tarea ⇒ ≈ 2 300 ms).
    expect(out.recording_cleanup).toMatchObject({ enqueued: 0, truncated: true, reason: 'budget_exhausted' });
    expect(out.health_recalculate).toEqual({ ok: false, ms: 0, error: 'budget_exhausted', reason: 'budget_exhausted' });
    expect(out.renewals_sync).toEqual({ ok: false, ms: 0, error: 'budget_exhausted', reason: 'budget_exhausted' });
    expect(runHealthRecalculate).not.toHaveBeenCalled();
    expect(runRenewalsSync).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(500);
  });

  it('comportamiento aceptado (r4, T-5): pending_org_ids NO se persiste y la selección va por id ascendente ⇒ con truncado recurrente las mismas orgs quedan fuera; la promesa «van primero al día siguiente» se retiró de docs/ruta', async () => {
    const run = async () => {
      const { sb } = makeProducerSb(orgs, { enqueueMs: 15 });
      return enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: new AbortController().signal, budgetMs: 90 });
    };
    const day1 = await run();
    const day2 = await run();
    expect(day1.truncated).toBe(true);
    expect(day2.truncated).toBe(true);
    const tail = orgs.slice(Math.max(day1.enqueued, day2.enqueued));
    expect(day1.pending_org_ids).toEqual(expect.arrayContaining(tail));
    expect(day2.pending_org_ids).toEqual(expect.arrayContaining(tail)); // las mismas orgs quedan fuera los dos días
  });

  it('selección por día UTC: a las 23:00 UTC una org en Asia/Tokyo ya está en el día siguiente ⇒ HUECO: `retention_until = díaUTC` vence para Tokio pero no se selecciona', async () => {
    // El comentario del productor («el día UTC es superconjunto») solo vale a las 08:30 UTC.
    const { sb, from } = makeProducerSb([1], { timezones: { 1: 'Asia/Tokyo' } });
    await enqueueRecordingCleanup(sb, new Date('2026-09-15T23:00:00Z'), makeJobLogger({ worker: 't' }), { signal: new AbortController().signal, budgetMs: 60_000 });
    const recordingsCall = from.mock.results.find((_r, i) => from.mock.calls[i][0] === 'call_recordings');
    expect(recordingsCall).toBeDefined();
    // La clave del job SÍ usa el día de Tokio (16), pero el filtro de selección usa `< 2026-09-15` (día UTC).
    const rpc = (sb as unknown as { rpc: jest.Mock }).rpc;
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_dedupe_key: 'recording_cleanup:2026-09-16' });
  });
});

describe('tester r3 — fechas por zona de la organización (N-7)', () => {
  it('borde de medianoche: 2026-09-16T04:59:59Z es el 15 en Bogotá y el 16 en UTC; a las 05:00:00Z ya es el 16 en Bogotá', async () => {
    const { orgDay } = await import('../orgTimezone');
    expect(orgDay('America/Bogota', new Date('2026-09-16T04:59:59Z'))).toBe('2026-09-15');
    expect(orgDay('UTC', new Date('2026-09-16T04:59:59Z'))).toBe('2026-09-16');
    expect(orgDay('America/Bogota', new Date('2026-09-16T05:00:00Z'))).toBe('2026-09-16');
    expect(orgDay('Pacific/Kiritimati', new Date('2026-09-15T10:00:01Z'))).toBe('2026-09-16'); // UTC+14
    expect(orgDay('Pacific/Pago_Pago', new Date('2026-09-15T10:59:59Z'))).toBe('2026-09-14'); // UTC−11
  });

  it('productor a las 08:30 UTC: la clave diaria de una org en Bogotá es el mismo día UTC; una en Pago_Pago (UTC−11) es el día anterior', async () => {
    const { sb, rpc } = makeProducerSb([1, 2], { timezones: { 1: 'America/Bogota', 2: 'Pacific/Pago_Pago' } });
    await enqueueRecordingCleanup(sb, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 't' }), { signal: new AbortController().signal, budgetMs: 60_000 });
    expect(rpc.mock.calls.map((c) => c[1].p_dedupe_key)).toEqual(['recording_cleanup:2026-09-15', 'recording_cleanup:2026-09-14']);
    expect(rpc.mock.calls.map((c) => (c[1].p_payload as Record<string, unknown>).scheduled_for)).toEqual(['2026-09-15', '2026-09-14']);
  });

  it('el código de JOBS no usa toISOString().slice/split para derivar días (regla 1 de fechas)', () => {
    const root = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(p); continue; }
        if (!/\.ts$/.test(entry.name)) continue;
        const src = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|split\('T'\))/.test(src)) offenders.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('tester r3 (volteado en r5) — canViewJobs/canRetryJobs frente al criterio del resto del CRM', () => {
  const base = { isSuperAdmin: false, roleName: 'x', roleId: 0 };
  /** `check_user_permission` por código; lo que no esté en `grants` ⇒ false. */
  const withSession = (roleId: number, grants: Record<string, boolean>, roleName = 'x') => ({
    ...base,
    roleId,
    roleName,
    userId: 'user-uuid',
    organizationId: 105,
    supabase: { rpc: jest.fn(async (_fn: string, args: { p_permission_code: string }) => ({ data: grants[args.p_permission_code] === true, error: null })) } as unknown as SupabaseClient,
  });

  // Sin `userId`/`organizationId`/`supabase` en el contexto no hay sesión completa:
  // solo decide el criterio síncrono (super admin / rol 1/2) y la RPC no se llama.
  it('sin sesión completa coincide con ORG_ADMIN_ROLE_IDS (1, 2) para todos los role_id del sistema (1..5) y un id desconocido: ya no hay lista de roles propia (r5)', async () => {
    for (const roleId of [1, 2, 3, 4, 5, 9]) {
      expect(await canViewJobs({ ...base, roleId })).toBe(ORG_ADMIN_ROLE_IDS.includes(roleId));
      expect(await canRetryJobs({ ...base, roleId })).toBe(ORG_ADMIN_ROLE_IDS.includes(roleId));
    }
    expect(await canViewJobs({ ...base, roleId: 9, isSuperAdmin: true })).toBe(true);
  });

  it('un Empleado (4) sin cargo con crm.jobs.view queda fuera; un Manager (5) ve Y reintenta porque la BD (f00_45) le concede crm.jobs.retry (decisión del dueño, r5)', async () => {
    expect(await canViewJobs(withSession(4, {}, 'Empleado'))).toBe(false);
    const manager = withSession(5, { 'crm.jobs.view': true, 'crm.jobs.retry': true }, 'Manager');
    expect(await canViewJobs(manager)).toBe(true);
    expect(await canRetryJobs(manager)).toBe(true);
    // El rol 5 NO decide por sí mismo: si un cargo le niega crm.jobs.view, no ve.
    expect(await canViewJobs(withSession(5, {}, 'Manager'))).toBe(false);
    expect(await canRetryJobs(withSession(5, {}, 'Manager'))).toBe(false);
  });

  it('regla 6: el NOMBRE "Admin de organización" con role_id 9 NO concede ni ver ni reintentar (hueco cerrado por F0-SEC r1 en orgAdmin.ts)', async () => {
    expect(await canViewJobs({ ...base, roleId: 9, roleName: 'Admin de organización' })).toBe(false);
    expect(await canRetryJobs({ ...base, roleId: 9, roleName: 'Admin de organización' })).toBe(false);
  });
});

describe('tester r3 — migración pendiente crm_v4_f00_41 ↔ schedule.ts', () => {
  const repo = path.resolve(__dirname, '../../../..');
  const mig = fs.readFileSync(path.join(repo, 'supabase/migrations/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql'), 'utf8');
  const rb = fs.readFileSync(path.join(repo, 'supabase/rollbacks/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel_rollback.sql'), 'utf8');

  it('el job 17 pasa exactamente a DRAIN_SCHEDULE y el 19 pide exactamente VERCEL_SCHEDULE_KINDS["30 8 * * *"] en el mismo orden', () => {
    expect(mig).toContain(`schedule => '${DRAIN_SCHEDULE}'`);
    const kinds = JSON.stringify(VERCEL_SCHEDULE_KINDS['30 8 * * *']);
    expect(mig).toContain(`'{"kinds":${kinds}}'::jsonb`);
  });

  it('no activa nada ni toca el 18; el rollback deshace 17 y 19 al estado actual de la BD y tampoco toca `active`', () => {
    const code = (sql: string) => sql.replace(/^\s*--.*$/gm, ''); // sin comentarios
    expect(code(mig)).not.toMatch(/active\s*=>/);
    expect(code(mig)).not.toMatch(/job_id\s*=>\s*18/);
    expect(rb).toContain(`schedule => '* * * * *'`);
    expect(rb).toContain(`'{"kinds":["recording_cleanup","maintenance"]}'::jsonb`);
    expect(code(rb)).not.toMatch(/active\s*=>/);
    // Idempotencia: guardadas por jobid + jobname (un renombre deja la migración sin efecto, sin error).
    expect(mig.match(/if exists \(select 1 from cron\.job where jobid = 1[79] and jobname = '/g)).toHaveLength(2);
    expect(rb.match(/if exists \(select 1 from cron\.job where jobid = 1[79] and jobname = '/g)).toHaveLength(2);
  });

  it('sin credenciales ni nombres de organizaciones cliente en el SQL', () => {
    for (const sql of [mig, rb]) {
      expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT
      expect(sql).not.toMatch(/sb_secret|service_role_key|password\s*=/i);
    }
  });
});
