/**
 * Tester F0-JOBS r4 — huecos no cubiertos por `builderR4.test.ts`:
 *  - Idempotencia fail-closed vista DESDE EL RUNNER (no solo desde el handler):
 *    error de BD ⇒ `fn_fail_job` con backoff estándar y 0 envíos; timeout
 *    advisory a mitad de la consulta ⇒ 0 envíos aunque la consulta termine.
 *  - `whatsappJobClientRequestId`: `retried_from` vacío / no string / clave
 *    explícita.
 *  - Permisos en las RUTAS (`GET /api/crm/jobs`, `POST …/retry`) con
 *    `getServerOrgContext` mockeado y `check_user_permission` mockeada:
 *    rol 4 sin permiso ⇒ 403, RPC con error ⇒ 403, con permiso ⇒ 200/`canRetry`,
 *    Manager ve pero no reintenta; contexto parcial (sin `userId`) ⇒ sin RPC.
 *  - `hasOrgAdminOrPermission`: solo `data === true` concede.
 *  - Presupuesto F11: la primera tarea consume el total ⇒ la segunda ni arranca.
 *  - `maintenance` con presupuesto total ya agotado: residuo documentado.
 *  - `email`: abort previo + id ajeno ⇒ ninguna consulta.
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Sin datos reales.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

jest.mock('../handlers', () => ({}));
jest.mock('../handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ jobs_deleted: 0 })) }));
jest.mock('../scheduled/healthRecalculate', () => ({ runHealthRecalculate: jest.fn() }));
jest.mock('../scheduled/renewalsSync', () => ({ runRenewalsSync: jest.fn() }));
jest.mock('@/lib/services/crm/whatsapp/outboundService', () => {
  const real = jest.requireActual('@/lib/services/crm/whatsapp/outboundService');
  return { ...real, sendWhatsApp: jest.fn(async () => ({ message_id: 'm-new', conversation_id: 'c-new', activity_id: null })) };
});
jest.mock('@/lib/services/crm/email/sendService', () => ({ dispatchScheduledEmail: jest.fn(async () => ({ sent: true })) }));
jest.mock('@/lib/services/crm/email/batchService', () => ({ sendPendingBatch: jest.fn() }));
jest.mock('@/lib/services/crm/email/inboundService', () => ({ ingestReceivedEmail: jest.fn() }));
jest.mock('@/lib/services/crm/email/types', () => ({ isEmailError: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/utils/orgContext');
  return { ...real, getServerOrgContext: jest.fn() };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({ from: jest.fn() })) }));

import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { runMaintenance } from '../handlers/maintenance';
import { runHealthRecalculate } from '../scheduled/healthRecalculate';
import { runRenewalsSync } from '../scheduled/renewalsSync';
import { whatsappJobClientRequestId, whatsappJobHandler } from '../handlers/whatsapp';
import { emailJobHandler } from '../handlers/email';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { runJobs } from '../runner';
import { runScheduledKinds } from '../scheduler';
import { type JobContext, type OutboundJob } from '../types';
import { canRetryJobs, canViewJobs } from '@/lib/services/crm/jobsService';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { GET as jobsGet } from '@/app/api/crm/jobs/route';
import { POST as retryPost } from '@/app/api/crm/jobs/[id]/retry/route';

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeJob(kind: OutboundJob['kind'], payload: Record<string, unknown>, id = 'job-1', extra: Partial<OutboundJob> = {}): OutboundJob {
  return {
    id, organization_id: 105, kind, payload, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
    last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '', ...extra,
  };
}
const ctx = (job: OutboundJob, sb: SupabaseClient, signal = new AbortController().signal): JobContext => ({ job, supabase: sb, orgId: job.organization_id, log, signal });

/**
 * Supabase para el RUNNER con un job `whatsapp`: `fn_claim_jobs` lo entrega una
 * vez; `messages` (consulta REAL de `findByClientRequestId`) responde según
 * `messages` (error / lentitud); se registran todas las RPC.
 */
function runnerSb(job: OutboundJob, messages: { error?: { message: string }; delayMs?: number; data?: unknown }) {
  let claims = 0;
  const rpc: jest.Mock<Promise<{ data: unknown; error: null }>, [string, Record<string, unknown>?]> = jest.fn(async (fn: string) => {
    if (fn === 'fn_claim_jobs') return { data: ++claims === 1 ? [job] : [], error: null };
    if (fn === 'fn_fail_job') return { data: 'queued', error: null };
    if (fn === 'fn_complete_job') return { data: true, error: null };
    return { data: true, error: null };
  });
  const tables: string[] = [];
  const from = jest.fn((table: string) => {
    tables.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = async () => {
      await sleep(messages.delayMs ?? 2);
      return { data: messages.data ?? null, error: messages.error ?? null };
    };
    return chain;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, tables };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const req = { orgId: 105, customerId: 'cu-1', text: 'hola' };

describe('tester r4 — idempotencia fail-closed vista desde el runner (T-2)', () => {
  it('timeout de BD en findByClientRequestId ⇒ fn_fail_job con backoff estándar (p_retry_after_seconds null), retried:1 y CERO envíos', async () => {
    registerJobHandler('whatsapp', whatsappJobHandler);
    const { sb, rpc } = runnerSb(makeJob('whatsapp', { message_request: req }), { error: { message: 'canceling statement due to statement timeout' } });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ claimed: 1, retried: 1, done: 0, failed: 0 });
    const fail = rpc.mock.calls.find((c) => c[0] === 'fn_fail_job');
    expect(fail).toBeDefined();
    expect(fail![1]).toMatchObject({ p_job_id: 'job-1', p_retry_after_seconds: null });
    expect(String((fail![1] as { p_error: string }).p_error)).toMatch(/idempotency_check_failed: findByClientRequestId: canceling statement/);
    expect(rpc.mock.calls.some((c) => c[0] === 'fn_complete_job')).toBe(false);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('timeout ADVISORY del runner a mitad de la consulta ⇒ el runner reintenta (queued) y el handler, al volver la consulta, NO envía (segundo punto de decisión)', async () => {
    registerJobHandler('whatsapp', whatsappJobHandler);
    // La consulta tarda 120 ms; el runner solo espera 30 ms y aborta la señal.
    const { sb, rpc } = runnerSb(makeJob('whatsapp', { message_request: req }), { delayMs: 120, data: null });
    const summary = await runJobs({ supabase: sb, worker: 'w', jobTimeoutMs: 30 });
    expect(summary).toMatchObject({ claimed: 1, retried: 1 });
    const fail = rpc.mock.calls.find((c) => c[0] === 'fn_fail_job');
    expect(String((fail![1] as { p_error: string }).p_error)).toMatch(/timeout after 30ms/);
    // La consulta sigue viva tras el timeout: al terminar, el handler ve `signal.aborted` y no envía.
    await sleep(200);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('sin timeout ni error: la consulta devuelve null ⇒ SÍ envía una vez (camino feliz, para que las dos pruebas anteriores no pasen por vacuidad)', async () => {
    registerJobHandler('whatsapp', whatsappJobHandler);
    const { sb } = runnerSb(makeJob('whatsapp', { message_request: req }), { data: null });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ claimed: 1, done: 1, retried: 0 });
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect((sendWhatsApp as jest.Mock).mock.calls[0][0]).toMatchObject({ clientRequestId: 'job:job-1', force: true, scheduledAt: null });
  });
});

describe('tester r4 — whatsappJobClientRequestId (retried_from estable)', () => {
  it('retried_from vacío o no string ⇒ job:{id}; retried_from string ⇒ job:{raíz}; clientRequestId explícito gana siempre', () => {
    expect(whatsappJobClientRequestId('job-2', {}, { retried_from: '' })).toBe('job:job-2');
    expect(whatsappJobClientRequestId('job-2', {}, { retried_from: 7 })).toBe('job:job-2');
    expect(whatsappJobClientRequestId('job-2', {}, { retried_from: null })).toBe('job:job-2');
    expect(whatsappJobClientRequestId('job-3', {}, { retried_from: 'job-1' })).toBe('job:job-1');
    expect(whatsappJobClientRequestId('job-3', { clientRequestId: 'req-x' }, { retried_from: 'job-1' })).toBe('req-x');
    expect(whatsappJobClientRequestId('job-3', { clientRequestId: '' }, { retried_from: 'job-1' })).toBe('job:job-1');
  });
});

describe('tester r4 — email: orden de las guardas', () => {
  it('signal ya abortada + email_message_id de otra org ⇒ JobRetryableError ANTES de consultar (ninguna consulta, ningún despacho)', async () => {
    const from = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 'em-ajeno' }), { from } as unknown as SupabaseClient, controller.signal))).rejects.toThrow('aborted antes del envío');
    expect(from).not.toHaveBeenCalled();
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
  });

  it('email_message_id numérico se coerciona a string y se comprueba por org (no se despacha a ciegas)', async () => {
    const filters: Record<string, unknown>[] = [];
    const sb = {
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, v: unknown) => { filters.push({ [col]: v }); return chain; };
        chain.maybeSingle = async () => ({ data: null, error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    await expect(emailJobHandler(ctx(makeJob('email', { email_message_id: 42 }), sb))).resolves.toEqual({ skipped: true, reason: 'not_found' });
    expect(filters).toEqual([{ id: '42' }, { organization_id: 105 }]);
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
  });
});

describe('tester r4 — permisos en las rutas (check_user_permission mockeada)', () => {
  const listSb = (rpc: jest.Mock) =>
    ({
      rpc,
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'order', 'range', 'limit', 'or']) chain[m] = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        return chain;
      },
    }) as unknown as SupabaseClient;

  const session = (roleId: number, rpc: jest.Mock, extra: Record<string, unknown> = {}) => ({
    userId: 'user-uuid',
    organizationId: 105,
    roleId,
    roleName: 'x',
    isSuperAdmin: false,
    supabase: listSb(rpc),
    ...extra,
  });

  const getReq = () => new NextRequest('http://localhost/api/crm/jobs');
  const retryReq = () =>
    new NextRequest('http://localhost/api/crm/jobs/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/retry', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  const params = { params: Promise.resolve({ id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' }) };

  it('Empleado (4) sin admin.full_access ⇒ GET 403 y POST retry 403; la RPC se consultó con el usuario/org de la sesión', async () => {
    const rpc = jest.fn(async () => ({ data: false, error: null }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(4, rpc));
    const g = await jobsGet(getReq());
    expect(g.status).toBe(403);
    const r = await retryPost(retryReq(), params);
    expect(r.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'user-uuid', p_organization_id: 105, p_permission_code: 'admin.full_access' });
  });

  it('Empleado (4) con la RPC en error ⇒ 403 en ambas (fail-closed), nunca 500', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'permission denied' } }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(4, rpc));
    expect((await jobsGet(getReq())).status).toBe(403);
    expect((await retryPost(retryReq(), params)).status).toBe(403);
  });

  it('Empleado (4) con admin.full_access por cargo ⇒ GET 200 con canRetry:true', async () => {
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(4, rpc));
    const g = await jobsGet(getReq());
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ success: true, canRetry: true, total: 0 });
  });

  it('Manager (5) ⇒ GET 200 con canRetry:false y POST retry 403 (la RPC dice false)', async () => {
    const rpc = jest.fn(async () => ({ data: false, error: null }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(5, rpc));
    const g = await jobsGet(getReq());
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ success: true, canRetry: false });
    expect((await retryPost(retryReq(), params)).status).toBe(403);
  });

  it('rol 9 llamado "Super Admin" sin is_super_admin ni permiso ⇒ 403 en ambas (regla 6: el nombre no concede)', async () => {
    const rpc = jest.fn(async () => ({ data: false, error: null }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(9, rpc, { roleName: 'Super Admin' }));
    expect((await jobsGet(getReq())).status).toBe(403);
    expect((await retryPost(retryReq(), params)).status).toBe(403);
  });

  it('contexto parcial (sin userId/organizationId): rol 4 ⇒ false SIN consultar la RPC; rol 5 ve; rol 2 reintenta', async () => {
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    const partial = (roleId: number) => ({ roleId, isSuperAdmin: false, supabase: { rpc } as unknown as SupabaseClient });
    expect(await canViewJobs(partial(4))).toBe(false);
    expect(await canRetryJobs(partial(4))).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(await canViewJobs(partial(5))).toBe(true);
    expect(await canRetryJobs(partial(2))).toBe(true);
  });

  it('hasOrgAdminOrPermission: solo `data === true` concede ("true", 1, null ⇒ false); sin código ⇒ false sin RPC', async () => {
    for (const data of ['true', 1, null, undefined, {}]) {
      const rpc = jest.fn(async () => ({ data, error: null }));
      expect(await hasOrgAdminOrPermission({ userId: 'u', organizationId: 105, roleId: 4, isSuperAdmin: false, supabase: { rpc } as unknown as SupabaseClient })).toBe(false);
      expect(rpc).toHaveBeenCalledTimes(1);
    }
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    expect(await hasOrgAdminOrPermission({ userId: 'u', organizationId: 105, roleId: 4, isSuperAdmin: false, supabase: { rpc } as unknown as SupabaseClient }, '')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('GET con cargo: la RPC se consulta dos veces por petición (canViewJobs + canRetryJobs) — observación, no fallo', async () => {
    const rpc: jest.Mock = jest.fn(async () => ({ data: true, error: null }));
    (getServerOrgContext as jest.Mock).mockResolvedValue(session(4, rpc));
    await jobsGet(getReq());
    expect(rpc.mock.calls.filter((c: unknown[]) => c[0] === 'check_user_permission')).toHaveLength(2);
  });
});

describe('tester r4 — presupuesto (T-3/T-4)', () => {
  const sbEmpty = () =>
    ({
      rpc: jest.fn(async () => ({ data: null, error: null })),
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'lt', 'in', 'limit']) chain[m] = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return chain;
      },
    }) as unknown as SupabaseClient;

  it('el presupuesto se recalcula ANTES de cada tarea: health_recalculate consume el total ⇒ renewals_sync ni arranca (budget_exhausted)', async () => {
    (runHealthRecalculate as jest.Mock).mockImplementation(async (_sb: unknown, _now: unknown, _log: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return { orgs: 0, processed: 0, errors: 0, aborted: true, by_org: [] };
    });
    (runRenewalsSync as jest.Mock).mockResolvedValue({ orgs: 0 });
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, totalBudgetMs: 300, worker: 't', supabase: sbEmpty() });
    expect(out.health_recalculate?.ok).toBe(true);
    expect(out.renewals_sync).toEqual({ ok: false, ms: 0, error: 'budget_exhausted', reason: 'budget_exhausted' });
    expect(runRenewalsSync).not.toHaveBeenCalled();
  });

  it('con presupuesto sobrante ambas tareas arrancan y renewals_sync recibe como máximo lo que quede del total', async () => {
    const budgets: number[] = [];
    (runHealthRecalculate as jest.Mock).mockImplementation(async (_sb: unknown, _now: unknown, _log: unknown, _signal: AbortSignal, opts: { budgetMs: number }) => {
      budgets.push(opts.budgetMs);
      await sleep(120);
      return { orgs: 0, processed: 0, errors: 0, aborted: false, by_org: [] };
    });
    (runRenewalsSync as jest.Mock).mockResolvedValue({ orgs: 0 });
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 20_000, taskBudgetMs: 12_000, totalBudgetMs: 400, worker: 't', supabase: sbEmpty() });
    expect(out.health_recalculate?.ok).toBe(true);
    expect(out.renewals_sync?.ok).toBe(true);
    expect(budgets[0]).toBeLessThanOrEqual(400);
    expect(runRenewalsSync).toHaveBeenCalledTimes(1);
  });

  it('RESIDUO (bajo): maintenance con totalBudgetMs 0 sí arranca (timer mínimo de 250 ms) — el productor no comprueba exhausted() antes del primer paso', async () => {
    (runMaintenance as jest.Mock).mockImplementation(async (_sb: unknown, _log: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return { jobs_deleted: 0 };
    });
    const t0 = Date.now();
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 20_000, totalBudgetMs: 0, worker: 't', supabase: sbEmpty() });
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    expect(out.maintenance?.ok).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(240);
  });
});

describe('tester r4 — trazabilidad', () => {
  it('nada promete que pending_org_ids «van primero al día siguiente»: ni ruta, ni scheduler, ni FASE-00', () => {
    const files = [
      path.join('src', 'app', 'api', 'crm', 'jobs', 'run', 'route.ts'),
      path.join('src', 'lib', 'jobs', 'scheduler.ts'),
      path.join('docs', 'crm-revenue-os', 'FASE-00-FUNDACIONES.md'),
    ];
    for (const f of files) {
      // La mención entre comillas «… se retiró» de FASE-00 :825 es la retractación, no la promesa.
      const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/«van primero al d[ií]a siguiente» se retir[oó]/gi, '');
      expect(src).not.toMatch(/van primero al d[ií]a siguiente|se recogen el d[ií]a siguiente|las recoge el d[ií]a siguiente/i);
    }
    const route = fs.readFileSync(path.join(process.cwd(), files[0]), 'utf8');
    expect(route).toMatch(/NO se persisten/);
  });
});
