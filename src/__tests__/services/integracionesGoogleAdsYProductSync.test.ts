/**
 * Segunda ronda de la familia «la organización sale de la sesión» (2026-09-23):
 *
 * - Google Ads OAuth: `authorize` con sesión + admin y `state` firmado
 *   (`@/lib/security/oauthState`, proveedor `google`); el callback lo valida
 *   antes de canjear el `code` y escribe solo en la organización firmada.
 * - Meta product-sync: el camino servidor a servidor exige `CRON_SECRET`
 *   (fail-closed, tiempo constante) y la organización sale de la CONEXIÓN; la
 *   cabecera `x-api-key` con la service-role key ya no autentica; el borrado
 *   del catálogo solo toca SKU de la organización.
 * - TikTok product-sync: los eventos pendientes son `received` (el CHECK no
 *   admite 'pending').
 */

import crypto from 'crypto';

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

function makeDb(tables: () => Record<string, Row[]>, calls: Call[]) {
  return {
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
        if (call.op === 'update') {
          for (const r of rows) Object.assign(r, call.payload as Row);
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
        maybeSingle: async () => ({ data: (result().data as Row[])[0] ?? null, error: null }),
        single: async () => {
          const row = (result().data as Row[])[0] ?? null;
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
const CONN_GOOGLE = 'dddddddd-0000-4000-8000-000000000120';
const CONN_GOOGLE_AJENA = 'eeeeeeee-0000-4000-8000-000000000121';
const CONN_META = 'aaaaaaaa-0000-4000-8000-000000000120';
const CONN_TIKTOK = 'bbbbbbbb-0000-4000-8000-000000000120';

let data: Record<string, Row[]>;
const sessionCalls: Call[] = [];
const serviceCalls: Call[] = [];

function freshData(): Record<string, Row[]> {
  return {
    integration_connections: [
      { id: CONN_GOOGLE, organization_id: ORG, status: 'draft', name: 'Google Ads - vieja', integration_connectors: { code: 'google_ads' } },
      { id: CONN_GOOGLE_AJENA, organization_id: OTRA_ORG, status: 'connected', integration_connectors: { code: 'google_ads' } },
      { id: CONN_META, organization_id: ORG, status: 'connected', integration_connectors: { code: 'meta_marketing' } },
      { id: CONN_TIKTOK, organization_id: ORG, status: 'connected', integration_connectors: { code: 'tiktok_marketing' } },
    ],
    integration_connectors: [{ id: 'c-google', code: 'google_ads' }],
    organization_domains: [{ organization_id: ORG, host: 'tienda.ejemplo.test', is_primary: true, is_active: true }],
    organizations: [{ id: ORG, name: 'Org 120', subdomain: 'org120' }],
    organization_members: [{ id: 1, organization_id: ORG, user_id: USER, role_id: 2, is_super_admin: false, is_active: true }],
    products: [
      { id: 1, organization_id: ORG, sku: 'PROPIO-1' },
      { id: 2, organization_id: OTRA_ORG, sku: 'AJENO-2' },
    ],
    integration_events: [],
  };
}

const sessionDb = makeDb(() => data, sessionCalls);
const serviceDb = makeDb(() => data, serviceCalls);

let session: { organizationId: number; userId: string; organizationName: string; roleId: number; isSuperAdmin: boolean } | null;

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
// svix es ESM puro y Jest (CJS) no lo carga; `verifyCronSecret` real no lo usa.
jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'USD' }) }));

const google = { completeOAuthFlow: jest.fn(), saveCredentials: jest.fn() };
jest.mock('@/lib/services/integrations/google-ads', () => ({ googleAdsService: google }));
const meta = { getCredentials: jest.fn(), getProductsForSync: jest.fn(), syncCatalog: jest.fn() };
jest.mock('@/lib/services/integrations/meta', () => ({ metaMarketingService: meta }));
const tiktok = { getCredentials: jest.fn(), getProductsForSync: jest.fn(), syncCatalog: jest.fn() };
jest.mock('@/lib/services/integrations/tiktok', () => ({ tiktokMarketingService: tiktok }));

import { NextRequest } from 'next/server';
import { POST as googleAuthorize } from '@/app/api/integrations/google-ads/oauth/authorize/route';
import { GET as googleCallback } from '@/app/api/integrations/google-ads/oauth/callback/route';
import { POST as metaProductSync } from '@/app/api/integrations/meta/product-sync/route';
import { POST as tiktokProductSync } from '@/app/api/integrations/tiktok/product-sync/route';
import { issueOAuthState, verifyOAuthState, oauthNonceCookieName, _resetOAuthStateNonces, OAUTH_STATE_TTL_SECONDS } from '@/lib/security/oauthState';

type Handler = (req: Request, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const rp = { params: Promise.resolve({}) };

function post(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const STATE_SECRET = crypto.randomBytes(32).toString('hex');
const CRON = crypto.randomBytes(24).toString('hex');
let warn: jest.SpyInstance;

beforeEach(() => {
  data = freshData();
  sessionCalls.length = 0;
  serviceCalls.length = 0;
  session = { organizationId: ORG, userId: USER, organizationName: 'Org 120', roleId: 2, isSuperAdmin: false };
  process.env.OAUTH_STATE_SECRET = STATE_SECRET;
  process.env.CRON_SECRET = CRON;
  process.env.GOOGLE_ADS_CLIENT_ID = 'client-id-de-prueba';
  process.env.GOOGLE_ADS_CLIENT_SECRET = crypto.randomBytes(16).toString('hex');
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.ejemplo.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba-0123456789';
  _resetOAuthStateNonces();
  for (const f of [...Object.values(google), ...Object.values(meta), ...Object.values(tiktok)]) f.mockReset();
  google.completeOAuthFlow.mockResolvedValue({ refreshToken: 'rt', customers: [{ id: '123', name: 'Cuenta', isManager: false }] });
  google.saveCredentials.mockResolvedValue(undefined);
  meta.getCredentials.mockResolvedValue({ accessToken: 'tok', catalogId: 'cat-1' });
  meta.getProductsForSync.mockResolvedValue([{ id: 1, sku: 'PROPIO-1' }]);
  meta.syncCatalog.mockResolvedValue({ total: 1, created: 1, errors: 0 });
  tiktok.getCredentials.mockResolvedValue({ accessToken: 'tok', advertiserId: 'adv', catalogId: 'cat-1' });
  tiktok.getProductsForSync.mockResolvedValue([{ id: 1, sku: 'PROPIO-1' }]);
  tiktok.syncCatalog.mockResolvedValue({ total: 1, created: 1, errors: 0 });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

// ─── Google Ads OAuth ────────────────────────────────────────────────────────

describe('google-ads/oauth/authorize', () => {
  const url = '/api/integrations/google-ads/oauth/authorize';

  it('sin sesión → 401; miembro sin admin → 403', async () => {
    session = null;
    expect((await (googleAuthorize as Handler)(post(url, {}), rp)).status).toBe(401);
    session = { organizationId: ORG, userId: USER, organizationName: 'Org 120', roleId: 5, isSuperAdmin: false };
    expect((await (googleAuthorize as Handler)(post(url, {}), rp)).status).toBe(403);
  });

  it('organización ajena en el body → 403 y registro', async () => {
    const res = await (googleAuthorize as Handler)(post(url, { organization_id: OTRA_ORG }), rp);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[orgBody]'), expect.objectContaining({ body: OTRA_ORG }));
  });

  it('connection_id de otra organización → 404', async () => {
    expect((await (googleAuthorize as Handler)(post(url, { connection_id: CONN_GOOGLE_AJENA }), rp)).status).toBe(404);
  });

  it('sin OAUTH_STATE_SECRET real → 503', async () => {
    process.env.OAUTH_STATE_SECRET = 'your-oauth-state-secret';
    expect((await (googleAuthorize as Handler)(post(url, {}), rp)).status).toBe(503);
  });

  it('caso feliz: state firmado para google con la organización de la sesión y cookie httpOnly del nonce', async () => {
    const res = await (googleAuthorize as Handler)(post(url, { connection_id: CONN_GOOGLE }), rp);
    expect(res.status).toBe(200);
    const state = new URL((await res.json()).url).searchParams.get('state');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('httponly');
    const nonce = new RegExp(`${oauthNonceCookieName('google')}=([^;]+)`).exec(cookie)?.[1] ?? null;
    expect(verifyOAuthState(state, 'google', { nonceCookie: nonce })).toEqual({
      ok: true,
      claims: expect.objectContaining({ org: ORG, uid: USER, cid: CONN_GOOGLE, p: 'google' }),
    });
  });
});

describe('google-ads/oauth/callback', () => {
  const cb = (state: string, cookie?: string) =>
    googleCallback(
      new NextRequest(`http://localhost/api/integrations/google-ads/oauth/callback?code=abc&state=${encodeURIComponent(state)}`, {
        headers: cookie ? { cookie } : {},
      })
    );
  const err = (res: Response) => new URL(res.headers.get('location') ?? 'http://x').searchParams.get('google_error');

  it('state viejo (base64 sin firma) con otra organización → rechazo sin canjear el code ni escribir', async () => {
    const viejo = Buffer.from(JSON.stringify({ organization_id: OTRA_ORG, connection_id: CONN_GOOGLE_AJENA, user_id: USER, ts: Date.now() })).toString('base64');
    const res = await cb(viejo);
    expect(err(res)).toMatch(/no es válida o expiró/);
    expect(google.completeOAuthFlow).not.toHaveBeenCalled();
    expect(google.saveCredentials).not.toHaveBeenCalled();
  });

  it('state firmado para Meta no sirve en Google; expirado tampoco', async () => {
    const deMeta = issueOAuthState({ provider: 'meta', organizationId: ORG, userId: USER }).state;
    expect(err(await cb(deMeta))).toBeTruthy();
    const viejo = issueOAuthState({ provider: 'google', organizationId: ORG, userId: USER }, Math.floor(Date.now() / 1000) - OAUTH_STATE_TTL_SECONDS - 5).state;
    expect(err(await cb(viejo))).toBeTruthy();
    expect(google.completeOAuthFlow).not.toHaveBeenCalled();
  });

  it('caso feliz sin conexión: crea `connected` en la organización firmada (columna name) y no se puede reutilizar', async () => {
    const { state, nonce } = issueOAuthState({ provider: 'google', organizationId: ORG, userId: USER });
    const cookie = `${oauthNonceCookieName('google')}=${nonce}`;
    const res = await cb(state, cookie);
    expect(new URL(res.headers.get('location') ?? 'http://x').searchParams.get('google_success')).toBeTruthy();
    const creada = data.integration_connections[4];
    expect(creada).toEqual(expect.objectContaining({ organization_id: ORG, status: 'connected', name: 'Google Ads - Cuenta', created_by: USER }));
    expect(creada).not.toHaveProperty('connection_name');
    expect(google.saveCredentials).toHaveBeenCalledWith(creada.id, { refreshToken: 'rt', customerId: '123' });

    expect(err(await cb(state, cookie))).toBeTruthy();
    expect(google.completeOAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('caso feliz con conexión propia: la actualiza filtrando por la organización firmada', async () => {
    const { state } = issueOAuthState({ provider: 'google', organizationId: ORG, userId: USER, connectionId: CONN_GOOGLE });
    await cb(state);
    const upd = serviceCalls.find((c) => c.table === 'integration_connections' && c.op === 'update');
    expect(upd?.filters).toEqual(expect.arrayContaining([['eq', 'id', CONN_GOOGLE], ['eq', 'organization_id', ORG]]));
    expect(data.integration_connections[0].status).toBe('connected');
    expect(google.saveCredentials).toHaveBeenCalledWith(CONN_GOOGLE, expect.anything());
  });

  it('conexión del state que es de otra organización → rechazo', async () => {
    const { state } = issueOAuthState({ provider: 'google', organizationId: ORG, userId: USER, connectionId: CONN_GOOGLE_AJENA });
    expect(err(await cb(state))).toBeTruthy();
    expect(google.completeOAuthFlow).not.toHaveBeenCalled();
  });
});

// ─── Meta product-sync ───────────────────────────────────────────────────────

describe('meta/product-sync: servidor a servidor', () => {
  const url = '/api/integrations/meta/product-sync';
  const bearer = { authorization: `Bearer ${CRON}` };
  const call = (body: unknown, headers: Record<string, string>) => (metaProductSync as Handler)(post(url, body, headers), rp);

  it('x-api-key con la service-role key ya no autentica → 401', async () => {
    const res = await call({ organization_id: ORG, connection_id: CONN_META }, { 'x-api-key': process.env.SUPABASE_SERVICE_ROLE_KEY as string });
    expect(res.status).toBe(401);
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('Bearer incorrecto o CRON_SECRET de relleno → 401 (fail-closed)', async () => {
    expect((await call({ connection_id: CONN_META }, { authorization: 'Bearer otro-valor-cualquiera-123456' })).status).toBe(401);
    process.env.CRON_SECRET = 'your-secure-random-token-here';
    expect((await call({ connection_id: CONN_META }, { authorization: 'Bearer your-secure-random-token-here' })).status).toBe(401);
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('sin connection_id → 400 (la organización ya no puede venir del body)', async () => {
    const res = await call({ organization_id: ORG }, bearer);
    expect(res.status).toBe(400);
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('organización del body distinta de la de la conexión → 403 y registro', async () => {
    const res = await call({ connection_id: CONN_META, organization_id: OTRA_ORG }, bearer);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[orgBody]'), expect.objectContaining({ session: ORG, body: OTRA_ORG }));
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('conexión de otro conector → 404', async () => {
    expect((await call({ connection_id: CONN_TIKTOK }, bearer)).status).toBe(404);
  });

  it('caso feliz: la organización sale de la conexión y el evento cumple el CHECK', async () => {
    const res = await call({ connection_id: CONN_META }, bearer);
    expect(res.status).toBe(200);
    expect(meta.getProductsForSync).toHaveBeenCalledWith(ORG, 'tienda.ejemplo.test', undefined, serviceDb);
    expect(data.integration_events[0]).toEqual(
      expect.objectContaining({ connection_id: CONN_META, organization_id: ORG, source: 'sync', direction: 'outbound', status: 'processed' })
    );
  });

  it('delete: solo borra del catálogo SKU de productos de la organización de la conexión', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const res = await call({ connection_id: CONN_META, action: 'delete', product_ids: [1, 2] }, bearer);
    expect(await res.json()).toEqual({ success: true, action: 'delete', count: 1 });
    const enviado = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(enviado.requests).toEqual([{ method: 'DELETE', retailer_id: 'PROPIO-1' }]);
  });
});

describe('meta/product-sync: sesión', () => {
  const url = '/api/integrations/meta/product-sync';

  it('sin sesión → 401', async () => {
    session = null;
    expect((await (metaProductSync as Handler)(post(url, {}), rp)).status).toBe(401);
  });

  it('organización ajena en el body → 403', async () => {
    expect((await (metaProductSync as Handler)(post(url, { organization_id: OTRA_ORG }), rp)).status).toBe(403);
    expect(meta.getCredentials).not.toHaveBeenCalled();
  });

  it('connection_id de otra organización → 404', async () => {
    expect((await (metaProductSync as Handler)(post(url, { connection_id: CONN_GOOGLE_AJENA }), rp)).status).toBe(404);
  });

  it('caso feliz: productos con el cliente de sesión y la organización de la sesión', async () => {
    const res = await (metaProductSync as Handler)(post(url, { product_ids: [1] }), rp);
    expect(res.status).toBe(200);
    expect(meta.getProductsForSync).toHaveBeenCalledWith(ORG, 'tienda.ejemplo.test', undefined, sessionDb);
  });
});

// ─── TikTok product-sync ─────────────────────────────────────────────────────

it("tiktok/product-sync marca como procesados los eventos `received` (el CHECK no admite 'pending')", async () => {
  data.integration_events.push({ id: 'ev-1', connection_id: CONN_TIKTOK, status: 'received', event_type: 'catalog.product_changed' });
  const res = await (tiktokProductSync as Handler)(post('/api/integrations/tiktok/product-sync', { connection_id: CONN_TIKTOK, product_ids: [1] }), rp);
  expect(res.status).toBe(200);
  const upd = serviceCalls.find((c) => c.table === 'integration_events' && c.op === 'update');
  expect(upd?.filters).toEqual(expect.arrayContaining([['eq', 'connection_id', CONN_TIKTOK], ['eq', 'status', 'received']]));
  expect(data.integration_events[0].status).toBe('processed');
});
