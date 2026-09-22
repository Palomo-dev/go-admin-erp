/**
 * TESTER · Fase 3, parte B · ronda 4. Ataques que NO estaban cubiertos por
 * las rondas 1–3 (esas ya fijan: token ajeno/revocado/hash, código vencido o
 * reutilizado, `organization_id` en el body, instancia y seq ajenos, canal de
 * otra terminal, JWT vencido, middleware y aislamiento de
 * `pos_terminal_secrets`).
 *
 * Aquí se mide lo que esas rondas dieron por supuesto:
 *  1. El techo de la fuerza bruta del código: los cubos de `/pair` son por
 *     INSTANCIA salvo que `RATE_LIMIT_STORE=db`, y `.env.example` reparte
 *     `memory`. Una instancia fría devuelve el presupuesto entero.
 *  2. El espacio de códigos es GLOBAL: `/pair` no recibe terminal, así que un
 *     acierto ciego empareja con cualquier terminal del despliegue que tenga
 *     código vivo, no con «la» terminal atacada.
 *  3. `/bootstrap` no tiene freno para el token VÁLIDO y cuesta tres
 *     consultas service-role por llamada, mientras `/heartbeat` sí frena su
 *     escritura.
 *  4. La coherencia canal ↔ terminal se exige en `/bootstrap`
 *     (`isRemoteBootstrap`) y NO en `/heartbeat`, que es quien renueva la
 *     credencial del canal durante toda la sesión.
 *
 * RONDA 4, CORREGIDO. Los cuatro defectos están arreglados y este archivo
 * fija ahora el comportamiento BUENO (mismos nombres de `it`, para que los
 * pasos del informe sigan sirviendo de referencia):
 *  1. `/pair` EXIGE `RATE_LIMIT_STORE=db` en producción (503
 *     `RATE_LIMIT_STORE_REQUIRED`). En memoria el techo sigue siendo por
 *     instancia —eso no cambia, es el limitador del repo—, por eso la ruta
 *     no atiende en producción sin el contador del despliegue.
 *  2. El análisis de `PAIR_GLOBAL_RATE_LIMIT` está rehecho sobre el conjunto
 *     de códigos vivos (N / 10^6 por intento) y el techo bajó a 60/min.
 *  3. `/bootstrap` tiene cubo por TOKEN (`BOOTSTRAP_RATE_LIMIT`, 10/min),
 *     comprobado ANTES de autenticar.
 *  4. El latido exige que la credencial sea de SU terminal y que el canal sea
 *     el de esa terminal; el desajuste es fallo reintentable, no 401.
 * Fixtures sin nombres de organizaciones (solo ids y descripciones).
 */

import * as fs from 'fs';
import * as path from 'path';
import { makeSupabaseDouble, matchesOrFilter, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

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
  orgs: Array<Record<string, unknown>>;
} = { secrets: [], terminals: [], orgs: [] };

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
    const row = state.orgs.find((o) => matches(o, call)) ?? null;
    return { data: row, error: null };
  }
  if (call.table === 'organization_settings') return { data: null, error: null };
  if (call.table === 'organization_currencies') return { data: [{ currency_code: 'COP', is_base: true }], error: null };
  throw new Error(`tabla inesperada: ${call.table}`);
}

let serviceDb: SupabaseDouble;
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null, RATE_LIMIT_STORE_ENV: 'RATE_LIMIT_STORE' }));

import { NextRequest } from 'next/server';
import { POST as pair } from '@/app/api/pos/display/pair/route';
import { GET as bootstrap } from '@/app/api/pos/display/bootstrap/route';
import { POST as heartbeat } from '@/app/api/pos/display/heartbeat/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetSecretReports } from '@/lib/security/secrets';
import { BOOTSTRAP_RATE_LIMIT, PAIR_GLOBAL_RATE_LIMIT, PAIR_RATE_LIMIT, hashDisplayToken } from '@/lib/pos/display/server/displayTokens';
import { RATE_LIMIT_STORE_REQUIRED_CODE, _resetDisplayRateLimitWarning } from '@/lib/pos/display/server/displayRateLimit';
import { sendRemoteHeartbeat, isRemoteBootstrap, type FetchLike } from '@/lib/pos/display/remoteDisplay';
import { displayChannelName } from '@/lib/pos/display/transport';

const uuid = (n: number) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;

function seedTerminal(n: number, orgId: number, code: string | null): string {
  const id = uuid(n);
  state.terminals.push({ id, organization_id: orgId, branch_id: 7, name: `Caja ${n}`, code: `CAJA-${n}`, is_active: true, display_last_seen_at: null });
  state.secrets.push({
    terminal_id: id,
    organization_id: orgId,
    pairing_code: code,
    pairing_code_expires_at: code === null ? null : new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    display_token_hash: null,
  });
  if (!state.orgs.some((o) => o.id === orgId)) {
    state.orgs.push({ id: orgId, name: `org ${orgId}`, logo_url: null, primary_color: null, secondary_color: null, timezone: 'America/Bogota' });
  }
  return id;
}

const pairReq = (code: string, ip: string) =>
  pair(
    new NextRequest('http://localhost/api/pos/display/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    }),
  );
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const bootstrapReq = (token: string) => bootstrap(new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: bearer(token) }));
const heartbeatReq = (token: string) => heartbeat(new NextRequest('http://localhost/api/pos/display/heartbeat', { method: 'POST', headers: bearer(token) }));

beforeEach(() => {
  state.secrets = [];
  state.terminals = [];
  state.orgs = [];
  serviceDb = makeSupabaseDouble(serviceResponder);
  _resetRateLimits();
  _resetSecretReports();
  _resetDisplayRateLimitWarning();
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SUPABASE_JWT_SECRET;
});

// ---------------------------------------------------------------------------
// 1. El techo de la fuerza bruta depende de RATE_LIMIT_STORE, y el default es memory
// ---------------------------------------------------------------------------

describe('tester F3-B r4 · el techo del canje es POR INSTANCIA con la configuración por defecto (y por eso producción exige `db`)', () => {
  it('.env.example reparte RATE_LIMIT_STORE=memory: sin store, los dos cubos de /pair viven en el Map del proceso', () => {
    const env = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    // Sigue siendo `memory`: es el valor de DESARROLLO LOCAL, donde no hay N
    // instancias. Lo que cambió en la ronda 4 es que el archivo ahora dice que
    // en producción `db` es requisito de despliegue de la fase, y /pair lo
    // exige de verdad (test siguiente) en vez de atender con un contador flojo.
    expect(env).toMatch(/^RATE_LIMIT_STORE=memory$/m);
    expect(env).toMatch(/REQUISITO DE DESPLIEGUE/);
    expect(env).toMatch(/RATE_LIMIT_STORE_REQUIRED/);
  });

  it('CORREGIDO (ronda 4 · 1): en PRODUCCIÓN sin store persistente, /pair no atiende (503 RATE_LIMIT_STORE_REQUIRED) en vez de canjear con el techo por instancia', async () => {
    seedTerminal(1, 120, '111111');
    const env = process.env as Record<string, string | undefined>;
    const anterior = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const res = await pairReq('111111', '203.0.113.1');
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe(RATE_LIMIT_STORE_REQUIRED_CODE);
      // Y no tocó la base: el código sigue vigente y sin hash.
      expect(state.secrets[0].pairing_code).toBe('111111');
      expect(state.secrets[0].display_token_hash).toBeNull();
    } finally {
      env.NODE_ENV = anterior;
    }
  });

  it('agotado el cubo GLOBAL, una instancia FRÍA (proceso nuevo) devuelve el presupuesto entero', async () => {
    seedTerminal(1, 120, '111111');
    // Ronda 3 · 4: solo los canjes FALLIDOS gastan el cubo global; cada
    // petición desde su propia IP para que el cubo por IP nunca sea el que corta.
    const fallos = PAIR_GLOBAL_RATE_LIMIT.limit;
    for (let i = 0; i < fallos; i += 1) {
      const res = await pairReq('999999', `198.51.100.${i % 200}.${i}`.slice(0, 15));
      expect(res.status).toBe(404);
    }
    const bloqueado = await pairReq('999999', '198.51.100.250');
    expect(bloqueado.status).toBe(429);

    // «Instancia fría»: exactamente lo que ve un lambda nuevo de Vercel, que
    // arranca con el Map vacío. Sin RATE_LIMIT_STORE=db no hay nada compartido.
    _resetRateLimits();
    const otraInstancia = await pairReq('999999', '198.51.100.250');
    expect(otraInstancia.status).toBe(404); // presupuesto entero otra vez
  });

  it('el cubo por IP tampoco sobrevive: la misma IP recupera sus 10 intentos en cada instancia', async () => {
    seedTerminal(1, 120, '111111');
    const ip = '203.0.113.7';
    for (let i = 0; i < PAIR_RATE_LIMIT.limit; i += 1) {
      expect((await pairReq('999999', ip)).status).toBe(404);
    }
    expect((await pairReq('999999', ip)).status).toBe(429);
    _resetRateLimits();
    expect((await pairReq('999999', ip)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 2. El espacio de códigos es global: un acierto ciego cae en CUALQUIER terminal
// ---------------------------------------------------------------------------

describe('tester F3-B r4 · el código de 6 dígitos es del despliegue, no de una terminal', () => {
  it('un acierto ciego empareja con la terminal de OTRA organización: el atacante no elige, pero le vale cualquiera', async () => {
    const t120 = seedTerminal(1, 120, '111111');
    const t145 = seedTerminal(2, 145, '222222');
    seedTerminal(3, 199, '333333');

    // Quien adivina no sabe a quién le acertó: /pair no recibe terminal ni
    // organización. Cualquiera de los tres códigos vivos vale como «acierto».
    const res = await pairReq('222222', '203.0.113.99');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { token: string; terminalId: string } };
    expect(body.data.terminalId).toBe(t145);
    expect(body.data.terminalId).not.toBe(t120);

    // Y el emparejamiento de la víctima queda ROBADO: su hash es el del atacante.
    const fila = state.secrets.find((s) => s.terminal_id === t145)!;
    expect(fila.display_token_hash).toBe(hashDisplayToken(body.data.token));
    expect(fila.pairing_code).toBeNull();

    // Con ese token el atacante entra al bootstrap de una organización que nunca nombró.
    const boot = await bootstrapReq(body.data.token);
    expect(boot.status).toBe(200);
    const bootBody = (await boot.json()) as { data: { brand: { organizationId: number }; realtime: { channel: string } } };
    expect(bootBody.data.brand.organizationId).toBe(145);
    expect(bootBody.data.realtime.channel).toBe(displayChannelName(t145));
  });

  // CORREGIDO (ronda 4 · 2): el comportamiento no cambia —la ruta no puede
  // recibir terminal sin romper la regla 5—, pero el análisis escrito en
  // `PAIR_GLOBAL_RATE_LIMIT` ya está hecho sobre el conjunto (N / 10^6 por
  // intento) y el techo bajó a 60/min en consecuencia.
  it('con N códigos vivos, CADA intento ciego tiene N oportunidades: el peor caso no es «por código vigente»', async () => {
    const vivos = 8;
    for (let i = 0; i < vivos; i += 1) seedTerminal(i + 1, 120 + i, String(100000 + i));
    // Un solo intento que acierta cualquiera de los ocho: la consulta de /pair
    // no filtra por terminal, así que el espacio efectivo es 10^6 / N.
    const res = await pairReq('100005', '203.0.113.5');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { terminalId: string } };
    expect(body.data.terminalId).toBe(uuid(6));
  });
});

// ---------------------------------------------------------------------------
// 3. /bootstrap no frena al token VÁLIDO, y cuesta tres consultas service-role
// ---------------------------------------------------------------------------

describe('tester F3-B r4 · /bootstrap CON freno por token (corregido, ronda 4 · 3)', () => {
  async function pairAndToken(): Promise<string> {
    if (state.terminals.length === 0) seedTerminal(1, 120, '111111');
    const res = await pairReq('111111', '203.0.113.11');
    const body = (await res.json()) as { data: { token: string } };
    return body.data.token;
  }

  it('cien llamadas seguidas con el MISMO token: cien 200 y cinco consultas service-role por llamada', async () => {
    const token = await pairAndToken();
    const antes = serviceDb.calls.length;
    const estados: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      estados.push((await bootstrapReq(token)).status);
    }
    // CORREGIDO: las primeras `BOOTSTRAP_RATE_LIMIT.limit` pasan y el resto es
    // 429. El cubo de `authenticateDisplayRequest` sigue sin contarlas (solo
    // consume 401): el freno es el cubo POR TOKEN de esta ruta.
    expect(estados.filter((x) => x === 200)).toHaveLength(BOOTSTRAP_RATE_LIMIT.limit);
    expect(estados.filter((x) => x === 429)).toHaveLength(100 - BOOTSTRAP_RATE_LIMIT.limit);
    const consultas = serviceDb.calls.slice(antes);
    // 2 de autenticación (secrets + terminals) + 3 del bootstrap
    // (organizations, organization_settings, organization_currencies), y SOLO
    // para las que pasaron el cubo: el 429 se decide antes de autenticar.
    expect(consultas.length).toBe(BOOTSTRAP_RATE_LIMIT.limit * 5);
    const porTabla = (t: string) => consultas.filter((c) => c.table === t).length;
    expect(porTabla('organizations')).toBe(BOOTSTRAP_RATE_LIMIT.limit);
    expect(porTabla('organization_settings')).toBe(BOOTSTRAP_RATE_LIMIT.limit);
    expect(porTabla('organization_currencies')).toBe(BOOTSTRAP_RATE_LIMIT.limit);
  });

  it('el 429 del bootstrap trae Retry-After y no desempareja: es coste, no autenticación', async () => {
    const token = await pairAndToken();
    for (let i = 0; i < BOOTSTRAP_RATE_LIMIT.limit; i += 1) expect((await bootstrapReq(token)).status).toBe(200);
    const bloqueado = await bootstrapReq(token);
    expect(bloqueado.status).toBe(429);
    expect((await bloqueado.json()).code).toBe('RATE_LIMITED');
    expect(Number(bloqueado.headers.get('retry-after'))).toBeGreaterThan(0);
    // El token sigue siendo válido: pasada la ventana vuelve a servir.
    _resetRateLimits();
    expect((await bootstrapReq(token)).status).toBe(200);
  });

  it('el cubo es POR TOKEN: agotar el de una pantalla no frena a otra', async () => {
    seedTerminal(1, 120, '111111');
    seedTerminal(2, 145, '222222');
    const tokenDe = async (code: string, ip: string) => {
      const res = await pairReq(code, ip);
      return ((await res.json()) as { data: { token: string } }).data.token;
    };
    const uno = await tokenDe('111111', '203.0.113.21');
    const otro = await tokenDe('222222', '203.0.113.22');
    for (let i = 0; i < BOOTSTRAP_RATE_LIMIT.limit; i += 1) expect((await bootstrapReq(uno)).status).toBe(200);
    expect((await bootstrapReq(uno)).status).toBe(429);
    expect((await bootstrapReq(otro)).status).toBe(200);
  });

  it('en /heartbeat la escritura SÍ está acotada (WHERE con el umbral), pero la firma del JWT y las dos lecturas no', async () => {
    // El latido se deja sin cubo a propósito: es 1/min, barato (2 lecturas y
    // un UPDATE que no toca filas) y un 429 aquí dejaría sin renovar el JWT a
    // una pantalla legítima. El caro era /bootstrap, y ese ya tiene el suyo.
    const token = await pairAndToken();
    const antes = serviceDb.calls.length;
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const res = await heartbeatReq(token);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { realtime: { token: string } } };
      tokens.add(body.data.realtime.token);
    }
    const consultas = serviceDb.calls.slice(antes);
    // 2 de autenticación + 1 update por latido: el update no se ahorra, solo
    // afecta a 0 filas gracias al `or(...)` del WHERE.
    expect(consultas.filter((c) => c.table === 'pos_terminals' && c.op === 'update').length).toBe(20);
    const update = consultas.find((c) => c.table === 'pos_terminals' && c.op === 'update')!;
    expect(update.filters.some(([op]) => op === 'or')).toBe(true);
    // 20 JWT de 5 minutos firmados a petición, sin cubo alguno. (Dentro del
    // mismo segundo el payload es idéntico —`iat`/`exp` van en segundos— así
    // que el token repite: lo que se mide aquí es que SIEMPRE se firma y se
    // entrega uno, no que sean distintos.)
    expect(tokens.size).toBeGreaterThanOrEqual(1);
    for (const t of tokens) expect(t.split('.')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 4. La coherencia canal ↔ terminal solo se exige en /bootstrap
// ---------------------------------------------------------------------------

describe('tester F3-B r4 · /heartbeat renueva la credencial CON el guardarraíl de la ronda 2 · 6 (corregido, ronda 4 · 4)', () => {
  const T_PROPIA = uuid(1);
  const T_AJENA = uuid(2);

  const fetchOk =
    (body: unknown): FetchLike =>
    async () => ({ status: 200, ok: true, json: async () => body });

  const credencial = (id: string, token = 'jwt') => ({ channel: displayChannelName(id), token, expiresAt: new Date(Date.now() + 300_000).toISOString() });

  it('el bootstrap RECHAZA un canal que no es el de su terminal (guardarraíl existente)', () => {
    const base = {
      terminal: { id: T_PROPIA, name: 'Caja 1', code: 'CAJA-1', branchId: 7 },
      brand: { organizationId: 120, name: 'org 120', logoUrl: null, primaryColor: null, secondaryColor: null, timezone: 'America/Bogota' },
      settings: {},
      locale: 'es',
      currency: 'COP',
      realtime: { channel: displayChannelName(T_PROPIA), token: 'jwt', expiresAt: new Date().toISOString() },
    };
    expect(isRemoteBootstrap(base)).toBe(true);
    expect(isRemoteBootstrap({ ...base, realtime: { ...base.realtime, channel: displayChannelName(T_AJENA) } })).toBe(false);
  });

  it('el latido ACEPTA una credencial de otra terminal: ni canal ni terminalId se contrastan con el emparejamiento', async () => {
    // CORREGIDO: ya NO la acepta. Con `expectedTerminalId` (lo que pasa
    // `useRemoteDisplay` en producción), una respuesta cuya terminal es otra
    // se descarta como fallo REINTENTABLE —no 401, que desemparejaría— con un
    // `console.warn` explícito, igual que hace `isRemoteBootstrap`.
    const result = await sendRemoteHeartbeat(
      'token-de-la-pantalla',
      fetchOk({ data: { terminalId: T_AJENA, at: new Date().toISOString(), realtime: credencial(T_AJENA, 'jwt-de-otra-terminal') } }),
      { expectedTerminalId: T_PROPIA },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('inalcanzable');
    expect(result.kind).toBe('network');
    expect(console.warn).toHaveBeenCalled();
  });

  it('la credencial de SU terminal sí pasa, y la comparación no depende de las mayúsculas del uuid', async () => {
    const ok = await sendRemoteHeartbeat('token-de-la-pantalla', fetchOk({ data: { terminalId: T_PROPIA, at: '', realtime: credencial(T_PROPIA) } }), {
      expectedTerminalId: T_PROPIA.toUpperCase(),
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error('inalcanzable');
    expect(ok.data.realtime.channel).toBe(displayChannelName(T_PROPIA));
  });

  it('un canal con OTRO prefijo también pasa el latido (la forma solo exige cadena no vacía)', async () => {
    // CORREGIDO: la coherencia canal ↔ terminalId se exige SIEMPRE, incluso
    // sin `expectedTerminalId`, que es el caso simétrico de `isRemoteBootstrap`.
    const result = await sendRemoteHeartbeat(
      'token-de-la-pantalla',
      fetchOk({ data: { terminalId: T_PROPIA, at: '', realtime: { channel: 'cualquier-cosa', token: 'jwt', expiresAt: 'x' } } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('inalcanzable');
    expect(result.kind).toBe('network');
  });

  it('el consumidor de producción pasa la terminal emparejada al latido (si esto se cae, el guardarraíl queda muerto)', () => {
    const fuente = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'pos-display', 'useRemoteDisplay.ts'), 'utf8');
    expect(fuente).toMatch(/expectedTerminalId:\s*terminalId/);
    // Y el id del receptor, el del claim y el del canal salen de la misma
    // normalización (ronda 4 · 6).
    expect(fuente).toMatch(/const terminalId = bootstrap\.terminal\.id\.toLowerCase\(\)/);
  });
});
