/**
 * Builder F0-JOBS r4 — puntos 1–4 del QA r3 (`F0-JOBS-qa-r3.md`):
 *  1. `findByClientRequestId` fail-closed (propaga `error`), handler `whatsapp`
 *     ⇒ `JobRetryableError` sin envío, `retried_from` estable, migración 42.
 *  2. `signal` recomprobada antes de cada efecto (whatsapp/email).
 *  3. Permisos (volteado en r5): `crm.jobs.view` / `crm.jobs.retry` por
 *     `hasOrgAdminOrPermission` (`check_user_permission` mockeada, fail-closed);
 *     sin `STAGE_MANAGER_ROLE_IDS`.
 *  4. Espera entre los dos intentos de `fn_complete_job` (solo si queda
 *     presupuesto); productor sin consultas con presupuesto 0.
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));
jest.mock('@/lib/services/crm/whatsapp/outboundService', () => {
  const real = jest.requireActual('@/lib/services/crm/whatsapp/outboundService');
  return { ...real, sendWhatsApp: jest.fn() };
});
jest.mock('@/lib/services/crm/email/sendService', () => ({ dispatchScheduledEmail: jest.fn(async () => ({ sent: true })) }));
jest.mock('@/lib/services/crm/email/batchService', () => ({ sendPendingBatch: jest.fn() }));
jest.mock('@/lib/services/crm/email/inboundService', () => ({ ingestReceivedEmail: jest.fn() }));
jest.mock('@/lib/services/crm/email/types', () => ({ isEmailError: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));

import { findByClientRequestId, sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { whatsappJobHandler } from '../handlers/whatsapp';
import { emailJobHandler } from '../handlers/email';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { COMPLETE_RETRY_DELAY_MS, runJobs } from '../runner';
import { JobRetryableError, type JobContext, type OutboundJob } from '../types';
import { canRetryJobs, canViewJobs, JOBS_RETRY_PERMISSION, JOBS_VIEW_PERMISSION, resolveJobsPermissions, retryJob } from '@/lib/services/crm/jobsService';
import { ORG_ADMIN_PERMISSION_CODE } from '@/lib/utils/orgAdmin';

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeJob(kind: OutboundJob['kind'], payload: Record<string, unknown>, id = 'job-1', extra: Partial<OutboundJob> = {}): OutboundJob {
  return {
    id, organization_id: 105, kind, payload, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
    last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '', ...extra,
  };
}
const ctx = (job: OutboundJob, sb: SupabaseClient, signal = new AbortController().signal): JobContext => ({ job, supabase: sb, orgId: job.organization_id, log, signal });

/** `messages` con respuesta configurable para `findByClientRequestId` REAL. */
function messagesSb(resp: { data?: unknown; error?: { message: string } | null }, onQuery?: () => void) {
  return {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'order', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = async () => {
        onQuery?.();
        await sleep(2);
        return { data: null, error: null, ...resp };
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('r4 · 1 — findByClientRequestId fail-closed', () => {
  it('propaga el error de la consulta en vez de devolver null', async () => {
    await expect(findByClientRequestId(105, 'job:job-1', messagesSb({ error: { message: 'canceling statement due to statement timeout' } }))).rejects.toThrow(
      'findByClientRequestId: canceling statement due to statement timeout',
    );
    await expect(findByClientRequestId(105, 'job:job-1', messagesSb({ data: null }))).resolves.toBeNull();
    await expect(findByClientRequestId(105, 'job:job-1', messagesSb({ data: { id: 'm', conversation_id: 'c' } }))).resolves.toEqual({ id: 'm', conversation_id: 'c' });
  });

  it('handler whatsapp: consulta fallida ⇒ JobRetryableError sin retryAfterSeconds (backoff estándar) y 0 envíos', async () => {
    const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };
    const err = await whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), messagesSb({ error: { message: 'ECONNRESET' } }))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobRetryableError);
    expect((err as JobRetryableError).message).toBe('idempotency_check_failed: findByClientRequestId: ECONNRESET');
    expect((err as JobRetryableError).retryAfterSeconds).toBeUndefined();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('retryJob: retried_from apunta a la raíz en cualquier generación (job-1 → job-2 → job-3 → job-4)', async () => {
    const rpc = jest.fn(async () => ({ data: 'new', error: null }));
    const seen: Record<string, unknown>[] = [];
    const make = (job: OutboundJob) => ({
      rpc,
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'update']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: job, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
        return chain;
      },
    }) as unknown as SupabaseClient;
    await retryJob(make(makeJob('whatsapp', { message_request: {} }, 'job-1', { status: 'failed' })), 105, 'job-1', 'admin');
    await retryJob(make(makeJob('whatsapp', { message_request: {}, retried_from: 'job-1' }, 'job-2', { status: 'failed' })), 105, 'job-2', 'admin');
    await retryJob(make(makeJob('whatsapp', { message_request: {}, retried_from: 'job-1' }, 'job-3', { status: 'dead' })), 105, 'job-3', 'admin');
    for (const call of rpc.mock.calls as unknown[][]) seen.push((call[1] as { p_payload: Record<string, unknown> }).p_payload);
    expect(seen.map((p) => p.retried_from)).toEqual(['job-1', 'job-1', 'job-1']);
    // Un `retried_from` que no sea string no se hereda: se usa el propio id.
    await retryJob(make(makeJob('whatsapp', { retried_from: 7 }, 'job-9', { status: 'failed' })), 105, 'job-9', 'admin');
    expect((rpc.mock.calls[3] as unknown[])[1]).toMatchObject({ p_payload: { retried_from: 'job-9' } });
  });
});

describe('r4 · 1 — migración crm_v4_f00_42 (índice parcial, PENDIENTE de aplicar)', () => {
  const dir = path.join(process.cwd(), 'supabase');
  const mig = fs.readFileSync(path.join(dir, 'migrations', '20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql'), 'utf8');
  const rb = fs.readFileSync(path.join(dir, 'rollbacks', '20260915234000_crm_v4_f00_42_idx_messages_client_request_id_rollback.sql'), 'utf8');
  const code = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('crea un índice parcial sobre (organization_id, metadata->>client_request_id) solo para salientes con clave, sin CONCURRENTLY en la sentencia (transacción del MCP) y con IF NOT EXISTS', () => {
    const sql = code(mig);
    expect(sql).toMatch(/create index if not exists idx_messages_org_client_request_id\s+on public\.messages \(organization_id, \(metadata->>'client_request_id'\)\)\s+where direction = 'outbound' and \(metadata->>'client_request_id'\) is not null;/i);
    expect(sql).not.toMatch(/concurrently/i);
    // Predicado demostrable por el planificador a partir de `.eq('metadata->>client_request_id', …)`.
    expect(sql).not.toMatch(/metadata \? 'client_request_id'/);
    expect(mig).toMatch(/bloqueo esperado/i);
    expect(mig).toMatch(/258 899 filas/);
  });

  it('rollback: drop index if exists del mismo nombre; ninguno de los dos trae credenciales ni nombres de organizaciones cliente', () => {
    expect(code(rb)).toMatch(/drop index if exists public\.idx_messages_org_client_request_id;/i);
    for (const sql of [mig, rb]) {
      expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk_live|service_role_key|password\s*=/i);
      expect(sql).not.toMatch(/org(anización|anization)?\s*\d+\s*\(/i);
    }
  });
});

describe('r4 · 2 — signal antes de cada efecto', () => {
  const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };

  it('whatsapp: abort durante findByClientRequestId (real) ⇒ JobRetryableError «aborted tras la comprobación» y 0 envíos', async () => {
    const controller = new AbortController();
    const sb = messagesSb({ data: null }, () => controller.abort());
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb, controller.signal))).rejects.toThrow('aborted tras la comprobación de idempotencia');
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('whatsapp: si ya se envió, el abort tardío no importa: skipped sin envío', async () => {
    const controller = new AbortController();
    const sb = messagesSb({ data: { id: 'm-1', conversation_id: 'c-1' } }, () => controller.abort());
    await expect(whatsappJobHandler(ctx(makeJob('whatsapp', { message_request: req }), sb, controller.signal))).resolves.toMatchObject({ skipped: true, reason: 'already_sent', message_id: 'm-1' });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  const emailSb = (row: { id: string } | null, opts: { error?: { message: string }; onQuery?: () => void; filters?: Record<string, unknown>[] } = {}) =>
    ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, v: unknown) => { opts.filters?.push({ [col]: v }); return chain; };
        chain.maybeSingle = async () => {
          opts.onQuery?.();
          await sleep(2);
          if (opts.error) return { data: null, error: opts.error };
          return { data: table === 'email_messages' ? row : null, error: null };
        };
        return chain;
      },
    }) as unknown as SupabaseClient;

  it('email: el email_message_id debe pertenecer a la org del job; si no ⇒ skipped not_found sin despachar', async () => {
    const filters: Record<string, unknown>[] = [];
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-otra' }), emailSb(null, { filters })))).resolves.toEqual({ skipped: true, reason: 'not_found' });
    expect(filters).toEqual([{ id: 'em-otra' }, { organization_id: 105 }]);
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
  });

  it('email: error al comprobar la pertenencia ⇒ JobRetryableError (no se despacha a ciegas)', async () => {
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), emailSb(null, { error: { message: 'timeout' } })))).rejects.toThrow('email_messages: timeout');
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
  });

  it('email: abort durante la comprobación ⇒ JobRetryableError antes de dispatchScheduledEmail; sin abort, despacha', async () => {
    const controller = new AbortController();
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), emailSb({ id: 'em-1' }, { onQuery: () => controller.abort() }), controller.signal))).rejects.toThrow('aborted antes de dispatchScheduledEmail');
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-1' }), emailSb({ id: 'em-1' })))).resolves.toEqual({ sent: true, email_message_id: 'em-1' });
    expect(dispatchScheduledEmail).toHaveBeenCalledWith('em-1', expect.anything());
  });
});

describe('r4 · 3 (volteado en r5) — permisos por código: crm.jobs.view / crm.jobs.retry (check_user_permission mockeada)', () => {
  const session = (roleId: number, rpc: jest.Mock, extra: Record<string, unknown> = {}) => ({
    roleId,
    roleName: 'x',
    isSuperAdmin: false,
    userId: 'user-uuid',
    organizationId: 105,
    supabase: { rpc } as unknown as SupabaseClient,
    ...extra,
  });
  /** `check_user_permission` por código: lo que no esté en `grants` ⇒ false. */
  const rpcByCode = (grants: Record<string, boolean>) =>
    jest.fn(async (_fn: string, args: { p_permission_code: string }) => ({ data: grants[args.p_permission_code] === true, error: null }));
  const codesAsked = (rpc: jest.Mock) => rpc.mock.calls.map((c: unknown[]) => (c[1] as { p_permission_code: string }).p_permission_code);

  it('Empleado (4) con crm.jobs.view y crm.jobs.retry por cargo ⇒ ve Y reintenta; la RPC recibe usuario y org DE LA SESIÓN y los códigos propios, nunca admin.full_access', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true, [JOBS_RETRY_PERMISSION]: true });
    const ctx4 = session(4, rpc);
    expect(await canViewJobs(ctx4)).toBe(true);
    expect(await canRetryJobs(ctx4)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(3); // view (canViewJobs) + [view, retry] (canRetryJobs = view ∧ retry, r5 cierre)
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'user-uuid', p_organization_id: 105, p_permission_code: 'crm.jobs.view' });
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'user-uuid', p_organization_id: 105, p_permission_code: 'crm.jobs.retry' });
    expect(codesAsked(rpc)).not.toContain(ORG_ADMIN_PERMISSION_CODE);
    expect(JOBS_VIEW_PERMISSION).toBe('crm.jobs.view');
    expect(JOBS_RETRY_PERMISSION).toBe('crm.jobs.retry');
  });

  it('Empleado (4) sin los permisos ⇒ ni ve ni reintenta; RPC con error ⇒ false (fail-closed) y console.warn', async () => {
    const no = rpcByCode({});
    expect(await canViewJobs(session(4, no))).toBe(false);
    expect(await canRetryJobs(session(4, no))).toBe(false);
    const warn = console.warn as jest.Mock;
    warn.mockClear();
    const boom = jest.fn(async () => ({ data: null, error: { message: 'permission denied for function' } }));
    expect(await canViewJobs(session(4, boom))).toBe(false);
    expect(await canRetryJobs(session(4, boom))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/check_user_permission/);
  });

  it('Manager (5): ve y reintenta SOLO porque la BD (f00_45) le concede los dos códigos; un cargo que los niega lo deja fuera aunque sea rol 5', async () => {
    const granted = rpcByCode({ [JOBS_VIEW_PERMISSION]: true, [JOBS_RETRY_PERMISSION]: true });
    expect(await canViewJobs(session(5, granted))).toBe(true);
    expect(granted).toHaveBeenCalledTimes(1); // rol 5 NO entra por el criterio síncrono: siempre consulta la BD
    expect(await canRetryJobs(session(5, granted))).toBe(true);
    expect(granted).toHaveBeenCalledTimes(3); // canRetryJobs = view ∧ retry (r5 cierre): dos RPC más, [view, retry]
    expect(codesAsked(granted)).toEqual(['crm.jobs.view', 'crm.jobs.view', 'crm.jobs.retry']);
    const denied = rpcByCode({});
    expect(await canViewJobs(session(5, denied))).toBe(false);
    expect(await canRetryJobs(session(5, denied))).toBe(false);
    expect(await resolveJobsPermissions(session(5, denied))).toEqual({ canView: false, canRetry: false });
  });

  it('cargo que concede crm.jobs.view y niega crm.jobs.retry ⇒ ve sin reintentar (dos RPC en resolveJobsPermissions: view primero, luego retry)', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true });
    expect(await resolveJobsPermissions(session(4, rpc))).toEqual({ canView: true, canRetry: false });
    expect(codesAsked(rpc)).toEqual(['crm.jobs.view', 'crm.jobs.retry']);
  });

  it('r5 cierre (canRetry = view ∧ retry): con SOLO crm.jobs.retry concedido, resolveJobsPermissions deniega ambos con UNA sola RPC (view) y no pregunta retry', async () => {
    const rpc = rpcByCode({ [JOBS_RETRY_PERMISSION]: true });
    expect(await resolveJobsPermissions(session(4, rpc))).toEqual({ canView: false, canRetry: false });
    expect(codesAsked(rpc)).toEqual(['crm.jobs.view']);
  });

  it('roles 1/2 y super admin: sin RPC (un cargo no puede negarles la cola); rol 9 llamado "Admin de organización" sin permiso concedido ⇒ false (regla 6)', async () => {
    const rpc = rpcByCode({});
    for (const roleId of [1, 2]) {
      expect(await canViewJobs(session(roleId, rpc))).toBe(true);
      expect(await canRetryJobs(session(roleId, rpc))).toBe(true);
    }
    expect(await canRetryJobs(session(9, rpc, { isSuperAdmin: true }))).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(await canViewJobs(session(9, rpc, { roleName: 'Admin de organización' }))).toBe(false);
    expect(await canRetryJobs(session(9, rpc, { roleName: 'Admin de organización' }))).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2); // sí se consulta el permiso: el nombre no decide, la BD sí
  });

  it('el código de JOBS no cablea ids de rol ni nombres ni listas: usa los códigos crm.jobs.* con hasOrgAdminOrPermission; la GET resuelve una vez y el retry usa resolveJobsPermissions(ctx).canRetry', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'services', 'crm', 'jobsService.ts'), 'utf8');
    expect(src).not.toMatch(/MANAGER_ROLE_ID\b/);
    expect(src).not.toMatch(/STAGE_MANAGER_ROLE_IDS/);
    expect(src).not.toMatch(/roleId === \d/);
    expect(src).not.toMatch(/roleName ===/);
    expect(src).not.toMatch(/ORG_ADMIN_PERMISSION_CODE|admin\.full_access'/);
    expect(src).toMatch(/JOBS_VIEW_PERMISSION = 'crm\.jobs\.view'/);
    expect(src).toMatch(/JOBS_RETRY_PERMISSION = 'crm\.jobs\.retry'/);
    expect(src).toMatch(/hasOrgAdminOrPermission\(permissionSubject\(ctx\), code\)/);
    const get = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', 'crm', 'jobs', 'route.ts'), 'utf8');
    expect(get).toMatch(/await resolveJobsPermissions\(ctx\)/);
    expect(get.match(/resolveJobsPermissions\(ctx\)/g)).toHaveLength(1); // una sola resolución por petición
    expect(get).not.toMatch(/can(View|Retry)Jobs\(/);
    const retry = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', 'crm', 'jobs', '[id]', 'retry', 'route.ts'), 'utf8');
    expect(retry).toMatch(/\(await resolveJobsPermissions\(ctx\)\)\.canRetry/); // r5 cierre: punto único, view ∧ retry
    expect(retry.match(/\(await resolveJobsPermissions\(ctx\)\)/g)).toHaveLength(1); // una sola resolución por petición (la cabecera la menciona sin `await`)
    expect(retry).not.toMatch(/can(View|Retry)Jobs\(|hasOrgAdminOrPermission\(|hasJobsPermission\(/); // nada que consulte solo `retry`
  });
});

describe('r4 · 4 — runner: espera entre los dos intentos de fn_complete_job', () => {
  function makeSupabase(job: OutboundJob, completeResponses: Array<{ data: unknown; error: { message: string } | null; delayMs?: number }>) {
    const calls: { fn: string; at: number; end: number }[] = [];
    let idx = 0;
    const sb = {
      rpc: jest.fn(async (fn: string) => {
        const call = { fn, at: Date.now(), end: 0 };
        calls.push(call);
        if (fn === 'fn_claim_jobs') return { data: calls.filter((c) => c.fn === 'fn_claim_jobs').length === 1 ? [job] : [], error: null };
        if (fn === 'fn_complete_job') {
          const r = completeResponses[Math.min(idx++, completeResponses.length - 1)];
          if (r.delayMs) await sleep(r.delayMs);
          call.end = Date.now();
          return { data: r.data, error: r.error };
        }
        if (fn === 'fn_fail_job') return { data: 'failed', error: null };
        return { data: true, error: null };
      }),
      from: jest.fn(),
    } as unknown as SupabaseClient;
    return { sb, calls };
  }

  it('primer intento falla, segundo acierta ⇒ done, sin fn_fail_job, con ≥ COMPLETE_RETRY_DELAY_MS entre ambos', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const { sb, calls } = makeSupabase(makeJob('noop', {}), [{ data: null, error: { message: 'blip' } }, { data: true, error: null }]);
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    const completes = calls.filter((c) => c.fn === 'fn_complete_job');
    expect(completes).toHaveLength(2);
    expect(completes[1].at - completes[0].end).toBeGreaterThanOrEqual(COMPLETE_RETRY_DELAY_MS - 5);
    expect(calls.some((c) => c.fn === 'fn_fail_job')).toBe(false);
    expect(summary).toMatchObject({ done: 1, failed: 0 });
    expect(summary.completeFailed).toBeUndefined();
  });

  it('sin presupuesto para esperar (deadline inminente) el segundo intento es inmediato: la espera nunca se come el margen del runner', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    // deadlineMs justo por encima de MIN_REMAINING_MS (1 500) para que el job se ejecute; el primer
    // fn_complete_job tarda 1 500 ms en fallar, así que al volver quedan < 300 ms: no se espera.
    const { sb, calls } = makeSupabase(makeJob('noop', {}), [{ data: null, error: { message: 'blip' }, delayMs: 1_500 }, { data: null, error: { message: 'blip' } }]);
    const summary = await runJobs({ supabase: sb, worker: 'w', deadlineMs: 1_700, jobTimeoutMs: 1_000 });
    const completes = calls.filter((c) => c.fn === 'fn_complete_job');
    expect(completes).toHaveLength(2);
    expect(completes[1].at - completes[0].end).toBeLessThan(COMPLETE_RETRY_DELAY_MS - 50);
    expect(summary).toMatchObject({ completeFailed: 1, failed: 1 });
  });
});
