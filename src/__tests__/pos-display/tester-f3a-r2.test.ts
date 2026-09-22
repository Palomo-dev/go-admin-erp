/**
 * Tester · Fase 3, parte A, ronda 2 — pruebas adversarias sobre lo que cambió
 * en la ronda 2 (PLAN §3.3, §7, §11) y sobre lo que la ronda 1 no cubrió:
 *
 * - Cubo de FALLOS por IP en displayAuth: 60 × 401 → 429 sin tocar la base;
 *   los aciertos no consumen; el 503 no consume; el cubo `unknown` es de 10;
 *   y el efecto colateral: con el cubo agotado, un token VÁLIDO desde esa
 *   misma IP también recibe 429 (una tableta legítima tras el mismo NAT que
 *   el atacante se queda sin bootstrap/heartbeat durante ese minuto).
 * - Rotar `x-forwarded-for` abre un cubo nuevo por valor: el corte por IP
 *   depende de que el proxy sobreescriba la cabecera.
 * - Revocar NO invalida el JWT de Realtime ya emitido (ningún componente del
 *   servidor lo verifica); PLAN §12 exige «al revocarla deja de recibir en el
 *   siguiente mensaje». Ronda 3 (builder): el hallazgo se convirtió en
 *   afirmación de la corrección: TTL de 5 min y renovación en cada latido, así
 *   la ventana residual queda acotada a <= 5 min y documentada.
 * - Un JWT caducado sigue verificando firma: `verifyJwtSignature` no mira
 *   `exp` y NADIE del servidor lo usa como comprobación (solo diagnóstico).
 * - /pair: carrera de 5 canjes, cuerpo no JSON, token con caracteres fuera
 *   del alfabeto base64url, canje de T1 no toca el hash de T2.
 * - /revoke sin sesión → 401 JSON (la ruta está fuera del middleware).
 * - /bootstrap: secreto JWT de relleno o corto → 503 sin JWT; organización
 *   sin fila → 503 sin filtrar nada; heartbeat sin límite de escrituras
 *   (ronda 3: el UPDATE lleva la condición «nulo o > 30 s» en el WHERE, así
 *   500 latidos son 1 escritura efectiva; el test afirma la corrección).
 * - Ronda 3: el cubo de fallos pasó de 60 a 300/min (protege el coste del
 *   SELECT, no la fuerza bruta); los tests iteran sobre la constante.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JWT_SECRET = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-secreto-jwt-tester-r2';

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

const state: { secrets: SecretRow[]; terminals: TerminalRow[]; orgMissing: boolean; secretsDown: boolean } = { secrets: [], terminals: [], orgMissing: false, secretsDown: false };

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
    if (state.secretsDown) return { data: null, error: { message: 'connection refused' } };
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
  if (call.table === 'organizations') return { data: state.orgMissing ? null : { id: eqValue(call, 'id'), name: 'Org', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' }, error: null };
  if (call.table === 'organization_settings') return { data: null, error: null };
  if (call.table === 'organization_currencies') return { data: [], error: null };
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
import { DISPLAY_AUTH_FAIL_LIMIT } from '@/lib/pos/display/server/displayAuth';
import { PAIR_GLOBAL_RATE_LIMIT, decodeJwtPayload, generateDisplayToken, hashDisplayToken, signRealtimeJwt, verifyJwtSignature } from '@/lib/pos/display/server/displayTokens';

function terminal(overrides: Partial<TerminalRow> = {}): TerminalRow {
  return { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, ...overrides };
}

let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
function pairReq(body: unknown, ip?: string, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return pair(new NextRequest('http://localhost/api/pos/display/pair', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { ...headers, 'x-forwarded-for': ip ?? freshIp() } }));
}
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const bootstrapReq = (token?: string, ip?: string) => bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: { ...bearer(token), ...(ip ? { 'x-forwarded-for': ip } : {}) } }));
const heartbeatReq = (token?: string, ip?: string) => heartbeat(new NextRequest('http://localhost/api/pos/display/heartbeat', { method: 'POST', headers: { ...bearer(token), ...(ip ? { 'x-forwarded-for': ip } : {}) } }));
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
  state.orgMissing = false;
  state.secretsDown = false;
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

describe('displayAuth · cubo de fallos por IP (ronda 2)', () => {
  const IP = '198.51.100.7';

  it('60 tokens al azar → 60 × 401 con una consulta cada uno; el 61.º es 429 sin consulta; otra IP sigue en 401', async () => {
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit; i++) {
      const before = secretsReads();
      expect((await heartbeatReq(generateDisplayToken(), IP)).status).toBe(401);
      expect(secretsReads() - before).toBe(1);
    }
    const before = secretsReads();
    const res = await heartbeatReq(generateDisplayToken(), IP);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^[0-9]+$/);
    expect(secretsReads()).toBe(before);
    // El cubo es por IP: otra IP no está bloqueada y sí consulta.
    expect((await heartbeatReq(generateDisplayToken(), '198.51.100.8')).status).toBe(401);
    expect(secretsReads()).toBe(before + 1);
    // Y bootstrap comparte el mismo cubo que heartbeat (misma IP).
    expect((await bootstrapReq(generateDisplayToken(), IP)).status).toBe(429);
  });

  it('EFECTO COLATERAL (decisión documentada en ronda 3): con el cubo agotado, un token VÁLIDO desde la misma IP también recibe 429 (tableta legítima tras el mismo NAT)', async () => {
    const token = await redeem(await generate());
    expect((await heartbeatReq(token, IP)).status).toBe(200);
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit; i++) await heartbeatReq(generateDisplayToken(), IP);
    // Decisión (ronda 3, qa bajo 4): el peek en memoria corta ANTES de mirar el
    // token; el riesgo queda acotado a la LAN de la tienda y a 60 s por ráfaga,
    // y el límite subió a 300/min. Documentado en displayAuth.ts y F3-A.
    expect(DISPLAY_AUTH_FAIL_LIMIT.limit).toBe(300);
    expect((await heartbeatReq(token, IP)).status).toBe(429);
    expect((await bootstrapReq(token, IP)).status).toBe(429);
    // Desde otra IP el mismo token sigue vivo: el bloqueo es de la IP, no del token.
    expect((await heartbeatReq(token, '198.51.100.9')).status).toBe(200);
  });

  it('los aciertos no consumen cupo: 200 latidos válidos y luego 60 fallos → el 61.º fallo es el primer 429', async () => {
    const token = await redeem(await generate());
    for (let i = 0; i < 200; i++) expect((await heartbeatReq(token, IP)).status).toBe(200);
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit; i++) expect((await heartbeatReq(generateDisplayToken(), IP)).status).toBe(401);
    expect((await heartbeatReq(generateDisplayToken(), IP)).status).toBe(429);
  });

  it('un 401 sin consulta (forma inválida) también consume cupo; un 503 (base caída) no', async () => {
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit; i++) expect((await heartbeatReq('no-es-un-token', IP)).status).toBe(401);
    expect(secretsReads()).toBe(0);
    expect((await heartbeatReq('no-es-un-token', IP)).status).toBe(429);

    const ip2 = '198.51.100.10';
    state.secretsDown = true;
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit + 5; i++) expect((await heartbeatReq(generateDisplayToken(), ip2)).status).toBe(503);
    state.secretsDown = false;
    expect((await heartbeatReq(generateDisplayToken(), ip2)).status).toBe(401);
  });

  it('sin cabecera de IP: cubo compartido «unknown» de 10 fallos', async () => {
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.unknownClientLimit; i++) expect((await heartbeatReq(generateDisplayToken())).status).toBe(401);
    expect((await heartbeatReq(generateDisplayToken())).status).toBe(429);
    expect((await bootstrapReq(generateDisplayToken())).status).toBe(429);
  });

  it('rotar x-forwarded-for abre un cubo por valor: 300 fallos con IP distinta nunca llegan a 429 (el corte depende del proxy; documentado en ronda 3)', async () => {
    for (let i = 0; i < 300; i++) expect((await heartbeatReq(generateDisplayToken(), `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`)).status).toBe(401);
    expect(secretsReads()).toBe(300);
  });

  // F3-B ronda 4 · 1 y · 2: el techo bajó a 60/min al recalcular el riesgo
  // sobre el CONJUNTO de códigos vivos (10^6 / N) en vez de sobre uno solo.
  it('ronda 3: en /pair, rotar x-forwarded-for YA NO es ilimitado: el cubo global corta en PAIR_GLOBAL_RATE_LIMIT por minuto', async () => {
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i++) expect((await pairReq({ code: '000000' })).status).toBe(404);
    expect((await pairReq({ code: '000000' })).status).toBe(429);
  });

  it('token de 43 caracteres con «+», «/» o «=» (base64 clásico) → 401 sin consulta y consume cupo', async () => {
    for (const bad of ['A'.repeat(42) + '+', 'A'.repeat(42) + '/', 'A'.repeat(42) + '=', 'A'.repeat(43) + '.', 'A'.repeat(44)]) {
      expect((await heartbeatReq(bad, '198.51.100.11')).status).toBe(401);
    }
    expect(secretsReads()).toBe(0);
  });
});

describe('/pair · carrera, cuerpo y aislamiento entre terminales', () => {
  it('5 canjes simultáneos del mismo código → exactamente un 200 y un solo hash', async () => {
    const code = await generate();
    const results = await Promise.all(Array.from({ length: 5 }, () => pairReq({ code })));
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(4);
    const token = (await ok[0].json()).data.token as string;
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(token));
    expect(state.secrets[0].pairing_code).toBeNull();
  });

  it('cuerpo form-urlencoded o texto → 400 sin consulta', async () => {
    expect((await pairReq('code=123456', undefined, { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(400);
    expect((await pairReq('123456', undefined, { 'content-type': 'text/plain' })).status).toBe(400);
    expect(serviceDb.calls).toHaveLength(0);
  });

  it('canjear el código de T1 no toca el hash ya emparejado de T2, y el token de T1 no sirve para el latido de T2', async () => {
    const tokenT2 = await redeem(await generate(T2));
    const hashT2 = state.secrets.find((s) => s.terminal_id === T2)!.display_token_hash;
    const tokenT1 = await redeem(await generate(T1));
    expect(state.secrets.find((s) => s.terminal_id === T2)!.display_token_hash).toBe(hashT2);
    expect(tokenT1).not.toBe(tokenT2);
    const res = await heartbeatReq(tokenT1);
    expect((await res.json()).data.terminalId).toBe(T1);
    expect(state.terminals[1].display_last_seen_at).toBeNull();
  });

  it('código vigente de una terminal que se desactivó tras generarlo → 404 y el código sigue sin canjear', async () => {
    const code = await generate();
    state.terminals[0].is_active = false;
    expect((await pairReq({ code })).status).toBe(404);
    expect(state.secrets[0].pairing_code).toBe(code);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });
});

describe('JWT de Realtime · revocación y caducidad', () => {
  it('CORREGIDO (ronda 3): revocar no invalida el JWT ya emitido, pero vive 5 min y el latido (que ya da 401) era quien lo renovaba: ventana residual <= 5 min', async () => {
    const token = await redeem(await generate());
    const { data } = await (await bootstrapReq(token)).json();
    const jwt = data.realtime.token as string;
    // Antes de revocar, cada latido renueva el JWT.
    const beat = await (await heartbeatReq(token)).json();
    expect(verifyJwtSignature(beat.data.realtime.token, JWT_SECRET)).toBe(true);
    expect((await revokeReq({ terminalId: T1 })).status).toBe(200);
    expect((await bootstrapReq(token)).status).toBe(401);
    expect((await heartbeatReq(token)).status).toBe(401);
    // El último JWT sigue firmado (el servidor no puede retirarlo), pero su
    // exp está a <= 5 min: esa es la ventana residual documentada en F3-A.
    expect(verifyJwtSignature(jwt, JWT_SECRET)).toBe(true);
    const payload = decodeJwtPayload(jwt)!;
    expect(Number(payload.exp) * 1000 - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(Number(payload.exp) - Number(payload.iat)).toBe(300);
    expect(payload.pos_terminal_id).toBe(T1);
  });

  it('un JWT caducado sigue verificando firma: verifyJwtSignature no mira exp (solo diagnóstico, nunca autenticación)', () => {
    const { token, expiresAt } = signRealtimeJwt(JWT_SECRET, { terminalId: T1, ttlSeconds: 60, now: Date.now() - 3_600_000 });
    expect(new Date(expiresAt).getTime()).toBeLessThan(Date.now());
    expect(verifyJwtSignature(token, JWT_SECRET)).toBe(true);
    // Firmado con otro secreto (p. ej. otro proyecto) → no verifica.
    const foreign = signRealtimeJwt('otro-secreto-de-otro-proyecto-0123456789', { terminalId: T1 });
    expect(verifyJwtSignature(foreign.token, JWT_SECRET)).toBe(false);
  });

  it('el claim pos_terminal_id es el id de la terminal en minúsculas (la política de la caja solo acepta [0-9a-f])', async () => {
    const token = await redeem(await generate());
    const { data } = await (await bootstrapReq(token)).json();
    const payload = decodeJwtPayload(data.realtime.token)!;
    expect(payload.pos_terminal_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.realtime.channel).toBe(`pos-display:${payload.pos_terminal_id}`);
    expect(payload.sub).toBe(`pos-display:${T1}`);
    expect(payload.aud).toBe('pos-display');
  });
});

describe('/bootstrap y /heartbeat · fallos del servidor y volumen', () => {
  it.each([
    ['relleno', 'your-supabase-jwt-secret-change-me-please-now'],
    ['corto', 'abc123'],
    ['vacío', ''],
  ])('secreto JWT %s → 503 REALTIME_NOT_CONFIGURED, sin consultar la organización ni emitir JWT', async (_l, secret) => {
    const token = await redeem(await generate());
    process.env.SUPABASE_JWT_SECRET = secret;
    const res = await bootstrapReq(token);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('REALTIME_NOT_CONFIGURED');
    expect(JSON.stringify(body)).not.toContain('token');
    expect(serviceDb.calls.some((c) => c.table === 'organizations')).toBe(false);
  });

  it('organización sin fila → 503 uniforme sin datos de la terminal', async () => {
    const token = await redeem(await generate());
    state.orgMissing = true;
    const res = await bootstrapReq(token);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain(T1);
  });

  it('sin ajustes ni moneda: valores por defecto (enabled=false, COP, locale por defecto)', async () => {
    const token = await redeem(await generate());
    const { data } = await (await bootstrapReq(token)).json();
    expect(data.currency).toBe('COP');
    expect(typeof data.locale).toBe('string');
    expect(data.settings).toBeDefined();
  });

  it('CORREGIDO (ronda 3): 500 latidos válidos = 500 × 200 pero UNA sola escritura efectiva (WHERE «nulo o > 30 s»)', async () => {
    const token = await redeem(await generate());
    for (let i = 0; i < 500; i++) expect((await heartbeatReq(token, '198.51.100.20')).status).toBe(200);
    const updates = serviceDb.calls.filter((c) => c.table === 'pos_terminals' && c.op === 'update');
    expect(updates).toHaveLength(500);
    expect(updates.every((u) => u.filters.some(([op, expr]) => op === 'or' && String(expr).startsWith('display_last_seen_at.is.null,display_last_seen_at.lt.')))).toBe(true);
    const at = state.terminals[0].display_last_seen_at!;
    expect(at).not.toBeNull();
    // Solo el primero cambió la fila: el resto encontró un latido de hace < 30 s
    // (varios latidos caen en el mismo milisegundo, así que se compara con el primero, no por unicidad del valor).
    expect(Date.now() - new Date(at).getTime()).toBeLessThan(30_000);
    expect(at).toBe((updates[0].payload as { display_last_seen_at: string }).display_last_seen_at);
    const last = (updates[499].payload as { display_last_seen_at: string }).display_last_seen_at;
    expect(new Date(last).getTime()).toBeGreaterThanOrEqual(new Date(at).getTime());
  });
});

describe('/revoke · sin sesión', () => {
  it('getServerOrgContext lanza 401 → JSON 401, sin tocar secretos (la ruta está fuera del middleware)', async () => {
    await redeem(await generate());
    getServerOrgContext.mockImplementation(async () => {
      throw new OrgContextError('No autenticado', 401);
    });
    const writes = serviceDb.calls.filter((c) => c.op === 'update').length;
    const res = await revokeReq({ terminalId: T1 });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('UNAUTHENTICATED');
    expect(serviceDb.calls.filter((c) => c.op === 'update')).toHaveLength(writes);
    expect(state.secrets[0].display_token_hash).not.toBeNull();
  });
});
