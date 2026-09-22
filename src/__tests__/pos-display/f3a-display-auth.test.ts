/**
 * Fase 3, parte A · secretos y autenticación de la pantalla remota
 * (PLAN §3.3, §7 y §11).
 *
 * - displayTokens: código de 6 dígitos y 5 min; token de 32 bytes en
 *   base64url; sha256 como único rastro en la base; comparación en tiempo
 *   constante; JWT HS256 de Realtime con `role: anon` y claims de la terminal.
 * - displayAuth: token válido → terminal + organización DESDE LA FILA;
 *   ausente / mal formado / desconocido / revocado / terminal inactiva /
 *   organización incoherente → 401 uniforme; base caída → 503.
 * - Ronda 2: cubo de FALLOS por IP: los 401 cuentan, los aciertos no, y con
 *   el cubo agotado se responde 429 SIN consultar la base.
 * - Ronda 3: GUARDARRAÍL del payload del JWT (conjunto EXACTO de claves;
 *   nunca `organization_id` ni otro claim que una política `to public` o una
 *   función SECURITY DEFINER lea como confianza), TTL de 5 min, límite de
 *   fallos 300/min (protege el coste del SELECT, no la fuerza bruta).
 */

jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import { NextRequest } from 'next/server';
import { _resetRateLimits, isRateLimitExhausted, checkRateLimit } from '@/lib/security/rateLimit';
import {
  authenticateDisplayRequest,
  DISPLAY_AUTH_FAIL_LIMIT,
  DISPLAY_AUTH_FAIL_PREFIX,
  DISPLAY_RATE_LIMITED_CODE,
  DISPLAY_UNAUTHORIZED_CODE,
  type DisplayAuthClient,
} from '@/lib/pos/display/server/displayAuth';
import {
  DISPLAY_TOKEN_PATTERN,
  PAIRING_CODE_PATTERN,
  PAIRING_CODE_TTL_MS,
  REALTIME_JWT_FORBIDDEN_CLAIMS,
  REALTIME_JWT_PAYLOAD_KEYS,
  REALTIME_JWT_TTL_SECONDS,
  decodeJwtPayload,
  generateDisplayToken,
  generatePairingCode,
  hashDisplayToken,
  hashesMatch,
  isDisplayTokenShape,
  isPairingCodeShape,
  pairingCodeExpiresAt,
  readBearerToken,
  signRealtimeJwt,
  verifyJwtSignature,
} from '@/lib/pos/display/server/displayTokens';
import { makeSupabaseDouble, type RecordedCall } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('displayTokens · código de emparejamiento', () => {
  it('genera 6 dígitos (con ceros a la izquierda) y solo acepta esa forma', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(PAIRING_CODE_PATTERN);
      expect(code).toHaveLength(6);
    }
    expect(isPairingCodeShape('012345')).toBe(true);
    expect(isPairingCodeShape('12345')).toBe(false);
    expect(isPairingCodeShape('1234567')).toBe(false);
    expect(isPairingCodeShape('12a456')).toBe(false);
    expect(isPairingCodeShape(123456)).toBe(false);
    expect(isPairingCodeShape(null)).toBe(false);
  });

  it('caduca exactamente a los 5 minutos', () => {
    expect(PAIRING_CODE_TTL_MS).toBe(5 * 60 * 1000);
    const now = Date.UTC(2026, 8, 22, 12, 0, 0);
    expect(pairingCodeExpiresAt(now).toISOString()).toBe('2026-09-22T12:05:00.000Z');
  });
});

describe('displayTokens · token largo y hash', () => {
  it('32 bytes en base64url (43 caracteres), distinto en cada llamada', () => {
    const a = generateDisplayToken();
    const b = generateDisplayToken();
    expect(a).toMatch(DISPLAY_TOKEN_PATTERN);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isDisplayTokenShape(a)).toBe(true);
    expect(isDisplayTokenShape(a + 'x')).toBe(false);
    expect(isDisplayTokenShape(a.slice(0, 42))).toBe(false);
    expect(isDisplayTokenShape('')).toBe(false);
    expect(isDisplayTokenShape(undefined)).toBe(false);
  });

  it('el hash es sha256 hex determinista y no contiene el token', () => {
    const token = generateDisplayToken();
    const hash = hashDisplayToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDisplayToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hashDisplayToken(generateDisplayToken())).not.toBe(hash);
  });

  it('hashesMatch: igual → true; distinto, nulo (revocado), vacío o longitud distinta → false', () => {
    const hash = hashDisplayToken('t');
    expect(hashesMatch(hash, hash)).toBe(true);
    expect(hashesMatch(hashDisplayToken('u'), hash)).toBe(false);
    expect(hashesMatch(null, hash)).toBe(false);
    expect(hashesMatch(undefined, hash)).toBe(false);
    expect(hashesMatch('', hash)).toBe(false);
    expect(hashesMatch(hash.slice(1), hash)).toBe(false);
    expect(hashesMatch(hash, hash.slice(1))).toBe(false);
  });

  it('readBearerToken solo acepta `Bearer <token>`', () => {
    const req = (authorization?: string) => new NextRequest('http://localhost/x', { headers: authorization ? { authorization } : {} });
    expect(readBearerToken(req())).toBeNull();
    expect(readBearerToken(req('Basic abc'))).toBeNull();
    expect(readBearerToken(req('Bearer'))).toBeNull();
    expect(readBearerToken(req('Bearer abc'))).toBe('abc');
    expect(readBearerToken(req('bearer abc'))).toBe('abc');
    expect(readBearerToken(req('Bearer abc def'))).toBeNull();
  });
});

describe('displayTokens · JWT de Realtime', () => {
  const secret = 'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl-un-secreto-de-pruebas';

  it('HS256 firmado con el secreto, role anon, claims de la terminal y exp corto', () => {
    const now = Date.UTC(2026, 8, 22, 12, 0, 0);
    const { token, expiresAt } = signRealtimeJwt(secret, { terminalId: T1, now });
    expect(token.split('.')).toHaveLength(3);
    expect(verifyJwtSignature(token, secret)).toBe(true);
    expect(verifyJwtSignature(token, secret + 'x')).toBe(false);
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decodeJwtPayload(token);
    expect(payload).toMatchObject({
      role: 'anon',
      aud: 'pos-display',
      sub: `pos-display:${T1}`,
      pos_terminal_id: T1,
      iat: now / 1000,
      exp: now / 1000 + REALTIME_JWT_TTL_SECONDS,
    });
    expect(payload?.role).not.toBe('authenticated');
    expect(expiresAt).toBe(new Date(now + REALTIME_JWT_TTL_SECONDS * 1000).toISOString());
  });

  it('respeta un ttl explícito y lanza con secreto vacío', () => {
    const now = 1_700_000_000_000;
    const { token } = signRealtimeJwt(secret, { terminalId: T1, now, ttlSeconds: 60 });
    expect(decodeJwtPayload(token)?.exp).toBe(now / 1000 + 60);
    expect(() => signRealtimeJwt('', { terminalId: T1 })).toThrow();
  });

  it('GUARDARRAÍL (ronda 3, qa crítico 1): el payload lleva EXACTAMENTE role, aud, sub, pos_terminal_id, iat, exp; nunca organization_id ni otro claim de confianza', () => {
    // El JWT va firmado con el MISMO secreto que valida PostgREST. En este
    // proyecto hay políticas `to public` (incluye anon) cuyo qual es
    // `organization_id = (auth.jwt() ->> 'organization_id')::integer` (carts,
    // organization_images, organization_taxes…) y funciones SECURITY DEFINER
    // que leen ese claim (current_org_id…). Con `organization_id` en el
    // payload, la tableta (o un token robado) leía y escribía esas tablas
    // para la organización entera. Cualquier claim nuevo pasa antes por un
    // grep de pg_policies y pg_proc; si hace falta la organización, que sea
    // `pos_display_org` (prefijo propio que ninguna política lee).
    expect([...REALTIME_JWT_PAYLOAD_KEYS].sort()).toEqual(['aud', 'exp', 'iat', 'pos_terminal_id', 'role', 'sub']);
    const { token } = signRealtimeJwt(secret, { terminalId: T1 });
    const payload = decodeJwtPayload(token)!;
    expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
    for (const forbidden of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload).not.toHaveProperty(forbidden);
    expect(REALTIME_JWT_FORBIDDEN_CLAIMS).toEqual(expect.arrayContaining(['organization_id', 'org_id', 'app_role', 'email']));
    // `sub` NO tiene forma de uuid: auth.uid() no puede tomarlo por un usuario.
    expect(payload.sub).toBe(`pos-display:${T1}`);
    expect(String(payload.sub)).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(payload.role).toBe('anon');
    expect(payload.aud).toBe('pos-display');
    // Ni con argumentos de más: la firma solo admite terminalId/ttl/now.
    const extra = signRealtimeJwt(secret, { terminalId: T1, organizationId: 120 } as unknown as Parameters<typeof signRealtimeJwt>[1]);
    expect(Object.keys(decodeJwtPayload(extra.token)!).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
  });

  it('TTL de 5 minutos (ronda 3, qa alto 2): la ventana residual tras revocar es como mucho la vida del JWT', () => {
    expect(REALTIME_JWT_TTL_SECONDS).toBe(5 * 60);
    const now = 1_700_000_000_000;
    const { token } = signRealtimeJwt(secret, { terminalId: T1, now });
    const payload = decodeJwtPayload(token)!;
    expect(Number(payload.exp) - Number(payload.iat)).toBe(300);
  });

  it('el id de la terminal se normaliza a minúsculas en el claim y en sub (la política de la caja y el canal lo esperan así)', () => {
    const upper = T1.toUpperCase();
    const payload = decodeJwtPayload(signRealtimeJwt(secret, { terminalId: upper }).token)!;
    expect(payload.pos_terminal_id).toBe(T1);
    expect(payload.sub).toBe(`pos-display:${T1}`);
  });
});

describe('authenticateDisplayRequest', () => {
  const token = generateDisplayToken();
  const hash = hashDisplayToken(token);
  const state: {
    secret: { terminal_id: string; organization_id: number; display_token_hash: string | null } | null;
    terminal: { id: string; organization_id: number; branch_id: number; name: string; code: string; is_active: boolean } | null;
    fail: 'secrets' | 'terminals' | null;
  } = { secret: null, terminal: null, fail: null };

  function responder(call: RecordedCall) {
    if (call.table === 'pos_terminal_secrets') {
      if (state.fail === 'secrets') return { data: null, error: { message: 'boom' } };
      const wanted = call.filters.find(([, col]) => col === 'display_token_hash')?.[2];
      return { data: state.secret && state.secret.display_token_hash === wanted ? state.secret : null, error: null };
    }
    if (call.table === 'pos_terminals') {
      if (state.fail === 'terminals') return { data: null, error: { message: 'boom' } };
      const wanted = call.filters.find(([, col]) => col === 'id')?.[2];
      return { data: state.terminal && state.terminal.id === wanted ? state.terminal : null, error: null };
    }
    throw new Error(`tabla inesperada: ${call.table}`);
  }

  let db: ReturnType<typeof makeSupabaseDouble>;
  const req = (authorization?: string) => new NextRequest('http://localhost/api/pos/display/bootstrap', { headers: authorization ? { authorization } : {} });
  const client = () => db as unknown as DisplayAuthClient;

  beforeEach(() => {
    _resetRateLimits();
    db = makeSupabaseDouble(responder);
    state.secret = { terminal_id: T1, organization_id: 120, display_token_hash: hash };
    state.terminal = { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true };
    state.fail = null;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('token válido → terminal con su organización, tomada de la fila (no de la petición)', async () => {
    const result = await authenticateDisplayRequest(req(`Bearer ${token}`), { client: client() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.terminal).toEqual({ id: T1, organizationId: 120, branchId: 7, name: 'Caja 1', code: 'CAJA-1' });
    // Se buscó por el hash, nunca por el token en claro.
    const secrets = db.calls.find((c) => c.table === 'pos_terminal_secrets');
    expect(secrets?.filters).toEqual([['eq', 'display_token_hash', hash]]);
    expect(JSON.stringify(db.calls)).not.toContain(token);
  });

  async function expect401(authorization?: string) {
    const result = await authenticateDisplayRequest(req(authorization), { client: client() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('cache-control')).toBe('no-store');
    const body = await result.response.json();
    expect(body).toEqual({ error: expect.any(String), code: DISPLAY_UNAUTHORIZED_CODE });
    return body;
  }

  it('sin cabecera → 401 sin consultar la base', async () => {
    await expect401();
    expect(db.calls).toHaveLength(0);
  });

  it('token con forma inválida → 401 sin consultar la base', async () => {
    await expect401('Bearer no-es-un-token');
    await expect401(`Basic ${token}`);
    expect(db.calls).toHaveLength(0);
  });

  it('token desconocido → 401 con el MISMO cuerpo que uno revocado', async () => {
    const unknownBody = await expect401(`Bearer ${generateDisplayToken()}`);
    state.secret = { terminal_id: T1, organization_id: 120, display_token_hash: null }; // revocado
    const revokedBody = await expect401(`Bearer ${token}`);
    expect(revokedBody).toEqual(unknownBody);
  });

  it('terminal inactiva o inexistente → 401', async () => {
    state.terminal = { ...state.terminal!, is_active: false };
    await expect401(`Bearer ${token}`);
    state.terminal = null;
    await expect401(`Bearer ${token}`);
  });

  it('organización distinta entre secretos y terminal → 401 y registro', async () => {
    state.terminal = { ...state.terminal!, organization_id: 121 };
    await expect401(`Bearer ${token}`);
    expect(console.error).toHaveBeenCalled();
  });

  it('un hash devuelto que no coincide (igualdad laxa de la consulta) → 401', async () => {
    const other = hashDisplayToken('otro');
    db = makeSupabaseDouble((call) =>
      call.table === 'pos_terminal_secrets' ? { data: { terminal_id: T1, organization_id: 120, display_token_hash: other }, error: null } : responder(call),
    );
    await expect401(`Bearer ${token}`);
  });

  it('base caída → 503, no 401 (no confundir con revocación)', async () => {
    state.fail = 'secrets';
    let result = await authenticateDisplayRequest(req(`Bearer ${token}`), { client: client() });
    expect(result.ok === false && result.response.status).toBe(503);
    state.fail = 'terminals';
    result = await authenticateDisplayRequest(req(`Bearer ${token}`), { client: client() });
    expect(result.ok === false && result.response.status).toBe(503);
  });
});

describe('authenticateDisplayRequest · rate limit de fallos por IP (ronda 2)', () => {
  const token = generateDisplayToken();
  const hash = hashDisplayToken(token);
  let db: ReturnType<typeof makeSupabaseDouble>;
  const req = (authorization: string | undefined, ip?: string) =>
    new NextRequest('http://localhost/api/pos/display/heartbeat', { headers: { ...(authorization ? { authorization } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) } });
  const auth = (authorization: string | undefined, ip?: string) => authenticateDisplayRequest(req(authorization, ip), { client: db as unknown as DisplayAuthClient });

  beforeEach(() => {
    _resetRateLimits();
    db = makeSupabaseDouble((call) => {
      if (call.table === 'pos_terminal_secrets') {
        const wanted = call.filters.find(([, col]) => col === 'display_token_hash')?.[2];
        return { data: wanted === hash ? { terminal_id: T1, organization_id: 120, display_token_hash: hash } : null, error: null };
      }
      return { data: { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true }, error: null };
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('300 fallos por minuto por IP (ronda 3: protege el coste del SELECT, no la fuerza bruta); el 301.º es 429 SIN consultar la base; otra IP sigue', async () => {
    expect(DISPLAY_AUTH_FAIL_LIMIT).toMatchObject({ limit: 300, windowMs: 60 * 1000 });
    const ip = '203.0.113.5';
    for (let i = 0; i < DISPLAY_AUTH_FAIL_LIMIT.limit; i++) {
      const r = await auth(`Bearer ${generateDisplayToken()}`, ip);
      expect(r.ok === false && r.response.status).toBe(401);
    }
    const queriesBefore = db.calls.length;
    expect(queriesBefore).toBe(DISPLAY_AUTH_FAIL_LIMIT.limit); // un SELECT por intento hasta agotar el cubo
    // Agotado: 429 con Retry-After, y ni el token VÁLIDO pasa desde esa IP (sin
    // tocar la base). DECISIÓN documentada (ronda 3, qa bajo 4): el corte es por
    // IP y va antes de mirar el token; el riesgo queda acotado a la LAN de la
    // tienda y a la ventana de 60 s.
    for (const header of [`Bearer ${generateDisplayToken()}`, `Bearer ${token}`, undefined]) {
      const r = await auth(header, ip);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.response.status).toBe(429);
      expect((await r.response.json()).code).toBe(DISPLAY_RATE_LIMITED_CODE);
      expect(Number(r.response.headers.get('retry-after'))).toBeGreaterThan(0);
    }
    expect(db.calls.length).toBe(queriesBefore);
    // Otra IP: cubo propio.
    const other = await auth(`Bearer ${token}`, '198.51.100.9');
    expect(other.ok).toBe(true);
    expect(isRateLimitExhausted(`${DISPLAY_AUTH_FAIL_PREFIX}${ip}`, DISPLAY_AUTH_FAIL_LIMIT)).toBe(true);
    expect(isRateLimitExhausted(`${DISPLAY_AUTH_FAIL_PREFIX}198.51.100.9`, DISPLAY_AUTH_FAIL_LIMIT)).toBe(false);
  });

  it('los aciertos NO consumen cupo: 200 latidos válidos seguidos desde la misma IP', async () => {
    const ip = '203.0.113.6';
    for (let i = 0; i < 200; i++) {
      const r = await auth(`Bearer ${token}`, ip);
      expect(r.ok).toBe(true);
    }
    expect(isRateLimitExhausted(`${DISPLAY_AUTH_FAIL_PREFIX}${ip}`, DISPLAY_AUTH_FAIL_LIMIT)).toBe(false);
    // Y un fallo después sigue siendo 401 (no 429): el cubo estaba a cero.
    const r = await auth(`Bearer ${generateDisplayToken()}`, ip);
    expect(r.ok === false && r.response.status).toBe(401);
  });

  it('sin cabecera de IP: cubo compartido «unknown» de 10', async () => {
    expect(DISPLAY_AUTH_FAIL_LIMIT.unknownClientLimit).toBe(10);
    for (let i = 0; i < 10; i++) {
      const r = await auth(`Bearer ${generateDisplayToken()}`);
      expect(r.ok === false && r.response.status).toBe(401);
    }
    const r = await auth(`Bearer ${generateDisplayToken()}`);
    expect(r.ok === false && r.response.status).toBe(429);
  });

  it('isRateLimitExhausted: cubo vacío o ventana vencida → no; al límite → sí; clave vacía → sí (fail-closed); no registra', async () => {
    const opts = { limit: 2, windowMs: 1000 };
    expect(isRateLimitExhausted('k:ip:1.1.1.1', opts)).toBe(false);
    await checkRateLimit('k:ip:1.1.1.1', opts);
    expect(isRateLimitExhausted('k:ip:1.1.1.1', opts)).toBe(false);
    await checkRateLimit('k:ip:1.1.1.1', opts);
    expect(isRateLimitExhausted('k:ip:1.1.1.1', opts)).toBe(true);
    expect(isRateLimitExhausted('k:ip:1.1.1.1', opts, Date.now() + 1001)).toBe(false);
    expect(isRateLimitExhausted('', opts)).toBe(true);
    expect(isRateLimitExhausted('k:ip:2.2.2.2', { limit: 0 })).toBe(true);
    // Mirar no registra: la clave sigue libre para checkRateLimit.
    expect(isRateLimitExhausted('k:ip:3.3.3.3', { limit: 1 })).toBe(false);
    expect((await checkRateLimit('k:ip:3.3.3.3', { limit: 1 })).allowed).toBe(true);
  });
});
