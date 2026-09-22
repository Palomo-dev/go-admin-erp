/**
 * Tester · Fase 3, parte A, ronda 3 — pruebas adversarias sobre lo que cambió
 * en la ronda 3 (PLAN §3.3, §7, §11) y ángulos que las rondas 1-2 no tocaron:
 *
 * - Regla 5 en las rutas por token: organización/terminal en body, query o
 *   cabecera de /heartbeat y /bootstrap se ignoran; todo sale de la fila.
 * - JWT renovado en cada latido: el nuevo `exp` avanza de verdad (no se
 *   devuelve el mismo token cacheado), vive 300 s y nunca lleva claims de
 *   confianza aunque la fila de la terminal traiga campos extra.
 * - El hash que vive en la base (64 hex) NO sirve como token (43 base64url):
 *   una fuga de `pos_terminal_secrets` no da acceso.
 * - /pair: formas «casi válidas» del código (número, salto de línea final,
 *   dígitos Unicode, espacios) → 400 sin base; un intento correcto bloqueado
 *   por el cubo de IP no consume el código (otra IP lo canjea después).
 * - Aislamiento de cubos: agotar el cubo GLOBAL de /pair no toca displayAuth
 *   y viceversa.
 * - Latido con `display_last_seen_at` en el futuro (reloj adelantado): 200 con
 *   JWT y sin escritura (la condición del WHERE lo cubre).
 * - La respuesta de /bootstrap tiene EXACTAMENTE las claves del contrato §7:
 *   nada de ventas.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JWT_SECRET = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-secreto-jwt-tester-r3';

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
  [extra: string]: unknown;
}

const state: { secrets: SecretRow[]; terminals: TerminalRow[] } = { secrets: [], terminals: [] };

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
  return { ...row, 'pos_terminals.id': t?.id, 'pos_terminals.organization_id': t?.organization_id, 'pos_terminals.is_active': t?.is_active, pos_terminals: t ? { id: t.id, organization_id: t.organization_id, is_active: t.is_active } : null };
}

function serviceResponder(call: RecordedCall) {
  if (call.table === 'pos_terminal_secrets') {
    if (call.op === 'upsert') {
      const p = call.payload as Partial<SecretRow>;
      const existing = state.secrets.find((r) => r.terminal_id === p.terminal_id);
      if (existing) Object.assign(existing, p);
      else state.secrets.push({ terminal_id: p.terminal_id!, organization_id: p.organization_id!, display_token_hash: p.display_token_hash ?? null, pairing_code: p.pairing_code ?? null, pairing_code_expires_at: p.pairing_code_expires_at ?? null });
      return { data: null, error: null };
    }
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
  if (call.table === 'organizations') return { data: { id: eqValue(call, 'id'), name: 'Org', logo_url: null, primary_color: '#123456', secondary_color: null, timezone: 'America/Bogota' }, error: null };
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
const hasOrgAdminOrPermission = jest.fn(async () => false);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  ORG_BODY_KEYS: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').ORG_BODY_KEYS,
  getServerOrgContext: (...a: unknown[]) => getServerOrgContext(...(a as [])),
  hasOrgAdminOrPermission: (...a: unknown[]) => hasOrgAdminOrPermission(...(a as [])),
  readOrgBody: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').readOrgBody,
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import { NextRequest } from 'next/server';
import { POST as pairingCode } from '@/app/api/pos/terminals/[id]/pairing-code/route';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { GET as bootstrap } from '@/app/api/pos/display/bootstrap/route';
import { POST as heartbeat } from '@/app/api/pos/display/heartbeat/route';
import { POST as revoke } from '@/app/api/pos/display/revoke/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetSecretReports } from '@/lib/security/secrets';
import {
  DISPLAY_TOKEN_PATTERN,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_RATE_LIMIT,
  REALTIME_JWT_FORBIDDEN_CLAIMS,
  REALTIME_JWT_PAYLOAD_KEYS,
  REALTIME_JWT_TTL_SECONDS,
  decodeJwtPayload,
  generateDisplayToken,
  hashDisplayToken,
  verifyJwtSignature,
} from '@/lib/pos/display/server/displayTokens';

function terminal(overrides: Partial<TerminalRow> = {}): TerminalRow {
  return { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, ...overrides };
}

let ipCounter = 0;
const freshIp = () => `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
function pairReq(body: unknown, ip?: string, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return pair(new NextRequest('http://localhost/api/pos/display/pair', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { ...headers, 'x-forwarded-for': ip ?? freshIp() } }));
}
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const bootstrapReq = (token?: string, extra: { ip?: string; query?: string; headers?: Record<string, string> } = {}) =>
  bootstrap(new NextRequest(`http://localhost/api/pos/display/bootstrap${extra.query ?? ''}`, { headers: { ...bearer(token), ...(extra.ip ? { 'x-forwarded-for': extra.ip } : {}), ...(extra.headers ?? {}) } }));
const heartbeatReq = (token?: string, extra: { ip?: string; query?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  heartbeat(
    new NextRequest(`http://localhost/api/pos/display/heartbeat${extra.query ?? ''}`, {
      method: 'POST',
      body: extra.body === undefined ? undefined : JSON.stringify(extra.body),
      headers: { ...bearer(token), ...(extra.ip ? { 'x-forwarded-for': extra.ip } : {}), ...(extra.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(extra.headers ?? {}) },
    }),
  );
const revokeReq = (body: unknown) => revoke(new NextRequest('http://localhost/api/pos/display/revoke', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const codeReq = (id: string) => pairingCode(new NextRequest(`http://localhost/api/pos/terminals/${id}/pairing-code`, { method: 'POST' }), { params: Promise.resolve({ id }) });

async function generate(id = T1): Promise<string> {
  const res = await codeReq(id);
  expect(res.status).toBe(200);
  return (await res.json()).data.code as string;
}
async function redeem(code: string): Promise<string> {
  const res = await pairReq({ code });
  expect(res.status).toBe(200);
  return (await res.json()).data.token as string;
}
const secretsReads = () => serviceDb.calls.filter((c) => c.table === 'pos_terminal_secrets' && c.op === 'select').length;
const terminalWrites = () => serviceDb.calls.filter((c) => c.table === 'pos_terminals' && c.op === 'update');

beforeEach(() => {
  _resetRateLimits();
  _resetSecretReports();
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  serviceDb = makeSupabaseDouble(serviceResponder);
  sessionDb = makeSupabaseDouble((call) => {
    if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call));
    return { data: row ? { id: row.id, organization_id: row.organization_id, is_active: row.is_active } : null, error: null };
  });
  state.secrets = [];
  state.terminals = [terminal(), terminal({ id: T2, name: 'Caja 2', code: 'CAJA-2' })];
  session.roleId = 2;
  getServerOrgContext.mockReset();
  getServerOrgContext.mockImplementation(async () => session);
  hasOrgAdminOrPermission.mockReset();
  hasOrgAdminOrPermission.mockImplementation(async () => false);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SUPABASE_JWT_SECRET;
});

describe('regla 5 en las rutas por token: nada del cliente decide terminal ni organización', () => {
  it('/heartbeat con body {organization_id: 999, terminalId: T2}, query ?organization_id=999 y cabecera x-organization-id → 200 y escribe SOLO T1 / org 120', async () => {
    const token = await redeem(await generate());
    const res = await heartbeatReq(token, { body: { organization_id: 999, organizationId: 999, terminalId: T2, terminal_id: T2 }, query: '?organization_id=999&terminalId=' + T2, headers: { 'x-organization-id': '999' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.terminalId).toBe(T1);
    const writes = terminalWrites();
    expect(writes).toHaveLength(1);
    expect(eqValue(writes[0], 'id')).toBe(T1);
    expect(eqValue(writes[0], 'organization_id')).toBe(120);
    expect(state.terminals.find((t) => t.id === T2)!.display_last_seen_at).toBeNull();
    expect(decodeJwtPayload(body.data.realtime.token)!.pos_terminal_id).toBe(T1);
  });

  it('/bootstrap con ?organization_id=999&terminalId=T2 y x-organization-id → datos de T1 / org 120; ninguna consulta lleva 999 ni T2', async () => {
    const token = await redeem(await generate());
    const res = await bootstrapReq(token, { query: '?organization_id=999&terminalId=' + T2, headers: { 'x-organization-id': '999' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.terminal.id).toBe(T1);
    expect(body.data.brand.organizationId).toBe(120);
    for (const call of serviceDb.calls) {
      for (const [, , value] of call.filters) {
        expect(value).not.toBe(999);
        expect(value).not.toBe('999');
        expect(value).not.toBe(T2);
      }
    }
  });

  it('el JWT nunca lleva claims de confianza aunque la fila de la terminal traiga organization_id, branch_id y email', async () => {
    state.terminals[0] = terminal({ email: 'caja@ejemplo.test', app_role: 'admin', org_id: 120 });
    const token = await redeem(await generate());
    for (const res of [await bootstrapReq(token), await heartbeatReq(token)]) {
      expect(res.status).toBe(200);
      const jwt = (await res.json()).data.realtime.token as string;
      const payload = decodeJwtPayload(jwt)!;
      expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
      for (const forbidden of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload).not.toHaveProperty(forbidden);
      expect(payload.role).toBe('anon');
      expect(String(payload.sub)).not.toMatch(/^[0-9a-f-]{36}$/);
      expect(verifyJwtSignature(jwt, JWT_SECRET)).toBe(true);
    }
  });
});

describe('JWT de Realtime · renovación real y vida', () => {
  it('cada latido emite un JWT distinto cuyo exp AVANZA con el reloj (no se cachea) y vive exactamente 300 s', async () => {
    const token = await redeem(await generate());
    const t0 = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const first = decodeJwtPayload((await (await heartbeatReq(token)).json()).data.realtime.token)!;
    nowSpy.mockReturnValue(t0 + 60_000);
    const res = await heartbeatReq(token);
    const body = await res.json();
    const second = decodeJwtPayload(body.data.realtime.token)!;
    expect(Number(second.exp) - Number(first.exp)).toBe(60);
    expect(Number(second.exp) - Number(second.iat)).toBe(REALTIME_JWT_TTL_SECONDS);
    expect(REALTIME_JWT_TTL_SECONDS).toBe(300);
    expect(new Date(body.data.realtime.expiresAt).getTime()).toBe(Number(second.exp) * 1000);
    expect(body.data.realtime.channel).toBe(`pos-display:${T1}`);
  });

  it('tras /revoke, ni bootstrap ni heartbeat entregan un JWT nuevo; el último emitido caduca solo (exp ≤ revocación + 300 s)', async () => {
    const token = await redeem(await generate());
    const last = decodeJwtPayload((await (await heartbeatReq(token)).json()).data.realtime.token)!;
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    const hb = await heartbeatReq(token);
    expect(hb.status).toBe(401);
    expect(JSON.stringify(await hb.json())).not.toMatch(/eyJ/);
    expect((await bootstrapReq(token)).status).toBe(401);
    expect(Number(last.exp) * 1000).toBeLessThanOrEqual(Date.now() + REALTIME_JWT_TTL_SECONDS * 1000);
  });
});

describe('fuga de la base: el hash no es el token', () => {
  it('presentar el sha256 (64 hex) guardado en pos_terminal_secrets → 401 sin consultar; el token real sigue valiendo', async () => {
    const token = await redeem(await generate());
    const hash = state.secrets[0].display_token_hash!;
    expect(hash).toHaveLength(64);
    expect(DISPLAY_TOKEN_PATTERN.test(hash)).toBe(false);
    const before = secretsReads();
    expect((await heartbeatReq(hash)).status).toBe(401);
    expect(secretsReads()).toBe(before);
    // Y tampoco recortado a 43 caracteres del alfabeto (forma válida, valor no): consulta y 401.
    expect((await heartbeatReq(hash.slice(0, 43))).status).toBe(401);
    expect(secretsReads()).toBe(before + 1);
    expect(hashDisplayToken(hash.slice(0, 43))).not.toBe(hash);
    expect((await heartbeatReq(token)).status).toBe(200);
  });
});

describe('/pair · formas «casi válidas» y consumo del código', () => {
  it.each([
    ['número 123456', { code: 123456 }],
    ['con salto de línea final', { code: '123456\n' }],
    ['con espacio inicial', { code: ' 123456' }],
    ['dígitos árabes-índicos', { code: '١٢٣٤٥٦' }],
    ['dígitos de ancho completo', { code: '１２３４５６' }],
    ['array de dígitos', { code: ['1', '2', '3', '4', '5', '6'] }],
    ['objeto con toString', { code: { toString: () => '123456' } }],
  ])('%s → 400 sin tocar la base', async (_label, body) => {
    const res = await pairReq(body);
    expect(res.status).toBe(400);
    expect(secretsReads()).toBe(0);
  });

  it('un intento CORRECTO bloqueado por el cubo de IP (429) no consume el código: otra IP lo canjea después', async () => {
    const code = await generate();
    const IP = '203.0.113.9';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) expect((await pairReq({ code: '000000' }, IP)).status).toBe(404);
    const blocked = await pairReq({ code }, IP);
    expect(blocked.status).toBe(429);
    expect(state.secrets[0].pairing_code).toBe(code);
    expect(state.secrets[0].display_token_hash).toBeNull();
    const token = await redeem(code);
    expect((await heartbeatReq(token)).status).toBe(200);
  });

  it('el cubo GLOBAL de /pair agotado no bloquea displayAuth (cubos independientes), y agotar el de fallos de auth no bloquea /pair', async () => {
    const token = await redeem(await generate());
    // El canje CORRECTO ya no consume cubo global (F3-B ronda 3 · 4): solo lo
    // gastan los que fallan, así que hacen falta `limit` fallos para agotarlo.
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i++) expect((await pairReq({ code: '000000' })).status).toBe(404);
    expect((await pairReq({ code: '000000' })).status).toBe(429);
    expect((await heartbeatReq(token, { ip: '203.0.113.50' })).status).toBe(200);
    expect((await bootstrapReq(token, { ip: '203.0.113.50' })).status).toBe(200);
  });
});

describe('/heartbeat · reloj adelantado y contrato de /bootstrap', () => {
  it('display_last_seen_at en el futuro (reloj de la base adelantado) → 200 con JWT y CERO escrituras efectivas', async () => {
    const token = await redeem(await generate());
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    state.terminals[0].display_last_seen_at = future;
    const res = await heartbeatReq(token);
    expect(res.status).toBe(200);
    expect((await res.json()).data.realtime.token).toMatch(/^eyJ/);
    expect(state.terminals[0].display_last_seen_at).toBe(future);
  });

  it('/bootstrap devuelve EXACTAMENTE terminal, brand, settings, locale, currency, realtime; terminal sin organization_id; sin ventas', async () => {
    const token = await redeem(await generate());
    const body = (await (await bootstrapReq(token)).json()).data;
    expect(Object.keys(body).sort()).toEqual(['brand', 'currency', 'locale', 'realtime', 'settings', 'terminal']);
    expect(Object.keys(body.terminal).sort()).toEqual(['branchId', 'code', 'id', 'name']);
    expect(Object.keys(body.realtime).sort()).toEqual(['channel', 'expiresAt', 'token']);
    // Sin datos de ventas ni secretos: se inspeccionan las CLAVES (el JWT en base64 y los flags de ajustes no cuentan).
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    };
    walk({ ...body, realtime: { ...body.realtime, token: null }, settings: null });
    for (const k of keys) expect(k).not.toMatch(/sale|cart|item|price|total|customer|display_token|pairing|hash/i);
  });

  it('token de otra terminal de la MISMA organización: cada uno escribe solo su fila y su JWT lleva su id', async () => {
    const tok1 = await redeem(await generate(T1));
    const tok2 = await redeem(await generate(T2));
    const b1 = (await (await heartbeatReq(tok1)).json()).data;
    const b2 = (await (await heartbeatReq(tok2)).json()).data;
    expect(b1.terminalId).toBe(T1);
    expect(b2.terminalId).toBe(T2);
    expect(decodeJwtPayload(b1.realtime.token)!.pos_terminal_id).toBe(T1);
    expect(decodeJwtPayload(b2.realtime.token)!.pos_terminal_id).toBe(T2);
    expect(b1.realtime.token).not.toBe(b2.realtime.token);
    expect(state.terminals[0].display_last_seen_at).not.toBeNull();
    expect(state.terminals[1].display_last_seen_at).not.toBeNull();
    // Un token al azar con forma válida no cae en ninguna de las dos.
    expect((await heartbeatReq(generateDisplayToken())).status).toBe(401);
  });
});
