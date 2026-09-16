/// <reference types="jest" />
/**
 * F0-SEC r2 · sub-partes C+D · tester (ronda 2). Organizaciones ficticias
 * (120 = sesión, 999 = ajena). Informe: docs/crm-revenue-os/rondas/F0-SEC-CD-tester-r2.md
 *
 * Verde = contrato cumplido. `it.failing` = hueco abierto que documenta el
 * informe; cuando el constructor lo cierre, el test pasa a rojo por «ya no
 * falla» y hay que quitar el `.failing` (rojo antes, verde después).
 *
 *  - C1  `readOrgBody`: intentos de esquive (alias, «7» vs 7, query, formatos).
 *  - C2  `getServerOrgContext`: sesión sin organización y header/cookie.
 *  - C3  admin por id/permiso, nunca por nombre; RPC de permisos.
 *  - C4  rutas reales: `ai-assistant/{attachments,transcribe}` convierten el 403
 *        del punto único en 400 (hueco).
 *  - D1  rate limit: concurrencia, reinicio de instancia, store `db` sin RPC.
 *  - D2  ws token: `jti` de un solo uso.
 */
import crypto from 'crypto';

// ───────────── dobles de infraestructura para orgContext (solo este archivo) ─────────────
const cookieJar = new Map<string, string>();
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
  headers: async () => ({ get: () => null }),
}));
class WebhookErrorStub extends Error { statusCode = 401; code = 'X'; }
jest.mock('@/lib/security/webhookSignatures', () => ({ verifyCronSecret: jest.fn(), WebhookError: WebhookErrorStub }));

type Row = Record<string, unknown>;
const memberships: Row[] = [];
let profileRows: Row[] = [];
let rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> = async () => ({ data: false, error: null });
const membershipQueries: Array<Array<[string, unknown]>> = [];

function query(rows: Row[], record?: boolean) {
  const filters: Array<[string, unknown]> = [];
  let limitN: number | null = null;
  const api = {
    select: () => api,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
    order: () => api,
    limit: (n: number) => { limitN = n; return api; },
    maybeSingle: async () => {
      if (record) membershipQueries.push([...filters]);
      return { data: rows.filter((row) => filters.every(([c, v]) => row[c] === v))[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => void) => {
      if (record) membershipQueries.push([...filters]);
      let r = rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      if (limitN !== null) r = r.slice(0, limitN);
      resolve({ data: r, error: null });
    },
  };
  return api;
}
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'u1@ejemplo.test' } }, error: null }) },
  from: (table: string) => (table === 'organization_members' ? query(memberships, true) : table === 'profiles' ? query(profileRows) : query([])),
  rpc: (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
};
jest.mock('@/lib/supabase/server-user', () => ({ getServerUserClient: async () => fakeClient }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient }));

// Rutas reales de C4: se dobla lo que no es el punto único.
jest.mock('@/lib/services/aiCreditsService', () => ({ checkAICredits: jest.fn(async () => ({ hasCredits: true, balance: 100 })) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(async () => ({ ok: true })) }));
const transcribeWithFallback = jest.fn(async () => ({ text: 'hola', segments: [], durationSeconds: 1, provider: 'x' }));
jest.mock('@/lib/services/crm/stt', () => ({ SttChainError: class extends Error {}, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallback(...(a as [])) }));

import { NextRequest } from 'next/server';
import { readOrgBody, claimedOrganizationIn, foreignOrganizationInBody } from '../organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServerOrgContext, hasOrgAdminOrPermission, requireOrgAdmin, withOrg } from '@/lib/utils/orgContext';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { checkRateLimit, checkRateLimits, _resetRateLimits, type RateLimitStore } from '../rateLimit';
import { getRateLimitStore, _resetRateLimitStore } from '../rateLimitStore';
import { issueWsSessionToken, verifyWsSessionToken, consumeWsSessionJti, _resetWsSessionJtis } from '../wsSessionToken';

const SESSION = 120;
const FOREIGN = 999;
const ctx = { organizationId: SESSION, userId: 'u-1' };
let warn: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { warn.mockRestore(); errorSpy.mockRestore(); });

const expect403 = (fn: () => unknown) => {
  try { fn(); } catch (e) {
    expect(e).toBeInstanceOf(OrgContextError);
    expect((e as OrgContextError).statusCode).toBe(403);
    expect((e as OrgContextError).code).toBe('FOREIGN_ORGANIZATION');
    return;
  }
  throw new Error('readOrgBody no lanzó');
};
const jsonReq = (url: string, body: unknown, method = 'POST', ct = 'application/json') =>
  new Request(url, { method, headers: { 'content-type': ct }, body: typeof body === 'string' ? body : JSON.stringify(body) });

// ───────────────────────── C1 · readOrgBody ─────────────────────────
describe('C1 · readOrgBody: intentos de esquive', () => {
  test('«999» (cadena) y 999 (número) son la misma organización ajena → 403 + un registro', () => {
    expect403(() => readOrgBody(ctx, { organization_id: '999' }));
    expect403(() => readOrgBody(ctx, { organization_id: 999 }));
    expect403(() => readOrgBody(ctx, { organization_id: ' 999 ' }));
    expect(warn).toHaveBeenCalledTimes(3);
  });
  test('«120» (cadena), 120, "120.0" y " 120 " son la propia → pasan sin registro', () => {
    for (const v of ['120', 120, '120.0', ' 120 ']) expect(readOrgBody(ctx, { organization_id: v })).toEqual({ organization_id: v });
    expect(warn).not.toHaveBeenCalled();
  });
  test('cada alias ajeno → 403: organizationId, orgId, org_id', () => {
    expect403(() => readOrgBody(ctx, { organizationId: FOREIGN }));
    expect403(() => readOrgBody(ctx, { orgId: '999' }));
    expect403(() => readOrgBody(ctx, { org_id: FOREIGN }));
  });
  test('valores no numéricos (objeto, «abc», true, [120, 999]) → 403 (NaN ≠ sesión, fail-closed)', () => {
    expect403(() => readOrgBody(ctx, { organization_id: { id: FOREIGN } }));
    expect403(() => readOrgBody(ctx, { organization_id: 'abc' }));
    expect403(() => readOrgBody(ctx, { organization_id: true }));
    expect403(() => readOrgBody(ctx, { organization_id: [SESSION, FOREIGN] }));
  });
  test('null / undefined / "" → pasan sin registro', () => {
    expect(readOrgBody(ctx, { organization_id: null })).toEqual({ organization_id: null });
    expect(readOrgBody(ctx, { organization_id: '' })).toEqual({ organization_id: '' });
    expect(warn).not.toHaveBeenCalled();
  });
  it.failing('HUECO C1-a: organization_id propio + organizationId ajeno → debería ser 403 (hoy solo se mira la PRIMERA clave presente)', () => {
    expect403(() => readOrgBody(ctx, { organization_id: SESSION, organizationId: FOREIGN }));
  });
  it.failing('HUECO C1-b: organization_id "" + orgId ajeno → debería ser 403 (hoy la clave vacía tapa al alias)', () => {
    expect403(() => readOrgBody(ctx, { organization_id: '', orgId: FOREIGN }));
  });
  test('documentado: solo se inspecciona el nivel raíz (data.organization_id y arrays no se miran)', () => {
    expect(readOrgBody(ctx, { data: { organization_id: FOREIGN } })).toEqual({ data: { organization_id: FOREIGN } });
    expect(readOrgBody(ctx, [{ organization_id: FOREIGN }])).toEqual([{ organization_id: FOREIGN }]);
    expect(warn).not.toHaveBeenCalled();
  });
  test('Request DELETE sin body con ?organization_id=999 → 403 (where: query)', async () => {
    await expect(readOrgBody(ctx, new Request('http://x/api/crm/teams/1?organization_id=999', { method: 'DELETE' }), { route: 'teams' })).rejects.toMatchObject({ statusCode: 403, code: 'FOREIGN_ORGANIZATION' });
    expect(warn.mock.calls[0][1]).toMatchObject({ where: 'query', key: 'organization_id', session: SESSION, body: '999', userId: 'u-1', route: 'teams' });
  });
  test('Request: query ajena manda aunque el body sea propio; body ajeno manda aunque la query sea propia', async () => {
    await expect(readOrgBody(ctx, jsonReq('http://x/api?orgId=999', { organization_id: SESSION }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(readOrgBody(ctx, jsonReq('http://x/api?organization_id=120', { organization_id: FOREIGN }))).rejects.toMatchObject({ statusCode: 403 });
    expect(warn.mock.calls.map((c) => c[1].where)).toEqual(['query', 'body']);
  });
  test('Request: form-urlencoded, multipart, text/plain con JSON y sin content-type → 403 igual', async () => {
    await expect(readOrgBody(ctx, new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'organization_id=999&a=1' }))).rejects.toMatchObject({ statusCode: 403 });
    const fd = new FormData(); fd.append('organizationId', '999');
    await expect(readOrgBody(ctx, new Request('http://x/api', { method: 'POST', body: fd }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(readOrgBody(ctx, jsonReq('http://x/api', { organization_id: FOREIGN }, 'POST', 'text/plain'))).rejects.toMatchObject({ statusCode: 403 });
    await expect(readOrgBody(ctx, new Request('http://x/api', { method: 'POST', body: JSON.stringify({ orgId: FOREIGN }) }))).rejects.toMatchObject({ statusCode: 403 });
  });
  test('body inválido es 400 (INVALID_JSON / INVALID_BODY), nunca 403 ni 500', async () => {
    await expect(readOrgBody(ctx, jsonReq('http://x/api', '{bad'))).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_JSON' });
    await expect(readOrgBody(ctx, new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=zz' }, body: 'garbage' }))).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_BODY' });
    expect(warn).not.toHaveBeenCalled();
  });
  test('JSON "null" / 123 / array raíz → pasan (no son objetos con claves)', async () => {
    expect(await readOrgBody(ctx, jsonReq('http://x/api', 'null'))).toBeNull();
    expect(await readOrgBody(ctx, jsonReq('http://x/api', '123'))).toBe(123);
    expect(await readOrgBody(ctx, jsonReq('http://x/api', '[{"organization_id":999}]'))).toEqual([{ organization_id: FOREIGN }]);
  });
  test('documentado: la sobrecarga síncrona no ve la query, y un body ya consumido devuelve {} sin mirar lo que traía', async () => {
    const r1 = jsonReq('http://x/api?organization_id=999', { a: 1 });
    expect(readOrgBody(ctx, await r1.json())).toEqual({ a: 1 });
    const r2 = jsonReq('http://x/api', { organization_id: FOREIGN });
    await r2.json();
    expect(await readOrgBody(ctx, r2)).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });
  test('registro: nunca vuelca objetos ni cadenas largas; __proto__ no concede', () => {
    expect403(() => readOrgBody(ctx, { organization_id: 'x'.repeat(500) }));
    expect(String(warn.mock.calls[0][1].body).length).toBeLessThanOrEqual(64);
    expect403(() => readOrgBody(ctx, JSON.parse('{"__proto__":{"organization_id":120},"organization_id":999}')));
  });
  test('predicados: "1e2" = 100 y "0x78" = 120 no son ajenas (Number()); "120.5" sí', () => {
    expect(foreignOrganizationInBody('1e2', 100)).toBeNull();
    expect(foreignOrganizationInBody('0x78', SESSION)).toBeNull();
    expect(foreignOrganizationInBody('120.5', SESSION)).toBe('120.5');
    expect(claimedOrganizationIn({ get: (k: string) => (k === 'orgId' ? '999' : null) })).toEqual({ key: 'orgId', value: '999' });
  });
});

// ───────────────────────── C2 · sesión sin organización / header vs cookie ─────────────────────────
describe('C2 · getServerOrgContext', () => {
  const member = (org: number, role: number) => ({ id: org, user_id: 'u-1', is_active: true, organization_id: org, role_id: role, is_super_admin: false, organizations: { name: `o${org}` }, roles: { name: 'x' } });
  const req = (h?: string) => new Request('http://x/api/crm/x', { headers: h ? { 'x-organization-id': h } : {} });
  beforeEach(() => { cookieJar.clear(); memberships.length = 0; membershipQueries.length = 0; profileRows = []; });

  test('sesión sin membresías → 403 NO_MEMBERSHIP; con dos y sin header/cookie/last_org → 400 ORG_AMBIGUOUS', async () => {
    await expect(getServerOrgContext(req())).rejects.toMatchObject({ statusCode: 403, code: 'NO_MEMBERSHIP' });
    memberships.push(member(5, 3), member(7, 2));
    await expect(getServerOrgContext(req())).rejects.toMatchObject({ statusCode: 400, code: 'ORG_AMBIGUOUS' });
  });
  test('withOrg: sin organización resoluble el handler (y readOrgBody) nunca se ejecuta', async () => {
    memberships.push(member(5, 3), member(7, 2));
    const handler = jest.fn(async () => new Response('ok'));
    const res = await withOrg(handler)(jsonReq('http://x/api', { organization_id: 7 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });
  test('la organización del body nunca sustituye a la de la sesión aunque el usuario sea miembro de ambas', async () => {
    memberships.push(member(5, 3), member(7, 2));
    const r = jsonReq('http://x/api', { organization_id: 7 });
    r.headers.set('x-organization-id', '5');
    const c = await getServerOrgContext(r);
    expect(c.organizationId).toBe(5);
    await expect(readOrgBody(c, r)).rejects.toMatchObject({ statusCode: 403 });
  });
  test('header y cookie distintas → 403 ORG_AMBIGUOUS registrado y SIN consultar membresías (también con la cookie legacy)', async () => {
    memberships.push(member(5, 3), member(7, 2));
    cookieJar.set('goadmin_org_id', '7');
    await expect(getServerOrgContext(req('5'))).rejects.toMatchObject({ statusCode: 403, code: 'ORG_AMBIGUOUS' });
    expect(membershipQueries).toHaveLength(0);
    cookieJar.clear(); cookieJar.set('org_id', '7');
    await expect(getServerOrgContext(req('5'))).rejects.toMatchObject({ statusCode: 403, code: 'ORG_AMBIGUOUS' });
    expect(warn).toHaveBeenCalledTimes(2);
  });
  test('bordes del parseo: header "0" se ignora (gana la cookie); "5abc" cuenta como 5 (parseInt)', async () => {
    memberships.push(member(5, 3), member(7, 2));
    cookieJar.set('goadmin_org_id', '7');
    expect((await getServerOrgContext(req('0'))).organizationId).toBe(7);
    await expect(getServerOrgContext(req('5abc'))).rejects.toMatchObject({ code: 'ORG_AMBIGUOUS' });
  });
  test('header de una organización a la que no pertenece → 403 ORG_FORBIDDEN', async () => {
    memberships.push(member(5, 3));
    await expect(getServerOrgContext(req('99'))).rejects.toMatchObject({ statusCode: 403, code: 'ORG_FORBIDDEN' });
  });
});

// ───────────────────────── C3 · admin ─────────────────────────
describe('C3 · admin por id / permiso, nunca por nombre', () => {
  const base = { userId: 'u-1', organizationId: 5, supabase: fakeClient as never, isSuperAdmin: false, roleId: 99 };
  beforeEach(() => { rpcImpl = async () => ({ data: false, error: null }); });

  test('rol 99 llamado «Admin de organización» / «Super Admin» → no admin; roleId "1" (cadena) tampoco', () => {
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 99, roleName: 'Admin de organización' })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 99, roleName: 'Super Admin' })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: '1' as never })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: 'true' as never, roleId: 99 })).toBe(false);
    expect(() => requireOrgAdmin({ roleId: 99, roleName: 'Administrador', isSuperAdmin: false } as never)).toThrow(OrgContextError);
  });
  test('check_user_permission recibe user y org DE LA SESIÓN con admin.full_access; solo `true` concede', async () => {
    let seen: Record<string, unknown> = {};
    rpcImpl = async (_fn, args) => { seen = args; return { data: false, error: null }; };
    expect(await hasOrgAdminOrPermission(base)).toBe(false);
    expect(seen).toEqual({ p_user_id: 'u-1', p_organization_id: 5, p_permission_code: 'admin.full_access' });
    for (const data of ['true', 1, { ok: true }, null]) { rpcImpl = async () => ({ data, error: null }); expect(await hasOrgAdminOrPermission(base)).toBe(false); }
    rpcImpl = async () => ({ data: true, error: null });
    expect(await hasOrgAdminOrPermission(base)).toBe(true);
  });
  test('RPC con {error} → denegado y registrado; código vacío → denegado sin consultar', async () => {
    let called = 0;
    rpcImpl = async () => { called++; return { data: null, error: { message: 'boom' } }; };
    expect(await hasOrgAdminOrPermission(base)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await hasOrgAdminOrPermission(base, '')).toBe(false);
    expect(called).toBe(1);
  });
  it.failing('HUECO C3-a: RPC que LANZA (red caída) debería contar como denegado (fail-closed); hoy la promesa rechaza y withOrg responde 500', async () => {
    rpcImpl = async () => { throw new Error('fetch failed'); };
    expect(await hasOrgAdminOrPermission(base)).toBe(false);
  });
});

// ───────────────────────── C4 · rutas reales: 403 convertido en 400 ─────────────────────────
describe('C4 · rutas multipart del asistente', () => {
  const session = { organizationId: SESSION, userId: 'u-1', userEmail: 'u-1@example.test', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', memberId: 1, supabase: {} as never };
  // Mismo registro de módulos que usan las rutas (no un automock): se dobla solo la sesión.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const orgContextModule = require('@/lib/utils/orgContext') as typeof import('@/lib/utils/orgContext');
  let ctxSpy: jest.SpyInstance;
  beforeEach(() => { ctxSpy = jest.spyOn(orgContextModule, 'getServerOrgContext').mockImplementation(async () => session); _resetRateLimits(); });
  afterEach(() => { ctxSpy.mockRestore(); });

  const multipart = (url: string, fields: Record<string, string | Blob>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return new NextRequest(`http://localhost${url}`, { method: 'POST', body: fd });
  };

  it.failing('HUECO C4-a: POST /api/ai-assistant/transcribe con organization_id ajeno responde 400 «Petición mal formada» en vez de 403', async () => {
    const { POST } = await import('@/app/api/ai-assistant/transcribe/route');
    const res = await POST(multipart('/api/ai-assistant/transcribe', { audio: new Blob([new Uint8Array(4)], { type: 'audio/webm' }), organization_id: '999' }));
    expect(res.status).toBe(403);
  });
  it.failing('HUECO C4-b: POST /api/ai-assistant/attachments con orgId ajeno responde 400 «multipart/form-data» en vez de 403', async () => {
    const { POST } = await import('@/app/api/ai-assistant/attachments/route');
    const res = await POST(multipart('/api/ai-assistant/attachments', { file: new Blob([new Uint8Array(4)], { type: 'image/png' }), orgId: '999' }));
    expect(res.status).toBe(403);
  });
  test('en ambas rutas el rechazo SÍ se registra y la transcripción no se ejecuta (la mitad «registro» del contrato se cumple)', async () => {
    const { POST } = await import('@/app/api/ai-assistant/transcribe/route');
    const res = await POST(multipart('/api/ai-assistant/transcribe', { audio: new Blob([new Uint8Array(4)], { type: 'audio/webm' }), organization_id: '999' }));
    expect(res.status).toBe(400);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: SESSION, body: '999' }));
    expect(transcribeWithFallback).not.toHaveBeenCalled();
  });
});

// ───────────────────────── D1 · rate limit ─────────────────────────
describe('D1 · rateLimit: concurrencia, reinicio, store', () => {
  const OPTS = { limit: 3, windowMs: 1000 };
  beforeEach(() => { _resetRateLimits(); _resetRateLimitStore(); delete process.env.RATE_LIMIT_STORE; });
  afterAll(() => { delete process.env.RATE_LIMIT_STORE; _resetRateLimitStore(); });

  /** Store de prueba con la misma semántica que fn_rate_limit_hit (atómico, registra solo si todas caben). */
  function fakeDbStore(latencyMs = 0) {
    const counts = new Map<string, number>();
    const store: RateLimitStore = {
      async hit(entries) {
        if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
        const proj = entries.map((e) => ({ key: e.key, count: (counts.get(e.key) ?? 0) + 1, resetAt: new Date(Date.now() + e.windowMs) }));
        if (proj.every((p, i) => p.count <= entries[i].limit)) proj.forEach((p) => counts.set(p.key, p.count));
        return proj;
      },
    };
    return { store, counts };
  }

  test('memoria: 5 peticiones concurrentes con limit 3 → exactamente 3 pasan', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => checkRateLimit('k', OPTS)));
    expect(rs.filter((r) => r.allowed)).toHaveLength(3);
  });
  it.failing('HUECO D1-a: con persistentCount (legado) hay un await entre proyección y registro: 5 concurrentes con limit 3 deberían dejar pasar 3 (hoy pasan 5)', async () => {
    const pc = async () => { await new Promise((r) => setTimeout(r, 5)); return 0; };
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => checkRateLimit('k2', { ...OPTS, persistentCount: pc })));
    expect(rs.filter((r) => r.allowed)).toHaveLength(3);
  });
  test('store atómico con latencia: 5 concurrentes con limit 3 → 3 pasan y el store cuenta 3', async () => {
    const { store, counts } = fakeDbStore(5);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => checkRateLimit('k3', OPTS, { store })));
    expect(rs.filter((r) => r.allowed)).toHaveLength(3);
    expect(counts.get('k3')).toBe(3);
  });
  test('reinicio de instancia: la memoria olvida (_resetRateLimits) pero el store recuerda → sigue bloqueado', async () => {
    const { store } = fakeDbStore();
    for (let i = 0; i < 3; i++) expect((await checkRateLimit('r', OPTS, { store })).allowed).toBe(true);
    _resetRateLimits(); // «instancia nueva»
    expect((await checkRateLimit('r', OPTS)).allowed).toBe(true); // sin store: limit × instancias (modo memoria)
    _resetRateLimits();
    expect((await checkRateLimit('r', OPTS, { store })).allowed).toBe(false); // con store: el límite es global
  });
  test('multi-clave: una clave bloqueada no consume las otras ni en memoria ni en el store', async () => {
    const { store, counts } = fakeDbStore();
    const e = (ip: string) => [{ key: `ip:${ip}`, opts: OPTS }, { key: 'to:+57300', opts: { limit: 1, windowMs: 1000 } }];
    expect((await checkRateLimits(e('1.1.1.1'), { store })).allowed).toBe(true);
    const second = await checkRateLimits(e('2.2.2.2'), { store });
    expect(second.allowed).toBe(false);
    expect(second.blockedKey).toBe('to:+57300');
    expect(counts.get('ip:2.2.2.2')).toBeUndefined();
    expect((await checkRateLimits([{ key: 'ip:2.2.2.2', opts: OPTS }], { store })).count).toBe(1);
  });
  test('RATE_LIMIT_STORE ausente → null (memoria, permite); =db sin la RPC (migración no aplicada) → bloqueado y registrado', async () => {
    expect(getRateLimitStore()).toBeNull();
    expect((await checkRateLimit('m', OPTS, { store: getRateLimitStore() })).allowed).toBe(true);
    process.env.RATE_LIMIT_STORE = 'db';
    _resetRateLimitStore();
    rpcImpl = async () => ({ data: null, error: { message: 'function public.fn_rate_limit_hit(jsonb) does not exist' } });
    const r = await checkRateLimit('m2', OPTS, { store: getRateLimitStore() });
    expect(r.allowed).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/store persistente falló/), expect.objectContaining({ keys: ['m2'] }));
  });
  test('RATE_LIMIT_STORE=db: la RPC recibe { key, limit, window_ms } y un resultado bloqueado no toca la memoria', async () => {
    process.env.RATE_LIMIT_STORE = 'db';
    _resetRateLimitStore();
    let seen: unknown = null;
    rpcImpl = async (_fn, args) => { seen = args; return { data: { allowed: false, entries: [{ key: 'm3', count: 6, reset_at: new Date(Date.now() + 1000).toISOString(), allowed: false }] }, error: null }; };
    expect((await checkRateLimit('m3', { limit: 5, windowMs: 600_000 }, { store: getRateLimitStore() })).allowed).toBe(false);
    expect(seen).toEqual({ p_entries: [{ key: 'm3', limit: 5, window_ms: 600_000 }] });
    rpcImpl = async () => ({ data: { allowed: true, entries: [{ key: 'm3', count: 1, reset_at: new Date(Date.now() + 1000).toISOString(), allowed: true }] }, error: null });
    expect((await checkRateLimit('m3', { limit: 5, windowMs: 600_000 }, { store: getRateLimitStore() })).count).toBe(1);
  });
  test('limit Infinity / 0 → bloqueado; store con count negativo o reset_at inválido no rompe (manda la memoria)', async () => {
    expect((await checkRateLimit('inf', { limit: Infinity })).allowed).toBe(false);
    expect((await checkRateLimit('zero', { limit: 0 })).allowed).toBe(false);
    const store: RateLimitStore = { async hit(entries) { return entries.map((e) => ({ key: e.key, count: -5, resetAt: new Date('x') })); } };
    const r = await checkRateLimit('neg', OPTS, { store });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });
});

// ───────────────────────── D2 · ws token ─────────────────────────
describe('D2 · wsSessionToken: jti de un solo uso', () => {
  const SECRET = crypto.randomBytes(32).toString('hex');
  const prev = process.env.WS_SESSION_SECRET;
  beforeEach(() => { process.env.WS_SESSION_SECRET = SECRET; _resetWsSessionJtis(); });
  afterAll(() => { if (prev === undefined) delete process.env.WS_SESSION_SECRET; else process.env.WS_SESSION_SECRET = prev; });
  const forge = (claims: Record<string, unknown>) => {
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${p}.${crypto.createHmac('sha256', SECRET).update(p).digest('base64url')}`;
  };
  const now = () => Math.floor(Date.now() / 1000);

  test('el mismo token verifica N veces (upgrade + setup) pero solo se consume una', () => {
    const t = issueWsSessionToken({ orgId: 5 });
    const c = verifyWsSessionToken(t)!;
    expect(verifyWsSessionToken(t)).not.toBeNull();
    expect(consumeWsSessionJti(c)).toBe(true);
    expect(consumeWsSessionJti(verifyWsSessionToken(t)!)).toBe(false);
  });
  test('jti forjado repetido con claims distintos (otra org) → el segundo consumo se rechaza; sin jti → no se puede consumir', () => {
    const a = verifyWsSessionToken(forge({ orgId: 5, exp: now() + 60, jti: 'dup' }))!;
    const b = verifyWsSessionToken(forge({ orgId: 6, exp: now() + 60, jti: 'dup' }))!;
    expect(consumeWsSessionJti(a)).toBe(true);
    expect(consumeWsSessionJti(b)).toBe(false);
    const sin = verifyWsSessionToken(forge({ orgId: 5, exp: now() + 60 }))!;
    expect(sin).not.toBeNull();
    expect(consumeWsSessionJti(sin)).toBe(false);
  });
  test('orgId 0 / -1 / 1.5 / "5" / NaN → null aunque la firma sea válida; exp > 1 h → null; exp == now → válido', () => {
    for (const orgId of [0, -1, 1.5, '5', NaN, null]) expect(verifyWsSessionToken(forge({ orgId, exp: now() + 60, jti: 'a' }))).toBeNull();
    expect(verifyWsSessionToken(forge({ orgId: 5, exp: now() + 3601, jti: 'a' }))).toBeNull();
    expect(verifyWsSessionToken(forge({ orgId: 5, exp: now(), jti: 'a' }))).not.toBeNull();
  });
  test('documentado: issueWsSessionToken no valida orgId al emitir (0 emite y solo verify lo frena)', () => {
    expect(typeof issueWsSessionToken({ orgId: 0 })).toBe('string');
    expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 0 }))).toBeNull();
  });
});
