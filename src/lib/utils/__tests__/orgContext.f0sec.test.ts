/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-partes C y D) — `orgContext.ts` real con sus dependencias
 * dobladas (next/headers, clientes de Supabase, webhookSignatures → svix):
 *
 *  - header `X-Organization-Id` y cookie `goadmin_org_id` que NO coinciden →
 *    403 `ORG_AMBIGUOUS` + registro (antes ganaba el header en silencio).
 *  - `resolveOrgFromExternal`: dos organizaciones con el mismo identificador →
 *    409 `ORG_AMBIGUOUS` + registro (antes `.limit(1)` elegía una arbitraria).
 *  - `requireOrgAdmin` decide por id, nunca por nombre; `hasOrgAdminOrPermission`
 *    consulta `check_user_permission` con el usuario y la organización de la
 *    sesión y deniega si la RPC falla.
 *  - `withOrg({ admin })` usa la variante con permiso.
 * Organizaciones y usuarios ficticios.
 */

const cookieJar = new Map<string, string>();
const headerBag = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
  headers: async () => ({ get: (k: string) => headerBag.get(k.toLowerCase()) ?? null }),
}));

class WebhookErrorStub extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}
jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyCronSecret: jest.fn(),
  WebhookError: WebhookErrorStub,
}));

type Row = Record<string, unknown>;
const memberships: Row[] = [];
let externalRows: Row[] = [];
let rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> = async () => ({ data: false, error: null });
let sessionUser: { id: string; email: string } | null = { id: 'u-1', email: 'u1@ejemplo.test' };

function query(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  let limitN: number | null = null;
  const api = {
    select: () => api,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
    order: () => api,
    limit: (n: number) => { limitN = n; return api; },
    maybeSingle: async () => {
      const r = rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      return { data: r[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => void) => {
      let r = rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      if (limitN !== null) r = r.slice(0, limitN);
      resolve({ data: r, error: null });
    },
  };
  return api;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: sessionUser }, error: sessionUser ? null : new Error('no session') }) },
  from: (table: string) => {
    if (table === 'organization_members') return query(memberships);
    if (table === 'profiles') return query([]);
    return query(externalRows);
  },
  rpc: (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
};
jest.mock('@/lib/supabase/server-user', () => ({ getServerUserClient: async () => fakeClient }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient }));

import {
  getServerOrgContext,
  hasOrgAdminOrPermission,
  OrgContextError,
  requireOrgAdmin,
  requireOrgAdminOrPermission,
  resolveOrgFromExternal,
  withOrg,
  type ServerOrgContext,
} from '../orgContext';
import { OrgContextError as LeafError } from '../orgContextError';
import { ORG_ADMIN_PERMISSION_CODE } from '../orgAdmin';

// Segundo argumento obligatorio del handler de Next (RouteContext); aquí sin segmentos.
const NO_PARAMS = { params: Promise.resolve({}) };

function member(org: number, roleId = 4, extra: Row = {}): Row {
  return { id: org * 10, organization_id: org, is_super_admin: false, role_id: roleId, is_active: true, user_id: 'u-1', organizations: { name: `Org ${org}` }, roles: { name: 'Rol' }, ...extra };
}

let warn: jest.SpyInstance;
beforeEach(() => {
  cookieJar.clear();
  headerBag.clear();
  memberships.length = 0;
  memberships.push(member(7), member(9));
  externalRows = [];
  sessionUser = { id: 'u-1', email: 'u1@ejemplo.test' };
  rpcImpl = async () => ({ data: false, error: null });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

async function rejects(p: Promise<unknown>): Promise<OrgContextError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(OrgContextError);
    return err as OrgContextError;
  }
  throw new Error('esperaba OrgContextError');
}

describe('getServerOrgContext · header vs cookie', () => {
  test('OrgContextError es la misma clase que la del módulo hoja (instanceof cruza)', () => {
    expect(OrgContextError).toBe(LeafError);
  });

  test('solo header → esa organización', async () => {
    const req = new Request('http://localhost/api/x', { headers: { 'x-organization-id': '9' } });
    expect((await getServerOrgContext(req)).organizationId).toBe(9);
  });

  test('solo cookie (goadmin_org_id o la legacy org_id) → esa organización', async () => {
    cookieJar.set('goadmin_org_id', '9');
    expect((await getServerOrgContext(new Request('http://localhost/api/x'))).organizationId).toBe(9);
    cookieJar.clear();
    cookieJar.set('org_id', '7');
    expect((await getServerOrgContext(new Request('http://localhost/api/x'))).organizationId).toBe(7);
  });

  test('header y cookie iguales → bien; distintos → 403 ORG_AMBIGUOUS y registro (aunque sea miembro de ambas)', async () => {
    cookieJar.set('goadmin_org_id', '9');
    expect((await getServerOrgContext(new Request('http://localhost/api/x', { headers: { 'x-organization-id': '9' } }))).organizationId).toBe(9);
    const e = await rejects(getServerOrgContext(new Request('http://localhost/api/crm/leads', { headers: { 'x-organization-id': '7' } })));
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('ORG_AMBIGUOUS');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/header y cookie/), expect.objectContaining({ header: 7, cookie: 9, userId: 'u-1', path: '/api/crm/leads' }));
  });

  test('sin `req` también compara con headers() de next/headers', async () => {
    headerBag.set('x-organization-id', '7');
    cookieJar.set('goadmin_org_id', '9');
    const e = await rejects(getServerOrgContext());
    expect(e.code).toBe('ORG_AMBIGUOUS');
    expect(e.statusCode).toBe(403);
  });

  test('la cookie legacy solo cuenta si no hay goadmin_org_id: header 9 + goadmin 9 + legacy 7 → 9', async () => {
    cookieJar.set('goadmin_org_id', '9');
    cookieJar.set('org_id', '7');
    expect((await getServerOrgContext(new Request('http://localhost/api/x', { headers: { 'x-organization-id': '9' } }))).organizationId).toBe(9);
  });

  test('la ambigüedad se detecta ANTES de comprobar la membresía (no filtra a qué organizaciones pertenece)', async () => {
    memberships.length = 0;
    memberships.push(member(7));
    cookieJar.set('goadmin_org_id', '123456');
    const e = await rejects(getServerOrgContext(new Request('http://localhost/api/x', { headers: { 'x-organization-id': '7' } })));
    expect(e.code).toBe('ORG_AMBIGUOUS');
  });

  test('sin sesión → 401 antes que nada', async () => {
    sessionUser = null;
    cookieJar.set('goadmin_org_id', '9');
    const e = await rejects(getServerOrgContext(new Request('http://localhost/api/x', { headers: { 'x-organization-id': '7' } })));
    expect(e.statusCode).toBe(401);
  });
});

describe('resolveOrgFromExternal · determinismo', () => {
  test('una sola organización → se resuelve', async () => {
    externalRows = [{ organization_id: 7, e164: '+573000000001' }];
    expect((await resolveOrgFromExternal('+573000000001', 'phone')).organizationId).toBe(7);
  });

  test('dos organizaciones con el mismo identificador → 409 ORG_AMBIGUOUS + registro (antes: la primera que devolviera la BD)', async () => {
    externalRows = [{ organization_id: 7, e164: '+573000000001' }, { organization_id: 9, e164: '+573000000001' }];
    const e = await rejects(resolveOrgFromExternal('+573000000001', 'phone'));
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('ORG_AMBIGUOUS');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/varias organizaciones/), expect.objectContaining({ identifierType: 'phone', organizations: [7, 9] }));
  });

  test('dos filas de la MISMA organización (p. ej. dos mensajes) no son ambigüedad', async () => {
    externalRows = [{ organization_id: 7, provider_message_id: 'm1' }, { organization_id: 7, provider_message_id: 'm1' }];
    expect((await resolveOrgFromExternal('m1', 'message_id')).organizationId).toBe(7);
  });

  test('ninguna fila o identificador vacío → 404 ORG_UNRESOLVED', async () => {
    expect((await rejects(resolveOrgFromExternal('nada', 'domain'))).code).toBe('ORG_UNRESOLVED');
    expect((await rejects(resolveOrgFromExternal('', 'domain'))).code).toBe('ORG_UNRESOLVED');
  });
});

describe('admin: por id o por permiso, nunca por nombre', () => {
  const base = (over: Partial<ServerOrgContext>): ServerOrgContext => ({
    userId: 'u-1', userEmail: null, organizationId: 7, organizationName: 'Org 7', roleId: 4, roleName: 'Empleado', isSuperAdmin: false, memberId: 1,
    supabase: fakeClient as unknown as ServerOrgContext['supabase'], ...over,
  });

  test('requireOrgAdmin (síncrono): rol 1/2 o super admin pasan; un rol 99 llamado «Admin de organización» NO', () => {
    expect(() => requireOrgAdmin(base({ roleId: 2 }))).not.toThrow();
    expect(() => requireOrgAdmin(base({ roleId: 1 }))).not.toThrow();
    expect(() => requireOrgAdmin(base({ roleId: 99, isSuperAdmin: true }))).not.toThrow();
    expect(() => requireOrgAdmin(base({ roleId: 99, roleName: 'Admin de organización' }))).toThrow(OrgContextError);
    expect(() => requireOrgAdmin(base({ roleId: 99, roleName: 'Super Admin' }))).toThrow(OrgContextError);
  });

  test('hasOrgAdminOrPermission: rol 1/2 sin consultar; el resto por check_user_permission con user/org DE LA SESIÓN', async () => {
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    rpcImpl = rpc;
    expect(await hasOrgAdminOrPermission(base({ roleId: 2 }))).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(await hasOrgAdminOrPermission(base({ roleId: 99, roleName: 'Admin de organización' }))).toBe(true);
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'u-1', p_organization_id: 7, p_permission_code: ORG_ADMIN_PERMISSION_CODE });
    expect(ORG_ADMIN_PERMISSION_CODE).toBe('admin.full_access');
  });

  test('la RPC dice false, devuelve null o falla → denegado (fail-closed) y la falla se registra', async () => {
    rpcImpl = async () => ({ data: false, error: null });
    expect(await hasOrgAdminOrPermission(base({}))).toBe(false);
    rpcImpl = async () => ({ data: null, error: null });
    expect(await hasOrgAdminOrPermission(base({}))).toBe(false);
    rpcImpl = async () => ({ data: null, error: { message: 'permission denied' } });
    expect(await hasOrgAdminOrPermission(base({}))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/check_user_permission/), expect.objectContaining({ organizationId: 7 }));
    await expect(requireOrgAdminOrPermission(base({}))).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_REQUIRED' });
  });

  test('un código de permiso personalizado se consulta tal cual', async () => {
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    rpcImpl = rpc;
    await requireOrgAdminOrPermission(base({}), 'crm.jobs.view');
    expect(rpc).toHaveBeenCalledWith('check_user_permission', expect.objectContaining({ p_permission_code: 'crm.jobs.view' }));
  });

  test('withOrg({ admin: true }): un cargo con admin.full_access entra; sin permiso, 403 JSON', async () => {
    cookieJar.set('goadmin_org_id', '7');
    const handler = withOrg(async (ctx) => Response.json({ ok: ctx.organizationId }), { admin: true });
    rpcImpl = async () => ({ data: true, error: null });
    const ok = await handler(new Request('http://localhost/api/x', { method: 'POST' }), NO_PARAMS);
    expect(ok.status).toBe(200);
    rpcImpl = async () => ({ data: false, error: null });
    const denied = await handler(new Request('http://localhost/api/x', { method: 'POST' }), NO_PARAMS);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  test('withOrg convierte la ambigüedad header/cookie en 403 JSON', async () => {
    cookieJar.set('goadmin_org_id', '9');
    const handler = withOrg(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/api/x', { method: 'POST', headers: { 'x-organization-id': '7' } }), NO_PARAMS);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ORG_AMBIGUOUS' });
  });
});
