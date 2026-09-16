/**
 * jobsService: roles (F-6/F-7), redacción del payload (F-7) y dedupe del retry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
// `webhookSignatures` (vía orgContext/verifyCronSecret) importa svix (ESM): se mockea como en SEC.
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
import {
  canRetryJobs,
  canViewJobs,
  JOBS_RETRY_PERMISSION,
  JOBS_VIEW_PERMISSION,
  redactPayload,
  resolveJobsPermissions,
  retryJob,
  JobRetryError,
} from '@/lib/services/crm/jobsService';
import type { OutboundJob } from '../types';

const role = (roleId: number, roleName: string, isSuperAdmin = false) => ({ roleId, roleName, isSuperAdmin });

/** `check_user_permission` mockeada por código: lo que no esté en `grants` ⇒ false. */
const rpcByCode = (grants: Record<string, boolean>) =>
  jest.fn(async (_fn: string, args: { p_permission_code: string }) => ({ data: grants[args.p_permission_code] === true, error: null }));
const session = (roleId: number, rpc: jest.Mock, roleName = 'x') =>
  ({ roleId, roleName, isSuperAdmin: false, userId: 'user-uuid', organizationId: 105, supabase: { rpc } as unknown as SupabaseClient });

describe('roles (r5: por código de permiso, nunca por lista de roles ni por nombre)', () => {
  // Sin sesión completa (userId/organizationId/supabase) no hay RPC: solo decide el criterio síncrono (super admin o rol 1/2).
  it('sin sesión completa: solo el criterio síncrono (rol 1/2 o super admin); Manager (5) y Empleado (4) ⇒ false (fail-closed, sin RPC)', async () => {
    expect(await canRetryJobs(role(2, 'Admin de organización'))).toBe(true);
    expect(await canRetryJobs(role(1, 'Super Admin'))).toBe(true);
    expect(await canRetryJobs(role(4, 'Empleado', true))).toBe(true);
    expect(await canRetryJobs(role(5, 'Manager'))).toBe(false);
    expect(await canRetryJobs(role(4, 'Empleado'))).toBe(false);
    expect(await canRetryJobs(role(9, 'admin'))).toBe(false); // nombres legacy 'admin'/'owner' no existen en roles
    expect(await canViewJobs(role(5, 'Manager'))).toBe(false);
    expect(await canViewJobs(role(2, 'Admin de organización'))).toBe(true);
    expect(await canViewJobs(role(9, 'Gerente'))).toBe(false);
    expect(await canViewJobs(role(3, 'Cliente'))).toBe(false);
  });

  it('Manager (5) con sesión: ve y reintenta porque la BD (f00_45) le concede crm.jobs.view y crm.jobs.retry; la RPC recibe cada código y nunca admin.full_access', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true, [JOBS_RETRY_PERMISSION]: true });
    const ctx = session(5, rpc, 'Manager');
    expect(await canViewJobs(ctx)).toBe(true);
    expect(await canRetryJobs(ctx)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'user-uuid', p_organization_id: 105, p_permission_code: 'crm.jobs.view' });
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'user-uuid', p_organization_id: 105, p_permission_code: 'crm.jobs.retry' });
    expect(rpc.mock.calls.some((c) => (c[1] as { p_permission_code: string }).p_permission_code === 'admin.full_access')).toBe(false);
  });

  it('un cargo que NIEGA crm.jobs.view deja fuera al Manager (5): el rol no es el criterio, la BD sí (regla 6)', async () => {
    const rpc = rpcByCode({});
    expect(await canViewJobs(session(5, rpc, 'Manager'))).toBe(false);
    expect(await canRetryJobs(session(5, rpc, 'Manager'))).toBe(false);
    // 1 RPC por llamada: `canRetryJobs` delega en `resolveJobsPermissions`, que corta en `view=false` (r5 cierre).
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((c) => (c[1] as { p_permission_code: string }).p_permission_code)).toEqual(['crm.jobs.view', 'crm.jobs.view']);
  });

  it('r5 cierre (QA r5 N-1): un cargo que niega SOLO crm.jobs.view al Manager (5) cierra también el retry; canViewJobs, canRetryJobs y resolveJobsPermissions coinciden', async () => {
    const rpc = rpcByCode({ [JOBS_RETRY_PERMISSION]: true });
    expect(await canViewJobs(session(5, rpc, 'Manager'))).toBe(false);
    expect(await canRetryJobs(session(5, rpc, 'Manager'))).toBe(false);
    expect(await resolveJobsPermissions(session(5, rpc, 'Manager'))).toEqual({ canView: false, canRetry: false });
    expect(rpc.mock.calls.map((c) => (c[1] as { p_permission_code: string }).p_permission_code)).not.toContain('crm.jobs.retry');
  });

  it('Empleado (4) con cargo que concede crm.jobs.view pero no crm.jobs.retry ⇒ ve sin reintentar, sin admin.full_access', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true });
    expect(await canViewJobs(session(4, rpc))).toBe(true);
    expect(await canRetryJobs(session(4, rpc))).toBe(false);
  });
});

describe('resolveJobsPermissions (r5 cierre: una resolución por petición, canRetry = view ∧ retry, orden [view, retry] con cortocircuito)', () => {
  it('crm.jobs.view true y crm.jobs.retry true ⇒ {canView:true, canRetry:true} con DOS RPC en el orden [view, retry]', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true, [JOBS_RETRY_PERMISSION]: true });
    expect(await resolveJobsPermissions(session(4, rpc))).toEqual({ canView: true, canRetry: true });
    expect(rpc.mock.calls.map((c) => (c[1] as { p_permission_code: string }).p_permission_code)).toEqual(['crm.jobs.view', 'crm.jobs.retry']);
  });

  it('crm.jobs.retry true pero crm.jobs.view false ⇒ {canView:false, canRetry:false} con UNA sola RPC (crm.jobs.view; retry no se consulta)', async () => {
    const rpc = rpcByCode({ [JOBS_RETRY_PERMISSION]: true });
    expect(await resolveJobsPermissions(session(4, rpc))).toEqual({ canView: false, canRetry: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_permission_code: 'crm.jobs.view' });
  });

  it('crm.jobs.view true y crm.jobs.retry false ⇒ {canView:true, canRetry:false} con dos RPC, view primero', async () => {
    const rpc = rpcByCode({ [JOBS_VIEW_PERMISSION]: true });
    expect(await resolveJobsPermissions(session(4, rpc))).toEqual({ canView: true, canRetry: false });
    expect(rpc.mock.calls.map((c) => (c[1] as { p_permission_code: string }).p_permission_code)).toEqual(['crm.jobs.view', 'crm.jobs.retry']);
  });

  it('ninguno concedido ⇒ ambos false con UNA RPC (cortocircuito en view); rol 1/2 y super admin ⇒ ambos true sin RPC', async () => {
    const none = rpcByCode({});
    expect(await resolveJobsPermissions(session(4, none))).toEqual({ canView: false, canRetry: false });
    expect(none).toHaveBeenCalledTimes(1);
    const rpc = rpcByCode({});
    expect(await resolveJobsPermissions(session(2, rpc))).toEqual({ canView: true, canRetry: true });
    expect(await resolveJobsPermissions({ ...session(9, rpc), isSuperAdmin: true })).toEqual({ canView: true, canRetry: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fail-closed: RPC con `error` ⇒ ambos false; cliente que LANZA ⇒ ambos false y console.warn (no 500)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const erroring = jest.fn(async () => ({ data: null, error: { message: 'permission denied' } }));
    expect(await resolveJobsPermissions(session(4, erroring))).toEqual({ canView: false, canRetry: false });
    const throwing = jest.fn(async () => {
      throw new Error('fetch failed');
    });
    expect(await resolveJobsPermissions(session(4, throwing))).toEqual({ canView: false, canRetry: false });
    expect(throwing).toHaveBeenCalledTimes(1); // falla en `view` ⇒ no se pregunta `retry`
    // La excepción la captura `orgContext` (F0-SEC C+D r2) o, si no, `jobsService`: en ambos casos queda registrada y se deniega.
    expect(warn.mock.calls.some((c) => /\[(orgContext|jobsService)\]/.test(String(c[0])) && String((c[1] as { message?: string } | undefined)?.message).includes('fetch failed'))).toBe(true);
    warn.mockRestore();
  });
});

describe('redactPayload', () => {
  it('solo deja *_id, kind, campaign_id, event_type… y recorta strings', () => {
    const out = redactPayload({
      event_id: 'ev-1',
      email_message_id: 'em-1',
      to_email: 'cliente@example.com',
      phone: '+573001234567',
      body: 'hola',
      access_token: 'secret',
      kind: 'email',
      campaign_id: 7,
      event_type: 'opportunity.stage_changed',
      resync: true,
      nested_id: { a: 1 },
      long_id: 'x'.repeat(200),
    });
    expect(out).toEqual({
      event_id: 'ev-1',
      email_message_id: 'em-1',
      kind: 'email',
      campaign_id: 7,
      event_type: 'opportunity.stage_changed',
      resync: true,
      long_id: 'x'.repeat(120),
    });
    expect(redactPayload(null)).toEqual({});
  });
});

describe('retryJob', () => {
  function makeSb(job: Partial<OutboundJob> | null) {
    const rpc = jest.fn(async () => ({ data: 'new-job', error: null }));
    const updates: Record<string, unknown>[] = [];
    const from = jest.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(async () => ({ data: job, error: null }));
      chain.update = jest.fn((v: Record<string, unknown>) => {
        updates.push(v);
        return chain;
      });
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
      return chain;
    });
    return { sb: { rpc, from } as unknown as SupabaseClient, rpc, updates };
  }
  const base: OutboundJob = {
    id: 'j1', organization_id: 105, kind: 'crm_event', payload: { event_id: 'ev-1' }, status: 'dead', run_at: '', attempts: 3,
    max_attempts: 3, last_error: 'x', result: null, locked_at: null, locked_by: null, dedupe_key: 'crm_event:ev-1', created_at: '', updated_at: '',
  };

  it('reutiliza el dedupe_key original (evita 2 jobs vivos con el resync) y anota el original', async () => {
    const { sb, rpc, updates } = makeSb(base);
    const res = await retryJob(sb, 105, 'j1', 'user-1');
    expect(res).toEqual({ jobId: 'new-job', status: 'queued' });
    expect(rpc).toHaveBeenCalledWith('fn_enqueue_job', expect.objectContaining({ p_org: 105, p_kind: 'crm_event', p_dedupe_key: 'crm_event:ev-1', p_max_attempts: 3 }));
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_payload: { event_id: 'ev-1', retried_from: 'j1' } });
    expect(String(updates[0].last_error)).toContain('[retried as new-job by user-1]');
  });

  it('sin dedupe_key usa job:{id}:retry:{attempts}; 404 si no es de la org; 409 si no está dead|failed', async () => {
    const { sb, rpc } = makeSb({ ...base, dedupe_key: null, status: 'failed', attempts: 1 });
    await retryJob(sb, 105, 'j1', 'u');
    expect(rpc).toHaveBeenCalledWith('fn_enqueue_job', expect.objectContaining({ p_dedupe_key: 'job:j1:retry:1' }));

    await expect(retryJob(makeSb(null).sb, 105, 'j1', 'u')).rejects.toMatchObject({ statusCode: 404 });
    await expect(retryJob(makeSb({ ...base, status: 'done' }).sb, 105, 'j1', 'u')).rejects.toBeInstanceOf(JobRetryError);
    await expect(retryJob(makeSb({ ...base, status: 'queued' }).sb, 105, 'j1', 'u')).rejects.toMatchObject({ statusCode: 409 });
  });
});
