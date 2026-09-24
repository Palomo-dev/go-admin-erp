/**
 * Meta Marketing y TikTok Marketing: la organización sale de la sesión y el
 * `state` OAuth va firmado (regla dura 5, 2026-09-23).
 *
 * Antes:
 * - `setup`, `catalog-sync` y `product-sync` (Meta y TikTok) tomaban
 *   `organization_id` del body con `createRouteHandlerClient` y usaban un
 *   `connection_id` cualquiera: se podían sincronizar productos de otra
 *   organización al catálogo propio o escribir credenciales en una conexión ajena.
 * - `oauth/authorize` sacaba el usuario de un JWT SIN verificar y la
 *   organización del body; el `state` era base64 sin firma y los callbacks lo
 *   usaban con service-role (crear conexiones / sobrescribir credenciales en
 *   cualquier organización).
 *
 * Aquí se prueba: sin sesión → 401; body con otra organización → 403 y
 * registro; `connection_id` de otra organización o de otro conector → 404 sin
 * tocar credenciales ni proveedor; caso feliz con la organización de la sesión;
 * `state` sin firma / manipulado / expirado / de otro proveedor / reutilizado /
 * de otro navegador → rechazo antes de canjear el `code`.
 */

import crypto from 'crypto';

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

// ─── Base de datos doble ─────────────────────────────────────────────────────

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

function makeDb(name: string, tables: () => Record<string, Row[]>, calls: Call[]) {
  return {
    name,
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      const result = () => {
        calls.push(call);
        const rows = (tables()[table] ?? []).filter((r) =>
          call.filters.every(([op, col, v]) => (op === 'eq' ? r[col] === v : op === 'in' ? (v as unknown[]).includes(r[col]) : true))
        );
        if (call.op === 'insert') {
          const inserted = { id: '99999999-9999-4999-8999-999999999999', ...(call.payload as Row) };
          (tables()[table] ??= []).push(inserted);
          return { data: [inserted], error: null };
        }
        return { data: rows, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (col: string, v: unknown) => (call.filters.push(['eq', col, v]), builder),
        in: (col: string, v: unknown) => (call.filters.push(['in', col, v]), builder),
        order: () => builder,
        limit: () => builder,
        insert: (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), builder),
        update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), builder),
        maybeSingle: async () => {
          const r = result();
          return { data: (r.data as Row[])[0] ?? null, error: null };
        },
        single: async () => {
          const r = result();
          const row = (r.data as Row[])[0] ?? null;
          return { data: row, error: row ? null : { message: 'no rows' } };
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko),
      };
      return builder;
    },
    rpc: async () => ({ data: false, error: null }),
  };
}

const ORG = 120;
const OTRA_ORG = 121;
const USER = '0f0f0f0f-1111-4222-8333-444444444444';
const OTRO_USER = '0e0e0e0e-1111-4222-8333-444444444444';
const CONN_META = 'aaaaaaaa-0000-4000-8000-000000000120';
const CONN_TIKTOK = 'bbbbbbbb-0000-4000-8000-000000000120';
const CONN_META_AJENA = 'cccccccc-0000-4000-8000-000000000121';

let data: Record<string, Row[]>;
let sessionCalls: Call[];
let serviceCalls: Call[];

function freshData(): Record<string, Row[]> {
  return {
    integration_connections: [
      { id: CONN_META, organization_id: ORG, integration_connectors: { code: 'meta_marketing' } },
      { id: CONN_TIKTOK, organization_id: ORG, integration_connectors: { code: 'tiktok_marketing' } },
      { id: CONN_META_AJENA, organization_id: OTRA_ORG, integration_connectors: { code: 'meta_marketing' } },
    ],
    integration_connectors: [
      { id: 'c-meta', code: 'meta_marketing' },
      { id: 'c-tiktok', code: 'tiktok_marketing' },
    ],
    organization_domains: [{ organization_id: ORG, host: 'tienda.ejemplo.test', is_primary: true, is_active: true }],
    organizations: [
      { id: ORG, name: 'Org 120', subdomain: 'org120' },
      { id: OTRA_ORG, name: 'Org 121', subdomain: 'org121' },
    ],
    organization_members: [
      { id: 1, organization_id: ORG, user_id: USER, role_id: 2, is_super_admin: false, is_active: true },
      { id: 2, organization_id: ORG, user_id: OTRO_USER, role_id: 5, is_super_admin: false, is_active: true },
    ],
    integration_events: [],
  };
}

const sessionDb = makeDb('session', () => data, (sessionCalls = []));
const serviceDb = makeDb('service', () => data, (serviceCalls = []));

// ─── Sesión doble (withOrg real en lo que importa: 401/403/admin) ────────────

let session: { organizationId: number; userId: string; organizationName: string; roleId: number; isSuperAdmin: boolean } | null;
let sessionUserForCallback: string | null;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async (m: { roleId: number; isSuperAdmin: boolean }) => m.isSuperAdmin || [1, 2].includes(m.roleId),
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>, opts?: { admin?: boolean }) =>
    async (req: Request, rp: unknown) => {
      try {
        if (!session) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
        if (opts?.admin && !(session.isSuperAdmin || [1, 2].includes(session.roleId))) {
          throw new OrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
        }
        return await handler({ ...session, supabase: sessionDb }, req, rp);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return new Response(JSON.stringify({ error: err.message, code: err.code }), { status: err.statusCode });
        }
        throw err;
      }
    },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUserForCallback ? { id: sessionUserForCallback } : null } }) },
  }),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'USD' }) }));

const meta = {
  getCredentials: jest.fn(),
  getProductsForSync: jest.fn(),
  syncCatalog: jest.fn(),
  healthCheck: jest.fn(),
  getAdAccounts: jest.fn(),
  fullSetup: jest.fn(),
  completeOAuthFlow: jest.fn(),
};
const tiktok = {
  getCredentials: jest.fn(),
  getProductsForSync: jest.fn(),
  syncCatalog: jest.fn(),
  healthCheck: jest.fn(),
  fullSetup: jest.fn(),
  completeOAuthFlow: jest.fn(),
};
jest.mock('@/lib/services/integrations/meta', () => ({ metaMarketingService: meta }));
jest.mock('@/lib/services/integrations/tiktok', () => ({ tiktokMarketingService: tiktok }));

import { NextRequest } from 'next/server';
import { POST as metaSetup } from '@/app/api/integrations/meta/setup/route';
import { POST as metaCatalogSync } from '@/app/api/integrations/meta/catalog-sync/route';
import { POST as tiktokSetup } from '@/app/api/integrations/tiktok/setup/route';
import { POST as tiktokCatalogSync } from '@/app/api/integrations/tiktok/catalog-sync/route';
import { POST as tiktokProductSync } from '@/app/api/integrations/tiktok/product-sync/route';
import { POST as metaAuthorize } from '@/app/api/integrations/meta/oauth/authorize/route';
import { POST as tiktokAuthorize } from '@/app/api/integrations/tiktok/oauth/authorize/route';
import { GET as metaCallback } from '@/app/api/integrations/meta/oauth/callback/route';
import { GET as tiktokCallback } from '@/app/api/integrations/tiktok/oauth/callback/route';
import {
  issueOAuthState,
  verifyOAuthState,
  oauthNonceCookieName,
  _resetOAuthStateNonces,
  OAUTH_STATE_TTL_SECONDS,
} from '@/lib/security/oauthState';
import fs from 'fs';
import path from 'path';

type Handler = (req: Request, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const rp = { params: Promise.resolve({}) };

function post(url: string, body: unknown): Request {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(url: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { headers: cookie ? { cookie } : {} });
}

const SECRET = crypto.randomBytes(32).toString('hex');
let warn: jest.SpyInstance;

beforeEach(() => {
  data = freshData();
  sessionCalls.length = 0;
  serviceCalls.length = 0;
  session = { organizationId: ORG, userId: USER, organizationName: 'Org 120', roleId: 2, isSuperAdmin: false };
  sessionUserForCallback = null;
  process.env.OAUTH_STATE_SECRET = SECRET;
  process.env.META_APP_ID = '1234567890';
  process.env.META_APP_SECRET = crypto.randomBytes(16).toString('hex');
  process.env.TIKTOK_APP_ID = '9876543210';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.ejemplo.test';
  _resetOAuthStateNonces();
  for (const f of [...Object.values(meta), ...Object.values(tiktok)]) f.mockReset();
  meta.getCredentials.mockResolvedValue({ accessToken: 'tok', catalogId: 'cat-1' });
  meta.getProductsForSync.mockResolvedValue([{ id: 1, sku: 'A' }]);
  meta.syncCatalog.mockResolvedValue({ total: 1, created: 1, updated: 0, errors: 0 });
  meta.healthCheck.mockResolvedValue({ valid: true });
  meta.fullSetup.mockResolvedValue({ catalogName: 'c', catalogId: '1', pixelName: 'p', pixelId: '2', productsSynced: 1 });
  meta.completeOAuthFlow.mockResolvedValue({ accessToken: 'tok', businessId: 'b', businessName: 'B', adAccountId: 'act', adAccountName: 'A' });
  tiktok.getCredentials.mockResolvedValue({ accessToken: 'tok', advertiserId: 'adv', catalogId: 'cat-1' });
  tiktok.getProductsForSync.mockResolvedValue([{ id: 1, sku: 'A' }, { id: 2, sku: 'B' }]);
  tiktok.syncCatalog.mockResolvedValue({ total: 1, created: 1, updated: 0, errors: 0 });
  tiktok.healthCheck.mockResolvedValue({ valid: true });
  tiktok.fullSetup.mockResolvedValue({ catalogName: 'c', catalogId: '1', pixelName: 'p', pixelCode: '2', productsSynced: 1 });
  tiktok.completeOAuthFlow.mockResolvedValue({ accessToken: 'tok', advertiserId: 'adv', advertiserName: 'Adv' });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

// ─── Rutas con sesión ────────────────────────────────────────────────────────

const RUTAS: Array<{ nombre: string; handler: Handler; url: string; body: Row; conn: string; proveedor: typeof meta | typeof tiktok }> = [
  { nombre: 'meta/setup', handler: metaSetup as Handler, url: '/api/integrations/meta/setup', body: { connection_id: CONN_META, access_token: 't', business_id: 'b', ad_account_id: 'act' }, conn: CONN_META, proveedor: meta },
  { nombre: 'meta/catalog-sync', handler: metaCatalogSync as Handler, url: '/api/integrations/meta/catalog-sync', body: { connection_id: CONN_META }, conn: CONN_META, proveedor: meta },
  { nombre: 'tiktok/setup', handler: tiktokSetup as Handler, url: '/api/integrations/tiktok/setup', body: { connection_id: CONN_TIKTOK, access_token: 't', advertiser_id: 'adv' }, conn: CONN_TIKTOK, proveedor: tiktok },
  { nombre: 'tiktok/catalog-sync', handler: tiktokCatalogSync as Handler, url: '/api/integrations/tiktok/catalog-sync', body: { connection_id: CONN_TIKTOK }, conn: CONN_TIKTOK, proveedor: tiktok },
  { nombre: 'tiktok/product-sync', handler: tiktokProductSync as Handler, url: '/api/integrations/tiktok/product-sync', body: { connection_id: CONN_TIKTOK, product_ids: [2] }, conn: CONN_TIKTOK, proveedor: tiktok },
];

function nadaDelProveedor(p: typeof meta | typeof tiktok) {
  for (const f of Object.values(p)) expect(f).not.toHaveBeenCalled();
  expect(serviceCalls).toEqual([]);
}

describe.each(RUTAS)('$nombre: la organización sale de la sesión', ({ handler, url, body, proveedor }) => {
  it('sin sesión → 401 sin tocar nada', async () => {
    session = null;
    const res = await handler(post(url, body), rp);
    expect(res.status).toBe(401);
    nadaDelProveedor(proveedor);
  });

  it('miembro sin admin → 403 (permiso resuelto en el servidor, no por nombre de rol)', async () => {
    session = { ...session!, roleId: 5 };
    const res = await handler(post(url, body), rp);
    expect(res.status).toBe(403);
    nadaDelProveedor(proveedor);
  });

  it('body con OTRA organización → 403 FOREIGN_ORGANIZATION y se registra', async () => {
    const res = await handler(post(url, { ...body, organization_id: OTRA_ORG }), rp);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[orgBody]'), expect.objectContaining({ session: ORG, body: OTRA_ORG }));
    nadaDelProveedor(proveedor);
  });

  it('organización ajena en la query → 403', async () => {
    const res = await handler(post(`${url}?organizationId=${OTRA_ORG}`, body), rp);
    expect(res.status).toBe(403);
    nadaDelProveedor(proveedor);
  });

  it('connection_id de OTRA organización → 404 sin revelar existencia ni leer credenciales', async () => {
    const res = await handler(post(url, { ...body, connection_id: CONN_META_AJENA }), rp);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Conexión no encontrada', code: 'CONNECTION_NOT_FOUND' });
    nadaDelProveedor(proveedor);
  });

  it('connection_id inexistente o sin forma de uuid → el mismo 404', async () => {
    for (const cid of ['dddddddd-0000-4000-8000-000000000000', "1' or '1'='1"]) {
      const res = await handler(post(url, { ...body, connection_id: cid }), rp);
      expect(res.status).toBe(404);
    }
    nadaDelProveedor(proveedor);
  });

  it('caso feliz: misma organización en el body (o ninguna) → 200 y todo con la organización de la sesión', async () => {
    const res = await handler(post(url, { ...body, organization_id: ORG }), rp);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    // La pertenencia se comprobó con el cliente de SESIÓN y filtrando por la organización de la sesión.
    const check = sessionCalls.find((c) => c.table === 'integration_connections');
    expect(check?.filters).toEqual(expect.arrayContaining([['eq', 'organization_id', ORG]]));
    // El service-role solo toca credenciales/eventos, nunca productos ni organizaciones.
    expect(serviceCalls.every((c) => ['integration_credentials', 'integration_events'].includes(c.table))).toBe(true);
  });
});

describe('uso de la organización de la sesión en las llamadas al servicio', () => {
  it('meta/setup: fullSetup recibe la organización, el nombre y el dominio del servidor, no los del body', async () => {
    const res = await metaSetup(
      post('/api/integrations/meta/setup', { connection_id: CONN_META, access_token: 't', business_id: 'b', ad_account_id: 'act', organization_name: 'Otra', domain: 'evil.test' }),
      rp
    );
    expect(res.status).toBe(200);
    const args = meta.fullSetup.mock.calls[0];
    expect(args[0]).toBe(CONN_META);
    expect(args[5]).toBe(ORG);
    expect(args[6]).toBe('Org 120');
    expect(args[7]).toBe('tienda.ejemplo.test');
    expect(args[9]).toBe(sessionDb);
    expect(args[10]).toBe(serviceDb);
  });

  it('una conexión de TikTok no sirve en las rutas de Meta (conector distinto) → 404', async () => {
    const res = await metaCatalogSync(post('/api/integrations/meta/catalog-sync', { connection_id: CONN_TIKTOK }), rp);
    expect(res.status).toBe(404);
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('tiktok/product-sync: product_ids solo filtra productos de la organización de la sesión', async () => {
    const res = await tiktokProductSync(post('/api/integrations/tiktok/product-sync', { connection_id: CONN_TIKTOK, product_ids: [2, 777] }), rp);
    expect(res.status).toBe(200);
    expect(tiktok.getProductsForSync).toHaveBeenCalledWith(ORG, 'tienda.ejemplo.test', expect.any(String), sessionDb);
    expect(tiktok.syncCatalog.mock.calls[0][3]).toEqual([{ id: 2, sku: 'B' }]);
  });

  it('tiktok/product-sync: product_ids con otra forma → 400', async () => {
    const res = await tiktokProductSync(post('/api/integrations/tiktok/product-sync', { connection_id: CONN_TIKTOK, product_ids: ['1; drop'] }), rp);
    expect(res.status).toBe(400);
  });
});

// ─── OAuth: state firmado ────────────────────────────────────────────────────

describe('oauthState: firma, expiración y ligadura', () => {
  const base = { provider: 'meta' as const, organizationId: ORG, userId: USER };

  it('un state emitido verifica y conserva organización, usuario y conexión', () => {
    const { state, nonce } = issueOAuthState({ ...base, connectionId: CONN_META });
    const v = verifyOAuthState(state, 'meta', { nonceCookie: nonce, sessionUserId: USER });
    expect(v).toEqual({ ok: true, claims: expect.objectContaining({ org: ORG, uid: USER, cid: CONN_META, p: 'meta' }) });
  });

  it('el state viejo (base64 sin firma) se rechaza', () => {
    const viejo = Buffer.from(JSON.stringify({ organization_id: OTRA_ORG, connection_id: '', user_id: USER, ts: Date.now() })).toString('base64');
    expect(verifyOAuthState(viejo, 'meta')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('cambiar la organización del payload invalida la firma', () => {
    const { state } = issueOAuthState(base);
    const [payload, sig] = state.split('.');
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const manipulado = Buffer.from(JSON.stringify({ ...claims, org: OTRA_ORG })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyOAuthState(`${manipulado}.${sig}`, 'meta')).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('firmado con otro secreto → bad_signature', () => {
    const { state } = issueOAuthState(base);
    process.env.OAUTH_STATE_SECRET = crypto.randomBytes(32).toString('hex');
    expect(verifyOAuthState(state, 'meta')).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('expirado → expired', () => {
    const now = Math.floor(Date.now() / 1000);
    const { state } = issueOAuthState(base, now - OAUTH_STATE_TTL_SECONDS - 1);
    expect(verifyOAuthState(state, 'meta', { now })).toEqual({ ok: false, reason: 'expired' });
  });

  it('state de Meta en el callback de TikTok → wrong_provider', () => {
    const { state } = issueOAuthState(base);
    expect(verifyOAuthState(state, 'tiktok')).toEqual({ ok: false, reason: 'wrong_provider' });
  });

  it('cookie de nonce de otro navegador → nonce_mismatch; sesión de otro usuario → session_mismatch', () => {
    const { state } = issueOAuthState(base);
    expect(verifyOAuthState(state, 'meta', { nonceCookie: 'x'.repeat(24) })).toEqual({ ok: false, reason: 'nonce_mismatch' });
    expect(verifyOAuthState(state, 'meta', { sessionUserId: OTRO_USER })).toEqual({ ok: false, reason: 'session_mismatch' });
  });

  it('sin secreto real (ausente o de relleno) no se emite ni se verifica nada', () => {
    const { state } = issueOAuthState(base);
    process.env.OAUTH_STATE_SECRET = 'your-oauth-state-secret';
    expect(() => issueOAuthState(base)).toThrow('OAUTH_STATE_SECRET');
    expect(verifyOAuthState(state, 'meta')).toEqual({ ok: false, reason: 'secret_not_configured' });
  });
});

describe('oauth/authorize: sesión + admin + state firmado + cookie de nonce', () => {
  it('sin sesión → 401', async () => {
    session = null;
    expect((await (metaAuthorize as Handler)(post('/api/integrations/meta/oauth/authorize', {}), rp)).status).toBe(401);
    expect((await (tiktokAuthorize as Handler)(post('/api/integrations/tiktok/oauth/authorize', {}), rp)).status).toBe(401);
  });

  it('organización ajena en el body → 403 y registro', async () => {
    const res = await (metaAuthorize as Handler)(post('/api/integrations/meta/oauth/authorize', { organization_id: OTRA_ORG }), rp);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[orgBody]'), expect.anything());
  });

  it('connection_id de otra organización → 404', async () => {
    const res = await (metaAuthorize as Handler)(post('/api/integrations/meta/oauth/authorize', { connection_id: CONN_META_AJENA }), rp);
    expect(res.status).toBe(404);
  });

  it('caso feliz: la URL lleva un state firmado con la organización y el usuario de la sesión, y el nonce en cookie httpOnly', async () => {
    const res = await (metaAuthorize as Handler)(post('/api/integrations/meta/oauth/authorize', { organization_id: ORG, connection_id: CONN_META }), rp);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const state = new URL(url).searchParams.get('state');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${oauthNonceCookieName('meta')}=`);
    expect(cookie.toLowerCase()).toContain('httponly');
    const nonce = /goadmin_oauth_meta_nonce=([^;]+)/.exec(cookie)?.[1] ?? null;
    expect(verifyOAuthState(state, 'meta', { nonceCookie: nonce })).toEqual({ ok: true, claims: expect.objectContaining({ org: ORG, uid: USER, cid: CONN_META }) });
  });

  it('sin OAUTH_STATE_SECRET real → 503 (fail-closed)', async () => {
    delete process.env.OAUTH_STATE_SECRET;
    const res = await (tiktokAuthorize as Handler)(post('/api/integrations/tiktok/oauth/authorize', {}), rp);
    expect(res.status).toBe(503);
  });
});

describe.each([
  { nombre: 'meta', callback: metaCallback, url: '/api/integrations/meta/oauth/callback?code=abc', provider: 'meta' as const, svc: meta, err: 'meta_error', ok: 'meta_success' },
  { nombre: 'tiktok', callback: tiktokCallback, url: '/api/integrations/tiktok/oauth/callback?auth_code=abc', provider: 'tiktok' as const, svc: tiktok, err: 'tiktok_error', ok: 'tiktok_success' },
])('$nombre oauth/callback: el state se valida antes de canjear el code', ({ callback, url, provider, svc, err, ok }) => {
  const location = (res: Response) => new URL(res.headers.get('location') ?? 'http://x');
  const conState = (state: string) => `${url}&state=${encodeURIComponent(state)}`;

  it('state sin firma (formato viejo) → rechazo y no se llama al proveedor', async () => {
    const viejo = Buffer.from(JSON.stringify({ organization_id: OTRA_ORG, user_id: USER, timestamp: Date.now() })).toString('base64');
    const res = await callback(get(conState(viejo)));
    expect(location(res).searchParams.get(err)).toMatch(/no es válida o expiró/);
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
    expect(data.integration_connections).toHaveLength(3);
  });

  it('state manipulado → rechazo', async () => {
    const { state } = issueOAuthState({ provider, organizationId: ORG, userId: USER });
    const res = await callback(get(conState(`${state.slice(0, -2)}xx`)));
    expect(location(res).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('state expirado → rechazo', async () => {
    const { state } = issueOAuthState({ provider, organizationId: ORG, userId: USER }, Math.floor(Date.now() / 1000) - OAUTH_STATE_TTL_SECONDS - 5);
    const res = await callback(get(conState(state)));
    expect(location(res).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('cookie de nonce de otro flujo → rechazo', async () => {
    const { state } = issueOAuthState({ provider, organizationId: ORG, userId: USER });
    const res = await callback(get(conState(state), `${oauthNonceCookieName(provider)}=${'z'.repeat(24)}`));
    expect(location(res).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('sesión de OTRO usuario en el callback → rechazo', async () => {
    sessionUserForCallback = OTRO_USER;
    const { state } = issueOAuthState({ provider, organizationId: ORG, userId: USER });
    const res = await callback(get(conState(state)));
    expect(location(res).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('el usuario que firmó ya no es admin de la organización → rechazo', async () => {
    const { state } = issueOAuthState({ provider, organizationId: ORG, userId: OTRO_USER });
    const res = await callback(get(conState(state)));
    expect(location(res).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('caso feliz (sin sesión en el callback, con la cookie del nonce): crea la conexión en la organización firmada; reutilizar el state → rechazo', async () => {
    const { state, nonce } = issueOAuthState({ provider, organizationId: ORG, userId: USER });
    const cookie = `${oauthNonceCookieName(provider)}=${nonce}`;
    const res = await callback(get(conState(state), cookie));
    expect(location(res).searchParams.get(ok)).toBeTruthy();
    expect(svc.completeOAuthFlow).toHaveBeenCalledTimes(1);
    const creada = data.integration_connections[3];
    expect(creada).toEqual(expect.objectContaining({ organization_id: ORG, status: 'connected', created_by: USER }));
    expect(svc.fullSetup.mock.calls[0][provider === 'meta' ? 5 : 4]).toBe(ORG);
    // La cookie del nonce se borra en la respuesta.
    expect(res.headers.get('set-cookie')).toContain(`${oauthNonceCookieName(provider)}=;`);

    const otra = await callback(get(conState(state), cookie));
    expect(location(otra).searchParams.get(err)).toBeTruthy();
    expect(svc.completeOAuthFlow).toHaveBeenCalledTimes(1);
  });
});

it('meta oauth/callback: conexión del state que ya no es de la organización → rechazo', async () => {
  // Firmado válido, pero la conexión pasó a otra organización (o nunca fue suya).
  const { state } = issueOAuthState({ provider: 'meta', organizationId: ORG, userId: USER, connectionId: CONN_META_AJENA });
  const res = await metaCallback(get(`/api/integrations/meta/oauth/callback?code=abc&state=${encodeURIComponent(state)}`));
  expect(new URL(res.headers.get('location') ?? 'http://x').searchParams.get('meta_error')).toBeTruthy();
  expect(meta.completeOAuthFlow).not.toHaveBeenCalled();
});

// ─── Guarda de fuente: que no vuelva el state sin firma ──────────────────────

it('ningún authorize/callback de Meta o TikTok decodifica un JWT sin verificar ni un state base64 sin firma', () => {
  const root = path.join(__dirname, '..', '..', 'app', 'api', 'integrations');
  const archivos = ['meta', 'tiktok'].flatMap((p) => ['authorize', 'callback'].map((r) => path.join(root, p, 'oauth', r, 'route.ts')));
  for (const f of archivos) {
    const src = fs.readFileSync(f, 'utf8');
    expect(src).not.toMatch(/decodeJwt|Buffer\.from\([^)]*\)\.toString\('base64'\)|Buffer\.from\([^)]*'base64'\)/);
    expect(src).toMatch(f.includes('callback') ? /acceptMarketingOAuthState\(/ : /issueOAuthState\(/);
  }
});
