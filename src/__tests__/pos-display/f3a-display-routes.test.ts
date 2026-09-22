/**
 * Fase 3, parte A · rutas de la pantalla remota (PLAN §7 y §11):
 * POST /api/pos/display/pair (sin sesión, rate limit por IP),
 * GET  /api/pos/display/bootstrap (token), POST /heartbeat (token),
 * POST /revoke (sesión admin), y la exclusión en el middleware.
 *
 * El service-role va doblado (`makeSupabaseDouble`); el rate limit es el
 * REAL en memoria (`_resetRateLimits` entre casos; store persistente nulo).
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import * as fs from 'fs';
import * as path from 'path';
import { makeSupabaseDouble, eqValue, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CODE = '482913';
/** 32+ caracteres y sin palabras de relleno: pasa `readRealSecret`. */
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
  org: Record<string, unknown> | null;
  settings: unknown;
  currencies: Array<{ currency_code: string; is_base: boolean }>;
  fail: Set<string>;
} = { secrets: [], terminals: [], org: null, settings: undefined, currencies: [], fail: new Set() };

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

/**
 * Embed `pos_terminals!inner(...)` de /pair: la fila de secretos se enriquece con
 * las columnas `pos_terminals.<col>` (para los filtros con punto) y, si se pidió
 * el embed, el resultado lleva `pos_terminals` anidado; `!inner` descarta las
 * filas sin terminal.
 */
function joinTerminal(row: SecretRow): Record<string, unknown> {
  const t = state.terminals.find((x) => x.id === row.terminal_id);
  return { ...row, 'pos_terminals.id': t?.id, 'pos_terminals.organization_id': t?.organization_id, 'pos_terminals.is_active': t?.is_active, pos_terminals: t ? { id: t.id, organization_id: t.organization_id, is_active: t.is_active } : null };
}

function serviceResponder(call: RecordedCall) {
  if (state.fail.has(call.table)) return { data: null, error: { message: 'boom' } };
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
  if (call.table === 'organizations') return { data: state.org, error: null };
  if (call.table === 'organization_settings') return { data: state.settings === undefined ? null : { settings: state.settings }, error: null };
  if (call.table === 'organization_currencies') return { data: [...state.currencies].sort((a, b) => Number(b.is_base) - Number(a.is_base)).slice(0, call.limit ?? 1), error: null };
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
  HEARTBEAT_WRITE_INTERVAL_MS,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT_KEY,
  PAIR_GLOBAL_SLOW_RATE_LIMIT,
  PAIR_RATE_LIMIT,
  REALTIME_JWT_PAYLOAD_KEYS,
  REALTIME_JWT_TTL_SECONDS,
  decodeJwtPayload,
  hashDisplayToken,
  verifyJwtSignature,
} from '@/lib/pos/display/server/displayTokens';
import { DEFAULT_CUSTOMER_DISPLAY_SETTINGS } from '@/lib/pos/display/settingsSchema';

function liveSecret(overrides: Partial<SecretRow> = {}): SecretRow {
  return {
    terminal_id: T1,
    organization_id: 120,
    pairing_code: CODE,
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
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const bootstrapReq = (token?: string) => bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: bearer(token) }));
const heartbeatReq = (token?: string) => heartbeat(new NextRequest('http://localhost/api/pos/display/heartbeat', { method: 'POST', headers: bearer(token) }));
function revokeReq(body: unknown, query = '') {
  return revoke(new NextRequest(`http://localhost/api/pos/display/revoke${query}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

/** Empareja de verdad por la ruta y devuelve el token en claro. */
async function pairOk(): Promise<string> {
  state.secrets = [liveSecret()];
  const res = await pairReq({ code: CODE });
  expect(res.status).toBe(200);
  const { data } = await res.json();
  return data.token as string;
}

beforeEach(() => {
  _resetRateLimits();
  _resetSecretReports();
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  serviceDb = makeSupabaseDouble(serviceResponder);
  sessionDb = makeSupabaseDouble((call) => {
    if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call));
    return { data: row ? { id: row.id } : null, error: null };
  });
  state.secrets = [liveSecret()];
  state.terminals = [terminal()];
  state.org = { id: 120, name: 'Una tienda de calzado', logo_url: 'https://cdn.example/logo.png', primary_color: '#123456', secondary_color: null, timezone: 'America/Bogota' };
  state.settings = { enabled: true, tips: { enabled: true, presets: [10, 5, 15], allowCustom: false }, locale: 'en-US', touch: 'touch' };
  state.currencies = [{ currency_code: 'USD', is_base: false }, { currency_code: 'COP', is_base: true }];
  state.fail = new Set();
  session.roleId = 2;
  getServerOrgContext.mockReset();
  getServerOrgContext.mockImplementation(async () => session);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SUPABASE_JWT_SECRET;
});

describe('POST /api/pos/display/pair', () => {
  it('código vigente → 200 con token (una sola vez), guarda SOLO el sha256 y borra el código', async () => {
    const token = await pairOk();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = state.secrets[0];
    expect(row.display_token_hash).toBe(hashDisplayToken(token));
    expect(row.pairing_code).toBeNull();
    expect(row.pairing_code_expires_at).toBeNull();
    // El token en claro nunca viaja a la base.
    expect(JSON.stringify(serviceDb.calls)).not.toContain(token);
    // El canje es atómico: el UPDATE exige el código en el WHERE.
    const update = serviceDb.calls.find((c) => c.op === 'update');
    expect(update?.filters).toEqual(expect.arrayContaining([['eq', 'terminal_id', T1], ['eq', 'pairing_code', CODE]]));
    expect(update?.returning).toBe('terminal_id');
  });

  it('un segundo canje del mismo código → 404 (ya se borró)', async () => {
    await pairOk();
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('CODE_INVALID');
  });

  it('inexistente, vencido, terminal inactiva y código duplicado → el MISMO 404, sin filtrar cuál', async () => {
    const bodies: unknown[] = [];
    const collect = async (res: Response) => {
      expect(res.status).toBe(404);
      bodies.push(await res.json());
    };
    await collect(await pairReq({ code: '000000' }));
    state.secrets = [liveSecret({ pairing_code_expires_at: new Date(Date.now() - 1000).toISOString() })];
    await collect(await pairReq({ code: CODE }));
    state.secrets = [liveSecret()];
    state.terminals = [terminal({ is_active: false })];
    await collect(await pairReq({ code: CODE }));
    // Código duplicado en DOS terminales activas (el embed `!inner` ya descarta las inactivas).
    state.terminals = [terminal(), terminal({ id: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', code: 'CAJA-2' })];
    state.secrets = [liveSecret(), liveSecret({ terminal_id: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee' })];
    await collect(await pairReq({ code: CODE }));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    // Ninguno escribió el hash.
    expect(serviceDb.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('sin oráculo de tiempo: inexistente, vencido y terminal inactiva cuestan UNA consulta (embed !inner por activa); el UPDATE repite la caducidad', async () => {
    const queries = () => serviceDb.calls.length;
    await pairReq({ code: '000000' });
    expect(queries()).toBe(1);
    state.terminals = [terminal({ is_active: false })];
    await pairReq({ code: CODE });
    expect(queries()).toBe(2);
    const lookup = serviceDb.calls[1];
    expect(lookup.op).toBe('select');
    expect(lookup.columns).toContain('pos_terminals!inner(');
    expect(lookup.filters).toEqual(expect.arrayContaining([['eq', 'pos_terminals.is_active', true]]));
    state.terminals = [terminal()];
    state.secrets = [liveSecret({ pairing_code_expires_at: new Date(Date.now() - 1000).toISOString() })];
    await pairReq({ code: CODE });
    expect(queries()).toBe(3);
    // Canje válido: SELECT + UPDATE, y el UPDATE exige la caducidad en el WHERE.
    await pairOk();
    const update = serviceDb.calls.find((c) => c.op === 'update')!;
    expect(update.filters.some(([op, col]) => op === 'gt' && col === 'pairing_code_expires_at')).toBe(true);
    expect(queries()).toBe(5);
  });

  it('body sin código de 6 dígitos → 400; JSON roto → 400; sin tocar la base', async () => {
    expect((await pairReq({ code: '12345' })).status).toBe(400);
    expect((await pairReq({ code: 123456 })).status).toBe(400);
    expect((await pairReq({})).status).toBe(400);
    expect((await pairReq('{no json')).status).toBe(400);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('no acepta terminal ni organización del cliente: la organización sale de la fila', async () => {
    state.secrets = [liveSecret({ organization_id: 120 })];
    const res = await pairReq({ code: CODE, organization_id: 999, terminalId: 'otra' });
    expect(res.status).toBe(200);
    expect(state.secrets[0].organization_id).toBe(120);
  });

  it('rate limit: 10 intentos por IP en 15 min; el 11.º → 429 con Retry-After; otra IP sigue; el bloqueado no consume', async () => {
    expect(PAIR_RATE_LIMIT).toMatchObject({ limit: 10, windowMs: 15 * 60 * 1000 });
    for (let i = 0; i < 10; i++) {
      expect((await pairReq({ code: '000000' })).status).toBe(404);
    }
    const blocked = await pairReq({ code: CODE });
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // Bloqueado ANTES de mirar el código: el código sigue vigente y otra IP lo canjea.
    expect(state.secrets[0].pairing_code).toBe(CODE);
    const other = await pairReq({ code: CODE }, '198.51.100.7');
    expect(other.status).toBe(200);
  });

  it('base caída → 503, no 404 (no confundir con código inválido)', async () => {
    state.fail.add('pos_terminal_secrets');
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(503);
  });

  // F3-B ronda 4 (· 1 y · 2): 120 → 60. El análisis se rehízo sobre el
  // CONJUNTO de códigos vivos (probabilidad N / 10^6 por intento, no 1 / 10^6)
  // y el techo se fijó en consecuencia; ver `PAIR_GLOBAL_RATE_LIMIT`.
  it('cubo GLOBAL de respaldo (ronda 3, qa medio 3): 60 canjes por minuto en todo el despliegue aunque cada intento rote x-forwarded-for', async () => {
    expect(PAIR_GLOBAL_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60 * 1000 });
    expect(PAIR_GLOBAL_RATE_LIMIT_KEY).toBe('pos-display:pair:global');
    const rotatingIp = (i: number) => `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i++) {
      expect((await pairReq({ code: '000000' }, rotatingIp(i))).status).toBe(404);
    }
    // Con el cubo global agotado, un código EQUIVOCADO ya no pasa: 429 (F3-B
    // ronda 3 · 4). Pero cada uno gasta una plaza del carril lento, que es por
    // donde esta ronda (5 · 4) deja entrar a quien sí acierta.
    for (let i = 0; i < PAIR_GLOBAL_SLOW_RATE_LIMIT.limit; i++) {
      expect((await pairReq({ code: '000000' }, rotatingIp(200 + i))).status).toBe(429);
    }
    const queries = serviceDb.calls.length;
    // Agotados los dos, ni el código BUENO toca la base; el código sigue vigente.
    const blocked = await pairReq({ code: CODE }, '198.51.100.200');
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(serviceDb.calls.length).toBe(queries);
    expect(state.secrets[0].pairing_code).toBe(CODE);
  });

  it('el abuso de terceros no apaga el emparejamiento: con el global agotado, el código BUENO pasa por el carril lento (ronda 5 · 4)', async () => {
    const rotatingIp = (i: number) => `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i++) {
      expect((await pairReq({ code: '000000' }, rotatingIp(i))).status).toBe(404);
    }
    const ok = await pairReq({ code: CODE }, '198.51.100.201');
    expect(ok.status).toBe(200);
    expect(state.secrets[0].display_token_hash).not.toBeNull();
  });

  it('los dos cubos se evalúan juntos: un bloqueo por IP no consume el global', async () => {
    const ip = '203.0.113.77';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) await pairReq({ code: '000000' }, ip);
    for (let i = 0; i < 5; i++) expect((await pairReq({ code: '000000' }, ip)).status).toBe(429);
    // El global lleva exactamente 10 hits (los bloqueados por IP no cuentan): quedan 50 para el resto.
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit - PAIR_RATE_LIMIT.limit; i++) {
      expect((await pairReq({ code: '000000' }, `10.1.${Math.floor(i / 250)}.${(i % 250) + 1}`)).status).toBe(404);
    }
    expect((await pairReq({ code: '000000' }, '10.9.9.9')).status).toBe(429);
  });
});

describe('GET /api/pos/display/bootstrap', () => {
  it('token válido → marca, ajustes validados, locale, moneda base y JWT de Realtime del canal de ESA terminal; sin datos de ventas', async () => {
    const token = await pairOk();
    const res = await bootstrapReq(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { data } = await res.json();
    expect(Object.keys(data).sort()).toEqual(['brand', 'currency', 'locale', 'realtime', 'settings', 'terminal']);
    expect(data.terminal).toEqual({ id: T1, name: 'Caja 1', code: 'CAJA-1', branchId: 7 });
    expect(data.brand).toEqual({ organizationId: 120, name: 'Una tienda de calzado', logoUrl: 'https://cdn.example/logo.png', primaryColor: '#123456', secondaryColor: null, timezone: 'America/Bogota' });
    expect(data.settings).toMatchObject({ enabled: true, tips: { enabled: true, presets: [5, 10, 15], allowCustom: false }, locale: 'en-US', touch: 'touch' });
    expect(data.locale).toBe('en');
    expect(data.currency).toBe('COP');
    expect(data.realtime.channel).toBe(`pos-display:${T1}`);
    expect(verifyJwtSignature(data.realtime.token, JWT_SECRET)).toBe(true);
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(payload).toMatchObject({ role: 'anon', pos_terminal_id: T1 });
    // Guardarraíl (ronda 3, qa crítico 1): conjunto EXACTO de claves, sin organization_id.
    expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
    expect(payload).not.toHaveProperty('organization_id');
    expect(Number(payload.exp) - Number(payload.iat)).toBe(REALTIME_JWT_TTL_SECONDS);
    expect(new Date(data.realtime.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(data.realtime.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
    // Todo lo que se leyó fue de la organización de la terminal (de la fila).
    for (const c of serviceDb.calls.filter((c) => ['organizations', 'organization_settings', 'organization_currencies'].includes(c.table))) {
      expect(eqValue(c, c.table === 'organizations' ? 'id' : 'organization_id')).toBe(120);
    }
  });

  it('sin fila de ajustes ni moneda → valores por defecto (apagado), COP y locale por defecto; zona horaria inválida → America/Bogota', async () => {
    const token = await pairOk();
    state.settings = undefined;
    state.currencies = [];
    state.org = { ...state.org, timezone: 'Marte/Olympus' };
    const { data } = await (await bootstrapReq(token)).json();
    expect(data.settings).toEqual(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    expect(data.currency).toBe('COP');
    expect(data.locale).toBe('es');
    expect(data.brand.timezone).toBe('America/Bogota');
  });

  it('sin token, token inválido o revocado → 401 uniforme', async () => {
    expect((await bootstrapReq()).status).toBe(401);
    expect((await bootstrapReq('a'.repeat(43))).status).toBe(401);
    const token = await pairOk();
    state.secrets[0].display_token_hash = null;
    const res = await bootstrapReq(token);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('DISPLAY_UNAUTHORIZED');
  });

  it('sin SUPABASE_JWT_SECRET (o con relleno) → 503 REALTIME_NOT_CONFIGURED, nunca un token sin firmar', async () => {
    const token = await pairOk();
    delete process.env.SUPABASE_JWT_SECRET;
    let res = await bootstrapReq(token);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('REALTIME_NOT_CONFIGURED');
    process.env.SUPABASE_JWT_SECRET = 'your-supabase-jwt-secret';
    res = await bootstrapReq(token);
    expect(res.status).toBe(503);
  });

  it('organización ilegible → 503', async () => {
    const token = await pairOk();
    state.fail.add('organizations');
    expect((await bootstrapReq(token)).status).toBe(503);
  });
});

describe('POST /api/pos/display/heartbeat', () => {
  it('token válido → escribe display_last_seen_at de ESA terminal y organización, y devuelve el JWT de Realtime renovado', async () => {
    const token = await pairOk();
    const res = await heartbeatReq(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { data } = await res.json();
    expect(Object.keys(data).sort()).toEqual(['at', 'realtime', 'terminalId']);
    expect(data.terminalId).toBe(T1);
    expect(state.terminals[0].display_last_seen_at).toBe(data.at);
    const update = serviceDb.calls.find((c) => c.table === 'pos_terminals' && c.op === 'update');
    expect(update?.payload).toEqual({ display_last_seen_at: data.at });
    expect(eqValue(update!, 'id')).toBe(T1);
    expect(eqValue(update!, 'organization_id')).toBe(120);
    // Renovación del JWT (ronda 3, qa alto 2): mismo canal, firma válida, 5 min, mismas claves que en /bootstrap.
    expect(data.realtime.channel).toBe(`pos-display:${T1}`);
    expect(verifyJwtSignature(data.realtime.token, JWT_SECRET)).toBe(true);
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
    expect(payload).toMatchObject({ role: 'anon', pos_terminal_id: T1 });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(REALTIME_JWT_TTL_SECONDS);
    expect(new Date(data.realtime.expiresAt).getTime()).toBe(Number(payload.exp) * 1000);
  });

  it('no escribe si el latido anterior tiene menos de 30 s (condición en el WHERE, sin lectura extra; ronda 3, qa bajo 5)', async () => {
    expect(HEARTBEAT_WRITE_INTERVAL_MS).toBe(30 * 1000);
    const token = await pairOk();
    const first = await (await heartbeatReq(token)).json();
    const at1 = state.terminals[0].display_last_seen_at;
    expect(at1).toBe(first.data.at);
    // 50 latidos seguidos: todos 200 (con JWT), UN solo UPDATE efectivo, y el WHERE lleva la condición.
    for (let i = 0; i < 50; i++) {
      const res = await heartbeatReq(token);
      expect(res.status).toBe(200);
      expect(typeof (await res.json()).data.realtime.token).toBe('string');
    }
    expect(state.terminals[0].display_last_seen_at).toBe(at1);
    const updates = serviceDb.calls.filter((c) => c.table === 'pos_terminals' && c.op === 'update');
    expect(updates).toHaveLength(51);
    const orFilter = updates[1].filters.find(([op]) => op === 'or')?.[1] ?? '';
    expect(orFilter).toMatch(/^display_last_seen_at\.is\.null,display_last_seen_at\.lt\.\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/);
    // Un latido viejo (31 s) sí se sobrescribe.
    state.terminals[0].display_last_seen_at = new Date(Date.now() - 31_000).toISOString();
    const late = await (await heartbeatReq(token)).json();
    expect(state.terminals[0].display_last_seen_at).toBe(late.data.at);
  });

  it('sin token o revocado → 401 y no escribe ni renueva; sin secreto JWT → 503 sin escribir', async () => {
    expect((await heartbeatReq()).status).toBe(401);
    const token = await pairOk();
    state.secrets[0].display_token_hash = null;
    const res = await heartbeatReq(token);
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('realtime');
    expect(state.terminals[0].display_last_seen_at).toBeNull();
    state.secrets[0].display_token_hash = hashDisplayToken(token);
    delete process.env.SUPABASE_JWT_SECRET;
    const noSecret = await heartbeatReq(token);
    expect(noSecret.status).toBe(503);
    expect((await noSecret.json()).code).toBe('REALTIME_NOT_CONFIGURED');
    expect(state.terminals[0].display_last_seen_at).toBeNull();
  });
});

describe('POST /api/pos/display/revoke', () => {
  it('admin → borra hash y código; la pantalla deja de autenticar en la siguiente petición', async () => {
    const token = await pairOk();
    expect((await heartbeatReq(token)).status).toBe(200);
    const res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { terminalId: T1, revoked: true } });
    expect(state.secrets[0]).toMatchObject({ display_token_hash: null, pairing_code: null, pairing_code_expires_at: null });
    const update = serviceDb.calls.filter((c) => c.table === 'pos_terminal_secrets' && c.op === 'update').pop();
    expect(eqValue(update!, 'organization_id')).toBe(120);
    expect((await heartbeatReq(token)).status).toBe(401);
    expect((await bootstrapReq(token)).status).toBe(401);
    // Ventana residual (ronda 3, qa alto 2): el último JWT emitido vive como
    // mucho 5 min y ningún latido lo renueva; con TTL de 1 h la tableta
    // revocada seguía en el canal una hora.
    expect(REALTIME_JWT_TTL_SECONDS).toBe(300);
  });

  it('cajero (rol 4) → 403 ADMIN_REQUIRED; sin sesión → 401; nada se toca', async () => {
    const token = await pairOk();
    session.roleId = 4;
    let res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_REQUIRED');
    getServerOrgContext.mockImplementationOnce(async () => {
      throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    });
    res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(401);
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
  });

  it('organización ajena en body/query → 403; terminalId inválido → 400; terminal ajena → 404', async () => {
    expect((await revokeReq({ terminalId: T1, organization_id: 999 })).status).toBe(403);
    expect((await revokeReq({ terminalId: T1 }, '?orgId=999')).status).toBe(403);
    expect((await revokeReq({ terminalId: 'nope' })).status).toBe(400);
    expect((await revokeReq({})).status).toBe(400);
    state.terminals = [terminal({ organization_id: 121 })];
    expect((await revokeReq({ terminalId: T1 })).status).toBe(404);
    expect(serviceDb.calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('middleware', () => {
  it('excluye /api/pos/display/ en skipPatterns y en el matcher (fail-closed por token, no por sesión)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../middleware.ts'), 'utf8');
    expect(src).toMatch(/'\/api\/pos\/display\/',/);
    const matcher = /matcher:\s*\[[\s\S]*?'([^']+)'/.exec(src)?.[1] ?? '';
    // Con barra, igual que el skipPattern: /api/pos/displays-x o /api/pos/display-x NO quedan fuera del middleware.
    expect(matcher).toContain('|api/pos/display/|');
    // Las rutas con sesión de terminales NO se excluyen: siguen pasando por el middleware.
    expect(src).not.toMatch(/'\/api\/pos\/terminals/);
    expect(matcher).not.toContain('api/pos/terminals');
  });
});
