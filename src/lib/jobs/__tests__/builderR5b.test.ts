/**
 * Builder F0-JOBS r5b — cierre de la ronda 5 con la opción (b) del QA r5
 * (`F0-JOBS-qa-r5.md`, «Lo que el test de cierre debe demostrar», puntos 1–9):
 *
 *   canRetry = view ∧ retry. `resolveJobsPermissions` consulta `crm.jobs.view`
 *   PRIMERO y corta en `false` (1 RPC); solo con `view=true` consulta
 *   `crm.jobs.retry` (2 RPC, orden `[view, retry]`). `canRetryJobs` delega en
 *   `resolveJobsPermissions` y `POST …/retry` usa `resolveJobsPermissions(ctx).canRetry`.
 *
 * Doble FIEL de `check_user_permission` (mismo que `testerR5.test.ts`, leído
 * de la BD el 2026-09-16): miembro activo → super admin ⇒ true → cargo con el
 * código definido ⇒ su `allowed` → `role_permissions` del rol → false. Un
 * código por llamada: el cargo que niega SOLO `view` devuelve
 * `view=false, retry=true` (N-1).
 *
 * Mutaciones que deben morir aquí (verificadas a mano, ver
 * `F0-JOBS-builder-r5b.md`): orden invertido (retry primero), sin
 * cortocircuito, `canRetry` sin `∧ view`, `canRetryJobs` consultando solo
 * `retry`, y retry/route.ts llamando a `hasOrgAdminOrPermission` directo.
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Sin datos reales ni nombres de
 * clientes; los ids de org son ficticios.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

jest.mock('../handlers', () => ({}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/utils/orgContext');
  return { ...real, getServerOrgContext: jest.fn() };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));

import { getServiceClient } from '@/lib/supabase/server-service';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import {
  canRetryJobs,
  canViewJobs,
  JOBS_RETRY_PERMISSION,
  JOBS_VIEW_PERMISSION,
  resolveJobsPermissions,
} from '@/lib/services/crm/jobsService';
import { GET as jobsGet } from '@/app/api/crm/jobs/route';
import { POST as retryPost } from '@/app/api/crm/jobs/[id]/retry/route';

const repo = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');

const ORG = 105;
const USER = 'user-uuid';
const ID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
const params = { params: Promise.resolve({ id: ID }) };
const VIEW_403 = 'Requiere permiso crm.jobs.view';
const RETRY_403 = 'Requiere permisos crm.jobs.view y crm.jobs.retry';

/** `role_permissions` tal como los deja `f00_45`. */
const ROLE_GRANTS: Record<number, Set<string>> = {
  1: new Set([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]),
  2: new Set([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]),
  3: new Set(),
  4: new Set(),
  5: new Set([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]),
};

interface Member {
  roleId: number;
  isSuperAdmin?: boolean;
  /** `job_position_permissions` del cargo: código ⇒ `allowed`. `undefined` = sin cargo. */
  cargo?: Record<string, boolean>;
}

type RpcArgs = { p_user_id: string; p_organization_id: number; p_permission_code: string };

/** Doble fiel de `check_user_permission(p_user_id, p_organization_id, p_permission_code)`. */
function dbDouble(member: Member) {
  return jest.fn(async (fn: string, args: RpcArgs) => {
    if (fn !== 'check_user_permission') return { data: null, error: { message: `rpc inesperada ${fn}` } };
    if (args.p_user_id !== USER || args.p_organization_id !== ORG) return { data: false, error: null };
    if (member.isSuperAdmin) return { data: true, error: null };
    if (member.cargo && Object.prototype.hasOwnProperty.call(member.cargo, args.p_permission_code)) {
      return { data: member.cargo[args.p_permission_code] === true, error: null };
    }
    return { data: (ROLE_GRANTS[member.roleId] ?? new Set()).has(args.p_permission_code), error: null };
  });
}

/** RPC por código con respuestas arbitrarias (o que lanza) para el fail-closed por código. */
type Reply = { data: unknown; error: unknown } | (() => never);
function rpcReplying(byCode: Record<string, Reply>) {
  return jest.fn(async (_fn: string, args: RpcArgs) => {
    const reply = byCode[args.p_permission_code];
    if (typeof reply === 'function') return reply();
    return reply ?? { data: false, error: null };
  });
}

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

function session(member: Member, rpc: jest.Mock = dbDouble(member)) {
  return { userId: USER, organizationId: ORG, roleId: member.roleId, roleName: 'x', isSuperAdmin: member.isSuperAdmin === true, supabase: listSb(rpc), rpc };
}

const codesAsked = (rpc: jest.Mock) =>
  rpc.mock.calls.filter((c: unknown[]) => c[0] === 'check_user_permission').map((c: unknown[]) => (c[1] as RpcArgs).p_permission_code);

const getReq = () => new NextRequest('http://localhost/api/crm/jobs');
const retryReq = () => new NextRequest(`http://localhost/api/crm/jobs/${ID}/retry`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });

/** Service client con la cola vacía: si el permiso pasa, `retryJob` responde 404 (= «llegó a retryJob»). */
const emptyServiceSb = () => ({
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null });
    return chain;
  },
});

/** Ejecuta GET y POST retry con la misma sesión y devuelve conteos/códigos por ruta. */
async function run(s: ReturnType<typeof session>) {
  (getServerOrgContext as jest.Mock).mockResolvedValue(s);
  const g = await jobsGet(getReq());
  const gBody = (await g.json()) as { canRetry?: boolean; error?: string };
  const getCodes = codesAsked(s.rpc);
  s.rpc.mockClear();
  (getServiceClient as jest.Mock).mockClear();
  const r = await retryPost(retryReq(), params);
  const rBody = (await r.json()) as { error?: string };
  return { g: g.status, gBody, getCodes, r: r.status, rBody, retryCodes: codesAsked(s.rpc), serviceOpened: (getServiceClient as jest.Mock).mock.calls.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getServiceClient as jest.Mock).mockImplementation(() => emptyServiceSb());
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('r5b · 1 — rol 5 + cargo que niega SOLO crm.jobs.view (RPC: view=false, retry=true) ⇒ deny explícito respetado', () => {
  const member: Member = { roleId: 5, cargo: { [JOBS_VIEW_PERMISSION]: false } };

  it('GET ⇒ 403 «Requiere permiso crm.jobs.view» con EXACTAMENTE 1 RPC (p_permission_code = crm.jobs.view); crm.jobs.retry no se pregunta', async () => {
    const s = session(member);
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const g = await jobsGet(getReq());
    expect(g.status).toBe(403);
    expect(await g.json()).toEqual({ success: false, error: VIEW_403 });
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: USER, p_organization_id: ORG, p_permission_code: 'crm.jobs.view' });
    expect(codesAsked(s.rpc)).not.toContain(JOBS_RETRY_PERMISSION);
  });

  it('POST retry ⇒ 403 «Requiere permisos crm.jobs.view y crm.jobs.retry» con 1 RPC (view), 0 getServiceClient y sin llegar a retryJob', async () => {
    const s = session(member);
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    (getServiceClient as jest.Mock).mockImplementation(() => {
      throw new Error('retryJob alcanzado: getServiceClient no debía abrirse');
    });
    const r = await retryPost(retryReq(), params);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ success: false, error: RETRY_403 });
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('resolveJobsPermissions ⇒ {canView:false, canRetry:false}; canRetryJobs ⇒ false; canViewJobs ⇒ false (las tres coinciden), cada una con 1 RPC de view', async () => {
    const s = session(member);
    expect(await resolveJobsPermissions(s)).toEqual({ canView: false, canRetry: false });
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    s.rpc.mockClear();
    expect(await canRetryJobs(s)).toBe(false);
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    s.rpc.mockClear();
    expect(await canViewJobs(s)).toBe(false);
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
  });
});

describe('r5b · 2–6 — matriz por sujeto sobre las rutas reales', () => {
  it('2 · rol 5 por defecto (f00_45): GET 200 canRetry:true con EXACTAMENTE 2 RPC en el orden [view, retry]; retry llega a retryJob (404) con 1 getServiceClient', async () => {
    const o = await run(session({ roleId: 5 }));
    expect([o.g, o.gBody.canRetry]).toEqual([200, true]);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    expect([o.r, o.serviceOpened]).toEqual([404, 1]);
    expect(o.retryCodes).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
  });

  it('3 · rol 5 + cargo que niega SOLO crm.jobs.retry: GET 200 canRetry:false (2 RPC); retry 403, 0 service', async () => {
    const o = await run(session({ roleId: 5, cargo: { [JOBS_RETRY_PERMISSION]: false } }));
    expect([o.g, o.gBody.canRetry]).toEqual([200, false]);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    expect([o.r, o.rBody.error, o.serviceOpened]).toEqual([403, RETRY_403, 0]);
  });

  it('4 · rol 4 + cargo que concede SOLO crm.jobs.retry: GET 403 (1 RPC, view) y retry 403 (no ve ⇒ no reintenta; QA r5 hallazgo 3)', async () => {
    const o = await run(session({ roleId: 4, cargo: { [JOBS_RETRY_PERMISSION]: true } }));
    expect([o.g, o.gBody.error, o.getCodes]).toEqual([403, VIEW_403, [JOBS_VIEW_PERMISSION]]);
    expect([o.r, o.rBody.error, o.retryCodes, o.serviceOpened]).toEqual([403, RETRY_403, [JOBS_VIEW_PERMISSION], 0]);
  });

  it('5 · rol 4 sin cargo: GET 403 con 1 RPC (view); retry 403 con 0 service', async () => {
    const o = await run(session({ roleId: 4 }));
    expect([o.g, o.getCodes]).toEqual([403, [JOBS_VIEW_PERMISSION]]);
    expect([o.r, o.retryCodes, o.serviceOpened]).toEqual([403, [JOBS_VIEW_PERMISSION], 0]);
  });

  const admins: Array<[string, Member]> = [
    ['rol 1', { roleId: 1 }],
    ['rol 2', { roleId: 2 }],
    ['super admin (rol 9)', { roleId: 9, isSuperAdmin: true }],
  ];
  it.each(admins)('6 · %s: ambos true con 0 RPC en resolveJobsPermissions, GET y retry (sin cambios)', async (_label, member) => {
    const s = session(member);
    expect(await resolveJobsPermissions(s)).toEqual({ canView: true, canRetry: true });
    expect(s.rpc).not.toHaveBeenCalled();
    const o = await run(s);
    expect([o.g, o.gBody.canRetry, o.getCodes]).toEqual([200, true, []]);
    expect([o.r, o.retryCodes, o.serviceOpened]).toEqual([404, [], 1]);
  });
});

describe('r5b · 7 — fail-closed por código: basura o excepción en la consulta de view ⇒ corta; en la de retry (view=true) ⇒ ve sin reintentar', () => {
  const garbage: Array<[string, Reply]> = [
    ['lanza', () => { throw new Error('socket hang up'); }],
    ['{ error }', { data: null, error: { message: 'statement timeout' } }],
    ['data:"true" (string)', { data: 'true', error: null }],
    ['data:1', { data: 1, error: null }],
    ['data:null', { data: null, error: null }],
  ];

  it.each(garbage)('view %s (retry sería true) ⇒ GET 403 con 1 RPC y sin consultar retry; retry 403 con 0 service; resolve {false,false}', async (_label, reply) => {
    const rpc = rpcReplying({ [JOBS_VIEW_PERMISSION]: reply, [JOBS_RETRY_PERMISSION]: { data: true, error: null } });
    const s = session({ roleId: 5 }, rpc);
    expect(await resolveJobsPermissions(s)).toEqual({ canView: false, canRetry: false });
    expect(codesAsked(rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    rpc.mockClear();
    const o = await run(s);
    expect([o.g, o.gBody.error, o.getCodes]).toEqual([403, VIEW_403, [JOBS_VIEW_PERMISSION]]);
    expect([o.r, o.retryCodes, o.serviceOpened]).toEqual([403, [JOBS_VIEW_PERMISSION], 0]);
  });

  it.each(garbage)('retry %s (view=true) ⇒ GET 200 canRetry:false con 2 RPC; retry 403 con 0 service; resolve {true,false}', async (_label, reply) => {
    const rpc = rpcReplying({ [JOBS_VIEW_PERMISSION]: { data: true, error: null }, [JOBS_RETRY_PERMISSION]: reply });
    const s = session({ roleId: 5 }, rpc);
    expect(await resolveJobsPermissions(s)).toEqual({ canView: true, canRetry: false });
    expect(codesAsked(rpc)).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    rpc.mockClear();
    const o = await run(s);
    expect([o.g, o.gBody.canRetry, o.getCodes]).toEqual([200, false, [JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]]);
    expect([o.r, o.rBody.error, o.serviceOpened]).toEqual([403, RETRY_403, 0]);
  });
});

describe('r5b · 8 — estático: view precede a retry; el retry no consulta solo `retry`; canRetryJobs delega', () => {
  const service = () => read(path.join('src', 'lib', 'services', 'crm', 'jobsService.ts'));
  const retryRoute = () => read(path.join('src', 'app', 'api', 'crm', 'jobs', '[id]', 'retry', 'route.ts'));

  it('resolveJobsPermissions: la consulta de view (canViewJobs) precede a la de retry (JOBS_RETRY_PERMISSION) y corta con canRetry:false antes de preguntar retry', () => {
    const src = service();
    const start = src.indexOf('export async function resolveJobsPermissions');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('\n}', start));
    const viewAt = body.indexOf('canViewJobs(ctx)');
    const retryAt = body.indexOf('JOBS_RETRY_PERMISSION');
    expect(viewAt).toBeGreaterThan(0);
    expect(retryAt).toBeGreaterThan(viewAt);
    // Cortocircuito: entre la consulta de view y la de retry hay un `return` con canRetry:false.
    const between = body.slice(viewAt, retryAt);
    expect(between).toMatch(/return \{ canView: false, canRetry: false \}/);
    expect(body).not.toMatch(/canRetryJobs\(ctx\)|Promise\.all/);
  });

  it('canRetryJobs: su cuerpo contiene resolveJobsPermissions(ctx) y no consulta JOBS_RETRY_PERMISSION ni hasJobsPermission por su cuenta', () => {
    const src = service();
    const start = src.indexOf('export async function canRetryJobs');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf('\n}', start));
    expect(body).toMatch(/resolveJobsPermissions\(ctx\)\)\.canRetry/);
    expect(body).not.toMatch(/hasJobsPermission\(|hasOrgAdminOrPermission\(|JOBS_RETRY_PERMISSION/);
  });

  it('retry/route.ts: usa (await resolveJobsPermissions(ctx)).canRetry una sola vez; sin hasJobsPermission(ctx, JOBS_RETRY_PERMISSION), hasOrgAdminOrPermission(…, crm.jobs.retry) ni canRetryJobs', () => {
    const src = retryRoute();
    expect(src.match(/\(await resolveJobsPermissions\(ctx\)\)\.canRetry/g)).toHaveLength(1);
    expect(src).not.toMatch(/hasJobsPermission\(|hasOrgAdminOrPermission\(|canRetryJobs\(|canViewJobs\(|JOBS_RETRY_PERMISSION|'crm\.jobs\.retry'\)/);
    expect(src).toMatch(/Requiere permisos crm\.jobs\.view y crm\.jobs\.retry/);
    // Orden de guardas: org de sesión → readOrgBody → permiso → UUID → service client.
    const idx = ['getServerOrgContext(request)', 'await readOrgBody(ctx, request)', '(await resolveJobsPermissions(ctx)).canRetry', 'UUID_RE.test(id)', 'getServiceClient()'].map((s) => src.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe('r5b · 9 — documentación coherente con (b)', () => {
  const doc = () => read(path.join('docs', 'crm-revenue-os', 'FASE-00-FUNDACIONES.md'));
  const rows = () => doc().split('\n').filter((l) => /^\| (GET|POST) \| `\/api\/crm\/jobs(\/\[id\]\/retry)?` /.test(l));

  it('§4.1 GET: sin «una sola RPC cuando crm.jobs.retry es true»; con «reintentar exige ambos códigos» y «view=false cierra la cola con 1 RPC»', () => {
    const [get] = rows();
    expect(get).toBeDefined();
    expect(get).not.toMatch(/una sola RPC cuando `crm\.jobs\.retry` es `true`/);
    expect(get).not.toMatch(/retry ⇒ view/);
    expect(get).toMatch(/reintentar exige ambos códigos/);
    expect(get).toMatch(/`view=false` cierra la cola con 1 RPC/);
    expect(get).toMatch(/\[view, retry\]/);
  });

  it('§4.1 POST: «el Manager reintenta si además puede ver», ambos códigos y el mensaje de 403 del cierre', () => {
    const [, post] = rows();
    expect(post).toBeDefined();
    expect(post).toMatch(/el Manager reintenta si además puede ver/);
    expect(post).toMatch(/`crm\.jobs\.view` Y `crm\.jobs\.retry`/);
    expect(post).toMatch(/resolveJobsPermissions\(ctx\)\.canRetry/);
    expect(post).toMatch(/Requiere permisos crm\.jobs\.view y crm\.jobs\.retry/);
    expect(post).not.toMatch(/canRetryJobs` → `hasOrgAdminOrPermission/);
  });

  it('§13 r5: conserva «un cargo que le niegue crm.jobs.view lo deja fuera aunque sea Manager», registra el hallazgo 3 y el cierre (b) con el coste de RPC', () => {
    const r5 = doc().slice(doc().indexOf('## 13. Registro de implementación — ronda 5'));
    expect(r5).toMatch(/cargo que le niegue `crm\.jobs\.view` lo deja fuera aunque sea Manager/);
    expect(r5).toMatch(/para conceder el retry por cargo hay que conceder también la vista/);
    expect(r5).toMatch(/\*\*Cierre r5 \(2026-09-16, QA r5 N-1, opción b/);
    expect(r5).toMatch(/2 RPC en la GET y 2 en el retry/);
    expect(r5).not.toMatch(/El contrato es `retry ⇒ view`/);
  });

  it('cabeceras de jobsService.ts, route.ts y retry/route.ts: sin «retry ⇒ view» y con el contrato view ∧ retry', () => {
    const service = read(path.join('src', 'lib', 'services', 'crm', 'jobsService.ts'));
    const get = read(path.join('src', 'app', 'api', 'crm', 'jobs', 'route.ts'));
    const retry = read(path.join('src', 'app', 'api', 'crm', 'jobs', '[id]', 'retry', 'route.ts'));
    for (const src of [service, get, retry]) {
      expect(src).not.toMatch(/retry ⇒ view|retry => view|una sola RPC cuando `crm\.jobs\.retry`/);
    }
    expect(service).toMatch(/reintentar exige AMBOS\s+\*?\s?códigos/);
    expect(service).toMatch(/consulta PRIMERO `crm\.jobs\.view`/);
    expect(get).toMatch(/orden `\[view, retry\]`/);
    expect(retry).toMatch(/`crm\.jobs\.view` Y\s+\* `crm\.jobs\.retry`|`crm\.jobs\.view` Y `crm\.jobs\.retry`/);
  });
});
