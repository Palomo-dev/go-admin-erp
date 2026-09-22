/**
 * Fase 3, parte C · TESTER ronda 2 — rutas (SEGURIDAD).
 *
 * Se intenta romper el emparejamiento por donde entra el cliente:
 * - token inválido, revocado, de otra terminal, con forma de hash;
 * - código caducado, ya canjeado, canjeado dos veces, de terminal inactiva;
 * - `organization_id` en el body y en la QUERY de las rutas con sesión;
 * - fuerza bruta del código (cubo por IP y cubo global);
 * - el código VIGENTE que `{ reuse: true }` devuelve: que sea el de ESTA
 *   terminal y esta organización, y que no alargue su propia caducidad;
 * - cupo del emisor de códigos.
 *
 * Dobles: service-role y cliente de sesión falsos (f3a-supabaseDouble); el
 * rate limit es el REAL en memoria.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

/** Terminal de la organización de la sesión (120). */
const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
/** Otra terminal de la MISMA organización. */
const T2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
/** Terminal de OTRA organización (145). */
const AJENA = 'cccccccc-dddd-4eee-8fff-000000000000';
const CODE = '482913';
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
    if (call.op === 'update' || call.op === 'upsert') {
      if (call.op === 'upsert') {
        const id = (call.payload as { terminal_id?: string })?.terminal_id;
        const existente = state.secrets.find((r) => r.terminal_id === id);
        if (existente) Object.assign(existente, call.payload);
        else state.secrets.push(Object.assign({ terminal_id: '', organization_id: 0, pairing_code: null, pairing_code_expires_at: null, display_token_hash: null }, call.payload) as SecretRow);
      } else {
        for (const r of rows) Object.assign(r, call.payload);
      }
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
    // La ruta filtra por el `organization_id` de la terminal AUTENTICADA: el doble lo devuelve tal cual.
    const pedida = call.filters.find(([op, col]) => op === 'eq' && col === 'id')?.[2];
    return { data: { id: pedida, name: 'Una tienda de calzado', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' }, error: null };
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
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  ORG_BODY_KEYS: jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody').ORG_BODY_KEYS,
  getServerOrgContext: jest.fn(async () => session),
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
import { POST as pairingCode } from '@/app/api/pos/terminals/[id]/pairing-code/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetSecretReports } from '@/lib/security/secrets';
import {
  PAIRING_CODE_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_SLOW_RATE_LIMIT,
  PAIR_RATE_LIMIT,
  REALTIME_JWT_FORBIDDEN_CLAIMS,
  decodeJwtPayload,
  hashDisplayToken,
} from '@/lib/pos/display/server/displayTokens';

function secret(overrides: Partial<SecretRow> = {}): SecretRow {
  return { terminal_id: T1, organization_id: 120, pairing_code: CODE, pairing_code_expires_at: new Date(Date.now() + 4 * 60_000).toISOString(), display_token_hash: null, ...overrides };
}
function terminal(overrides: Partial<TerminalRow> = {}): TerminalRow {
  return { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, ...overrides };
}

function pairReq(body: unknown, ip = '203.0.113.10') {
  return pair(new NextRequest('http://localhost/api/pos/display/pair', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } }));
}
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const bootstrapReq = (token?: string) => bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: bearer(token) }));
const heartbeatReq = (token?: string) => heartbeat(new NextRequest('http://localhost/api/pos/display/heartbeat', { method: 'POST', headers: bearer(token) }));
function revokeReq(body: unknown, query = '') {
  return revoke(new NextRequest(`http://localhost/api/pos/display/revoke${query}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}
function codeReq(id: string, body?: unknown, query = '') {
  const req = new NextRequest(`http://localhost/api/pos/terminals/${id}/pairing-code${query}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
  return pairingCode(req, { params: Promise.resolve({ id }) });
}

/** Empareja de verdad por la ruta y devuelve el token en claro. */
async function pairOk(code = CODE): Promise<string> {
  const res = await pairReq({ code });
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
    return { data: row ? { id: row.id, organization_id: row.organization_id, is_active: row.is_active } : null, error: null };
  });
  state.secrets = [secret()];
  state.terminals = [terminal(), terminal({ id: T2, code: 'CAJA-2' }), terminal({ id: AJENA, organization_id: 145, code: 'CAJA-X' })];
  session.roleId = 2;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/pos/display/pair · el código', () => {
  it('canjeado DOS veces: el segundo intento es 404 y el token del primero sigue siendo el único', async () => {
    const token = await pairOk();
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
    const segundo = await pairReq({ code: CODE });
    expect(segundo.status).toBe(404);
    expect((await segundo.json()).code).toBe('CODE_INVALID');
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
  });

  it('caducado un milisegundo antes: 404, con el mismo cuerpo que uno inexistente (sin oráculo de tiempo)', async () => {
    state.secrets = [secret({ pairing_code_expires_at: new Date(Date.now() - 1).toISOString() })];
    const vencido = await pairReq({ code: CODE });
    const inexistente = await pairReq({ code: '000001' });
    expect(vencido.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await vencido.json()).toEqual(await inexistente.json());
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('de una terminal DESACTIVADA: 404 y no se escribe hash', async () => {
    state.terminals = [terminal({ is_active: false })];
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('`organization_id` y `terminalId` en el body se IGNORAN: la organización sale de la fila', async () => {
    const res = await pairReq({ code: CODE, organization_id: 145, organizationId: 145, terminalId: AJENA });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.terminalId).toBe(T1); // no la ajena que pidió el cliente
    // Y el hash quedó en la fila de T1, no en la de la organización 145.
    expect(state.secrets.find((s) => s.terminal_id === T1)?.display_token_hash).toBeTruthy();
  });

  it('fuerza bruta: agotado el cubo por IP, el siguiente intento es 429 SIN tocar la base', async () => {
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) {
      const res = await pairReq({ code: String(100000 + i) });
      expect(res.status).toBe(404);
    }
    const antes = serviceDb.calls.length;
    const res = await pairReq({ code: '999999' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(serviceDb.calls.length).toBe(antes);
  });

  it('otra IP no hereda el bloqueo de la primera', async () => {
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) await pairReq({ code: String(100000 + i) }, '203.0.113.10');
    expect((await pairReq({ code: '999999' }, '203.0.113.10')).status).toBe(429);
    expect((await pairReq({ code: CODE }, '198.51.100.7')).status).toBe(200);
  });

  it('agotado el cubo GLOBAL, un canje CORRECTO sigue pasando por el carril lento (ronda 5 · 4)', async () => {
    let ip = 0;
    let fallos = 0;
    // Cada IP aporta como mucho PAIR_RATE_LIMIT.limit fallos.
    while (fallos < PAIR_GLOBAL_RATE_LIMIT.limit) {
      const res = await pairReq({ code: String(200000 + fallos) }, `198.51.100.${ip % 250}`);
      if (res.status === 404) fallos++;
      else ip++;
      if (ip > 400) throw new Error('no se pudo agotar el cubo global');
    }
    // Antes de esta ronda, un canje CORRECTO desde una IP limpia recibía 429:
    // 60 códigos equivocados por minuto con la IP rotada apagaban el
    // emparejamiento de TODAS las organizaciones. Ahora pasa por el carril lento.
    const res = await pairReq({ code: CODE }, '192.0.2.50');
    expect(res.status).toBe(200);
    expect(state.secrets[0].display_token_hash).not.toBeNull();
  });

  it('el carril lento también tiene techo: agotado, se rechaza sin tocar la base', async () => {
    let ip = 0;
    let fallos = 0;
    while (fallos < PAIR_GLOBAL_RATE_LIMIT.limit) {
      const res = await pairReq({ code: String(200000 + fallos) }, `198.51.100.${ip % 250}`);
      if (res.status === 404) fallos++;
      else ip++;
      if (ip > 400) throw new Error('no se pudo agotar el cubo global');
    }
    // Cada petición que pasa por el carril lento gasta una de sus plazas.
    for (let i = 0; i < PAIR_GLOBAL_SLOW_RATE_LIMIT.limit; i++) {
      expect((await pairReq({ code: '111111' }, `192.0.2.${i + 1}`)).status).toBe(429);
    }
    const antes = serviceDb.calls.length;
    const res = await pairReq({ code: CODE }, '192.0.2.99');
    expect(res.status).toBe(429);
    expect(serviceDb.calls.length).toBe(antes);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });
});

describe('GET /bootstrap y POST /heartbeat · el token', () => {
  it('inexistente, vacío, con forma de hash o el sha256 guardado: 401 uniforme', async () => {
    const token = await pairOk();
    const hash = hashDisplayToken(token);
    for (const malo of [undefined, '', 'x', hash, token.slice(0, -1), `${token}a`]) {
      const res = await bootstrapReq(malo as string | undefined);
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('DISPLAY_UNAUTHORIZED');
    }
    expect((await bootstrapReq(token)).status).toBe(200);
  });

  it('de OTRA terminal solo abre SU terminal: nunca la de la organización vecina', async () => {
    state.secrets = [secret(), secret({ terminal_id: AJENA, organization_id: 145, pairing_code: CODE2 })];
    const tokenAjeno = await pairOk(CODE2);
    const res = await bootstrapReq(tokenAjeno);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.terminal.id).toBe(AJENA);
    expect(data.brand.organizationId).toBe(145);
    // El JWT de Realtime solo vale para el canal de ESA terminal.
    expect(data.realtime.channel).toBe(`pos-display:${AJENA}`);
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(payload.pos_terminal_id).toBe(AJENA);
    for (const prohibido of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload[prohibido]).toBeUndefined();
  });

  it('tras /revoke: 401 en bootstrap y en heartbeat, y el latido ya no renueva el JWT', async () => {
    const token = await pairOk();
    expect((await heartbeatReq(token)).status).toBe(200);
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    expect((await bootstrapReq(token)).status).toBe(401);
    const latido = await heartbeatReq(token);
    expect(latido.status).toBe(401);
    expect(await latido.text()).not.toContain('realtime');
  });

  it('con la terminal desactivada después de emparejar: 401', async () => {
    const token = await pairOk();
    state.terminals = [terminal({ is_active: false })];
    expect((await bootstrapReq(token)).status).toBe(401);
    expect((await heartbeatReq(token)).status).toBe(401);
  });

  it('incoherencia de organización entre las dos tablas: 401 fail-closed', async () => {
    const token = await pairOk();
    state.secrets[0].organization_id = 145; // la terminal sigue en 120
    expect((await bootstrapReq(token)).status).toBe(401);
  });
});

describe('POST /api/pos/display/revoke · la organización sale de la sesión', () => {
  it('`organization_id` ajeno en el BODY: 403 y no se toca nada', async () => {
    const token = await pairOk();
    const res = await revokeReq({ terminalId: T1, organization_id: 145 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
  });

  it('`organization_id` ajeno en la QUERY: 403 (la ruta no depende del middleware para esto)', async () => {
    await pairOk();
    const res = await revokeReq({ terminalId: T1 }, '?organization_id=145');
    expect(res.status).toBe(403);
    expect(state.secrets[0].display_token_hash).toBeTruthy();
  });

  it('terminal de OTRA organización: 404 y ni su hash ni su latido se tocan', async () => {
    state.secrets = [secret({ terminal_id: AJENA, organization_id: 145, pairing_code: null, display_token_hash: 'a'.repeat(64) })];
    state.terminals = [terminal({ id: AJENA, organization_id: 145, display_last_seen_at: '2026-09-22T00:00:00.000Z' })];
    const res = await revokeReq({ terminalId: AJENA });
    expect(res.status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBe('a'.repeat(64));
    expect(state.terminals[0].display_last_seen_at).toBe('2026-09-22T00:00:00.000Z');
  });

  it('un cajero (rol 4, sin permiso) recibe 403 y no revoca', async () => {
    const token = await pairOk();
    session.roleId = 4;
    const res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_REQUIRED');
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
  });

  it('body con claves de más: 400 `INVALID_BODY` (schema estricto)', async () => {
    const res = await revokeReq({ terminalId: T1, revoked: true });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_BODY');
  });
});

describe('POST /api/pos/terminals/[id]/pairing-code · el emisor de códigos', () => {
  it('`organization_id` ajeno en la QUERY: 403 sin emitir código', async () => {
    const res = await codeReq(T1, { reuse: true }, '?organization_id=145');
    expect(res.status).toBe(403);
    expect(state.secrets[0].pairing_code).toBe(CODE);
  });

  it('`{ reuse: true }` devuelve el código de ESTA terminal, no el de la vecina, y no alarga su caducidad', async () => {
    const caduca = state.secrets[0].pairing_code_expires_at;
    state.secrets.push(secret({ terminal_id: T2, pairing_code: CODE2 }));
    const res = await codeReq(T1, { reuse: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ terminalId: T1, code: CODE, reused: true });
    expect(state.secrets[0].pairing_code_expires_at).toBe(caduca);
  });

  it('`{ reuse: true }` sobre una terminal de OTRA organización: 404 y no se filtra su código', async () => {
    state.secrets.push(secret({ terminal_id: AJENA, organization_id: 145, pairing_code: CODE2 }));
    const res = await codeReq(AJENA, { reuse: true });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(CODE2);
  });

  it('`{ reuse: true }` con el código ya VENCIDO emite uno nuevo (no revive el viejo)', async () => {
    state.secrets = [secret({ pairing_code_expires_at: new Date(Date.now() - 1).toISOString() })];
    const res = await codeReq(T1, { reuse: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.reused).toBe(false);
    expect(data.code).not.toBe(CODE);
  });

  it('`{ reuse: true }` NO revive el código de una pantalla ya emparejada (al canjear, el código se borra)', async () => {
    await pairOk();
    const res = await codeReq(T1, { reuse: true });
    const { data } = await res.json();
    expect(data.reused).toBe(false);
    expect(data.code).not.toBe(CODE);
    // Y el hash de la pantalla emparejada sigue intacto: pedir código no desempareja.
    expect(state.secrets[0].display_token_hash).toBeTruthy();
  });

  it('cupo por usuario: agotado, 429 y ninguna escritura más', async () => {
    for (let i = 0; i < PAIRING_CODE_RATE_LIMIT.limit; i++) expect((await codeReq(T1)).status).toBe(200);
    const escrituras = serviceDb.calls.filter((c) => c.table === 'pos_terminal_secrets' && (c.op === 'upsert' || c.op === 'update')).length;
    const res = await codeReq(T1);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(serviceDb.calls.filter((c) => c.table === 'pos_terminal_secrets' && (c.op === 'upsert' || c.op === 'update')).length).toBe(escrituras);
  });

  it('el 403 de un cajero NO consume el cupo del administrador', async () => {
    session.roleId = 4;
    for (let i = 0; i < PAIRING_CODE_RATE_LIMIT.limit + 5; i++) expect((await codeReq(T1)).status).toBe(403);
    session.roleId = 2;
    expect((await codeReq(T1)).status).toBe(200);
  });
});
