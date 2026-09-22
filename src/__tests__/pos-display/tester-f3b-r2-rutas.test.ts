/**
 * TESTER · Fase 3, parte B, ronda 2 — ataques a las rutas de la pantalla
 * remota. Lo que se intenta romper: token de OTRA terminal, token revocado,
 * hash presentado como token, `organization_id` en el body, código caducado
 * o reutilizado, fuerza bruta del código y coherencia del JWT de canal con
 * la terminal del token.
 *
 * El service-role va doblado (`makeSupabaseDouble`); el rate limit es el
 * REAL en memoria (`_resetRateLimits`, store persistente nulo).
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'cccccccc-dddd-4eee-8fff-000000000000';
const CODE1 = '482913';
const CODE2 = '100200';
const JWT_SECRET = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-secreto-jwt-de-jest';

interface SecretRow {
  terminal_id: string;
  organization_id: number;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  display_token_hash: string | null;
}
interface TerminalRow {
  id: string;
  organization_id: number;
  branch_id: number;
  name: string;
  code: string;
  is_active: boolean;
  display_last_seen_at: string | null;
}

const state: {
  secrets: SecretRow[];
  terminals: TerminalRow[];
  orgs: Record<number, Record<string, unknown>>;
} = { secrets: [], terminals: [], orgs: {} };

function matches(row: Record<string, unknown>, call: RecordedCall): boolean {
  return call.filters.every(([op, col, value]) => {
    const v = row[col];
    if (op === 'eq') return v === value;
    if (op === 'neq') return v !== value;
    if (op === 'gt') return typeof v === 'string' && typeof value === 'string' && v > value;
    if (op === 'or') return matchesOrFilter(row, col);
    return false;
  });
}

function joinTerminal(row: SecretRow): Record<string, unknown> {
  const t = state.terminals.find((x) => x.id === row.terminal_id);
  return {
    ...row,
    'pos_terminals.id': t?.id,
    'pos_terminals.organization_id': t?.organization_id,
    'pos_terminals.is_active': t?.is_active,
    pos_terminals: t ? { id: t.id, organization_id: t.organization_id, is_active: t.is_active } : null,
  };
}

function serviceResponder(call: RecordedCall) {
  if (call.table === 'pos_terminal_secrets') {
    const embed = call.op === 'select' && /pos_terminals!inner/.test(call.columns ?? '');
    const rows = state.secrets.filter((r) => matches(embed ? joinTerminal(r) : (r as unknown as Record<string, unknown>), call));
    if (call.op === 'update') {
      for (const r of rows) Object.assign(r, call.payload);
      return { data: rows.map((r) => ({ terminal_id: r.terminal_id })), error: null };
    }
    const out = embed ? rows.map(joinTerminal).filter((r) => r.pos_terminals !== null) : rows;
    return { data: call.limit === undefined ? (out[0] ?? null) : out.slice(0, call.limit), error: null };
  }
  if (call.table === 'pos_terminals') {
    const rows = state.terminals.filter((r) => matches(r as unknown as Record<string, unknown>, call));
    if (call.op === 'update') {
      for (const r of rows) Object.assign(r, call.payload);
      return { data: null, error: null };
    }
    return { data: rows[0] ?? null, error: null };
  }
  if (call.table === 'organizations') {
    const id = eqValue(call, 'id');
    return { data: state.orgs[Number(id)] ?? null, error: null };
  }
  if (call.table === 'organization_settings') return { data: null, error: null };
  if (call.table === 'organization_currencies') return { data: [{ currency_code: 'COP', is_base: true }], error: null };
  throw new Error(`tabla inesperada: ${call.table}`);
}

let serviceDb: SupabaseDouble;
let sessionDb: SupabaseDouble;
const session = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 2,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'Org 120',
  memberId: 1,
  get supabase() {
    return sessionDb as never;
  },
};
const getServerOrgContext = jest.fn(async () => session);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  ORG_BODY_KEYS: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').ORG_BODY_KEYS,
  getServerOrgContext: (...a: unknown[]) => getServerOrgContext(...(a as [])),
  hasOrgAdminOrPermission: jest.fn(async () => false),
  readOrgBody: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').readOrgBody,
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import { NextRequest } from 'next/server';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { GET as bootstrap } from '@/app/api/pos/display/bootstrap/route';
import { POST as heartbeat } from '@/app/api/pos/display/heartbeat/route';
import { POST as revoke } from '@/app/api/pos/display/revoke/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetSecretReports } from '@/lib/security/secrets';
import {
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_RATE_LIMIT,
  REALTIME_JWT_FORBIDDEN_CLAIMS,
  decodeJwtPayload,
  hashDisplayToken,
  verifyJwtSignature,
} from '@/lib/pos/display/server/displayTokens';
import { displayChannelName } from '@/lib/pos/display/transport';

function secret(overrides: Partial<SecretRow> = {}): SecretRow {
  return {
    terminal_id: T1,
    organization_id: 120,
    pairing_code: CODE1,
    pairing_code_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    display_token_hash: null,
    ...overrides,
  };
}
function terminal(overrides: Partial<TerminalRow> = {}): TerminalRow {
  return { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, ...overrides };
}

function pairReq(body: unknown, ip = '203.0.113.10') {
  return pair(
    new NextRequest('http://localhost/api/pos/display/pair', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    }),
  );
}
const bootstrapReq = (headers: Record<string, string>) => bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers }));
const heartbeatReq = (headers: Record<string, string>, body?: unknown) =>
  heartbeat(
    new NextRequest('http://localhost/api/pos/display/heartbeat', {
      method: 'POST',
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const bearer = (token: string) => ({ authorization: `Bearer ${token}`, 'x-forwarded-for': '198.51.100.7' });

async function canjear(code: string, ip = '203.0.113.10'): Promise<string> {
  const res = await pairReq({ code }, ip);
  expect(res.status).toBe(200);
  return (await res.json()).data.token as string;
}

beforeEach(() => {
  _resetRateLimits();
  _resetSecretReports();
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  serviceDb = makeSupabaseDouble(serviceResponder);
  sessionDb = makeSupabaseDouble((call) => {
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call));
    return { data: row ? { id: row.id } : null, error: null };
  });
  state.secrets = [secret(), secret({ terminal_id: T2, organization_id: 300, pairing_code: CODE2 })];
  state.terminals = [terminal(), terminal({ id: T2, organization_id: 300, branch_id: 9, name: 'Caja 9', code: 'CAJA-9' })];
  state.orgs = {
    120: { id: 120, name: 'Una tienda de calzado', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' },
    300: { id: 300, name: 'Una cafetería', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' },
  };
  session.organizationId = 120;
  getServerOrgContext.mockReset();
  getServerOrgContext.mockImplementation(async () => session);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SUPABASE_JWT_SECRET;
});

// ---------------------------------------------------------------------------

describe('ataque · la organización nunca sale del cliente', () => {
  it('/pair ignora organization_id, terminalId y cualquier otra clave del body', async () => {
    const res = await pairReq({
      code: CODE1,
      organization_id: 300,
      organizationId: 300,
      terminalId: T2,
      terminal_id: T2,
      branch_id: 999,
      display_token_hash: 'x',
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    // La terminal sale de la FILA del código, no del body.
    expect(data.terminalId).toBe(T1);
    // Ninguna consulta se filtró por lo que traía el body.
    const filtros = JSON.stringify(serviceDb.calls.map((c) => c.filters));
    expect(filtros).not.toContain('300');
    expect(filtros).not.toContain(T2);
    // El token quedó en la terminal del código, no en la ajena.
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(data.token));
    expect(state.secrets[1].display_token_hash).toBeNull();
  });

  it('/heartbeat con un body que pide otra organización: el body ni se lee, la terminal sale del token', async () => {
    const token = await canjear(CODE1);
    const res = await heartbeatReq(bearer(token), { organization_id: 300, terminalId: T2 });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.terminalId).toBe(T1);
    // Solo se tocó la terminal del token, filtrando también por SU organización.
    const update = serviceDb.calls.find((c) => c.table === 'pos_terminals' && c.op === 'update');
    expect(update?.filters).toEqual(expect.arrayContaining([['eq', 'id', T1], ['eq', 'organization_id', 120]]));
    expect(state.terminals[1].display_last_seen_at).toBeNull();
  });

  it('/bootstrap ignora cabeceras de organización: devuelve la de SU terminal', async () => {
    const token = await canjear(CODE2); // terminal T2, organización 300
    const res = await bootstrapReq({ ...bearer(token), 'x-organization-id': '120', 'x-org-id': '120' });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.terminal.id).toBe(T2);
    expect(data.brand.organizationId).toBe(300);
  });

  it('/revoke con una organización ajena en el body → 403 y no escribe', async () => {
    const res = await revoke(
      new NextRequest('http://localhost/api/pos/display/revoke', {
        method: 'POST',
        body: JSON.stringify({ terminalId: T1, organization_id: 300 }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(403);
    expect(serviceDb.calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });
});

describe('ataque · tokens', () => {
  it('token de OTRA terminal: autentica como esa terminal y NUNCA como la primera', async () => {
    const tokenT2 = await canjear(CODE2);
    const res = await bootstrapReq(bearer(tokenT2));
    const { data } = await res.json();
    expect(data.terminal.id).toBe(T2);
    expect(data.realtime.channel).toBe(displayChannelName(T2));
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(payload.pos_terminal_id).toBe(T2);
    expect(verifyJwtSignature(data.realtime.token, JWT_SECRET)).toBe(true);
    for (const claim of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload[claim]).toBeUndefined();
  });

  it('token revocado (/revoke) deja de valer en bootstrap Y en heartbeat', async () => {
    const token = await canjear(CODE1);
    expect((await bootstrapReq(bearer(token))).status).toBe(200);
    const rev = await revoke(
      new NextRequest('http://localhost/api/pos/display/revoke', {
        method: 'POST',
        body: JSON.stringify({ terminalId: T1 }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(rev.status).toBe(200);
    expect((await bootstrapReq(bearer(token))).status).toBe(401);
    expect((await heartbeatReq(bearer(token))).status).toBe(401);
  });

  it('un segundo canje de la misma terminal invalida el token anterior', async () => {
    const viejo = await canjear(CODE1);
    state.secrets[0].pairing_code = '777777';
    state.secrets[0].pairing_code_expires_at = new Date(Date.now() + 60_000).toISOString();
    const nuevo = await canjear('777777');
    expect(nuevo).not.toBe(viejo);
    expect((await bootstrapReq(bearer(viejo))).status).toBe(401);
    expect((await bootstrapReq(bearer(nuevo))).status).toBe(200);
  });

  it('presentar el HASH guardado (64 hex) no vale como token, y no llega a la base', async () => {
    const token = await canjear(CODE1);
    const antes = serviceDb.calls.length;
    const res = await bootstrapReq(bearer(hashDisplayToken(token)));
    expect(res.status).toBe(401);
    expect(serviceDb.calls.length).toBe(antes); // ni una consulta: la forma no cuadra
  });

  it('cabeceras Authorization torcidas → 401 uniforme', async () => {
    const token = await canjear(CODE1);
    const variantes: Record<string, string>[] = [
      {},
      { authorization: 'Bearer' },
      { authorization: `Basic ${token}` },
      { authorization: `Bearer ${token} ${token}` },
      { authorization: `Bearer ${token.slice(0, 42)}` },
      { authorization: `Bearer ${token}=` },
      { authorization: `Bearer ${token.slice(0, 42)}+` },
    ];
    for (const h of variantes) {
      const res = await bootstrapReq({ ...h, 'x-forwarded-for': '198.51.100.7' });
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('DISPLAY_UNAUTHORIZED');
    }
    // `bearer` en minúsculas SÍ vale (RFC 7235 es insensible a mayúsculas).
    expect((await bootstrapReq({ authorization: `bearer ${token}`, 'x-forwarded-for': '198.51.100.7' })).status).toBe(200);
  });
});

describe('ataque · códigos', () => {
  it('código vencido → 404, sin decir que existía', async () => {
    state.secrets[0].pairing_code_expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await pairReq({ code: CODE1 });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('CODE_INVALID');
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('código de una terminal INACTIVA → 404 y sin token', async () => {
    state.terminals[0].is_active = false;
    const res = await pairReq({ code: CODE1 });
    expect(res.status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('reutilizar un código ya canjeado → 404 y el token anterior sigue valiendo', async () => {
    const token = await canjear(CODE1);
    const res = await pairReq({ code: CODE1 });
    expect(res.status).toBe(404);
    expect((await bootstrapReq(bearer(token))).status).toBe(200);
  });

  it('el mismo código vigente en DOS terminales → 404 (no se elige una al azar)', async () => {
    state.secrets[1].pairing_code = CODE1;
    const res = await pairReq({ code: CODE1 });
    expect(res.status).toBe(404);
    expect(state.secrets.every((s) => s.display_token_hash === null)).toBe(true);
  });

  it('códigos con forma torcida → 400 sin tocar la base', async () => {
    for (const code of ['12345', '1234567', '12 34 56', '12345a', '', null, 42, ['482913'], { code: CODE1 }]) {
      serviceDb.calls.length = 0;
      const res = await pairReq({ code });
      expect(res.status).toBe(400);
      expect(serviceDb.calls).toHaveLength(0);
    }
  });
});

describe('ataque · fuerza bruta del código', () => {
  it('la misma IP agota su cubo y el bloqueo NO consume cupo extra', async () => {
    const ip = '203.0.113.200';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i += 1) {
      const res = await pairReq({ code: '000001' }, ip);
      expect(res.status).toBe(404);
    }
    const bloqueado = await pairReq({ code: '000001' }, ip);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get('Retry-After')).not.toBeNull();
    // Y un código BUENO desde esa IP tampoco pasa mientras dure la ventana.
    expect((await pairReq({ code: CODE1 }, ip)).status).toBe(429);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('rotando la IP se agota el cubo GLOBAL de respaldo', async () => {
    let bloqueos = 0;
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit + 5; i += 1) {
      const res = await pairReq({ code: '000002' }, `198.18.${Math.floor(i / 250)}.${i % 250}`);
      if (res.status === 429) bloqueos += 1;
    }
    expect(bloqueos).toBe(5);
  });
});
