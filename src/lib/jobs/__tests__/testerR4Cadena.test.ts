/**
 * Tester F0-JOBS r4 (segunda tanda) — cadenas completas que ni `builderR4` ni
 * `testerR4` recorren de punta a punta:
 *  - `retryJob` (service) → job re-encolado → `runJobs` → handler `whatsapp` con
 *    `findByClientRequestId` REAL sobre un `messages` que ya tiene la clave de la
 *    raíz: la 3.ª generación se completa como `skipped/already_sent` sin envío.
 *  - `retryJob` conserva un `clientRequestId` explícito y trata `retried_from: ''`
 *    y `payload: null` sin romper la clave.
 *  - `POST …/retry`: el body con otra organización se rechaza (403) ANTES de
 *    abrir el service client; con la misma org pasa a `retryJob` (404 aquí).
 *  - `email` visto desde el runner: timeout advisory durante la comprobación de
 *    pertenencia ⇒ `retried:1` y CERO despachos aunque la consulta termine.
 *  - Coherencia estática: el filtro de `findByClientRequestId` satisface el
 *    predicado del índice parcial de la migración 42 (si alguien quita
 *    `direction = 'outbound'` de la consulta, el índice deja de aplicarse).
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Sin datos reales ni nombres de clientes.
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
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { whatsappJobHandler } from '../handlers/whatsapp';
import { emailJobHandler } from '../handlers/email';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { runJobs } from '../runner';
import { type OutboundJob } from '../types';
import { retryJob } from '@/lib/services/crm/jobsService';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { POST as retryPost } from '@/app/api/crm/jobs/[id]/retry/route';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeJob(kind: OutboundJob['kind'], payload: Record<string, unknown> | null, id = 'job-1', extra: Partial<OutboundJob> = {}): OutboundJob {
  return {
    id, organization_id: 105, kind, payload: payload as Record<string, unknown>, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
    last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '', ...extra,
  };
}

/** Service client para `retryJob`: devuelve `job` y captura lo que `fn_enqueue_job` recibe. */
function retrySb(job: OutboundJob | null, newId = 'job-next') {
  const rpc = jest.fn(async () => ({ data: newId, error: null }));
  const updates: Record<string, unknown>[] = [];
  const from = jest.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: job, error: null });
    chain.update = (v: Record<string, unknown>) => { updates.push(v); return chain; };
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return chain;
  });
  const enqueuedPayload = () => (rpc.mock.calls[0] as unknown as [string, { p_payload: Record<string, unknown> }])[1].p_payload;
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, updates, enqueuedPayload };
}

/**
 * Supabase para el RUNNER: `fn_claim_jobs` entrega `job` una vez; `messages`
 * responde a la consulta REAL de `findByClientRequestId` según la clave que
 * llegue en `.eq('metadata->>client_request_id', …)`; `email_messages` según
 * `emailRow`. Todas las tablas consultadas quedan en `tables`.
 */
function runnerSb(job: OutboundJob, opts: { sentKeys?: Record<string, { id: string; conversation_id: string }>; emailRow?: unknown; delayMs?: number } = {}) {
  let claims = 0;
  const rpc: jest.Mock<Promise<{ data: unknown; error: null }>, [string, Record<string, unknown>?]> = jest.fn(async (fn: string) => {
    if (fn === 'fn_claim_jobs') return { data: ++claims === 1 ? [job] : [], error: null };
    if (fn === 'fn_fail_job') return { data: 'queued', error: null };
    if (fn === 'fn_complete_job') return { data: true, error: null };
    return { data: true, error: null };
  });
  const tables: string[] = [];
  const keys: string[] = [];
  const from = jest.fn((table: string) => {
    tables.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'order', 'limit']) chain[m] = () => chain;
    chain.eq = (col: string, v: unknown) => { if (col === 'metadata->>client_request_id') keys.push(String(v)); return chain; };
    chain.maybeSingle = async () => {
      await sleep(opts.delayMs ?? 2);
      if (table === 'messages') return { data: opts.sentKeys?.[keys[keys.length - 1]] ?? null, error: null };
      if (table === 'email_messages') return { data: opts.emailRow ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, tables, keys };
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

describe('tester r4 — cadena retryJob → runner → whatsapp (idempotencia por la raíz, T-2 bis)', () => {
  it('3.ª generación: job-2 (retried_from job-1) se reintenta ⇒ job-3 hereda job-1; el runner lo completa como already_sent con la clave job:job-1 y CERO envíos', async () => {
    // 1) Retry manual de job-2 (que ya era un retry de job-1).
    const failed = makeJob('whatsapp', { message_request: req, retried_from: 'job-1' }, 'job-2', { status: 'failed', attempts: 3 });
    const svc = retrySb(failed, 'job-3');
    await expect(retryJob(svc.sb, 105, 'job-2', 'admin')).resolves.toEqual({ jobId: 'job-3', status: 'queued' });
    const payload = svc.enqueuedPayload();
    expect(payload.retried_from).toBe('job-1');
    expect(svc.updates[0]).toMatchObject({ last_error: expect.stringContaining('[retried as job-3 by admin]') });

    // 2) El runner ejecuta job-3 con el payload EXACTO que salió de retryJob; `messages` ya tiene job:job-1.
    registerJobHandler('whatsapp', whatsappJobHandler);
    const job3 = makeJob('whatsapp', payload, 'job-3');
    const { sb, rpc, keys } = runnerSb(job3, { sentKeys: { 'job:job-1': { id: 'm-prev', conversation_id: 'c-prev' } } });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ claimed: 1, done: 1, retried: 0, failed: 0 });
    expect(keys).toEqual(['job:job-1']); // la clave consultada es la de la raíz, no job:job-3
    expect(sendWhatsApp).not.toHaveBeenCalled();
    const complete = rpc.mock.calls.find((c) => c[0] === 'fn_complete_job');
    expect(complete![1]).toMatchObject({ p_job_id: 'job-3', p_result: { skipped: true, reason: 'already_sent', message_id: 'm-prev' } });
  });

  it('clientRequestId explícito en message_request sobrevive al retry y manda sobre retried_from', async () => {
    const failed = makeJob('whatsapp', { message_request: { ...req, clientRequestId: 'req-x' } }, 'job-1', { status: 'dead' });
    const svc = retrySb(failed, 'job-2');
    await retryJob(svc.sb, 105, 'job-1', 'admin');
    const payload = svc.enqueuedPayload();
    expect(payload).toMatchObject({ retried_from: 'job-1', message_request: { clientRequestId: 'req-x' } });

    registerJobHandler('whatsapp', whatsappJobHandler);
    const { sb, keys } = runnerSb(makeJob('whatsapp', payload, 'job-2'), { sentKeys: { 'req-x': { id: 'm-x', conversation_id: 'c-x' } } });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ done: 1 });
    expect(keys).toEqual(['req-x']);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('retried_from vacío ("") no se hereda: la raíz pasa a ser el propio job; payload null no rompe', async () => {
    const a = retrySb(makeJob('whatsapp', { message_request: req, retried_from: '' }, 'job-7', { status: 'failed' }), 'job-8');
    await retryJob(a.sb, 105, 'job-7', 'admin');
    expect(a.enqueuedPayload().retried_from).toBe('job-7');

    const b = retrySb(makeJob('crm_event', null, 'job-9', { status: 'failed' }), 'job-10');
    await expect(retryJob(b.sb, 105, 'job-9', 'admin')).resolves.toEqual({ jobId: 'job-10', status: 'queued' });
    expect(b.enqueuedPayload()).toEqual({ retried_from: 'job-9' });
  });

  it('sin previo en messages ⇒ el runner SÍ envía una vez con la clave de la raíz (para que lo anterior no pase por vacuidad)', async () => {
    registerJobHandler('whatsapp', whatsappJobHandler);
    const { sb, keys } = runnerSb(makeJob('whatsapp', { message_request: req, retried_from: 'job-1' }, 'job-3'));
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ done: 1 });
    expect(keys).toEqual(['job:job-1']);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect((sendWhatsApp as jest.Mock).mock.calls[0][0]).toMatchObject({ clientRequestId: 'job:job-1', orgId: 105, force: true });
  });
});

describe('tester r4 — POST /api/crm/jobs/[id]/retry: la organización sale de la sesión, nunca del body (regla 5)', () => {
  const ID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
  const params = { params: Promise.resolve({ id: ID }) };
  const post = (body: unknown) =>
    retryPost(new NextRequest(`http://localhost/api/crm/jobs/${ID}/retry`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), params);
  const admin = () => ({ userId: 'user-uuid', organizationId: 105, roleId: 2, roleName: 'x', isSuperAdmin: false, supabase: { rpc: jest.fn() } as unknown as SupabaseClient });

  it('admin (rol 2) con organization_id AJENO en el body ⇒ 403 FOREIGN_ORGANIZATION, sin abrir el service client ni tocar la cola', async () => {
    (getServerOrgContext as jest.Mock).mockResolvedValue(admin());
    const res = await post({ organization_id: 999 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, error: 'Organización no permitida' });
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('admin (rol 2) con la MISMA organización en el body (o sin body) ⇒ pasa el permiso y llega a retryJob (404 aquí: la cola simulada está vacía)', async () => {
    const svc = retrySb(null);
    (getServiceClient as jest.Mock).mockReturnValue(svc.sb);
    (getServerOrgContext as jest.Mock).mockResolvedValue(admin());
    const same = await post({ organization_id: 105 });
    expect(same.status).toBe(404);
    expect(getServiceClient).toHaveBeenCalledTimes(1);
    const none = await post({});
    expect(none.status).toBe(404);
    // `retryJob` filtra por la org DE LA SESIÓN: el select lleva organization_id = 105.
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('Empleado (rol 4) sin permiso y body ajeno ⇒ 403 (el body ajeno se detecta antes que el permiso; ninguna de las dos vías abre el service client)', async () => {
    (getServerOrgContext as jest.Mock).mockResolvedValue({ ...admin(), roleId: 4, supabase: { rpc: jest.fn(async () => ({ data: false, error: null })) } as unknown as SupabaseClient });
    expect((await post({ orgId: 1 })).status).toBe(403);
    expect((await post({})).status).toBe(403);
    expect(getServiceClient).not.toHaveBeenCalled();
  });
});

describe('tester r4 — email visto desde el runner (T-1)', () => {
  it('timeout advisory DURANTE la comprobación de pertenencia ⇒ el runner reintenta (queued) y, al volver la consulta, el handler NO despacha', async () => {
    registerJobHandler('email', emailJobHandler);
    const { sb, rpc, tables } = runnerSb(makeJob('email', { email_message_id: 'em-1' }), { emailRow: { id: 'em-1' }, delayMs: 120 });
    const summary = await runJobs({ supabase: sb, worker: 'w', jobTimeoutMs: 30 });
    expect(summary).toMatchObject({ claimed: 1, retried: 1, done: 0 });
    const fail = rpc.mock.calls.find((c) => c[0] === 'fn_fail_job');
    expect(String((fail![1] as { p_error: string }).p_error)).toMatch(/timeout after 30ms/);
    await sleep(200);
    expect(tables).toEqual(['email_messages']);
    expect(dispatchScheduledEmail).not.toHaveBeenCalled();
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_fail_job')).toHaveLength(1); // el handler tardío no vuelve a fallar el job
  });

  it('sin timeout: la fila pertenece a la org ⇒ despacha una vez y el runner completa (camino feliz)', async () => {
    registerJobHandler('email', emailJobHandler);
    const { sb } = runnerSb(makeJob('email', { email_message_id: 'em-1' }), { emailRow: { id: 'em-1' } });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ claimed: 1, done: 1 });
    expect(dispatchScheduledEmail).toHaveBeenCalledWith('em-1', sb);
  });
});

describe('tester r4 — coherencia estática: consulta de idempotencia ↔ índice parcial (migración 42, PENDIENTE)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');

  it('findByClientRequestId filtra direction=outbound y metadata->>client_request_id: exactamente lo que el predicado parcial exige para que el planificador use el índice', () => {
    const src = read('src', 'lib', 'services', 'crm', 'whatsapp', 'outboundService.ts');
    const fn = src.slice(src.indexOf('export async function findByClientRequestId'));
    const body = fn.slice(0, fn.search(/\r?\n\}\r?\n/) + 3);
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/\.eq\('direction', 'outbound'\)/);
    expect(body).toMatch(/\.eq\('metadata->>client_request_id', clientRequestId\)/);
    expect(body).toMatch(/\.eq\('organization_id', orgId\)/);
    expect(body).toMatch(/if \(error\) throw new Error\(`findByClientRequestId: /);

    const mig = read('supabase', 'migrations', '20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql');
    const stmt = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(stmt).toMatch(/create index if not exists idx_messages_org_client_request_id\s+on public\.messages \(organization_id, \(metadata->>'client_request_id'\)\)\s+where direction = 'outbound' and \(metadata->>'client_request_id'\) is not null;/);
    expect(stmt).not.toMatch(/concurrently/i);
  });

  it('el rollback borra el mismo índice y ninguno de los dos .sql trae claves ni URLs con credenciales', () => {
    const rb = read('supabase', 'rollbacks', '20260915234000_crm_v4_f00_42_idx_messages_client_request_id_rollback.sql');
    expect(rb).toMatch(/drop index if exists public\.idx_messages_org_client_request_id;/);
    for (const f of [rb, read('supabase', 'migrations', '20260915234000_crm_v4_f00_42_idx_messages_client_request_id.sql')]) {
      expect(f).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/|service_role|sbp_[a-z0-9]/i);
    }
  });
});
