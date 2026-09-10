/**
 * `GET|POST /api/crm/jobs/run`: auth fail-closed, kinds inválidos ⇒ 400 (F-3),
 * productor de kinds programados antes de drenar (F-1).
 */
import { NextRequest } from 'next/server';
// `webhookSignatures` (vía orgContext/verifyCronSecret) importa svix (ESM): se mockea como en SEC.
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));

jest.mock('@/lib/jobs/runner', () => ({
  makeWorkerId: () => 'w-test',
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

const SECRET = 'test-cron-secret-0123456789';
const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  new NextRequest(`http://localhost:3000${url}`, { method: init.method ?? 'GET', headers: init.headers, body: init.body });
const auth = { authorization: `Bearer ${SECRET}` };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  jest.clearAllMocks();
});

describe('/api/crm/jobs/run', () => {
  it('401 sin header, con Bearer erróneo y con ?token=', async () => {
    expect((await GET(req('/api/crm/jobs/run'))).status).toBe(401);
    expect((await GET(req('/api/crm/jobs/run', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect((await GET(req(`/api/crm/jobs/run?token=${SECRET}`))).status).toBe(401);
    expect(runJobs).not.toHaveBeenCalled();
  });

  it('?kind=bogus ⇒ 400 con la lista válida y NO drena (F-3); mezcla válido+inválido también 400', async () => {
    const res = await GET(req('/api/crm/jobs/run?kind=bogus,alsobogus', { headers: auth }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ success: false, invalid: ['bogus', 'alsobogus'] });
    expect(json.valid).toContain('maintenance');
    expect(runJobs).not.toHaveBeenCalled();

    const mixed = await POST(req('/api/crm/jobs/run', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ kinds: ['maintenance', 'campaign_batchh'] }) }));
    expect(mixed.status).toBe(400);
    expect((await mixed.json()).invalid).toEqual(['campaign_batchh']);
  });

  it('sin kinds drena todo (kinds:"all") y no ejecuta el productor', async () => {
    const res = await GET(req('/api/crm/jobs/run', { headers: auth }));
    expect(res.status).toBe(200);
    expect((await res.json()).kinds).toBe('all');
    expect(runJobs).toHaveBeenCalledWith(expect.objectContaining({ kinds: undefined, worker: 'w-test' }));
    expect(runScheduledKinds).not.toHaveBeenCalled();
  });

  it('?kind=maintenance ejecuta el productor ANTES de drenar y devuelve scheduled (F-1)', async () => {
    const res = await GET(req('/api/crm/jobs/run?kind=maintenance', { headers: auth }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kinds).toEqual(['maintenance']);
    expect(json.scheduled).toMatchObject({ maintenance: { ok: true } });
    expect(runScheduledKinds).toHaveBeenCalledWith(expect.objectContaining({ kinds: ['maintenance'], worker: 'w-test' }));
    expect((runScheduledKinds as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((runJobs as jest.Mock).mock.invocationCallOrder[0]);
    expect(runJobs).toHaveBeenCalledWith(expect.objectContaining({ kinds: ['maintenance'] }));
  });

  it('header x-vercel-cron-schedule del cron diario ⇒ recording_cleanup+maintenance; x-cron-secret también autentica', async () => {
    const res = await GET(req('/api/crm/jobs/run', { headers: { 'x-cron-secret': SECRET, 'x-vercel-cron-schedule': '30 8 * * *' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).kinds).toEqual(['recording_cleanup', 'maintenance']);
    expect(runScheduledKinds).toHaveBeenCalledTimes(1);
  });

  it('body JSON malformado ⇒ todos los kinds (no 400); limit se recorta a 200; worker largo se ignora', async () => {
    const res = await POST(req('/api/crm/jobs/run', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{not json' }));
    expect(res.status).toBe(200);
    expect((await res.json()).kinds).toBe('all');

    await POST(req('/api/crm/jobs/run', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ limit: 99999, worker: 'x'.repeat(150) }) }));
    expect(runJobs).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200, worker: 'w-test' }));
  });
});
