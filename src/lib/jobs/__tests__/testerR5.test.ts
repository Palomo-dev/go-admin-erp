/**
 * Tester F0-JOBS r5 — matriz de permisos de la cola con un doble FIEL de
 * `check_user_permission` (leído de la BD el 2026-09-16 con el MCP):
 *
 *   miembro activo → `is_super_admin` ⇒ true → si el CARGO tiene el código
 *   definido, su `allowed` decide (precedencia) → si no, `role_permissions`
 *   del rol → false.
 *
 * Grants por defecto (`crm_v4_f00_45`, verificados en `role_permissions`):
 * `crm.jobs.view` y `crm.jobs.retry` ⇒ roles 1, 2 y 5. La RPC resuelve UN
 * código por llamada: dry-run real (transacción con `rollback`) sobre un
 * Manager de org 128 con un cargo que niega SOLO `crm.jobs.view` ⇒
 * `view=false, retry=true`. Cierre r5 (QA r5 N-1, opción b): el código ya no
 * asume `retry ⇒ view`; `canRetry = view ∧ retry`, `view` se consulta primero
 * y `false` corta con una sola RPC. El caso N-1 pasa de documentar el defecto
 * a demostrar la corrección.
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Sin datos reales ni nombres de
 * clientes; los ids de org son ficticios.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

jest.mock('../handlers', () => ({}));
jest.mock('../handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ jobs_deleted: 0 })) }));
jest.mock('../scheduled/healthRecalculate', () => ({ runHealthRecalculate: jest.fn() }));
jest.mock('../scheduled/renewalsSync', () => ({ runRenewalsSync: jest.fn() }));
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
import { runMaintenance } from '../handlers/maintenance';
import { runScheduledKinds } from '../scheduler';
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
  /** Simula `organization_members.is_active = false` (o no miembro). */
  inactive?: boolean;
}

/** Doble fiel de `check_user_permission(p_user_id, p_organization_id, p_permission_code)`. */
function dbDouble(member: Member) {
  return jest.fn(async (fn: string, args: { p_user_id: string; p_organization_id: number; p_permission_code: string }) => {
    if (fn !== 'check_user_permission') return { data: null, error: { message: `rpc inesperada ${fn}` } };
    if (args.p_user_id !== USER || args.p_organization_id !== ORG || member.inactive) return { data: false, error: null };
    if (member.isSuperAdmin) return { data: true, error: null };
    if (member.cargo && Object.prototype.hasOwnProperty.call(member.cargo, args.p_permission_code)) {
      return { data: member.cargo[args.p_permission_code] === true, error: null };
    }
    return { data: (ROLE_GRANTS[member.roleId] ?? new Set()).has(args.p_permission_code), error: null };
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
  return {
    userId: USER,
    organizationId: ORG,
    roleId: member.roleId,
    roleName: 'x',
    isSuperAdmin: member.isSuperAdmin === true,
    supabase: listSb(rpc),
    rpc,
  };
}

const codesAsked = (rpc: jest.Mock) =>
  rpc.mock.calls.filter((c: unknown[]) => c[0] === 'check_user_permission').map((c: unknown[]) => (c[1] as { p_permission_code: string }).p_permission_code);

const getReq = (query = '') => new NextRequest(`http://localhost/api/crm/jobs${query}`);
const retryReq = (body: unknown = {}, query = '') =>
  new NextRequest(`http://localhost/api/crm/jobs/${ID}/retry${query}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

/** Service client con la cola vacía: si el permiso pasa, `retryJob` responde 404 (= «llegó a retryJob»). */
const emptyServiceSb = () => ({
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null });
    return chain;
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  (getServiceClient as jest.Mock).mockImplementation(() => emptyServiceSb());
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('tester r5 · matriz por rol sobre las rutas reales (GET /api/crm/jobs y POST …/retry) con el doble fiel de la RPC', () => {
  async function run(member: Member) {
    const s = session(member);
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const g = await jobsGet(getReq());
    const gBody = (await g.json()) as { canRetry?: boolean; error?: string };
    const getCalls = s.rpc.mock.calls.length;
    const getCodes = codesAsked(s.rpc);
    s.rpc.mockClear();
    (getServiceClient as jest.Mock).mockClear();
    const r = await retryPost(retryReq(), params);
    const rBody = (await r.json()) as { error?: string };
    return { g: g.status, gBody, getCalls, getCodes, r: r.status, rBody, retryCalls: s.rpc.mock.calls.length, serviceOpened: (getServiceClient as jest.Mock).mock.calls.length };
  }

  it('super admin (role_id 9 cualquiera) ⇒ GET 200 canRetry:true y retry llega a retryJob (404), CERO RPC en ambas', async () => {
    const o = await run({ roleId: 9, isSuperAdmin: true });
    expect([o.g, o.gBody.canRetry, o.getCalls]).toEqual([200, true, 0]);
    expect([o.r, o.retryCalls, o.serviceOpened]).toEqual([404, 0, 1]);
  });

  it.each([1, 2])('rol %i ⇒ 200 canRetry:true / retry 404, sin RPC (criterio síncrono ORG_ADMIN_ROLE_IDS)', async (roleId) => {
    const o = await run({ roleId });
    expect([o.g, o.gBody.canRetry, o.getCalls]).toEqual([200, true, 0]);
    expect([o.r, o.retryCalls]).toEqual([404, 0]);
  });

  it('rol 5 (Manager) con los grants de f00_45 ⇒ GET 200 canRetry:true con EXACTAMENTE 2 RPC en el orden [view, retry]; retry llega a retryJob con 2 RPC y 1 service client', async () => {
    const o = await run({ roleId: 5 });
    expect([o.g, o.gBody.canRetry]).toEqual([200, true]);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    expect([o.r, o.retryCalls, o.serviceOpened]).toEqual([404, 2, 1]);
  });

  it('rol 4 sin cargo ⇒ 403 en GET (1 RPC: view; retry no se pregunta) y 403 en retry (1 RPC) con los mensajes del cierre r5; el service client no se abre', async () => {
    const s = session({ roleId: 4 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const g = await jobsGet(getReq());
    expect(g.status).toBe(403);
    expect(await g.json()).toEqual({ success: false, error: 'Requiere permiso crm.jobs.view' });
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    s.rpc.mockClear();
    const r = await retryPost(retryReq(), params);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ success: false, error: 'Requiere permisos crm.jobs.view y crm.jobs.retry' });
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('rol 3 (Cliente) ⇒ 403/403 igual que el rol 4', async () => {
    const o = await run({ roleId: 3 });
    expect([o.g, o.r, o.serviceOpened]).toEqual([403, 403, 0]);
  });

  it('rol 4 con cargo que concede SOLO crm.jobs.view ⇒ GET 200 canRetry:false (2 RPC: view, retry), retry 403 (2 RPC) sin abrir el service client', async () => {
    const o = await run({ roleId: 4, cargo: { [JOBS_VIEW_PERMISSION]: true } });
    expect([o.g, o.gBody.canRetry]).toEqual([200, false]);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    expect([o.r, o.retryCalls, o.serviceOpened]).toEqual([403, 2, 0]);
  });

  it('rol 4 con cargo que concede SOLO crm.jobs.retry ⇒ 403 en GET y en retry con 1 RPC (view): no ve ⇒ no reintenta (r5 cierre, QA r5 hallazgo 3)', async () => {
    const o = await run({ roleId: 4, cargo: { [JOBS_RETRY_PERMISSION]: true } });
    expect([o.g, o.getCalls, o.getCodes]).toEqual([403, 1, [JOBS_VIEW_PERMISSION]]);
    expect([o.r, o.retryCalls, o.serviceOpened]).toEqual([403, 1, 0]);
  });

  it('rol 5 con cargo que niega view Y retry ⇒ 403/403 con 1 RPC (view): ser Manager no concede nada por sí mismo', async () => {
    const o = await run({ roleId: 5, cargo: { [JOBS_VIEW_PERMISSION]: false, [JOBS_RETRY_PERMISSION]: false } });
    expect([o.g, o.r, o.serviceOpened]).toEqual([403, 403, 0]);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION]);
  });

  it('N-1 (corregido en el cierre r5) · rol 5 con cargo que niega SOLO crm.jobs.view: la BD dice view=false/retry=true y el código responde GET 403 con EXACTAMENTE 1 RPC (crm.jobs.view) y retry 403 con 0 service client', async () => {
    // Contrato (b): `canRetry = view ∧ retry`; `view` se consulta primero y `false` corta.
    // El deny explícito del cargo sobre `view` se respeta aunque el rol conceda `retry`.
    const o = await run({ roleId: 5, cargo: { [JOBS_VIEW_PERMISSION]: false } });
    expect([o.g, o.gBody.error]).toEqual([403, 'Requiere permiso crm.jobs.view']);
    expect(o.getCalls).toBe(1);
    expect(o.getCodes).toEqual([JOBS_VIEW_PERMISSION]);
    expect(o.getCodes).not.toContain(JOBS_RETRY_PERMISSION);
    expect([o.r, o.rBody.error, o.retryCalls, o.serviceOpened]).toEqual([403, 'Requiere permisos crm.jobs.view y crm.jobs.retry', 1, 0]);
    // Las tres funciones exportadas coinciden para este miembro.
    const s = session({ roleId: 5, cargo: { [JOBS_VIEW_PERMISSION]: false } });
    expect(await resolveJobsPermissions(s)).toEqual({ canView: false, canRetry: false });
    expect(await canRetryJobs(s)).toBe(false);
    expect(await canViewJobs(s)).toBe(false);
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION, JOBS_VIEW_PERMISSION, JOBS_VIEW_PERMISSION]);
  });

  it('rol 5 con cargo que niega SOLO crm.jobs.retry ⇒ ve sin reintentar (2 RPC), retry 403', async () => {
    const o = await run({ roleId: 5, cargo: { [JOBS_RETRY_PERMISSION]: false } });
    expect([o.g, o.gBody.canRetry, o.getCalls]).toEqual([200, false, 2]);
    expect([o.r, o.serviceOpened]).toEqual([403, 0]);
  });

  it('rol 5 con membresía inactiva (la RPC devuelve false para ambos) ⇒ 403/403', async () => {
    const o = await run({ roleId: 5, inactive: true });
    expect([o.g, o.r]).toEqual([403, 403]);
  });

  it('la RPC recibe SIEMPRE el usuario y la org de la sesión, y nunca admin.full_access', async () => {
    const s = session({ roleId: 5 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    await jobsGet(getReq());
    await retryPost(retryReq(), params);
    for (const c of s.rpc.mock.calls as unknown[][]) {
      expect(c[0]).toBe('check_user_permission');
      expect(c[1]).toMatchObject({ p_user_id: USER, p_organization_id: ORG });
      expect((c[1] as { p_permission_code: string }).p_permission_code).not.toBe('admin.full_access');
    }
    expect(s.rpc).toHaveBeenCalledTimes(4); // 2 por la GET + 2 por el retry (rol 5 con ambos grants, r5 cierre)
    expect(codesAsked(s.rpc)).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION, JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
  });
});

describe('tester r5 · fail-closed: RPC que lanza, que rechaza, que tarda y que devuelve basura ⇒ 403, nunca 500', () => {
  it.each([
    ['lanza síncronamente', jest.fn(() => { throw new Error('socket hang up'); })],
    ['rechaza la promesa', jest.fn(async () => { throw new Error('ETIMEDOUT'); })],
    ['devuelve { error }', jest.fn(async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }))],
    ['devuelve data:"true" (string)', jest.fn(async () => ({ data: 'true', error: null }))],
    ['devuelve data:1', jest.fn(async () => ({ data: 1, error: null }))],
    ['devuelve data:null sin error', jest.fn(async () => ({ data: null, error: null }))],
    ['devuelve undefined', jest.fn(async () => undefined)],
  ])('rol 5 con RPC que %s ⇒ GET 403 y retry 403 (sin service client)', async (_label, rpc) => {
    const s = session({ roleId: 5 }, rpc as jest.Mock);
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const g = await jobsGet(getReq());
    expect(g.status).toBe(403);
    const r = await retryPost(retryReq(), params);
    expect(r.status).toBe(403);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('RPC que tarda 150 ms y luego falla ⇒ 403 (no 500) y se registra un warn', async () => {
    const rpc = jest.fn(async () => {
      await new Promise((res) => setTimeout(res, 150));
      return { data: null, error: { message: 'timeout' } };
    });
    const s = session({ roleId: 5 }, rpc);
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    expect((await jobsGet(getReq())).status).toBe(403);
    expect(console.warn).toHaveBeenCalled();
  });

  it('resolveJobsPermissions sin sesión completa (sin supabase/userId): rol 5 ⇒ {false,false} sin lanzar; rol 2 ⇒ {true,true}', async () => {
    await expect(resolveJobsPermissions({ roleId: 5, isSuperAdmin: false })).resolves.toEqual({ canView: false, canRetry: false });
    await expect(resolveJobsPermissions({ roleId: 2, isSuperAdmin: false })).resolves.toEqual({ canView: true, canRetry: true });
    await expect(resolveJobsPermissions({ roleId: 5, isSuperAdmin: false, userId: USER, organizationId: ORG })).resolves.toEqual({ canView: false, canRetry: false });
  });

  it('permissionSubject: isSuperAdmin ausente/undefined/"true" (string) NO es super admin (solo `=== true`): rol 4 ⇒ RPC y false', async () => {
    for (const bad of [undefined, null, 'true', 1]) {
      const rpc = dbDouble({ roleId: 4 });
      const ctx = { roleId: 4, isSuperAdmin: bad as unknown as boolean, userId: USER, organizationId: ORG, supabase: { rpc } as unknown as SupabaseClient };
      await expect(resolveJobsPermissions(ctx)).resolves.toEqual({ canView: false, canRetry: false });
      expect(rpc).toHaveBeenCalledTimes(1); // sí consulta la BD (no es super admin) y `view=false` corta
      expect(codesAsked(rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    }
  });

  it('hasJobsPermission: si hasOrgAdminOrPermission LANZARA (cliente sin rpc), jobsService deniega con warn (defensa en profundidad)', async () => {
    const s = { roleId: 5, isSuperAdmin: false, userId: USER, organizationId: ORG, supabase: {} as unknown as SupabaseClient };
    await expect(canViewJobs(s)).resolves.toBe(false);
    await expect(canRetryJobs(s)).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('tester r5 · regla 5 en retry: org ajena en body o query ⇒ 403 ANTES del permiso y de la BD', () => {
  it.each([
    ['body organization_id', { organization_id: 999 }, ''],
    ['body organizationId', { organizationId: '999' }, ''],
    ['body orgId', { orgId: 1 }, ''],
    ['body org_id', { org_id: 999 }, ''],
    ['query organization_id', {}, '?organization_id=999'],
    ['query orgId', {}, '?orgId=999'],
  ])('rol 5 con todos los grants y %s ajeno ⇒ 403 FOREIGN_ORGANIZATION, cero RPC, cero service client', async (_l, body, query) => {
    const s = session({ roleId: 5 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const r = await retryPost(retryReq(body, query), params);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, error: 'Organización no permitida' });
    expect(s.rpc).not.toHaveBeenCalled();
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('rol 4 SIN permiso y org ajena ⇒ 403 por la org (no por el permiso): el mensaje es el de readOrgBody y la RPC no se consulta', async () => {
    const s = session({ roleId: 4 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const r = await retryPost(retryReq({ organization_id: 999 }), params);
    expect(await r.json()).toMatchObject({ error: 'Organización no permitida' });
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it('misma org en body (string "105") ⇒ pasa la regla 5 y llega a retryJob', async () => {
    const s = session({ roleId: 5 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const r = await retryPost(retryReq({ organization_id: '105' }), params);
    expect(r.status).toBe(404);
  });

  it('id no UUID con permiso ⇒ 400 sin abrir el service client', async () => {
    const s = session({ roleId: 2 });
    (getServerOrgContext as jest.Mock).mockResolvedValue(s);
    const r = await retryPost(retryReq(), { params: Promise.resolve({ id: 'no-es-uuid' }) });
    expect(r.status).toBe(400);
    expect(getServiceClient).not.toHaveBeenCalled();
  });
});

describe('tester r5 · N-3: maintenance con presupuesto agotado', () => {
  const sbEmpty = () => ({ from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }) }) as unknown as SupabaseClient;

  it('totalBudgetMs ya consumido (negativo tras el arranque) ⇒ {ok:false, ms:0, error:budget_exhausted}, sin runMaintenance y sin timer de 250 ms', async () => {
    const t0 = Date.now();
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 5_000, totalBudgetMs: -1, worker: 't', supabase: sbEmpty() });
    expect(runMaintenance).not.toHaveBeenCalled();
    expect(out.maintenance).toStrictEqual({ ok: false, ms: 0, error: 'budget_exhausted' });
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it('budgetMs del paso en 0 con total infinito también se salta (remainingFor ≤ 0): el 250 ms mínimo ya no rescata al paso', async () => {
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 0, worker: 't', supabase: sbEmpty() });
    expect(runMaintenance).not.toHaveBeenCalled();
    expect(out.maintenance).toStrictEqual({ ok: false, ms: 0, error: 'budget_exhausted' });
  });

  it('presupuesto positivo de 1 ms ⇒ arranca y el abort llega a ~250 ms (mínimo conservado), ok:true y ms ≥ 200', async () => {
    (runMaintenance as jest.Mock).mockImplementation(async (_sb: unknown, _log: unknown, signal: AbortSignal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      return { jobs_deleted: 0 };
    });
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 5_000, totalBudgetMs: 1, worker: 't', supabase: sbEmpty() });
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    expect(out.maintenance?.ok).toBe(true);
    expect(out.maintenance?.ms).toBeGreaterThanOrEqual(200);
    expect(out.maintenance?.ms).toBeLessThan(1_000);
  });

  it('con presupuesto agotado, recording_cleanup tampoco encola (el salto de maintenance no consume ni desbloquea nada)', async () => {
    const out = await runScheduledKinds({ kinds: ['maintenance', 'recording_cleanup'], budgetMs: 5_000, totalBudgetMs: 0, worker: 't', supabase: sbEmpty() });
    expect(out.maintenance).toMatchObject({ ok: false, error: 'budget_exhausted' });
    expect(runMaintenance).not.toHaveBeenCalled();
  });
});

describe('tester r5 · estático: orden de guardas y una sola resolución por petición', () => {
  it('GET route.ts: exactamente una llamada a resolveJobsPermissions, antes de cualquier listJobs/getJobStats; sin canViewJobs/canRetryJobs', () => {
    const src = read(path.join('src', 'app', 'api', 'crm', 'jobs', 'route.ts'));
    expect(src.match(/resolveJobsPermissions\(ctx\)/g)).toHaveLength(1);
    expect(src).toMatch(/await resolveJobsPermissions\(ctx\)/);
    expect(src.indexOf('resolveJobsPermissions(ctx)')).toBeLessThan(src.indexOf('listJobs('));
    expect(src).not.toMatch(/canViewJobs\(|canRetryJobs\(/);
    expect(src).toMatch(/if \(!permissions\.canView\)/);
    expect(src).toMatch(/canRetry: permissions\.canRetry/);
  });

  it('retry/route.ts: getServerOrgContext → readOrgBody → (await resolveJobsPermissions(ctx)).canRetry → UUID → getServiceClient, en ese orden; sin canRetryJobs ni hasOrgAdminOrPermission', () => {
    const src = read(path.join('src', 'app', 'api', 'crm', 'jobs', '[id]', 'retry', 'route.ts'));
    const idx = ['getServerOrgContext(request)', 'await readOrgBody(ctx, request)', '(await resolveJobsPermissions(ctx)).canRetry', 'UUID_RE.test(id)', 'getServiceClient()'].map((s) => src.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(src).not.toMatch(/canRetryJobs\(|canViewJobs\(|hasOrgAdminOrPermission\(|hasJobsPermission\(|JOBS_RETRY_PERMISSION/);
  });

  it('jobsService.ts: resolveJobsPermissions consulta view y luego retry (cierre r5); canRetryJobs delega en resolveJobsPermissions; los códigos exportados son literales crm.jobs.view / crm.jobs.retry', () => {
    const src = read(path.join('src', 'lib', 'services', 'crm', 'jobsService.ts'));
    expect(src).toMatch(/JOBS_VIEW_PERMISSION = 'crm\.jobs\.view'/);
    expect(src).toMatch(/JOBS_RETRY_PERMISSION = 'crm\.jobs\.retry'/);
    const body = src.slice(src.indexOf('export async function resolveJobsPermissions'));
    expect(body.indexOf('canViewJobs(ctx)')).toBeGreaterThan(0);
    expect(body.indexOf('canViewJobs(ctx)')).toBeLessThan(body.indexOf('JOBS_RETRY_PERMISSION'));
    expect(body).not.toMatch(/canRetryJobs\(ctx\)/);
    const retryFn = src.slice(src.indexOf('export async function canRetryJobs'), src.indexOf('export async function resolveJobsPermissions'));
    expect(retryFn).toMatch(/resolveJobsPermissions\(ctx\)/);
    expect(retryFn).not.toMatch(/hasJobsPermission\(|JOBS_RETRY_PERMISSION/);
    expect(src).not.toMatch(/STAGE_MANAGER_ROLE_IDS|roleId === \d|roleName ===|admin\.full_access'/);
  });

  it('N-1 documental: FASE-00 §13 r5 afirma que «un cargo que le niegue crm.jobs.view lo deja fuera aunque sea Manager» — la frase existe y, con el cierre r5 (b), el caso N-1 la demuestra', () => {
    const doc = read(path.join('docs', 'crm-revenue-os', 'FASE-00-FUNDACIONES.md'));
    const r5 = doc.slice(doc.indexOf('## 13. Registro de implementación — ronda 5'));
    expect(r5).toMatch(/cargo que le niegue `crm\.jobs\.view` lo deja fuera aunque sea Manager/);
  });
});
