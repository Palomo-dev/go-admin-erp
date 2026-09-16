/**
 * F0-JOBS builder r3 — cobertura de los puntos del QA r2 que no viven en el
 * runner ni en la ruta: idempotencia del handler `whatsapp` (N-4), `signal`
 * en los handlers de envío, día de la organización en `recording_cleanup`
 * (N-7), helpers de zona horaria y contrato de scheduling (N-3).
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota` (npm run test:tz-all): ninguna
 * expectativa depende de la zona del host.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/services/crm/whatsapp/outboundService', () => ({
  findByClientRequestId: jest.fn(async () => null),
  sendWhatsApp: jest.fn(async () => ({ message_id: 'm-new', conversation_id: 'c-1', activity_id: 'a-1', customer_id: 'cu', channel_id: 'ch', scheduled: false })),
}));
jest.mock('@/lib/services/crm/email/sendService', () => ({ dispatchScheduledEmail: jest.fn(async () => ({ sent: true })) }));
jest.mock('@/lib/services/crm/email/batchService', () => ({ sendPendingBatch: jest.fn() }));
jest.mock('@/lib/services/crm/email/inboundService', () => ({ ingestReceivedEmail: jest.fn() }));
jest.mock('@/lib/services/crm/email/types', () => ({ isEmailError: () => false }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({ runTranscribePipeline: jest.fn() }));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class TranscriptionError extends Error {} }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ InsufficientCreditsError: class InsufficientCreditsError extends Error {} }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ deleteRecording: jest.fn(async () => undefined) }));
jest.mock('@/lib/services/crm/voiceContextService', () => ({
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  getTwilioClientForOrg: jest.fn(async () => { throw new Error('sin twilio'); }),
}));

import { findByClientRequestId, sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { getTwilioClientForOrg } from '@/lib/services/crm/voiceContextService';
import { whatsappJobClientRequestId, whatsappJobHandler } from '../handlers/whatsapp';
import { emailJobHandler } from '../handlers/email';
import { transcribeHandler } from '../handlers/transcribe';
import { recordingCleanupHandler } from '../handlers/recordingCleanup';
import { getOrgTimezoneForJob, isValidTimezone, loadOrgTimezones, orgDay } from '../orgTimezone';
import { DRAIN_INTERVAL_MIN, DRAIN_SCHEDULE, JOBS_RUN_SCHEDULES, VERCEL_SCHEDULE_KINDS } from '../schedule';
import { JobFatalError, JobRetryableError, type JobContext, type OutboundJob } from '../types';

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeJob(kind: OutboundJob['kind'], payload: Record<string, unknown>, id = 'job-1'): OutboundJob {
  return {
    id, organization_id: 105, kind, payload, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
    last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '',
  };
}

const ctx = (job: OutboundJob, sb: SupabaseClient, signal = new AbortController().signal): JobContext => ({
  job, supabase: sb, orgId: job.organization_id, log, signal,
});

const aborted = () => {
  const c = new AbortController();
  c.abort();
  return c.signal;
};

beforeEach(() => jest.clearAllMocks());

describe('handler whatsapp — idempotente por clientRequestId (N-4)', () => {
  const sb = {} as SupabaseClient;
  const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };

  it('sin clientRequestId en el payload usa job:{id}; con retried_from hereda la clave del job original', () => {
    expect(whatsappJobClientRequestId('j-1', {}, {})).toBe('job:j-1');
    expect(whatsappJobClientRequestId('j-2', {}, { retried_from: 'j-1' })).toBe('job:j-1');
    expect(whatsappJobClientRequestId('j-1', { clientRequestId: 'cli-9' }, {})).toBe('cli-9');
  });

  it('primera ejecución: comprueba la clave, envía con clientRequestId=job:{id} y devuelve message_id', async () => {
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb));
    expect(findByClientRequestId).toHaveBeenCalledWith(105, 'job:job-1', sb);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect((sendWhatsApp as jest.Mock).mock.calls[0][0]).toMatchObject({ orgId: 105, clientRequestId: 'job:job-1', force: true, scheduledAt: null });
    expect(out).toMatchObject({ message_id: 'm-new' });
    expect((out as Record<string, unknown>).skipped).toBeUndefined();
  });

  it('segunda ejecución del mismo job (ya hay un messages con esa clave) ⇒ {skipped:true} y sendWhatsApp NO se invoca', async () => {
    (findByClientRequestId as jest.Mock).mockResolvedValueOnce({ id: 'm-prev', conversation_id: 'c-prev' });
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb));
    expect(out).toEqual({ skipped: true, reason: 'already_sent', message_id: 'm-prev', conversation_id: 'c-prev' });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('retry manual (retried_from) de un envío ya hecho ⇒ skipped, no segundo envío', async () => {
    (findByClientRequestId as jest.Mock).mockResolvedValueOnce({ id: 'm-prev', conversation_id: 'c-prev' });
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req, retried_from: 'job-1' }, 'job-2'), sb));
    expect(findByClientRequestId).toHaveBeenCalledWith(105, 'job:job-1', sb);
    expect(out).toMatchObject({ skipped: true });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('sendWhatsApp devuelve duplicate:true (carrera entre la comprobación y el insert) ⇒ se marca skipped', async () => {
    (sendWhatsApp as jest.Mock).mockResolvedValueOnce({ message_id: 'm-prev', conversation_id: 'c', activity_id: null, duplicate: true });
    const out = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb));
    expect(out).toMatchObject({ skipped: true, reason: 'already_sent', message_id: 'm-prev' });
  });

  it('signal ya abortada ⇒ JobRetryableError sin tocar la BD ni enviar', async () => {
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb, aborted()))).rejects.toBeInstanceOf(JobRetryableError);
    expect(findByClientRequestId).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('orgId del payload distinto al del job ⇒ JobFatalError (nunca se envía con la org del payload)', async () => {
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: { ...req, orgId: 999 } }), sb))).rejects.toBeInstanceOf(JobFatalError);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
});

describe('handlers email y transcribe — signal advisory', () => {
  const sb = {} as SupabaseClient;
  // r4: el envío programado comprueba `email_messages` (id + organization_id) antes de despachar.
  const emailSb = (filters: Record<string, unknown>[] = []) =>
    ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, v: unknown) => { filters.push({ [col]: v }); return chain; };
        chain.maybeSingle = async () => ({ data: table === 'email_messages' ? { id: 'em-1' } : null, error: null });
        return chain;
      },
    }) as unknown as SupabaseClient;

  it('email: signal abortada ⇒ JobRetryableError y dispatchScheduledEmail no se invoca; sin abortar, envía (tras comprobar la pertenencia a la org)', async () => {
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), sb, aborted()))).rejects.toBeInstanceOf(JobRetryableError);
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
    const filters: Record<string, unknown>[] = [];
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), emailSb(filters)))).resolves.toEqual({ sent: true, email_message_id: 'em-1' });
    expect(filters).toEqual([{ id: 'em-1' }, { organization_id: 105 }]);
  });

  it('transcribe: signal abortada ⇒ JobRetryableError antes de cobrar créditos', async () => {
    await expect(transcribeHandler(ctx(makeJob('transcribe', { call_id: 'call-1' }), sb, aborted()))).rejects.toBeInstanceOf(JobRetryableError);
    expect(runTranscribePipeline).not.toHaveBeenCalled();
  });
});

describe('recording_cleanup — cutoff por zona de la organización (N-7)', () => {
  function makeSb(timezone: string | null) {
    const ops: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'in', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        ops.push([m, args]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
    const from = jest.fn((table: string) => {
      if (table === 'organizations') {
        const org: Record<string, unknown> = {};
        org.select = () => org;
        org.in = async () => ({ data: timezone === null ? [] : [{ id: 105, timezone }], error: null });
        return org;
      }
      return chain;
    });
    return { sb: { from } as unknown as SupabaseClient, ops };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-16T03:00:00Z') });
    (getTwilioClientForOrg as jest.Mock).mockRejectedValue(new (jest.requireMock('@/lib/services/crm/voiceContextService').VoiceNotConfiguredError)());
  });
  afterEach(() => jest.useRealTimers());

  it('a las 03:00 UTC del 16, una org en America/Bogota corta en 2026-09-15 (no en el día UTC)', async () => {
    const { sb, ops } = makeSb('America/Bogota');
    const out = await recordingCleanupHandler(ctx(makeJob('recording_cleanup', {}), sb));
    expect(out).toMatchObject({ deleted: 0, remaining: 0, cutoff: '2026-09-15' });
    expect(ops).toEqual(expect.arrayContaining([['lt', ['retention_until', '2026-09-15']], ['eq', ['organization_id', 105]], ['eq', ['status', 'ready']]]));
  });

  it('una org en Asia/Tokyo corta en 2026-09-16; sin zona en BD cae a America/Bogota con aviso', async () => {
    const tokyo = makeSb('Asia/Tokyo');
    expect(await recordingCleanupHandler(ctx(makeJob('recording_cleanup', {}), tokyo.sb))).toMatchObject({ cutoff: '2026-09-16' });
    const none = makeSb(null);
    expect(await recordingCleanupHandler(ctx(makeJob('recording_cleanup', {}), none.sb))).toMatchObject({ cutoff: '2026-09-15' });
    expect(log.warn).toHaveBeenCalledWith('org_timezone_fallback', expect.objectContaining({ org_id: 105 }));
  });
});

describe('orgTimezone helpers', () => {
  it('isValidTimezone acepta IANA y rechaza basura', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });

  it('orgDay usa toPlainDate con `now` y todayInTz sin él; nunca el día UTC', () => {
    const now = new Date('2026-09-16T03:00:00Z');
    expect(orgDay('America/Bogota', now)).toBe('2026-09-15');
    expect(orgDay('UTC', now)).toBe('2026-09-16');
    expect(orgDay('Asia/Tokyo', now)).toBe('2026-09-16');
    expect(orgDay('America/Bogota')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('loadOrgTimezones descarta zonas inválidas; getOrgTimezoneForJob cae al fallback si la consulta falla', async () => {
    const sb = {
      from: () => ({ select: () => ({ in: async () => ({ data: [{ id: 1, timezone: 'Europe/Madrid' }, { id: 2, timezone: 'nope' }], error: null }) }) }),
    } as unknown as SupabaseClient;
    const tz = await loadOrgTimezones([1, 2], sb);
    expect(tz.get(1)).toBe('Europe/Madrid');
    expect(tz.has(2)).toBe(false);

    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }) } as unknown as SupabaseClient;
    await expect(loadOrgTimezones([1], broken)).rejects.toThrow('organizations.timezone: boom');
    const warn = jest.fn();
    expect(await getOrgTimezoneForJob(1, broken, { warn })).toBe('America/Bogota');
    expect(warn).toHaveBeenCalledWith('org_timezone_fallback', expect.objectContaining({ error: expect.stringContaining('boom') }));
  });
});

describe('schedule.ts — contrato único (N-3)', () => {
  it('drenaje total cada DRAIN_INTERVAL_MIN y el cron diario pide los 4 kinds programados', () => {
    expect(DRAIN_SCHEDULE).toBe(`*/${DRAIN_INTERVAL_MIN} * * * *`);
    expect(VERCEL_SCHEDULE_KINDS['30 8 * * *']).toEqual(['recording_cleanup', 'maintenance', 'health_recalculate', 'renewals_sync']);
    expect(VERCEL_SCHEDULE_KINDS['*/5 * * * *']).toEqual(['campaign_batch']);
    expect(JOBS_RUN_SCHEDULES).toEqual([DRAIN_SCHEDULE, '*/5 * * * *', '30 8 * * *']);
  });
});
