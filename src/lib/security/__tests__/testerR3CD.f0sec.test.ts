/// <reference types="jest" />
/**
 * F0-SEC r3 · sub-partes C+D · tester (ronda 3). Organizaciones ficticias
 * (120 = sesión, 999 = ajena, 7 para «"7" vs 7»). Informe:
 * docs/crm-revenue-os/rondas/F0-SEC-CD-tester-r3.md
 *
 * Verifica los 7 obligatorios del QA r2 tal como los cerró el constructor r3 y
 * sondea los bordes que quedaban sin cubrir:
 *
 *  - S1  matriz `readOrgBody`: 4 claves × 4 formatos (JSON, form-urlencoded,
 *        multipart, query) → 403 + registro con `key` y `where`.
 *  - S2  combinaciones: propia + ajena, `''`/`' '` por clave, `0`, `'7'` vs 7,
 *        arrays, claves repetidas (documentado).
 *  - S3  RPC de permisos que lanza (síncrono, rechazo, timeout) → deniega,
 *        registra y `withOrg({admin})` responde 403, nunca 500. Una RPC que
 *        nunca resuelve queda documentada (sin presupuesto de tiempo).
 *  - S4  `checkRateLimit` bajo concurrencia real (20 con limit 3) en memoria,
 *        con store `db` simulado atómico, con store que falla y con store NO
 *        atómico (documenta por qué la RPC debe serlo).
 *  - S5  rutas reales `ai-assistant/{attachments,transcribe}`: 403 con `code`
 *        por cada alias y formato multipart; vacío no es 403; JSON → 400.
 */

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
let rpcImpl: (fn: string, args: Record<string, unknown>) => unknown = async () => ({ data: false, error: null });

function query(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  let limitN: number | null = null;
  const api = {
    select: () => api,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return api; },
    order: () => api,
    limit: (n: number) => { limitN = n; return api; },
    maybeSingle: async () => ({ data: rows.filter((row) => filters.every(([c, v]) => row[c] === v))[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => void) => {
      let r = rows.filter((row) => filters.every(([c, v]) => row[c] === v));
      if (limitN !== null) r = r.slice(0, limitN);
      resolve({ data: r, error: null });
    },
  };
  return api;
}
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'u1@ejemplo.test' } }, error: null }) },
  from: (table: string) => (table === 'organization_members' ? query(memberships) : query([])),
  rpc: (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
};
jest.mock('@/lib/supabase/server-user', () => ({ getServerUserClient: async () => fakeClient }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient }));

// Rutas reales de S5: se dobla lo que no es el punto único.
jest.mock('@/lib/services/aiCreditsService', () => ({ checkAICredits: jest.fn(async () => ({ hasCredits: true, allowed: true, balance: 100 })) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(async () => ({ ok: true })) }));
const transcribeWithFallback = jest.fn(async () => ({ text: 'hola', segments: [], durationSeconds: 1, provider: 'x' }));
jest.mock('@/lib/services/crm/stt', () => ({ SttChainError: class extends Error {}, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallback(...(a as [])) }));

import { NextRequest } from 'next/server';
import { readOrgBody, claimedOrganizationsIn, ORG_BODY_KEYS } from '../organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { checkRateLimit, checkRateLimits, _resetRateLimits, type RateLimitStore } from '../rateLimit';
import { createDbRateLimitStore } from '../rateLimitStore';

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

async function expect403(run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (e) {
    expect(e).toBeInstanceOf(OrgContextError);
    expect((e as OrgContextError).statusCode).toBe(403);
    expect((e as OrgContextError).code).toBe('FOREIGN_ORGANIZATION');
    return;
  }
  throw new Error('readOrgBody no lanzó');
}

type Fmt = 'json' | 'urlencoded' | 'multipart' | 'query';
const FORMATS: Fmt[] = ['json', 'urlencoded', 'multipart', 'query'];

/** Petición POST con `fields` en el formato pedido (o en la query con body vacío). */
function reqOf(fmt: Fmt, fields: Record<string, string>): Request {
  const url = 'http://localhost/api/crm/x';
  if (fmt === 'json') return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) });
  if (fmt === 'urlencoded') return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  if (fmt === 'multipart') {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return new Request(url, { method: 'POST', body: fd });
  }
  return new Request(`${url}?${new URLSearchParams(fields).toString()}`, { method: 'DELETE' });
}

// ───────────────────────── S1 · matriz clave × formato ─────────────────────────
describe('S1 · readOrgBody: cada alias en cada formato → 403 + registro con key/where', () => {
  for (const key of ORG_BODY_KEYS) {
    for (const fmt of FORMATS) {
      test(`${key} ajena en ${fmt} → 403 FOREIGN_ORGANIZATION y warn { key: '${key}', where: '${fmt === 'query' ? 'query' : 'body'}' }`, async () => {
        await expect403(() => readOrgBody(ctx, reqOf(fmt, { [key]: String(FOREIGN) }), { route: 'sonda' }));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`${key} ajeno`),
          expect.objectContaining({ key, where: fmt === 'query' ? 'query' : 'body', session: SESSION, body: String(FOREIGN), route: 'sonda', userId: 'u-1' }),
        );
      });
      test(`${key} propia en ${fmt} → pasa sin registro`, async () => {
        const out = await readOrgBody(ctx, reqOf(fmt, { [key]: String(SESSION) }));
        expect(out).toBeDefined();
        expect(warn).not.toHaveBeenCalled();
      });
    }
  }
});

// ───────────────────────── S2 · combinaciones y bordes ─────────────────────────
describe('S2 · combinaciones: propia + ajena, vacíos, 0, "7" vs 7, arrays', () => {
  for (const fmt of FORMATS) {
    test(`${fmt}: { organization_id: propia, orgId: ajena } → 403 registrando key=orgId (obligatorio 4)`, async () => {
      await expect403(() => readOrgBody(ctx, reqOf(fmt, { organization_id: String(SESSION), orgId: String(FOREIGN) })));
      expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ key: 'orgId', body: String(FOREIGN) }));
    });
    test(`${fmt}: { organization_id: '', org_id: ajena } y { organizationId: ' ', orgId: ajena } → 403 (la vacía cuenta como ausente POR clave)`, async () => {
      await expect403(() => readOrgBody(ctx, reqOf(fmt, { organization_id: '', org_id: String(FOREIGN) })));
      await expect403(() => readOrgBody(ctx, reqOf(fmt, { organizationId: ' ', orgId: String(FOREIGN) })));
      expect(warn).toHaveBeenCalledTimes(2);
    });
    test(`${fmt}: las 4 claves vacías o en blanco → pasan sin registro`, async () => {
      await readOrgBody(ctx, reqOf(fmt, { organization_id: '', organizationId: ' ', orgId: '', org_id: '\t' }));
      expect(warn).not.toHaveBeenCalled();
    });
    test(`${fmt}: las 4 claves con la propia (mezclando "120", " 120 ") → pasan; las 4 con la ajena → 403 en la primera (organization_id)`, async () => {
      await readOrgBody(ctx, reqOf(fmt, { organization_id: '120', organizationId: ' 120 ', orgId: '120', org_id: '120' }));
      expect(warn).not.toHaveBeenCalled();
      await expect403(() => readOrgBody(ctx, reqOf(fmt, { organization_id: '999', organizationId: '998', orgId: '997', org_id: '996' })));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ key: 'organization_id', body: '999' }));
    });
  }

  test('0 y "0" no son «ausente»: son otra organización → 403 (fail-closed)', async () => {
    await expect403(() => readOrgBody(ctx, { organization_id: 0 }));
    await expect403(() => readOrgBody(ctx, { organization_id: '0' }));
    await expect403(() => readOrgBody(ctx, reqOf('query', { orgId: '0' })));
    expect(warn).toHaveBeenCalledTimes(3);
  });

  test('"7" ≡ 7: con sesión 7 pasan las dos formas; con sesión 120 las dos son ajenas', async () => {
    const seven = { organizationId: 7, userId: 'u-7' };
    expect(readOrgBody(seven, { organization_id: '7' })).toEqual({ organization_id: '7' });
    expect(readOrgBody(seven, { organization_id: 7 })).toEqual({ organization_id: 7 });
    await readOrgBody(seven, reqOf('json', { orgId: '7' }));
    expect(warn).not.toHaveBeenCalled();
    await expect403(() => readOrgBody(ctx, { organization_id: '7' }));
    await expect403(() => readOrgBody(ctx, { organization_id: 7 }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({ body: '7' }));
    expect(warn).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ body: 7 }));
  });

  test('arrays: [999] y [120, 999] → 403; [120] y [] → pasan (Number([120]) = 120, String([]) = ""); body raíz array → no se inspecciona (documentado r2)', async () => {
    await expect403(() => readOrgBody(ctx, { organization_id: [FOREIGN] }));
    await expect403(() => readOrgBody(ctx, { organization_id: [SESSION, FOREIGN] }));
    expect(readOrgBody(ctx, { organization_id: [SESSION] })).toEqual({ organization_id: [SESSION] });
    expect(readOrgBody(ctx, { organization_id: [] })).toEqual({ organization_id: [] });
    expect(readOrgBody(ctx, [{ organization_id: FOREIGN }])).toEqual([{ organization_id: FOREIGN }]);
    expect(claimedOrganizationsIn([{ organization_id: FOREIGN }])).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('objeto / booleano / NaN como valor → 403 (no numérico ≠ sesión); el registro no vuelca el objeto', async () => {
    await expect403(() => readOrgBody(ctx, { org_id: { id: SESSION } }));
    await expect403(() => readOrgBody(ctx, { org_id: true }));
    await expect403(() => readOrgBody(ctx, { org_id: Number.NaN }));
    expect(warn).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({ body: '[object Object]' }));
  });

  test('claimedOrganizationsIn devuelve TODAS las claves no vacías en el orden de ORG_BODY_KEYS, en objeto y en URLSearchParams', () => {
    expect(claimedOrganizationsIn({ org_id: 1, organization_id: 2, orgId: '', organizationId: 3 })).toEqual([
      { key: 'organization_id', value: 2 }, { key: 'organizationId', value: 3 }, { key: 'org_id', value: 1 },
    ]);
    expect(claimedOrganizationsIn(new URLSearchParams('orgId=5&organization_id=&org_id=%20'))).toEqual([{ key: 'orgId', value: '5' }]);
    expect(claimedOrganizationsIn(null)).toEqual([]);
    expect(claimedOrganizationsIn('organization_id=999')).toEqual([]);
  });

  test('CERRADO (cierre F0-SEC): clave repetida en query/form → se miran TODAS (`getAll`), la segunda ajena → 403', async () => {
    // Antes solo se miraba `get()` (primer valor) y un parser que se quede con el
    // último (`Object.fromEntries`) habría visto 999 mientras el punto único vio 120.
    const q = new Request(`http://localhost/api/crm/x?organization_id=${SESSION}&organization_id=${FOREIGN}`, { method: 'DELETE' });
    await expect(readOrgBody(ctx, q)).rejects.toMatchObject({ statusCode: 403 });
    const form = new Request('http://localhost/api/crm/x', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `organization_id=${SESSION}&organization_id=${FOREIGN}` });
    await expect(readOrgBody(ctx, form)).rejects.toMatchObject({ statusCode: 403 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(Object.fromEntries(new URLSearchParams(`organization_id=${SESSION}&organization_id=${FOREIGN}`))).toEqual({ organization_id: String(FOREIGN) });
  });

  test('sobrecarga síncrona: FormData y URLSearchParams ya leídos con propia + ajena → 403; devuelve el MISMO objeto cuando pasa', async () => {
    const fd = new FormData();
    fd.append('organization_id', String(SESSION));
    fd.append('org_id', String(FOREIGN));
    await expect403(() => readOrgBody(ctx, fd));
    const ok = new URLSearchParams({ organizationId: String(SESSION) });
    expect(readOrgBody(ctx, ok)).toBe(ok);
  });
});

// ───────────────────────── S3 · RPC de permisos ─────────────────────────
describe('S3 · hasOrgAdminOrPermission: la RPC que lanza deniega y registra; withOrg({admin}) nunca da 500', () => {
  const member = { userId: 'u-1', organizationId: SESSION, roleId: 5, isSuperAdmin: false, supabase: fakeClient as never };
  beforeEach(() => { memberships.length = 0; cookieJar.clear(); });

  test('rpc que LANZA síncronamente (no devuelve promesa) → false + warn «lanzó»', async () => {
    rpcImpl = () => { throw new TypeError('fetch failed'); };
    await expect(hasOrgAdminOrPermission(member)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lanzó'), expect.objectContaining({ code: 'admin.full_access', organizationId: SESSION, message: 'fetch failed' }));
  });

  test('rpc que RECHAZA (red caída) → false + warn; rechazo con valor no-Error → message = String(valor)', async () => {
    rpcImpl = async () => { throw new Error('ECONNRESET'); };
    await expect(hasOrgAdminOrPermission(member)).resolves.toBe(false);
    rpcImpl = () => Promise.reject('timeout');
    await expect(hasOrgAdminOrPermission(member)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(2, expect.stringContaining('lanzó'), expect.objectContaining({ message: 'timeout' }));
  });

  test('rpc que expira tras 30 ms (AbortError) → false, sin 500, y el resultado no depende de que el rechazo sea tardío', async () => {
    rpcImpl = () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), 30));
    await expect(hasOrgAdminOrPermission(member)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lanzó'), expect.objectContaining({ message: 'The operation was aborted' }));
  });

  test('DOCUMENTADO (bajo): rpc que NUNCA resuelve → la promesa queda pendiente (no hay presupuesto de tiempo propio; lo corta la plataforma)', async () => {
    rpcImpl = () => new Promise(() => undefined);
    const outcome = await Promise.race([
      hasOrgAdminOrPermission(member).then(() => 'resolvió'),
      new Promise<string>((r) => setTimeout(() => r('pendiente'), 150)),
    ]);
    expect(outcome).toBe('pendiente');
  });

  test('withOrg({ admin: true }) con rpc que lanza → 403 ADMIN_REQUIRED (no 500) y el handler no corre; con rpc true → handler corre', async () => {
    memberships.push({ id: 1, user_id: 'u-1', is_active: true, organization_id: SESSION, is_super_admin: false, role_id: 5, organizations: { name: 'Org 120' }, roles: { name: 'Vendedor' } });
    cookieJar.set('goadmin_org_id', String(SESSION));
    const handler = jest.fn(async () => Response.json({ ok: true }));
    const route = withOrg(handler, { admin: true });
    const params = { params: Promise.resolve({}) };

    rpcImpl = async () => { throw new Error('boom'); };
    const res = await route(new Request('http://localhost/api/crm/x', { method: 'POST' }), params);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ADMIN_REQUIRED' });
    expect(handler).not.toHaveBeenCalled();

    const seen: Array<[string, Record<string, unknown>]> = [];
    rpcImpl = async (fn, args) => { seen.push([fn, args]); return { data: true, error: null }; };
    const ok = await route(new Request('http://localhost/api/crm/x', { method: 'POST' }), params);
    expect(ok.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([['check_user_permission', { p_user_id: 'u-1', p_organization_id: SESSION, p_permission_code: 'admin.full_access' }]]);
  });

  test('withOrg: readOrgBody dentro del handler con org ajena → 403 FOREIGN_ORGANIZATION por el mismo camino (sin try/catch propio)', async () => {
    memberships.push({ id: 1, user_id: 'u-1', is_active: true, organization_id: SESSION, is_super_admin: false, role_id: 5, organizations: { name: 'Org 120' }, roles: { name: 'Vendedor' } });
    cookieJar.set('goadmin_org_id', String(SESSION));
    const inner = jest.fn();
    const route = withOrg(async (c, req) => { await readOrgBody(c, req); inner(); return Response.json({ ok: true }); });
    const res = await route(reqOf('json', { organizationId: String(FOREIGN) }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expect(inner).not.toHaveBeenCalled();
  });
});

// ───────────────────────── S4 · rate limit bajo concurrencia ─────────────────────────
describe('S4 · checkRateLimit: 20 concurrentes con limit 3', () => {
  const OPTS = { limit: 3, windowMs: 1000 };
  beforeEach(() => _resetRateLimits());

  /** Store atómico con la semántica de fn_rate_limit_hit (verificada en BD dentro de begin; sin commit). */
  function atomicStore(latencyMs = 0) {
    const counts = new Map<string, number>();
    let calls = 0;
    const store: RateLimitStore = {
      async hit(entries) {
        calls += 1;
        if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
        const proj = entries.map((e) => ({ key: e.key, count: (counts.get(e.key) ?? 0) + 1, resetAt: new Date(Date.now() + e.windowMs) }));
        if (proj.every((p, i) => p.count <= entries[i].limit)) proj.forEach((p) => counts.set(p.key, p.count));
        return proj;
      },
    };
    return { store, counts, calls: () => calls };
  }

  test('memoria: Promise.all de 20 → exactamente 3 permitidas, count final 3 y remaining 0', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('k', OPTS)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.filter((r) => !r.allowed)).toHaveLength(17);
    expect((await checkRateLimit('k', OPTS)).count).toBe(4);
  });

  test('memoria: 20 concurrentes sobre 4 claves distintas → 3 por clave (los cubos no se mezclan)', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => checkRateLimit(`k${i % 4}`, OPTS).then((r) => ({ ...r, key: `k${i % 4}` }))));
    for (let i = 0; i < 4; i++) expect(results.filter((r) => r.key === `k${i}` && r.allowed)).toHaveLength(3);
  });

  test('store db simulado (atómico, 10 ms de latencia): 20 concurrentes → 3 permitidas, el store cuenta 3 y la memoria queda en 3', async () => {
    const { store, counts, calls } = atomicStore(10);
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('k', OPTS, { store })));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(counts.get('k')).toBe(3);
    expect(calls()).toBe(20);
    // La memoria proyectó count=1 para las 20 (todas antes del await) pero solo registró las 3 que el store aceptó.
    _resetRateLimits();
    expect((await checkRateLimit('k', OPTS, { store })).allowed).toBe(false);
  });

  test('store que lanza bajo concurrencia: 20 → 0 permitidas, 20 errores registrados, memoria intacta', async () => {
    const store: RateLimitStore = { hit: async () => { throw new Error('rpc caída'); } };
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('k', OPTS, { store })));
    expect(results.filter((r) => r.allowed)).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledTimes(20);
    expect((await checkRateLimit('k', OPTS)).count).toBe(1);
  });

  test('store que omite la clave o devuelve entries vacío → bloqueado (fail-closed), no 500', async () => {
    const empty: RateLimitStore = { hit: async () => [] };
    expect((await checkRateLimit('k', OPTS, { store: empty })).allowed).toBe(false);
    const other: RateLimitStore = { hit: async () => [{ key: 'otra', count: 1, resetAt: new Date() }] };
    expect((await checkRateLimit('k', OPTS, { store: other })).allowed).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  test('DOCUMENTADO: un store NO atómico (leer-luego-escribir con latencia) deja pasar las 20: la memoria no lo compensa porque proyecta antes del await. Por eso fn_rate_limit_hit es una sola sentencia transaccional', async () => {
    const counts = new Map<string, number>();
    const naive: RateLimitStore = {
      async hit(entries) {
        const read = entries.map((e) => ({ key: e.key, count: (counts.get(e.key) ?? 0) + 1, resetAt: new Date(Date.now() + e.windowMs) }));
        await new Promise((r) => setTimeout(r, 5));
        read.forEach((p) => counts.set(p.key, p.count));
        return read;
      },
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('k', OPTS, { store: naive })));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
  });

  test('createDbRateLimitStore bajo concurrencia: 20 llamadas → 20 RPC con { key, limit, window_ms }; respuesta sin entries → lanza (y rateLimit bloquea)', async () => {
    const calls: unknown[] = [];
    let n = 0;
    const client = { rpc: async (_fn: string, args: Record<string, unknown>) => { calls.push(args); n += 1; return { data: { entries: [{ key: 'k', count: n, reset_at: new Date(Date.now() + 1000).toISOString() }] }, error: null }; } };
    const store = createDbRateLimitStore(client);
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit('k', OPTS, { store })));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(calls).toHaveLength(20);
    expect(calls[0]).toEqual({ p_entries: [{ key: 'k', limit: 3, window_ms: 1000 }] });
    const broken = createDbRateLimitStore({ rpc: async () => ({ data: { nope: 1 }, error: null }) });
    await expect(broken.hit([{ key: 'k', limit: 3, windowMs: 1000 }])).rejects.toThrow(/entries/);
    _resetRateLimits();
    expect((await checkRateLimit('k', OPTS, { store: broken })).allowed).toBe(false);
  });

  test('multi-clave concurrente: 20 peticiones con [ip (limit 3), user (limit 10)] → 3 pasan y `user` queda en 3, no en 10 ni en 20', async () => {
    const { store, counts } = atomicStore(2);
    const entries = [{ key: 'ip', opts: OPTS }, { key: 'user', opts: { limit: 10, windowMs: 1000 } }];
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimits(entries, { store })));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.filter((r) => !r.allowed).every((r) => r.blockedKey === 'ip')).toBe(true);
    expect(counts.get('user')).toBe(3);
  });
});

// ───────────────────────── S5 · rutas multipart del asistente ─────────────────────────
describe('S5 · ai-assistant/{attachments,transcribe}: 403 con code por cada alias; vacío no es 403 (obligatorio 1)', () => {
  const session = { organizationId: SESSION, userId: 'u-1', userEmail: 'u-1@example.test', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', memberId: 1, supabase: {} as never };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const orgContextModule = require('@/lib/utils/orgContext') as typeof import('@/lib/utils/orgContext');
  let ctxSpy: jest.SpyInstance;
  beforeEach(() => { ctxSpy = jest.spyOn(orgContextModule, 'getServerOrgContext').mockImplementation(async () => session); _resetRateLimits(); transcribeWithFallback.mockClear(); });
  afterEach(() => { ctxSpy.mockRestore(); });

  const multipart = (url: string, fields: Record<string, string | Blob>, search = '') => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return new NextRequest(`http://localhost${url}${search}`, { method: 'POST', body: fd });
  };
  const audio = () => new Blob([new Uint8Array(4)], { type: 'audio/webm' });
  const png = () => new Blob([new Uint8Array(4)], { type: 'image/png' });

  for (const key of ORG_BODY_KEYS) {
    test(`transcribe: ${key} ajena en el multipart → 403 { code: FOREIGN_ORGANIZATION }, warn con route y STT no invocada`, async () => {
      const { POST } = await import('@/app/api/ai-assistant/transcribe/route');
      const res = await POST(multipart('/api/ai-assistant/transcribe', { audio: audio(), [key]: String(FOREIGN) }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Organización no permitida', code: 'FOREIGN_ORGANIZATION' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${key} ajeno`), expect.objectContaining({ key, route: 'ai-assistant/transcribe', session: SESSION }));
      expect(transcribeWithFallback).not.toHaveBeenCalled();
    });
    test(`attachments: ${key} ajena en el multipart → 403 { code: FOREIGN_ORGANIZATION } y warn con route`, async () => {
      const { POST } = await import('@/app/api/ai-assistant/attachments/route');
      const res = await POST(multipart('/api/ai-assistant/attachments', { file: png(), [key]: String(FOREIGN) }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Organización no permitida', code: 'FOREIGN_ORGANIZATION' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${key} ajeno`), expect.objectContaining({ key, route: 'ai-assistant/attachments' }));
    });
  }

  test('ambas: { organization_id: propia, orgId: ajena } → 403; { organization_id: "" } o propia → siguen al siguiente paso (no 403)', async () => {
    const t = await import('@/app/api/ai-assistant/transcribe/route');
    const a = await import('@/app/api/ai-assistant/attachments/route');
    expect((await t.POST(multipart('/api/ai-assistant/transcribe', { audio: audio(), organization_id: String(SESSION), orgId: String(FOREIGN) }))).status).toBe(403);
    expect((await a.POST(multipart('/api/ai-assistant/attachments', { file: png(), organization_id: String(SESSION), orgId: String(FOREIGN) }))).status).toBe(403);
    // Sin archivo y con la clave vacía/propia: llega a la validación del archivo (400 propio de la ruta, no 403).
    const t1 = await t.POST(multipart('/api/ai-assistant/transcribe', { organization_id: '' }));
    expect(t1.status).toBe(400);
    expect(await t1.json()).toMatchObject({ error: expect.stringMatching(/audio/i) });
    const a1 = await a.POST(multipart('/api/ai-assistant/attachments', { organization_id: String(SESSION) }));
    expect(a1.status).toBe(400);
    expect(await a1.json()).toMatchObject({ code: 'FILE_REQUIRED' });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('JSON: transcribe sigue requiriendo multipart (400); attachments valida organización del contrato firmado (403)', async () => {
    const t = await import('@/app/api/ai-assistant/transcribe/route');
    const a = await import('@/app/api/ai-assistant/attachments/route');
    const json = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organization_id: FOREIGN }) });
    expect((await t.POST(json('/api/ai-assistant/transcribe'))).status).toBe(400);
    const ra = await a.POST(json('/api/ai-assistant/attachments'));
    // prepare/finalize admite JSON para que el binario vaya directo a Storage.
    // Ya no es un error de formato: una organización ajena debe rechazarse.
    expect(ra.status).toBe(403);
    expect(await ra.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
  });

  test('CERRADO (deuda C): ?organization_id=999 en la query de estas rutas → 403 { code } y warn where: query (sobrecarga síncrona con { request })', async () => {
    const t = await import('@/app/api/ai-assistant/transcribe/route');
    const res = await t.POST(multipart('/api/ai-assistant/transcribe', {}, `?organization_id=${FOREIGN}`));
    expect(res.status).toBe(403); // antes llegaba a «audio requerido» (400) sin registro
    expect(await res.json()).toEqual({ error: 'Organización no permitida', code: 'FOREIGN_ORGANIZATION' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('organization_id ajeno'), expect.objectContaining({ where: 'query', route: 'ai-assistant/transcribe', session: SESSION, body: String(FOREIGN) }));
    const a = await import('@/app/api/ai-assistant/attachments/route');
    const ra = await a.POST(multipart('/api/ai-assistant/attachments', { file: png() }, `?orgId=${FOREIGN}`));
    expect(ra.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('orgId ajeno'), expect.objectContaining({ where: 'query', route: 'ai-assistant/attachments' }));
    // La query PROPIA no estorba: sigue llegando a la validación del formulario.
    const ok = await t.POST(multipart('/api/ai-assistant/transcribe', {}, `?organization_id=${SESSION}`));
    expect(ok.status).toBe(400);
  });

  test('DOCUMENTADO (bajo): el rechazo 403 consume un hit del rate limit por usuario (el límite se evalúa antes de leer el formulario)', async () => {
    const t = await import('@/app/api/ai-assistant/transcribe/route');
    for (let i = 0; i < 10; i++) {
      expect((await t.POST(multipart('/api/ai-assistant/transcribe', { audio: audio(), org_id: String(FOREIGN) }))).status).toBe(403);
    }
    expect((await t.POST(multipart('/api/ai-assistant/transcribe', { audio: audio(), org_id: String(FOREIGN) }))).status).toBe(429);
  });
});
