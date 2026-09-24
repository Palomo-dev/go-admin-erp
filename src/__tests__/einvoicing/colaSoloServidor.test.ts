/**
 * GO-sec (2026-09-24): la cola de facturación electrónica solo la escribe el
 * servidor. La RLS de `electronic_invoicing_jobs`/`_events` quedó de solo
 * lectura (migración 20260925120000, probada en una transacción deshecha:
 * como miembro, quitar una retención, insertar, borrar, escribir eventos y
 * llamar a las funciones de la cola → 42501; como servicio, todo sigue).
 *
 * Aquí, la ruta `/api/factus/jobs`:
 *  - lee el job con la sesión (RLS) y escribe SOLO con
 *    `fn_einvoicing_accion_manual` (service role), con la organización y el
 *    actor de la sesión, nunca del body;
 *  - traduce los errores de la función (P0002 → 404, 55000 → 409, 42501 → 403);
 *  - nunca escribe la tabla con la sesión del usuario.
 * Y los servicios del navegador ya no escriben: llaman a la ruta.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

type Row = Record<string, unknown>;

const ORG = 132;
const OTRA = 134;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';

let jobs: Row[];
let permisos: string[];
const escriturasConSesion: string[] = [];
const rpc = jest.fn();

/** Cliente de la sesión: solo lectura; cualquier escritura queda registrada. */
const sessionDb = {
  from(table: string) {
    const filtros: Array<[string, unknown]> = [];
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filtros.push([c, v]), b),
      in: () => b,
      insert: () => (escriturasConSesion.push(`${table}.insert`), b),
      update: () => (escriturasConSesion.push(`${table}.update`), b),
      delete: () => (escriturasConSesion.push(`${table}.delete`), b),
      maybeSingle: async () => ({
        data: (table === 'electronic_invoicing_jobs' ? jobs : []).find((r) => filtros.every(([c, v]) => String(r[c]) === String(v))) ?? null,
        error: null,
      }),
    };
    return b;
  },
  rpc: async () => ({ data: false, error: null }),
};

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => permisos.includes(code),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    async (req: Request, rp: unknown) => {
      const ctx = { organizationId: ORG, userId: USER, roleId: 5, isSuperAdmin: false, organizationName: 'Org', roleName: 'x', memberId: 1, userEmail: null, supabase: sessionDb };
      try {
        return await handler(ctx, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ({ rpc }) }));
/** Cliente del navegador: cualquier escritura en la cola queda registrada. */
const escriturasNavegador: string[] = [];
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (t: string) => ({
      update: () => (escriturasNavegador.push(`${t}.update`), { eq: async () => ({ error: null }) }),
      insert: () => (escriturasNavegador.push(`${t}.insert`), { select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

import { NextRequest } from 'next/server';
import * as ruta from '@/app/api/factus/jobs/route';
import { electronicInvoicingService } from '@/lib/services/electronicInvoicingService';

type Handler = (req: NextRequest, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function call(h: unknown, r: NextRequest) {
  const res = await (h as Handler)(r, { params: Promise.resolve({}) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeEach(() => {
  jobs = [
    { id: 'job-fallido', organization_id: ORG, status: 'failed' },
    { id: 'job-retenido', organization_id: ORG, status: 'pending', hold_reason: 'Servicio sin activar' },
    { id: 'job-ajeno', organization_id: OTRA, status: 'failed' },
  ];
  permisos = ['finance.view', 'finance.create', 'finance.void', 'finance.edit', 'finance.manage'];
  escriturasConSesion.length = 0;
  rpc.mockReset();
  rpc.mockImplementation(async (_n: string, args: Row) => ({ data: { id: args.p_job_id, status: args.p_accion === 'retry' ? 'pending' : 'cancelled' }, error: null }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('/api/factus/jobs escribe solo en el servidor', () => {
  test('reintentar: una llamada a fn_einvoicing_accion_manual con la organización y el actor de la sesión', async () => {
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-fallido', action: 'retry' }));
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_einvoicing_accion_manual', {
      p_job_id: 'job-fallido',
      p_organization_id: ORG,
      p_accion: 'retry',
      p_actor: USER,
    });
    expect(escriturasConSesion).toEqual([]);
  });

  test('cancelar: igual, con p_accion cancel', async () => {
    const r = await call(ruta.DELETE, req('DELETE', '/api/factus/jobs?jobId=job-fallido'));
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_einvoicing_accion_manual', expect.objectContaining({ p_accion: 'cancel', p_organization_id: ORG }));
    expect(escriturasConSesion).toEqual([]);
  });

  test('una organización en el body distinta a la de la sesión → 403 sin tocar la cola', async () => {
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-fallido', action: 'retry', organizationId: OTRA }));
    expect(r.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('job de otra organización → 404 sin llamar a la función', async () => {
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-ajeno', action: 'retry' }));
    expect(r.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('un job pendiente (p. ej. retenido) no se «reintenta»: 409 y la retención sigue', async () => {
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-retenido', action: 'retry' }));
    expect(r.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    expect(jobs.find((j) => j.id === 'job-retenido')?.hold_reason).toBe('Servicio sin activar');
  });

  test('sin permiso finance.create → 403 sin tocar la cola', async () => {
    permisos = ['finance.view'];
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-fallido', action: 'retry' }));
    expect(r.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    ['P0002', 404],
    ['55000', 409],
    ['42501', 403],
    ['XX000', 500],
  ])('error %s de la función → %i', async (code, status) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: `fallo ${code}` } });
    const r = await call(ruta.POST, req('POST', '/api/factus/jobs', { jobId: 'job-fallido', action: 'retry' }));
    expect(r.status).toBe(status);
  });
});

describe('servicios del navegador: reintentar y cancelar van a la ruta', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  test('electronicInvoicingService.retryJob/cancelJob llaman a /api/factus/jobs y no escriben la tabla', async () => {
    const llamadas: Array<[string, RequestInit | undefined]> = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      llamadas.push([url, init]);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await electronicInvoicingService.retryJob('job-1')).toEqual({ success: true });
    expect(await electronicInvoicingService.cancelJob('job 2')).toEqual({ success: true });
    expect(llamadas[0][0]).toBe('/api/factus/jobs');
    expect(llamadas[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(llamadas[0][1]?.body))).toEqual({ jobId: 'job-1', action: 'retry' });
    expect(llamadas[1][0]).toBe('/api/factus/jobs?jobId=job%202');
    expect(llamadas[1][1]?.method).toBe('DELETE');
    expect(escriturasNavegador).toEqual([]);
    expect('createJob' in electronicInvoicingService).toBe(false);
  });

  test('un 409 de la ruta llega como error legible', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: 'Un job en estado pending no se puede reintentar' }), { status: 409 })) as unknown as typeof fetch;
    expect(await electronicInvoicingService.retryJob('x')).toEqual({
      success: false,
      error: 'Un job en estado pending no se puede reintentar',
    });
  });
});
