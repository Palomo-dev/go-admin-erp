/**
 * TESTER · Fase 3, parte B — ronda 5 (auditoría de SEGURIDAD del transporte
 * remoto y de la pantalla emparejable). PLAN §3.2, §3.3, §7, §8, §11 y §12.
 *
 * Intento de ROMPER lo entregado, no de describirlo: token inválido,
 * revocado y de otra terminal; código caducado y reutilizado; organización
 * en el body (regla 5 de CLAUDE.md); fuerza bruta del código contra los dos
 * cubos; canal de otra terminal; sobres con instanceId ajeno y con seq
 * repetido; caducidad del JWT de Realtime; y el coste en base de datos que
 * queda DESPUÉS de que cada cubo se agote.
 *
 * El service-role va doblado (`makeSupabaseDouble`) y el rate limit es el
 * real en memoria (`_resetRateLimits`, store persistente nulo salvo donde el
 * caso lo cambia). Fixtures sin nombres de organizaciones reales.
 */

import { makeSupabaseDouble, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const CODE = '482913';
const CODE_2 = '135790';
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
    const id = call.filters.find(([, col]) => col === 'id')?.[2] as number;
    return { data: state.orgs[id] ?? null, error: null };
  }
  if (call.table === 'organization_settings') return { data: null, error: null };
  if (call.table === 'organization_currencies') return { data: [{ currency_code: 'COP', is_base: true }], error: null };
  throw new Error(`tabla inesperada: ${call.table}`);
}

let serviceDb: SupabaseDouble;
/** Store persistente doblado: null salvo en los casos que lo activan. Registra cada clave. */
let storeDoble: { hit(entries: Array<{ key: string; limit: number; windowMs: number }>): Promise<Array<{ key: string; count: number; resetAt: Date }>> } | null = null;
const clavesDelStore: string[] = [];
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({
  RATE_LIMIT_STORE_ENV: 'RATE_LIMIT_STORE',
  getRateLimitStore: () => storeDoble,
}));

/** Store en memoria con la semántica de `fn_rate_limit_hit`: una fila por clave. */
function hacerStore() {
  const filas = new Map<string, { count: number; start: number }>();
  return {
    async hit(entries: Array<{ key: string; limit: number; windowMs: number }>) {
      const ahora = Date.now();
      return entries.map((e) => {
        clavesDelStore.push(e.key);
        const fila = filas.get(e.key);
        const fresca = !fila || ahora - fila.start >= e.windowMs;
        const next = { count: (fresca ? 0 : fila!.count) + 1, start: fresca ? ahora : fila!.start };
        filas.set(e.key, next);
        return { key: e.key, count: next.count, resetAt: new Date(next.start + e.windowMs) };
      });
    },
    get filas() {
      return filas;
    },
  };
}

import { NextRequest } from 'next/server';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { GET as bootstrap } from '@/app/api/pos/display/bootstrap/route';
import { POST as heartbeat } from '@/app/api/pos/display/heartbeat/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetSecretReports } from '@/lib/security/secrets';
import { _resetDisplayRateLimitWarning, RATE_LIMIT_STORE_REQUIRED_CODE } from '@/lib/pos/display/server/displayRateLimit';
import {
  BOOTSTRAP_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_SLOW_RATE_LIMIT,
  REALTIME_JWT_TTL_SECONDS,
  decodeJwtPayload,
  hashDisplayToken,
  verifyJwtSignature,
} from '@/lib/pos/display/server/displayTokens';
import { PROTOCOL_VERSION } from '@/lib/pos/display/protocol';
import { displayChannelName } from '@/lib/pos/display/transport';
import { SupabaseBroadcastReceiver, SupabaseBroadcastTransport, DISPLAY_DOWN_EVENT, DISPLAY_UP_EVENT } from '@/lib/pos/display/supabaseBroadcastTransport';
import { RealtimeBus, createRealtimeDouble, type DoubleChannel } from './f3b-supabaseRealtimeDouble';

function secretRow(overrides: Partial<SecretRow> = {}): SecretRow {
  return {
    terminal_id: T1,
    organization_id: 120,
    pairing_code: CODE,
    pairing_code_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    display_token_hash: null,
    ...overrides,
  };
}
function terminalRow(overrides: Partial<TerminalRow> = {}): TerminalRow {
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

/** Cuenta las consultas al service-role hechas desde ahora. */
function contarDesde(): () => number {
  const inicio = serviceDb.calls.length;
  return () => serviceDb.calls.length - inicio;
}

beforeEach(() => {
  storeDoble = null;
  clavesDelStore.length = 0;
  _resetRateLimits();
  _resetSecretReports();
  _resetDisplayRateLimitWarning();
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  serviceDb = makeSupabaseDouble(serviceResponder);
  state.secrets = [secretRow()];
  state.terminals = [terminalRow()];
  state.orgs = {
    120: { id: 120, name: 'Una tienda de calzado', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' },
    240: { id: 240, name: 'Una panadería', logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' },
  };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. El código: reutilización, caducidad y lo que el cliente intenta colar
// ---------------------------------------------------------------------------

describe('canje del código · lo que el cliente manda en el body', () => {
  it('organization_id / terminal_id / terminalId en el body se IGNORAN: nada de eso llega a la consulta', async () => {
    state.secrets = [secretRow()];
    const res = await pairReq({ code: CODE, organization_id: 240, organizationId: 240, terminal_id: T2, terminalId: T2, branch_id: 99 });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    // El token es de la terminal del CÓDIGO, no de la que pidió el body.
    expect(data.terminalId).toBe(T1);
    const columnasFiltradas = serviceDb.calls.flatMap((c) => c.filters.map(([, col]) => col));
    expect(columnasFiltradas).not.toContain('organization_id');
    expect(columnasFiltradas).not.toContain('branch_id');
    // El único `terminal_id` que aparece es el de la fila encontrada (el UPDATE).
    for (const call of serviceDb.calls) {
      for (const [, col, value] of call.filters) {
        if (col === 'terminal_id') expect(value).toBe(T1);
      }
    }
  });

  it('un código ya canjeado NO vuelve a canjearse y el token del primero sigue vivo', async () => {
    state.secrets = [secretRow()];
    const primero = await pairReq({ code: CODE });
    const { data } = await primero.json();
    const tokenBueno = data.token as string;

    const segundo = await pairReq({ code: CODE }, '203.0.113.11');
    expect(segundo.status).toBe(404);
    expect((await segundo.json()).code).toBe('CODE_INVALID');
    // El hash guardado sigue siendo el del primer canje.
    expect(state.secrets[0].display_token_hash).toBe(hashDisplayToken(tokenBueno));
    expect(state.secrets[0].pairing_code).toBeNull();
    expect((await bootstrapReq(tokenBueno)).status).toBe(200);
  });

  it('un código VENCIDO no canjea ni escribe nada', async () => {
    state.secrets = [secretRow({ pairing_code_expires_at: new Date(Date.now() - 1000).toISOString() })];
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBeNull();
    expect(serviceDb.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('un código de una terminal INACTIVA no canjea', async () => {
    state.terminals = [terminalRow({ is_active: false })];
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(404);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('dos canjes SIMULTÁNEOS del mismo código: solo uno recibe token', async () => {
    state.secrets = [secretRow()];
    const [a, b] = await Promise.all([pairReq({ code: CODE }, '203.0.113.20'), pairReq({ code: CODE }, '203.0.113.21')]);
    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 404]);
  });
});

// ---------------------------------------------------------------------------
// 2. Fuerza bruta del código: qué corta cada cubo y qué sigue costando
// ---------------------------------------------------------------------------

describe('fuerza bruta del código · los dos cubos de /pair', () => {
  it('el cubo por IP corta al intento 11 desde la misma IP', async () => {
    state.secrets = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await pairReq({ code: String(100000 + i) }, '198.51.100.7');
      expect(res.status).toBe(404);
    }
    const bloqueado = await pairReq({ code: '999999' }, '198.51.100.7');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get('Retry-After')).toBeTruthy();
  });

  it('agotado el cubo GLOBAL, el CARRIL LENTO deja pasar seis conjeturas MÁS al lookup (aunque respondan 429)', async () => {
    state.secrets = [];
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i += 1) {
      const res = await pairReq({ code: String(100000 + i) }, `198.18.${Math.floor(i / 250)}.${i % 250}`);
      expect(res.status).toBe(404);
    }
    // Carril lento (F3-C ronda 5 · 4): las siguientes PAIR_GLOBAL_SLOW_RATE_LIMIT.limit
    // peticiones del despliegue entero SÍ llegan a la base. El código se EVALÚA
    // (un código correcto devolvería 200); solo el fallo se convierte en 429.
    const contar = contarDesde();
    for (let i = 0; i < PAIR_GLOBAL_SLOW_RATE_LIMIT.limit; i += 1) {
      const res = await pairReq({ code: String(300000 + i) }, `198.19.0.${i + 1}`);
      expect(res.status).toBe(429);
    }
    expect(contar()).toBe(PAIR_GLOBAL_SLOW_RATE_LIMIT.limit);
    // Y a partir de ahí sí se rechaza sin tocar la base.
    const contarTras = contarDesde();
    const res = await pairReq({ code: '424242' }, '198.19.1.1');
    expect(res.status).toBe(429);
    expect(contarTras()).toBe(0);
  });

  it('el techo de conjeturas EVALUADAS por minuto en todo el despliegue es global + carril lento', async () => {
    state.secrets = [];
    const contar = contarDesde();
    for (let i = 0; i < 200; i += 1) {
      await pairReq({ code: String(400000 + i) }, `198.20.${Math.floor(i / 250)}.${i % 250}`);
    }
    expect(contar()).toBe(PAIR_GLOBAL_RATE_LIMIT.limit + PAIR_GLOBAL_SLOW_RATE_LIMIT.limit);
  });

  it('con el global agotado, un código CORRECTO sigue canjeando: el carril lento no apaga el emparejamiento ajeno', async () => {
    state.secrets = [];
    state.terminals = [terminalRow()];
    for (let i = 0; i < PAIR_GLOBAL_RATE_LIMIT.limit; i += 1) {
      await pairReq({ code: String(100000 + i) }, `198.18.${Math.floor(i / 250)}.${i % 250}`);
    }
    state.secrets = [secretRow()];
    const res = await pairReq({ code: CODE }, '198.21.0.1');
    expect(res.status).toBe(200);
  });

  it('el cubo GLOBAL no lo gastan los canjes correctos', async () => {
    const total = PAIR_GLOBAL_RATE_LIMIT.limit + 5;
    state.secrets = [];
    state.terminals = [];
    for (let i = 0; i < total; i += 1) {
      const id = `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`;
      state.terminals.push(terminalRow({ id }));
      state.secrets.push(secretRow({ terminal_id: id, pairing_code: String(200000 + i) }));
    }
    for (let i = 0; i < total; i += 1) {
      const res = await pairReq({ code: String(200000 + i) }, `198.18.${Math.floor(i / 250)}.${i % 250}`);
      expect(res.status).toBe(200);
    }
  });
});

describe('postura del store de rate limit (fail-closed del canje)', () => {
  const NODE_ENV = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = NODE_ENV;
  });

  it('en producción y sin store persistente, /pair responde 503 sin tocar la base', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const contar = contarDesde();
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe(RATE_LIMIT_STORE_REQUIRED_CODE);
    expect(contar()).toBe(0);
    expect(state.secrets[0].display_token_hash).toBeNull();
  });

  it('el 503 alcanza también a un canje LEGÍTIMO: sin la variable de entorno no se empareja ninguna pantalla', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const res = await pairReq({ code: CODE });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// 3. El token: inválido, revocado, de otra terminal
// ---------------------------------------------------------------------------

describe('token de la pantalla · /bootstrap y /heartbeat', () => {
  async function emparejar(): Promise<string> {
    const res = await pairReq({ code: CODE });
    const { data } = await res.json();
    return data.token as string;
  }

  it('sin token, con token corto y con un token inventado: siempre el MISMO 401', async () => {
    const cuerpos = await Promise.all(
      [undefined, 'abc', 'a'.repeat(43), 'B'.repeat(43)].map(async (t) => {
        const res = await bootstrapReq(t);
        return { status: res.status, body: await res.json() };
      }),
    );
    for (const c of cuerpos) {
      expect(c.status).toBe(401);
      expect(c.body.code).toBe('DISPLAY_UNAUTHORIZED');
      expect(c.body.error).toBe(cuerpos[0].body.error);
    }
  });

  it('token REVOCADO (hash a null): 401 en /bootstrap y en /heartbeat, y el latido no escribe', async () => {
    const token = await emparejar();
    expect((await bootstrapReq(token)).status).toBe(200);
    state.secrets[0].display_token_hash = null; // /revoke
    expect((await bootstrapReq(token)).status).toBe(401);
    const contar = contarDesde();
    const res = await heartbeatReq(token);
    expect(res.status).toBe(401);
    expect(serviceDb.calls.slice(serviceDb.calls.length - contar()).some((c) => c.op === 'update')).toBe(false);
  });

  it('el token de la terminal A no sirve para leer la organización de la terminal B', async () => {
    state.terminals.push(terminalRow({ id: T2, organization_id: 240, branch_id: 9, name: 'Caja 2', code: 'CAJA-2' }));
    state.secrets.push(secretRow({ terminal_id: T2, organization_id: 240, pairing_code: CODE_2 }));
    const tokenA = await emparejar();
    const res = await bootstrapReq(tokenA);
    const { data } = await res.json();
    expect(data.terminal.id).toBe(T1);
    expect(data.brand.organizationId).toBe(120);
    expect(data.realtime.channel).toBe(displayChannelName(T1));
    // Ni una sola consulta se hizo contra la organización de la otra terminal.
    const orgCalls = serviceDb.calls.filter((c) => c.table === 'organizations');
    for (const c of orgCalls) expect(c.filters).toContainEqual(['eq', 'id', 120]);
  });

  it('terminal desactivada después de emparejar: el token deja de valer', async () => {
    const token = await emparejar();
    state.terminals[0].is_active = false;
    expect((await bootstrapReq(token)).status).toBe(401);
    expect((await heartbeatReq(token)).status).toBe(401);
  });

  it('organización incoherente entre las dos tablas: 401 (no se sirve la de la terminal)', async () => {
    const token = await emparejar();
    state.terminals[0].organization_id = 240;
    expect((await bootstrapReq(token)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 4. Coste por petición de un token VÁLIDO (la tableta robada o en bucle)
// ---------------------------------------------------------------------------

describe('coste de un token válido que martillea', () => {
  async function emparejar(): Promise<string> {
    const res = await pairReq({ code: CODE });
    const { data } = await res.json();
    return data.token as string;
  }

  it('/bootstrap topa a los BOOTSTRAP_RATE_LIMIT.limit por minuto y el 429 no cuesta base', async () => {
    const token = await emparejar();
    for (let i = 0; i < BOOTSTRAP_RATE_LIMIT.limit; i += 1) {
      expect((await bootstrapReq(token)).status).toBe(200);
    }
    const contar = contarDesde();
    const res = await bootstrapReq(token);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(contar()).toBe(0);
  });

  it('/heartbeat NO tiene cubo: 200 latidos seguidos del mismo token son 200 respuestas y 600 consultas', async () => {
    const token = await emparejar();
    const contar = contarDesde();
    let ok = 0;
    for (let i = 0; i < 200; i += 1) {
      const res = await heartbeatReq(token);
      if (res.status === 200) ok += 1;
    }
    expect(ok).toBe(200);
    // 2 lecturas de autenticación + 1 UPDATE por latido, sin tope alguno.
    expect(contar()).toBe(600);
  });

  it('el cubo de /bootstrap se gasta ANTES de autenticar: un token INEXISTENTE con forma válida ya escribe su clave en el store', async () => {
    const store = hacerStore();
    storeDoble = store;
    const inventado = 'Z'.repeat(43);
    const res = await bootstrapReq(inventado);
    expect(res.status).toBe(401);
    // Una clave NUEVA por token probado: el cubo que existe para abaratar la
    // ruta acaba escribiendo una fila en rate_limit_buckets por conjetura.
    expect(clavesDelStore.some((k) => k.startsWith('pos-display:bootstrap:tok:'))).toBe(true);
    const antes = store.filas.size;
    for (let i = 0; i < 20; i += 1) {
      await bootstrapReq(`${'Y'.repeat(42)}${String.fromCharCode(97 + i)}`);
    }
    expect(store.filas.size).toBeGreaterThanOrEqual(antes + 20);
  });

  it('la clave del cubo de /bootstrap NUNCA es el hash que autentica', async () => {
    const store = hacerStore();
    storeDoble = store;
    const res = await pairReq({ code: CODE });
    const { data } = await res.json();
    await bootstrapReq(data.token);
    const hash = hashDisplayToken(data.token);
    for (const clave of clavesDelStore) {
      expect(clave).not.toContain(hash);
      expect(clave).not.toContain(data.token);
    }
  });

  it('cada latido firma un JWT nuevo de 5 minutos, sin límite de cuántos', async () => {
    const token = await emparejar();
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const res = await heartbeatReq(token);
      const { data } = await res.json();
      tokens.add(data.realtime.token);
      expect(verifyJwtSignature(data.realtime.token, JWT_SECRET)).toBe(true);
    }
    expect(tokens.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. El JWT de Realtime
// ---------------------------------------------------------------------------

describe('JWT de Realtime', () => {
  it('caduca en 5 minutos y no lleva ningún claim de confianza', async () => {
    const { data } = await (await pairReq({ code: CODE })).json();
    const res = await bootstrapReq(data.token);
    const body = await res.json();
    const payload = decodeJwtPayload(body.data.realtime.token)!;
    expect(Number(payload.exp) - Number(payload.iat)).toBe(REALTIME_JWT_TTL_SECONDS);
    for (const prohibido of ['organization_id', 'org_id', 'app_role', 'email', 'user_id', 'branch_id']) {
      expect(payload[prohibido]).toBeUndefined();
    }
    expect(payload.role).toBe('anon');
    expect(payload.pos_terminal_id).toBe(T1);
    expect(String(payload.sub)).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(new Date(body.data.realtime.expiresAt).getTime()).toBe(Number(payload.exp) * 1000);
  });

  it('un JWT CADUCADO no se renueva si el token fue revocado: el latido responde 401 y no entrega credencial', async () => {
    const { data } = await (await pairReq({ code: CODE })).json();
    state.secrets[0].display_token_hash = null;
    const res = await heartbeatReq(data.token);
    expect(res.status).toBe(401);
    expect((await res.json()).data).toBeUndefined();
  });

  it('sin SUPABASE_JWT_SECRET no hay 200 degradado: 503 en /bootstrap y en /heartbeat', async () => {
    const { data } = await (await pairReq({ code: CODE })).json();
    delete process.env.SUPABASE_JWT_SECRET;
    _resetSecretReports();
    const b = await bootstrapReq(data.token);
    expect(b.status).toBe(503);
    expect((await b.json()).code).toBe('REALTIME_NOT_CONFIGURED');
    const h = await heartbeatReq(data.token);
    expect(h.status).toBe(503);
    // El latido tampoco se registra: una pantalla sin canal no está viva.
    expect(state.terminals[0].display_last_seen_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. El canal: terminal ajena, instancia ajena, seq repetido
// ---------------------------------------------------------------------------

describe('canal remoto · lo que el receptor acepta y lo que descarta', () => {
  const INSTANCIA = 'caja-1';
  const OTRA = 'caja-2';

  const ESTADO = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } as const;

  function sobre(overrides: Record<string, unknown> = {}) {
    return {
      v: PROTOCOL_VERSION,
      terminalId: T1,
      instanceId: INSTANCIA,
      seq: 1,
      t: 'state',
      at: 1,
      state: ESTADO,
      ...overrides,
    };
  }

  function abrirReceptor(bus: RealtimeBus, terminalId = T1, channelName = displayChannelName(T1)) {
    const doble = createRealtimeDouble({ bus, autoJoin: false });
    const receiver = new SupabaseBroadcastReceiver({ terminalId, channelName, client: doble.client });
    const canal = doble.channels[0] as DoubleChannel;
    canal.setStatus('SUBSCRIBED');
    return { receiver, canal };
  }

  it('el canal remoto SIEMPRE es privado y solo escucha el sentido que le toca', () => {
    const bus = new RealtimeBus();
    const { canal } = abrirReceptor(bus);
    expect(canal.opts.config.private).toBe(true);
    expect(canal.opts.config.broadcast.self).toBe(false);
    expect(canal.listening).toEqual([DISPLAY_DOWN_EVENT]);
  });

  it('un sobre con el terminalId de OTRA terminal en el mismo canal se descarta', () => {
    const bus = new RealtimeBus();
    const { receiver, canal } = abrirReceptor(bus);
    const vistos: unknown[] = [];
    receiver.onDown((m) => vistos.push(m));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ terminalId: T2 }));
    expect(vistos).toHaveLength(0);
    expect(receiver.activeInstanceId).toBeNull();
    receiver.close(false);
  });

  it('con una instancia ya adoptada, los sobres de OTRA instancia (que no son hello) se descartan', () => {
    const bus = new RealtimeBus();
    const { receiver, canal } = abrirReceptor(bus);
    const vistos: Array<{ instanceId: string }> = [];
    receiver.onDown((m) => vistos.push(m as never));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ seq: 1 }));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ instanceId: OTRA, seq: 2 }));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ instanceId: OTRA, seq: 3, t: 'bye' }));
    expect(vistos).toHaveLength(1);
    expect(receiver.activeInstanceId).toBe(INSTANCIA);
    receiver.close(false);
  });

  it('un seq repetido o menor de la instancia activa no se entrega (repetición del canal)', () => {
    const bus = new RealtimeBus();
    const { receiver, canal } = abrirReceptor(bus);
    const vistos: unknown[] = [];
    receiver.onDown((m) => vistos.push(m));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ seq: 5 }));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ seq: 5 }));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ seq: 4 }));
    expect(vistos).toHaveLength(1);
    expect(receiver.lastSeq).toBe(5);
    receiver.close(false);
  });

  it('un sobre de OTRA versión del protocolo no se entrega, pero queda anotado', () => {
    const bus = new RealtimeBus();
    const { receiver, canal } = abrirReceptor(bus);
    const vistos: unknown[] = [];
    receiver.onDown((m) => vistos.push(m));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ v: PROTOCOL_VERSION + 7 }));
    expect(vistos).toHaveLength(0);
    expect(receiver.incompatibleVersionCount).toBe(1);
    receiver.close(false);
  });

  it('si el canal fuese el de OTRA terminal, la pantalla queda MUDA (no adopta nada del canal ajeno)', () => {
    const bus = new RealtimeBus();
    // terminalId de esta pantalla = T1, pero el servidor le dio el canal de T2.
    const { receiver, canal } = abrirReceptor(bus, T1, displayChannelName(T2));
    const vistos: unknown[] = [];
    receiver.onDown((m) => vistos.push(m));
    canal.inject(DISPLAY_DOWN_EVENT, sobre({ terminalId: T2, seq: 1 }));
    expect(vistos).toHaveLength(0);
    receiver.close(false);
  });

  it('la caja y la pantalla no se oyen a sí mismas: cada lado publica en su propio evento', async () => {
    const bus = new RealtimeBus();
    const cajaDoble = createRealtimeDouble({ bus });
    const pantallaDoble = createRealtimeDouble({ bus });
    const caja = new SupabaseBroadcastTransport({ terminalId: T1, client: cajaDoble.client });
    const pantalla = new SupabaseBroadcastReceiver({ terminalId: T1, client: pantallaDoble.client });
    await Promise.resolve();
    await Promise.resolve();
    const recibidos: Array<{ t: string }> = [];
    pantalla.onDown((m) => recibidos.push(m as never));
    caja.publish({ t: 'state', state: ESTADO as never });
    expect(bus.sent.filter((s) => s.event === DISPLAY_DOWN_EVENT).length).toBeGreaterThan(0);
    expect(recibidos.some((m) => m.t === 'state')).toBe(true);
    pantalla.send({ t: 'need_snapshot', capabilities: { width: 1024, height: 768, touch: false } });
    expect(bus.sent.some((s) => s.event === DISPLAY_UP_EVENT)).toBe(true);
    // La pantalla nunca publicó en el evento de bajada.
    const deLaPantalla = bus.sent.filter((s) => s.event === DISPLAY_DOWN_EVENT);
    expect(deLaPantalla.every((s) => (s.payload as { t?: string }).t !== 'need_snapshot')).toBe(true);
    pantalla.close(false);
    caja.close(false);
  });
});
