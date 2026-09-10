/**
 * jobsService: roles (F-6/F-7), redacción del payload (F-7) y dedupe del retry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
// `webhookSignatures` (vía orgContext/verifyCronSecret) importa svix (ESM): se mockea como en SEC.
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
import { canRetryJobs, canViewJobs, redactPayload, retryJob, JobRetryError } from '@/lib/services/crm/jobsService';
import type { OutboundJob } from '../types';

const role = (roleId: number, roleName: string, isSuperAdmin = false) => ({ roleId, roleName, isSuperAdmin });

describe('roles', () => {
  it('reintentar: solo admin de la org (rol 1/2 o super admin)', () => {
    expect(canRetryJobs(role(2, 'Admin de organización'))).toBe(true);
    expect(canRetryJobs(role(1, 'Super Admin'))).toBe(true);
    expect(canRetryJobs(role(4, 'Empleado', true))).toBe(true);
    expect(canRetryJobs(role(5, 'Manager'))).toBe(false);
    expect(canRetryJobs(role(4, 'Empleado'))).toBe(false);
    expect(canRetryJobs(role(9, 'admin'))).toBe(false); // nombres legacy 'admin'/'owner' no existen en roles
  });

  it('ver la cola: admin o Manager (rol 5)', () => {
    expect(canViewJobs(role(5, 'Manager'))).toBe(true);
    expect(canViewJobs(role(9, 'Gerente'))).toBe(true);
    expect(canViewJobs(role(2, 'Admin de organización'))).toBe(true);
    expect(canViewJobs(role(4, 'Empleado'))).toBe(false);
    expect(canViewJobs(role(3, 'Cliente'))).toBe(false);
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
