/**
 * Tester · Fase 3, parte A, ronda 1 — pruebas adversarias sobre las rutas de
 * servidor y los tokens de la pantalla remota (PLAN §3.3, §7, §11).
 *
 * A diferencia de las suites del builder, aquí las CINCO rutas comparten un
 * mismo estado (secretos, terminales) para recorrer el ciclo completo:
 * generar código → canjear → bootstrap/heartbeat → regenerar → revocar, y
 * comprobar en cada paso qué deja de valer. Además: carrera de canjes, cuerpo
 * con organización ajena en rutas sin sesión, formas raras del código y del
 * token, claims del JWT, y el matcher REAL del middleware convertido a regex.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import * as fs from 'fs';
import * as path from 'path';
import { makeSupabaseDouble, eqValue, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JWT_SECRET = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-secreto-jwt-tester';

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
    // Ronda 3: /heartbeat condiciona el UPDATE con `.or('display_last_seen_at.is.null,…lt.<hace 30 s>')`.
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

/** Service-role con estado: upsert por terminal_id, update con filtros, select con/sin limit. */
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
  if (call.table === 'organizations') return { data: { id: eqValue(call, 'id'), name: 'Org', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' }, error: null };
  if (call.table === 'organization_settings') return { data: { settings: { enabled: true, secretField: 'no-debe-salir', tips: { enabled: true, presets: [10, 20, 30], allowCustom: true, extra: 1 } } }, error: null };
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
import { decodeJwtPayload, hashDisplayToken, signRealtimeJwt, verifyJwtSignature, PAIR_RATE_LIMIT } from '@/lib/pos/display/server/displayTokens';

function terminal(overrides: Partial<TerminalRow> = {}): TerminalRow {
  return { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, ...overrides };
}

let ipCounter = 0;
/** Cada llamada con IP distinta salvo que se pida la misma: el rate limit no contamina otras pruebas. */
function pairReq(body: unknown, ip?: string) {
  return pair(
    new NextRequest('http://localhost/api/pos/display/pair', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` },
    }),
  );
}
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const bootstrapReq = (token?: string, query = '') => bootstrap(new NextRequest(`http://localhost/api/pos/display/bootstrap${query}`, { headers: bearer(token) }));
const heartbeatReq = (token?: string, body?: unknown) =>
  heartbeat(new NextRequest('http://localhost/api/pos/display/heartbeat', { method: 'POST', headers: { ...bearer(token), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
const revokeReq = (body: unknown, query = '') =>
  revoke(new NextRequest(`http://localhost/api/pos/display/revoke${query}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const codeReq = (id: string, body?: unknown, query = '') =>
  pairingCode(
    new NextRequest(`http://localhost/api/pos/terminals/${id}/pairing-code${query}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } }),
    { params: Promise.resolve({ id }) },
  );

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
  session.isSuperAdmin = false;
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

describe('ciclo completo: generar → canjear → usar → regenerar → revocar', () => {
  it('el código vale una vez; regenerar invalida el anterior; canjear el nuevo revoca el token viejo; revocar tumba el nuevo', async () => {
    const code1 = await generate();
    expect(state.secrets).toHaveLength(1);
    expect(state.secrets[0].pairing_code).toBe(code1);

    // Regenerar: el código anterior deja de existir (una sola fila por terminal).
    const code2 = await generate();
    expect(code2).toMatch(/^[0-9]{6}$/);
    expect(state.secrets).toHaveLength(1);
    expect((await pairReq({ code: code1 })).status).toBe(code1 === code2 ? 200 : 404);
    if (code1 === code2) return; // colisión de 1/10^6: la prueba no decide nada más

    const tokenA = await redeem(code2);
    expect(state.secrets[0].pairing_code).toBeNull();
    expect((await bootstrapReq(tokenA)).status).toBe(200);
    expect((await heartbeatReq(tokenA)).status).toBe(200);

    // Generar un código nuevo NO mata la pantalla ya emparejada…
    const code3 = await generate();
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(tokenA));
    expect((await heartbeatReq(tokenA)).status).toBe(200);
    // …pero canjearlo sí: el hash se sustituye y el token viejo queda revocado.
    const tokenB = await redeem(code3);
    expect(tokenB).not.toBe(tokenA);
    expect((await heartbeatReq(tokenA)).status).toBe(401);
    expect((await bootstrapReq(tokenA)).status).toBe(401);
    expect((await heartbeatReq(tokenB)).status).toBe(200);

    // Revocar: el token vigente muere en la siguiente petición y el código pendiente también.
    await generate();
    expect(state.secrets[0].pairing_code).not.toBeNull();
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    expect(state.secrets[0]).toMatchObject({ display_token_hash: null, pairing_code: null, pairing_code_expires_at: null });
    expect((await heartbeatReq(tokenB)).status).toBe(401);
    expect((await bootstrapReq(tokenB)).status).toBe(401);

    // Ningún token en claro pisó la base ni el log de consultas.
    const dump = JSON.stringify(serviceDb.calls);
    expect(dump).not.toContain(tokenA);
    expect(dump).not.toContain(tokenB);
  });

  it('un token de la terminal 1 nunca toca la terminal 2 (heartbeat) ni sirve para su bootstrap', async () => {
    const tokenT1 = await redeem(await generate(T1));
    const tokenT2 = await redeem(await generate(T2));
    expect(tokenT1).not.toBe(tokenT2);
    const res = await heartbeatReq(tokenT1, { terminalId: T2, organization_id: 999 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.terminalId).toBe(T1);
    expect(state.terminals[0].display_last_seen_at).not.toBeNull();
    expect(state.terminals[1].display_last_seen_at).toBeNull();
    const boot = await (await bootstrapReq(tokenT2, '?organization_id=999&terminalId=' + T1)).json();
    expect(boot.data.terminal.id).toBe(T2);
    expect(boot.data.brand.organizationId).toBe(120);
    expect(boot.data.realtime.channel).toBe(`pos-display:${T2}`);
  });

  it('carrera: dos canjes simultáneos del mismo código → exactamente un 200', async () => {
    const code = await generate();
    const results = await Promise.all([pairReq({ code }), pairReq({ code })]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 404]);
  });

  it('desactivar la terminal tumba el token en la siguiente petición; reactivarla lo devuelve (el hash sigue)', async () => {
    const token = await redeem(await generate());
    state.terminals[0].is_active = false;
    expect((await heartbeatReq(token)).status).toBe(401);
    expect((await bootstrapReq(token)).status).toBe(401);
    state.terminals[0].is_active = true;
    expect((await heartbeatReq(token)).status).toBe(200);
  });

  it('secreto cuya organización no coincide con la de la terminal → /pair 404 y, si ya hubiera hash, 401', async () => {
    const code = await generate();
    state.secrets[0].organization_id = 121;
    expect((await pairReq({ code })).status).toBe(404);
    state.secrets[0].organization_id = 120;
    const token = await redeem(code);
    state.secrets[0].organization_id = 121;
    expect((await bootstrapReq(token)).status).toBe(401);
  });
});

describe('/pair · formas del código y del cuerpo', () => {
  it.each([
    ['dígitos fullwidth', '４８２９１３'],
    ['con espacios', ' 482913'],
    ['con salto', '482913\n'],
    ['array', ['482913']],
    ['objeto', { $gt: '' }],
    ['número', 482913],
    ['null', null],
    ['7 dígitos', '4829130'],
  ])('%s → 400 sin tocar la base', async (_label, code) => {
    const res = await pairReq({ code });
    expect(res.status).toBe(400);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('body que es un array o un string JSON → 400', async () => {
    expect((await pairReq(['482913'])).status).toBe(400);
    expect((await pairReq('"482913"')).status).toBe(400);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('código con caducidad nula (fila corrupta) o pasada → 404', async () => {
    const code = await generate();
    state.secrets[0].pairing_code_expires_at = null;
    expect((await pairReq({ code })).status).toBe(404);
    state.secrets[0].pairing_code_expires_at = new Date(Date.now() - 1).toISOString();
    expect((await pairReq({ code })).status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('rate limit: el cubo es por IP (primera de x-forwarded-for); sin cabecera, cubo «unknown» de 5', async () => {
    const ip = '203.0.113.99';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) expect((await pairReq({ code: '000000' }, `${ip}, 10.1.1.1`)).status).toBe(404);
    expect((await pairReq({ code: '000000' }, ip)).status).toBe(429);
    // Cambiar solo el segundo salto no abre otro cubo.
    expect((await pairReq({ code: '000000' }, `${ip}, 10.9.9.9`)).status).toBe(429);
    // Sin cabecera de IP: cubo compartido con límite reducido (5).
    const noIp = () => pair(new NextRequest('http://localhost/api/pos/display/pair', { method: 'POST', body: JSON.stringify({ code: '000000' }), headers: { 'content-type': 'application/json' } }));
    for (let i = 0; i < PAIR_RATE_LIMIT.unknownClientLimit; i++) expect((await noIp()).status).toBe(404);
    expect((await noIp()).status).toBe(429);
  });

  it('un 429 llega ANTES de leer el body: un body roto bloqueado también es 429', async () => {
    const ip = '203.0.113.77';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i++) await pairReq({ code: '000000' }, ip);
    expect((await pairReq('{roto', ip)).status).toBe(429);
  });
});

describe('/bootstrap · lo que sale y lo que no', () => {
  it('los ajustes se filtran por el esquema: claves desconocidas no viajan; el JWT no es de PostgREST con privilegios', async () => {
    const token = await redeem(await generate());
    const { data } = await (await bootstrapReq(token)).json();
    expect(JSON.stringify(data)).not.toContain('secretField');
    expect(JSON.stringify(data.settings)).not.toContain('extra');
    expect(data.settings.tips.presets).toEqual([10, 20, 30]);
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(payload.role).toBe('anon');
    expect(['authenticated', 'service_role']).not.toContain(payload.role);
    // Ronda 3 (qa alto 2): TTL de 5 min, renovado en cada latido.
    expect(Number(payload.exp) - Number(payload.iat)).toBe(300);
    expect(new Date(data.realtime.expiresAt).getTime()).toBe(Number(payload.exp) * 1000);
    // Nada de ventas ni de secretos en la respuesta.
    for (const forbidden of ['sale', 'cart', 'total', 'hash', 'pairing', 'service_role', JWT_SECRET]) {
      expect(JSON.stringify(data).toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('JWT manipulado (cambiar pos_terminal_id o alg=none) no verifica', () => {
    // Ronda 3 (qa crítico 1): el payload ya no lleva organization_id; se manipula el claim que sí existe.
    const { token } = signRealtimeJwt(JWT_SECRET, { terminalId: T1 });
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    payload.pos_terminal_id = T2;
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    expect(verifyJwtSignature(forged, JWT_SECRET)).toBe(false);
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    expect(verifyJwtSignature(none, JWT_SECRET)).toBe(false);
    expect(verifyJwtSignature(token, JWT_SECRET)).toBe(true);
  });

  it('variantes de la cabecera: token en mayúsculas/minúsculas cambiado, con sufijo, en query o en cookie → 401 sin consultar', async () => {
    const token = await redeem(await generate());
    const before = serviceDb.calls.length;
    const swapped = token.split('').map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
    if (swapped !== token) expect((await bootstrapReq(swapped)).status).toBe(401);
    expect((await bootstrap(new NextRequest(`http://localhost/api/pos/display/bootstrap?token=${token}`))).status).toBe(401);
    expect((await bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: { cookie: `token=${token}` } }))).status).toBe(401);
    expect((await bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: { authorization: `Bearer ${token}x` } }))).status).toBe(401);
    expect((await bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: { authorization: `Token ${token}` } }))).status).toBe(401);
    // Solo la variante con mayúsculas cambiadas (forma válida) llegó a la base: una consulta como mucho.
    expect(serviceDb.calls.length - before).toBeLessThanOrEqual(swapped !== token ? 1 : 0);
  });
});

describe('/revoke y /pairing-code · superficie con sesión', () => {
  it('revoke: claves extra → 400 strict; terminalId en la query sin body → 400; organización propia en el body → sigue', async () => {
    await redeem(await generate());
    expect((await revokeReq({ terminalId: T1, force: true })).status).toBe(400);
    expect((await revokeReq({}, `?terminalId=${T1}`)).status).toBe(400);
    expect(state.secrets[0].display_token_hash).not.toBeNull();
    expect((await revokeReq({ terminalId: T1, organization_id: 120 })).status).toBe(200);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('revoke: rol 4 con admin.full_access → 200; rol 4 sin él → 403; terminal de otra organización → 404 sin escribir', async () => {
    await redeem(await generate());
    session.roleId = 4;
    expect((await revokeReq({ terminalId: T1 })).status).toBe(403);
    hasOrgAdminOrPermission.mockImplementation(async () => true);
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    // Terminal ajena: el cliente de sesión (RLS + eq org) no la ve.
    state.terminals.push(terminal({ id: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', organization_id: 121 }));
    const writes = serviceDb.calls.filter((c) => c.op === 'update').length;
    expect((await revokeReq({ terminalId: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee' })).status).toBe(404);
    expect(serviceDb.calls.filter((c) => c.op === 'update')).toHaveLength(writes);
  });

  it('pairing-code: organización propia como string en el body → 200; ajena con clave alternativa (orgId) → 403; sin escribir', async () => {
    expect((await codeReq(T1, { organizationId: '120' })).status).toBe(200);
    const writes = serviceDb.calls.length;
    expect((await codeReq(T1, { orgId: 121 })).status).toBe(403);
    expect((await codeReq(T1, { org_id: '' , organization_id: 999 })).status).toBe(403);
    expect(serviceDb.calls).toHaveLength(writes);
  });

  it('pairing-code: super admin de la sesión 120 no genera código para una terminal de la 121 (404); terminal inactiva → 409 y no se toca el secreto', async () => {
    state.terminals.push(terminal({ id: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', organization_id: 121 }));
    session.isSuperAdmin = true;
    expect((await codeReq('cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee')).status).toBe(404);
    const token = await redeem(await generate());
    state.terminals[0].is_active = false;
    expect((await codeReq(T1)).status).toBe(409);
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
  });

  it('pairing-code: cada código vigente es único entre terminales (colisión regenerada) y siempre caduca en 5 min', async () => {
    const before = Date.now();
    const c1 = await generate(T1);
    const c2 = await generate(T2);
    // Si ambos coinciden, la ruta debió regenerar: comprobamos que el estado nunca tiene dos filas vigentes iguales.
    const live = state.secrets.filter((s) => s.pairing_code !== null).map((s) => s.pairing_code);
    expect(new Set(live).size).toBe(live.length);
    expect(c1).toMatch(/^[0-9]{6}$/);
    expect(c2).toMatch(/^[0-9]{6}$/);
    for (const s of state.secrets) {
      const exp = new Date(s.pairing_code_expires_at!).getTime();
      expect(exp - before).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100);
      expect(exp - before).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
    }
  });
});

describe('middleware · el matcher real', () => {
  it('convertido a regex: /api/pos/display/* NO entra; /api/pos/terminals/** y /pos-display SÍ', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../middleware.ts'), 'utf8');
    const matcher = /matcher:\s*\[[\s\S]*?'([^']+)'/.exec(src)?.[1] ?? '';
    // Sintaxis path-to-regexp `/((?!a|b).*)` → regex JS equivalente.
    const inner = matcher.replace(/^\/\((.*)\)$/, '$1');
    const re = new RegExp(`^/${inner}$`);
    for (const p of ['/api/pos/display/pair', '/api/pos/display/bootstrap', '/api/pos/display/heartbeat', '/api/pos/display/revoke']) {
      expect(re.test(p)).toBe(false);
    }
    for (const p of [`/api/pos/terminals/${T1}/pairing-code`, '/api/pos/terminals', '/pos-display', '/app/pos']) {
      expect(re.test(p)).toBe(true);
    }
    // Hallazgo bajo (tester r1), corregido en la ronda 2: el matcher excluye
    // con barra (`api/pos/display/`), igual que shouldSkipRoute, así que una
    // futura /api/pos/displays-x o /api/pos/display-x SÍ pasa por el middleware.
    expect(re.test('/api/pos/displays-x')).toBe(true);
    expect(re.test('/api/pos/display-x')).toBe(true);
  });

  it('shouldSkipRoute (por prefijo): /api/pos/display/ sí, /api/pos/displays-x no', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../middleware.ts'), 'utf8');
    const body = /function shouldSkipRoute[\s\S]*?const skipPatterns = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
    const patterns = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(patterns).toContain('/api/pos/display/');
    expect(patterns.some((p) => '/api/pos/displays-x'.startsWith(p))).toBe(false);
    expect(patterns.some((p) => `/api/pos/terminals/${T1}/pairing-code`.startsWith(p))).toBe(false);
  });
});

describe('aislamiento de secretos', () => {
  it('ningún componente de navegador ni servicio de cliente consulta pos_terminal_secrets', () => {
    const root = path.resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (!/from\(['"]pos_terminal_secrets['"]\)/.test(text)) continue;
          const rel = path.relative(root, full).replace(/\\/g, '/');
          const allowed = rel.startsWith('app/api/pos/display/') || rel.startsWith('app/api/pos/terminals/') || rel.startsWith('lib/pos/display/server/');
          if (!allowed || /'use client'/.test(text) || /@\/lib\/supabase\/config/.test(text)) offenders.push(rel);
        }
      }
    };
    walk(path.join(root, 'app'));
    walk(path.join(root, 'lib'));
    walk(path.join(root, 'components'));
    expect(offenders).toEqual([]);
  });
});
