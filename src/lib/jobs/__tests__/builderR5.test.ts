/**
 * Builder F0-JOBS r5 — obligatorios 1–3 y opcionales del QA r4 (`F0-JOBS-qa-r4.md`):
 *  1. Contrato BD ↔ código ↔ doc: la migración `crm_v4_f00_45` concede
 *     `crm.jobs.view` y `crm.jobs.retry` a los roles 1, 2 y 5; NO existe una
 *     `f00_46` que retire el retry al Manager (decisión B del dueño); los
 *     códigos del SQL son exactamente los que usa `jobsService.ts`; FASE-00
 *     §4.1 ya no describe `admin.full_access` ni `STAGE_MANAGER_ROLE_IDS` para
 *     estas rutas.
 *  2. `resolveJobsPermissions`: una resolución por petición. Cierre r5 (QA r5
 *     N-1, opción b): `canRetry = view ∧ retry`, orden `[view, retry]` con
 *     cortocircuito en `view=false`. Los 10 puntos del QA r5 están en
 *     `builderR5b.test.ts`.
 *  4. Segunda prueba para las guardas de un solo test: `readOrgBody` en retry
 *     (super admin con body/query de otra org ⇒ 403 sin abrir el service
 *     client) y T-6 (`COMPLETE_RETRY_DELAY_MS` literal 300 y Δt ≥ 300 medido
 *     sin restar la constante).
 *
 * Corre en `TZ=UTC` y `TZ=America/Bogota`. Sin datos reales ni nombres de clientes.
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
import { ORG_ADMIN_ROLE_IDS } from '@/lib/utils/orgAdmin';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { COMPLETE_RETRY_DELAY_MS, runJobs } from '../runner';
import type { OutboundJob } from '../types';
import { JOBS_RETRY_PERMISSION, JOBS_VIEW_PERMISSION, resolveJobsPermissions } from '@/lib/services/crm/jobsService';
import { POST as retryPost } from '@/app/api/crm/jobs/[id]/retry/route';

const repo = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  jest.clearAllMocks();
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('r5 · 1 — contrato de permisos: BD (f00_45) ↔ código ↔ doc', () => {
  const migrations = fs.readdirSync(path.join(repo, 'supabase', 'migrations'));
  const f45 = migrations.find((f) => /crm_v4_f00_45/.test(f));
  const f46 = migrations.filter((f) => /crm_v4_f00_46/.test(f));

  it('f00_45 existe con su rollback, crea exactamente los dos códigos que usa jobsService.ts y los concede a los roles 1, 2 y 5', () => {
    expect(f45).toBeDefined();
    const sql = read(path.join('supabase', 'migrations', f45 as string));
    expect(fs.existsSync(path.join(repo, 'supabase', 'rollbacks', (f45 as string).replace(/\.sql$/, '_rollback.sql')))).toBe(true);
    expect(sql).toContain(`('${JOBS_VIEW_PERMISSION}',`);
    expect(sql).toContain(`('${JOBS_RETRY_PERMISSION}',`);
    // Los grants por rol: (1), (2), (5) para AMBOS códigos (un solo `cross join`).
    const grant = sql.match(/cross join \(values ([^)]+\)(?:,\s*\([^)]+\))*)\) as r\(id\)/);
    expect(grant).not.toBeNull();
    const roles = Array.from((grant as RegExpMatchArray)[1].matchAll(/\((\d+)\)/g)).map((m) => Number(m[1]));
    expect(roles).toEqual([1, 2, 5]);
    expect(sql).toMatch(/p\.code in \('crm\.jobs\.view', 'crm\.jobs\.retry'\)/);
    // Sin credenciales ni nombres de organizaciones clientes.
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|service_role_key|SUPABASE_[A-Z_]*KEY/);
  });

  it('decisión B del dueño: NO existe f00_46 que retire crm.jobs.retry al rol 5; ningún .sql posterior borra ese grant', () => {
    expect(f46).toEqual([]);
    for (const f of migrations.filter((m) => m > (f45 as string))) {
      const sql = read(path.join('supabase', 'migrations', f));
      if (!/crm\.jobs\.retry/.test(sql)) continue;
      expect(sql).not.toMatch(/delete from public\.role_permissions[\s\S]*crm\.jobs\.retry/);
    }
  });

  it('el criterio síncrono sigue siendo el del repo (ORG_ADMIN_ROLE_IDS = [1, 2]); el rol 5 no está ahí: siempre consulta la BD', () => {
    expect([...ORG_ADMIN_ROLE_IDS]).toEqual([1, 2]);
    expect(ORG_ADMIN_ROLE_IDS).not.toContain(5);
    const src = read(path.join('src', 'lib', 'services', 'crm', 'jobsService.ts'));
    expect(src).not.toMatch(/stagePermissions|STAGE_MANAGER_ROLE_IDS|ORG_ADMIN_ROLE_IDS\.includes/);
  });

  it('FASE-00 §4.1 (:733-734) y la cabecera de retry/route.ts describen el criterio por código, no admin.full_access ni STAGE_MANAGER_ROLE_IDS', () => {
    const doc = read(path.join('docs', 'crm-revenue-os', 'FASE-00-FUNDACIONES.md'));
    const rows = doc.split('\n').filter((l) => /^\| (GET|POST) \| `\/api\/crm\/jobs(\/\[id\]\/retry)?` /.test(l));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatch(/crm\.jobs\.(view|retry)/);
      expect(row).not.toMatch(/STAGE_MANAGER_ROLE_IDS|admin\.full_access|Manager NO/);
    }
    expect(rows[1]).toMatch(/crm\.jobs\.retry/);
    expect(rows[1]).toMatch(/1, 2 y 5|1\/2\/5/);
    const retry = read(path.join('src', 'app', 'api', 'crm', 'jobs', '[id]', 'retry', 'route.ts'));
    expect(retry).toMatch(/crm\.jobs\.retry/);
    expect(retry).not.toMatch(/Manager \(5\) NO reintenta|admin\.full_access/);
  });
});

describe('r5 · 2 — resolveJobsPermissions con el mismo doble de `check_user_permission` que usa la BD (rol 5 = grants de f00_45)', () => {
  const grantsByRole: Record<number, Record<string, boolean>> = {
    1: {}, // nunca consulta
    2: {}, // nunca consulta
    3: {},
    4: {},
    5: { [JOBS_VIEW_PERMISSION]: true, [JOBS_RETRY_PERMISSION]: true },
  };
  const ctxFor = (roleId: number, overrides: Record<string, boolean> = {}) => {
    const grants = { ...grantsByRole[roleId], ...overrides };
    const rpc = jest.fn(async (_fn: string, args: { p_permission_code: string }) => ({ data: grants[args.p_permission_code] === true, error: null }));
    return { rpc, ctx: { roleId, roleName: 'x', isSuperAdmin: false, userId: 'user-uuid', organizationId: 105, supabase: { rpc } as unknown as SupabaseClient } };
  };

  const codes = (rpc: jest.Mock) => rpc.mock.calls.map((c: unknown[]) => (c[1] as { p_permission_code: string }).p_permission_code);

  it('roles de sistema con los grants por defecto: 1/2 sin RPC, 5 con DOS RPC en orden [view, retry] (cierre r5), 3/4 con UNA RPC (view) y sin acceso', async () => {
    for (const roleId of [1, 2]) {
      const { rpc, ctx } = ctxFor(roleId);
      expect(await resolveJobsPermissions(ctx)).toEqual({ canView: true, canRetry: true });
      expect(rpc).not.toHaveBeenCalled();
    }
    const m = ctxFor(5);
    expect(await resolveJobsPermissions(m.ctx)).toEqual({ canView: true, canRetry: true });
    expect(codes(m.rpc)).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    for (const roleId of [3, 4]) {
      const { rpc, ctx } = ctxFor(roleId);
      expect(await resolveJobsPermissions(ctx)).toEqual({ canView: false, canRetry: false });
      expect(codes(rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    }
  });

  it('un cargo con precedencia puede negar el retry al Manager (ve, no reintenta: 2 RPC), negarle la vista (1 RPC, cierra también el retry) o ambos', async () => {
    const soloVe = ctxFor(5, { [JOBS_RETRY_PERMISSION]: false });
    expect(await resolveJobsPermissions(soloVe.ctx)).toEqual({ canView: true, canRetry: false });
    expect(codes(soloVe.rpc)).toEqual([JOBS_VIEW_PERMISSION, JOBS_RETRY_PERMISSION]);
    const noVe = ctxFor(5, { [JOBS_VIEW_PERMISSION]: false });
    expect(await resolveJobsPermissions(noVe.ctx)).toEqual({ canView: false, canRetry: false });
    expect(codes(noVe.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
    const nada = ctxFor(5, { [JOBS_RETRY_PERMISSION]: false, [JOBS_VIEW_PERMISSION]: false });
    expect(await resolveJobsPermissions(nada.ctx)).toEqual({ canView: false, canRetry: false });
    expect(codes(nada.rpc)).toEqual([JOBS_VIEW_PERMISSION]);
  });
});

describe('r5 · 4a — POST /api/crm/jobs/[id]/retry: readOrgBody antes del permiso también para quien lo tiene todo (regla 5, 2.ª guarda de M26)', () => {
  const ID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
  const params = { params: Promise.resolve({ id: ID }) };
  const post = (body: unknown, query = '') =>
    retryPost(new NextRequest(`http://localhost/api/crm/jobs/${ID}/retry${query}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), params);
  const superAdmin = () => ({ userId: 'user-uuid', organizationId: 105, roleId: 9, roleName: 'x', isSuperAdmin: true, supabase: { rpc: jest.fn() } as unknown as SupabaseClient });

  it('super admin con organizationId AJENO en el body ⇒ 403 FOREIGN_ORGANIZATION, getServiceClient NO se invoca y la RPC de permisos tampoco', async () => {
    const ctx = superAdmin();
    (getServerOrgContext as jest.Mock).mockResolvedValue(ctx);
    for (const body of [{ organizationId: 999 }, { org_id: '7' }, { orgId: 1 }]) {
      const res = await post(body);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ success: false, error: 'Organización no permitida' });
    }
    expect(getServiceClient).not.toHaveBeenCalled();
    expect((ctx.supabase as unknown as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('super admin con la org ajena en la QUERY STRING (`?organization_id=999`) ⇒ 403 sin abrir el service client', async () => {
    (getServerOrgContext as jest.Mock).mockResolvedValue(superAdmin());
    const res = await post({}, '?organization_id=999');
    expect(res.status).toBe(403);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('super admin con la MISMA org en el body ⇒ pasa las dos guardas y abre el service client (404: cola vacía)', async () => {
    (getServerOrgContext as jest.Mock).mockResolvedValue(superAdmin());
    (getServiceClient as jest.Mock).mockReturnValue({
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        return chain;
      },
    });
    const res = await post({ organization_id: 105 });
    expect(res.status).toBe(404);
    expect(getServiceClient).toHaveBeenCalledTimes(1);
  });
});

describe('r5 · 4b — T-6: la espera entre los dos intentos de fn_complete_job es un literal, no lo que diga la constante', () => {
  function makeJob(): OutboundJob {
    return {
      id: 'job-1', organization_id: 105, kind: 'noop' as OutboundJob['kind'], payload: {}, status: 'running', run_at: '', attempts: 1, max_attempts: 3,
      last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: '', updated_at: '',
    };
  }
  function makeSupabase(job: OutboundJob) {
    const completes: number[] = [];
    let claims = 0;
    const sb = {
      rpc: jest.fn(async (fn: string) => {
        if (fn === 'fn_claim_jobs') return { data: ++claims === 1 ? [job] : [], error: null };
        if (fn === 'fn_complete_job') {
          completes.push(Date.now());
          await sleep(1);
          return { data: null, error: { message: 'ECONNRESET' } };
        }
        if (fn === 'fn_fail_job') return { data: 'failed', error: null };
        return { data: true, error: null };
      }),
      from: jest.fn(),
    } as unknown as SupabaseClient;
    return { sb, completes };
  }

  it('COMPLETE_RETRY_DELAY_MS es exactamente 300', () => {
    expect(COMPLETE_RETRY_DELAY_MS).toBe(300);
    expect(read(path.join('src', 'lib', 'jobs', 'runner.ts'))).toMatch(/COMPLETE_RETRY_DELAY_MS = 300\b/);
  });

  it('entre el primer y el segundo fn_complete_job pasan ≥ 300 ms reales (medido sin restar la constante) y hay un solo fn_fail_job', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const { sb, completes } = makeSupabase(makeJob());
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(completes).toHaveLength(2);
    expect(completes[1] - completes[0]).toBeGreaterThanOrEqual(295); // 300 menos la granularidad del timer de Node
    expect((sb.rpc as jest.Mock).mock.calls.filter((c: unknown[]) => c[0] === 'fn_fail_job')).toHaveLength(1);
    expect(summary).toMatchObject({ failed: 1, completeFailed: 1 });
  });
});
