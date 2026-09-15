/**
 * Tester F0-JOBS r2 — casos borde de `GET|POST /api/crm/jobs/run` que la
 * suite del builder no cubría: fail-closed sin `CRON_SECRET`, `x-cron-secret`
 * erróneo, fallback body→query, valores no-string en `kinds`, `limit`
 * degenerado y schedules de Vercel desconocidos.
 */
import { NextRequest } from 'next/server';
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

jest.mock('@/lib/jobs/runner', () => ({
  makeWorkerId: () => 'w-tester',
  runJobs: jest.fn(async (opts: Record<string, unknown>) => ({
    worker: opts.worker, claimed: 0, done: 0, skipped: 0, retried: 0, failed: 0, dead: 0, released: 0, ms: 1, byKind: {},
  })),
}));
jest.mock('@/lib/jobs/scheduler', () => {
  const actual = jest.requireActual('@/lib/jobs/scheduler');
  return { ...actual, runScheduledKinds: jest.fn(async () => ({ maintenance: { ok: true, ms: 1, result: { jobs_deleted: 0 } } })) };
});

import { runJobs } from '@/lib/jobs/runner';
import { runScheduledKinds } from '@/lib/jobs/scheduler';
import { GET, POST } from '@/app/api/crm/jobs/run/route';

const SECRET = 'tester-r2-secret-0123456789';
const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  new NextRequest(`http://localhost:3000${url}`, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
const auth = { authorization: `Bearer ${SECRET}` };
const post = (body: unknown, headers: Record<string, string> = auth) =>
  POST(req('/api/crm/jobs/run', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

const lastRunOpts = () => (runJobs as jest.Mock).mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  jest.clearAllMocks();
});

describe('tester r2 — fail-closed', () => {
  it('sin CRON_SECRET en el entorno ⇒ 401 aunque el Bearer sea "correcto"', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('/api/crm/jobs/run', { headers: auth }));
    expect(res.status).toBe(401);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('CRON_SECRET vacío ⇒ 401 (no se acepta Bearer vacío ni x-cron-secret vacío)', async () => {
    process.env.CRON_SECRET = '';
    expect((await GET(req('/api/crm/jobs/run', { headers: { authorization: 'Bearer ' } }))).status).toBe(401);
    expect((await GET(req('/api/crm/jobs/run', { headers: { 'x-cron-secret': '' } }))).status).toBe(401);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('x-cron-secret erróneo ⇒ 401; Bearer erróneo + x-cron-secret correcto ⇒ 401 (el Bearer manda)', async () => {
    expect((await GET(req('/api/crm/jobs/run', { headers: { 'x-cron-secret': 'nope' } }))).status).toBe(401);
    expect(
      (await GET(req('/api/crm/jobs/run', { headers: { authorization: 'Bearer nope', 'x-cron-secret': SECRET } }))).status,
    ).toBe(401);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('el secreto con prefijo/sufijo (ataque de prefijo) ⇒ 401', async () => {
    expect((await GET(req('/api/crm/jobs/run', { headers: { authorization: `Bearer ${SECRET}x` } }))).status).toBe(401);
    expect((await GET(req('/api/crm/jobs/run', { headers: { authorization: `Bearer ${SECRET.slice(0, -1)}` } }))).status).toBe(401);
    expect((await GET(req('/api/crm/jobs/run', { headers: { authorization: `bearer ${SECRET}` } }))).status).toBe(401);
  });
});

describe('tester r2 — selección de kinds', () => {
  it('body.kinds vacío cae al query: ?kind=bogus ⇒ 400 y no drena', async () => {
    const res = await POST(req('/api/crm/jobs/run?kind=bogus', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ kinds: [] }) }));
    expect(res.status).toBe(400);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('kinds con valores no-string ([123], [null], [{}]) ⇒ 400 y no drena', async () => {
    for (const kinds of [[123], [null], [{}], [true]]) {
      const res = await post({ kinds });
      expect(res.status).toBe(400);
    }
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('kinds como string en el body ("noop,crm_event") se acepta y se deduplica', async () => {
    const res = await post({ kinds: 'noop,crm_event,noop' });
    expect(res.status).toBe(200);
    expect(lastRunOpts().kinds).toEqual(['noop', 'crm_event']);
  });

  it('?kind= vacío y ?kind=,, ⇒ se drena todo (kinds:"all")', async () => {
    for (const q of ['?kind=', '?kind=,,', '?kind=%20']) {
      const res = await GET(req(`/api/crm/jobs/run${q}`, { headers: auth }));
      expect(res.status).toBe(200);
      expect((await res.json()).kinds).toBe('all');
      expect(lastRunOpts().kinds).toBeUndefined();
    }
  });

  it('kinds con mayúsculas o espacios ("NOOP", " noop ") ⇒ "NOOP" 400, " noop " se acepta recortado', async () => {
    expect((await post({ kinds: ['NOOP'] })).status).toBe(400);
    const ok = await post({ kinds: [' noop '] });
    expect(ok.status).toBe(200);
    expect(lastRunOpts().kinds).toEqual(['noop']);
  });

  it('x-vercel-cron-schedule desconocido (*/2 * * * * de vercel.json) ⇒ drena TODO y no ejecuta el productor', async () => {
    const res = await GET(req('/api/crm/jobs/run', { headers: { ...auth, 'x-vercel-cron-schedule': '*/2 * * * *' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).kinds).toBe('all');
    expect(runScheduledKinds).not.toHaveBeenCalled();
  });

  it('?kind= tiene prioridad sobre x-vercel-cron-schedule', async () => {
    const res = await GET(req('/api/crm/jobs/run?kind=noop', { headers: { ...auth, 'x-vercel-cron-schedule': '30 8 * * *' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).kinds).toEqual(['noop']);
    expect(runScheduledKinds).not.toHaveBeenCalled();
  });

  it('solo kinds programados de cola (?kind=maintenance) ⇒ productor + drenaje SOLO de maintenance (no de todo)', async () => {
    const res = await GET(req('/api/crm/jobs/run?kind=maintenance', { headers: auth }));
    expect(res.status).toBe(200);
    expect(lastRunOpts().kinds).toEqual(['maintenance']);
    expect(runScheduledKinds).toHaveBeenCalledTimes(1);
  });
});

describe('tester r2 — limit y worker', () => {
  it('limit negativo, 0, NaN o Infinity ⇒ se ignora (default del runner); 201 se recorta a 200', async () => {
    for (const limit of [-5, 0, 'abc', Infinity, null]) {
      await post({ limit });
      expect(lastRunOpts().limit).toBeUndefined();
    }
    await post({ limit: 201 });
    expect(lastRunOpts().limit).toBe(200);
    await GET(req('/api/crm/jobs/run?limit=3', { headers: auth }));
    expect(lastRunOpts().limit).toBe(3);
  });

  // r3 (N-10): solo identificadores simples llegan a `locked_by` y a los logs.
  it('worker del body: solo /^[A-Za-z0-9._:-]{1,100}$/ se respeta; espacios, saltos de línea, comillas o no-string ⇒ se genera uno', async () => {
    await post({ worker: 'pg_cron:17.host-a' });
    expect(lastRunOpts().worker).toBe('pg_cron:17.host-a');
    for (const bad of ["x'); drop table outbound_jobs; --", 'con espacio', 'salto\nlinea', '', 'x'.repeat(101), 42]) {
      await post({ worker: bad });
      expect(lastRunOpts().worker).toBe('w-tester');
    }
  });

  it('el deadline que recibe el runner nunca baja de 2 s y nunca supera 50 s', async () => {
    await GET(req('/api/crm/jobs/run', { headers: auth }));
    const deadline = lastRunOpts().deadlineMs as number;
    expect(deadline).toBeGreaterThanOrEqual(2_000);
    expect(deadline).toBeLessThanOrEqual(50_000);
  });
});
