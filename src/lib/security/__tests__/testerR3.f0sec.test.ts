/// <reference types="jest" />
/**
 * F0-SEC r3 · tester · sondas adversarias sobre `secrets.ts`,
 * `wsSessionToken.ts` y `rateLimit.ts`.
 *
 *  - Detector de relleno (huecos 4 y 5 del tester r2): casos cerrados, bordes
 *    conservados y FALSOS POSITIVOS (secretos reales con forma realista que NO
 *    deben rechazarse). Los bordes que siguen abiertos se anotan con su valor
 *    actual (no son `test.failing`: son de severidad baja y se documentan).
 *  - Token WS: caducado por 1 s, exp == now, firmado con otra clave, dos
 *    puntos, firma truncada, exp/orgId con tipos raros, replay de jti,
 *    secreto de 32 chars pero de relleno.
 *  - Rate limit: clave por IP + por organización combinadas, XFF con varios
 *    saltos (el primero manda: es el que controla el cliente si el proxy
 *    APPENDA), TOCTOU con `persistentCount` (legado) frente al store atómico.
 *
 * Sin credenciales reales: todos los valores son inventados.
 */
import crypto from 'crypto';
import { isRealSecret, secretProblem, readRealSecret, _resetSecretReports } from '../secrets';
import { issueWsSessionToken, verifyWsSessionToken, consumeWsSessionJti, readWsSessionSecret, _resetWsSessionJtis, MAX_TTL_SECONDS } from '../wsSessionToken';
import { checkRateLimit, checkRateLimits, getClientIp, _resetRateLimits, type RateLimitStore } from '../rateLimit';

const REAL_HEX_64 = '3f9a1c7e5b2d4680a9c3e1f7b5d2a4c6e8f0b1d3a5c7e9f1b3d5a7c9e1f3b5d7';
const OTHER_HEX_64 = 'c6e8f0b1d3a5c7e9f1b3d5a7c9e1f3b5d73f9a1c7e5b2d4680a9c3e1f7b5d2a4';

beforeEach(() => {
  _resetSecretReports();
  _resetWsSessionJtis();
  _resetRateLimits();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── secrets.ts ──────────────────────────────────────────────────────────────

describe('detector de relleno · huecos 4 y 5 del tester r2 cerrados', () => {
  test.each([
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',   // base64 de 32 ceros (hueco 4)
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    '1234changeme5678',                               // marca en cualquier posición (hueco 5)
    'CHANGEME1234567890',
    'xxchange-mexx0123456789',
    'undefinedundefined',                              // solo palabras de relleno (hueco 5)
    'undefined-undefined',
    'null_null',
    'nullnullnullnull',
    'undefined.undefined.undefined',
    'testtesttesttest',
    'secretsecretsecret',
    'example-sample-dummy-test',
    'sk-undefinedundefined',                           // prefijo de proveedor + relleno
  ])('%p → placeholder', (v) => {
    expect(secretProblem(v)).toBe('placeholder');
    expect(isRealSecret(v)).toBe(false);
  });

  test('bordes que el constructor conserva a propósito (documentados en su informe)', () => {
    expect(secretProblem('abc-your-secure-random-token-here-with-a-long-tail-1234567')).toBeNull(); // >= 48 con your- en medio
    expect(secretProblem('abcdefgh-todo-1234567')).toBe('placeholder');                             // falso positivo conservador
    expect(secretProblem('xxxxxxxxxxxxxxx1')).toBeNull();
    expect(secretProblem('0123456789abcdef')).toBeNull();
  });

  test('ANOTADO (bajo): plantillas mal interpoladas con separadores fuera de [-_.] o con [object Object] siguen pasando', () => {
    // `${A}:${B}` y `${obj}${obj}` producen esto; ninguno es un secreto.
    expect(secretProblem('undefined:undefined')).toBeNull();
    expect(secretProblem('[object Object][object Object]')).toBeNull();
    expect(secretProblem('undefined-undefined1')).toBeNull();
    // Tres "=" no es base64 válido; el detector solo quita 1-2. Se acepta (no aparece en documentación real).
    expect(secretProblem('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA===')).toBeNull();
  });
});

describe('detector de relleno · FALSOS POSITIVOS: secretos con forma real NO se rechazan', () => {
  test.each([
    REAL_HEX_64,
    crypto.createHash('sha256').update('semilla-fija-del-test').digest('base64'),  // base64 aleatorio con "=" final
    `whsec_${crypto.createHash('sha256').update('otra-semilla').digest('base64')}`,
    ['sk_test_', '51H8f2kL9mN3pQ7rS1tU5vW9xY2zA4bC6dE8'].join(''), // Stripe de prueba (test en medio, prefijo de proveedor); partida para el escáner de GitHub
    ['sk_live_', '51H8f2kL9mN3pQ7rS1tU5vW9xY2zA4bC6dE8'].join(''),
    're_9kL2mN4pQ6rS8tU1vW3xY5zA7bC9dE1f',
    ['SK', '0f3e1d9c7b5a3f1e9d7c5b3a1f9e7d5c'].join(''),                // Twilio API key
    ['AC', '0f3e1d9c7b5a3f1e9d7c5b3a1f9e7d5c'].join(''),
    'abcdefghtodo1234567890',                            // 8 letras + todo sin separador: no es prefijo
    'a1b2test3c4d5e6f7g8h9',                             // "test" dentro de un valor mixto
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123def456',  // forma de JWT
    'correct-horse-battery-staple-2026',                 // passphrase con guiones
    'contrasena-muy-larga-sin-palabras-de-relleno',
    'NaNNaNNaNNaNNaNNaN',                                // anotado: se acepta (18 chars, no es palabra de relleno)
  ])('%p → real', (v) => {
    expect(secretProblem(v)).toBeNull();
  });
});

describe('readRealSecret · alias', () => {
  const ENV = ['TESTER_R3_MAIN', 'TESTER_R3_ALIAS'];
  afterEach(() => { for (const k of ENV) delete process.env[k]; });

  test('principal de relleno + alias real → devuelve el alias y AVISA una vez (sin imprimir el valor)', () => {
    process.env.TESTER_R3_MAIN = 'changeme-2026-09-15';
    process.env.TESTER_R3_ALIAS = REAL_HEX_64;
    expect(readRealSecret('TESTER_R3_MAIN', { aliases: ['TESTER_R3_ALIAS'] })).toBe(REAL_HEX_64);
    expect(readRealSecret('TESTER_R3_MAIN', { aliases: ['TESTER_R3_ALIAS'] })).toBe(REAL_HEX_64);
    const warns = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(warns.filter((w) => w.includes('TESTER_R3_ALIAS'))).toHaveLength(1);
    expect(warns.join('\n')).not.toContain(REAL_HEX_64);
    expect(warns.join('\n')).not.toContain('changeme-2026');
  });

  test('principal ausente + alias real → sin aviso; principal real → el alias de relleno no importa', () => {
    process.env.TESTER_R3_ALIAS = REAL_HEX_64;
    expect(readRealSecret('TESTER_R3_MAIN', { aliases: ['TESTER_R3_ALIAS'] })).toBe(REAL_HEX_64);
    expect(console.warn).not.toHaveBeenCalled();
    process.env.TESTER_R3_MAIN = OTHER_HEX_64;
    process.env.TESTER_R3_ALIAS = 'your-alias-placeholder';
    expect(readRealSecret('TESTER_R3_MAIN', { aliases: ['TESTER_R3_ALIAS'] })).toBe(OTHER_HEX_64);
  });

  test('principal y alias de relleno → null y el motivo registrado es el de la principal', () => {
    process.env.TESTER_R3_MAIN = 'short';
    process.env.TESTER_R3_ALIAS = 'changeme';
    expect(readRealSecret('TESTER_R3_MAIN', { aliases: ['TESTER_R3_ALIAS'] })).toBeNull();
    expect(String((console.error as jest.Mock).mock.calls[0][0])).toContain('TESTER_R3_MAIN es demasiado corta');
  });
});

// ─── wsSessionToken.ts ───────────────────────────────────────────────────────

describe('token WS · caducidad, otra clave, formas rotas', () => {
  const original = process.env.WS_SESSION_SECRET;
  beforeEach(() => { process.env.WS_SESSION_SECRET = REAL_HEX_64; });
  afterAll(() => { if (original === undefined) delete process.env.WS_SESSION_SECRET; else process.env.WS_SESSION_SECRET = original; });

  function forge(claims: Record<string, unknown>, secret: string): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${payload}.${sig}`;
  }
  const now = () => Math.floor(Date.now() / 1000);

  test('caducado por 1 s → null; exp == now → válido; exp = now + MAX_TTL → válido; +1 → null', () => {
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() - 1 }, REAL_HEX_64))).toBeNull();
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() + 1 }, REAL_HEX_64))?.orgId).toBe(7);
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() + MAX_TTL_SECONDS }, REAL_HEX_64))?.orgId).toBe(7);
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() + MAX_TTL_SECONDS + 2 }, REAL_HEX_64))).toBeNull();
  });

  test('firmado con OTRA clave real → null; el mismo token con la clave correcta → válido', () => {
    const t = forge({ orgId: 7, exp: now() + 60 }, OTHER_HEX_64);
    expect(verifyWsSessionToken(t)).toBeNull();
    process.env.WS_SESSION_SECRET = OTHER_HEX_64;
    expect(verifyWsSessionToken(t)?.orgId).toBe(7);
  });

  test('secreto de 32 chars pero de relleno (changeme x4) → no emite ni verifica', () => {
    process.env.WS_SESSION_SECRET = 'changemechangemechangemechangeme';
    expect(readWsSessionSecret()).toBeNull();
    expect(() => issueWsSessionToken({ orgId: 7 })).toThrow();
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() + 60 }, 'changemechangemechangemechangeme'))).toBeNull();
  });

  test('formas rotas: dos puntos, firma truncada, firma con base64 no-url, payload no JSON, sin punto, vacío', () => {
    const good = issueWsSessionToken({ orgId: 7 });
    const [payload, sig] = good.split('.');
    expect(verifyWsSessionToken(`${payload}.${sig}.extra`)).toBeNull();
    expect(verifyWsSessionToken(`${payload}.${sig.slice(0, -1)}`)).toBeNull();
    expect(verifyWsSessionToken(`${payload}.${sig.replace(/-/g, '+').replace(/_/g, '/')}=`)).toBeNull();
    expect(verifyWsSessionToken(`bm8tanNvbg.${crypto.createHmac('sha256', REAL_HEX_64).update('bm8tanNvbg').digest('base64url')}`)).toBeNull();
    expect(verifyWsSessionToken(payload)).toBeNull();
    expect(verifyWsSessionToken('')).toBeNull();
    expect(verifyWsSessionToken(`.${sig}`)).toBeNull();
  });

  test('claims con tipos raros firmados con la clave buena → null (exp string, exp NaN, orgId string, orgId 0/-1/1.5, jti objeto)', () => {
    for (const claims of [
      { orgId: 7, exp: String(now() + 60) },
      { orgId: 7, exp: null },
      { orgId: '7', exp: now() + 60 },
      { orgId: 0, exp: now() + 60 },
      { orgId: -1, exp: now() + 60 },
      { orgId: 1.5, exp: now() + 60 },
      { exp: now() + 60 },
      { orgId: 7, exp: now() + 60, jti: { a: 1 } },
      { orgId: 7, exp: now() + 60, jti: '' },
      { orgId: 7, exp: now() + 60, jti: 'x'.repeat(65) },
    ]) expect(verifyWsSessionToken(forge(claims, REAL_HEX_64))).toBeNull();
  });

  test('ANOTADO (bajo, sin impacto): orgId 2^53+2 (entero no seguro) se acepta; callId/agentId no se validan de tipo', () => {
    expect(verifyWsSessionToken(forge({ orgId: 2 ** 53 + 2, exp: now() + 60 }, REAL_HEX_64))?.orgId).toBe(2 ** 53 + 2);
    expect(verifyWsSessionToken(forge({ orgId: 7, exp: now() + 60, callId: { $ne: null } }, REAL_HEX_64))?.callId).toEqual({ $ne: null });
  });

  test('replay del jti: consumir 2 veces → false; token sin jti → false; jti de un token caducado → false', () => {
    const t = issueWsSessionToken({ orgId: 7 });
    const claims = verifyWsSessionToken(t)!;
    expect(consumeWsSessionJti(claims)).toBe(true);
    expect(consumeWsSessionJti(claims)).toBe(false);
    expect(consumeWsSessionJti({ exp: claims.exp })).toBe(false);
    expect(consumeWsSessionJti({ jti: 'abc', exp: now() - 1 })).toBe(false);
    // El mismo jti con un exp distinto no se puede fabricar (va firmado); pero si se re-presentara, sigue consumido.
    expect(consumeWsSessionJti({ jti: claims.jti, exp: claims.exp + 100 })).toBe(false);
  });
});

// ─── rateLimit.ts ────────────────────────────────────────────────────────────

describe('rate limit · por IP y por organización combinados', () => {
  const opts = { limit: 2, windowMs: 60_000 };

  test('la organización agota su cupo aunque cambie de IP; la petición bloqueada no consume la IP nueva', async () => {
    for (const ip of ['1.1.1.1', '2.2.2.2']) expect((await checkRateLimits([{ key: `ip:${ip}`, opts }, { key: 'org:7', opts }])).allowed).toBe(true);
    const r = await checkRateLimits([{ key: 'ip:3.3.3.3', opts }, { key: 'org:7', opts }]);
    expect(r.allowed).toBe(false);
    expect(r.blockedKey).toBe('org:7');
    expect((await checkRateLimit('ip:3.3.3.3', opts)).count).toBe(1);
    // Otra organización desde la misma IP bloqueada por org:7 sigue pasando.
    expect((await checkRateLimits([{ key: 'ip:3.3.3.3', opts }, { key: 'org:8', opts }])).allowed).toBe(true);
  });

  test('getClientIp: con varios saltos manda el PRIMERO (controlable por el cliente si el proxy APPENDA en vez de sobrescribir)', () => {
    const req = (h: Record<string, string>) => new Request('http://x', { headers: h });
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 1.2.3.4' }))).toBe('9.9.9.9');
    expect(getClientIp(req({ 'x-forwarded-for': ' , 1.2.3.4' }))).toBe('');
    expect(getClientIp(req({ 'x-real-ip': '5.5.5.5' }))).toBe('5.5.5.5');
    expect(getClientIp(req({}))).toBe('unknown');
    // Un valor arbitrario no rompe la clave (queda como cubo propio): documentado.
    expect(getClientIp(req({ 'x-forwarded-for': 'no-es-ip' }))).toBe('no-es-ip');
  });

  test('clave con la IP vacía sigue teniendo prefijo → no dispara el fail-closed de clave vacía (cubo compartido "ip:")', async () => {
    expect((await checkRateLimit('ip:', opts)).allowed).toBe(true);
  });

  test('ANOTADO (bajo): con `persistentCount` (legado, async) dos peticiones simultáneas pasan ambas con limit 1 (TOCTOU en memoria)', async () => {
    const legacy = { limit: 1, windowMs: 60_000, persistentCount: async () => { await new Promise((r) => setTimeout(r, 5)); return 0; } };
    const [a, b] = await Promise.all([checkRateLimit('toctou', legacy), checkRateLimit('toctou', legacy)]);
    expect([a.allowed, b.allowed]).toEqual([true, true]);
    // Sin `persistentCount` el camino es síncrono y la segunda ya ve la primera.
    const [c, d] = await Promise.all([checkRateLimit('sync', { limit: 1, windowMs: 60_000 }), checkRateLimit('sync', { limit: 1, windowMs: 60_000 })]);
    expect([c.allowed, d.allowed]).toEqual([true, false]);
  });

  test('con store atómico, dos peticiones simultáneas con limit 1: solo pasa la que el store registró', async () => {
    const counts = new Map<string, number>();
    const store: RateLimitStore = {
      async hit(entries) {
        await new Promise((r) => setTimeout(r, 2));
        // Atómico: si alguna excede, no registra ninguna.
        const projected = entries.map((e) => ({ e, next: (counts.get(e.key) ?? 0) + 1 }));
        const fits = projected.every((p) => p.next <= p.e.limit);
        if (fits) for (const p of projected) counts.set(p.e.key, p.next);
        return projected.map((p) => ({ key: p.e.key, count: p.next, resetAt: new Date(Date.now() + p.e.windowMs) }));
      },
    };
    const o = { limit: 1, windowMs: 60_000 };
    const [a, b] = await Promise.all([checkRateLimit('atom', o, { store }), checkRateLimit('atom', o, { store })]);
    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(1);
  });

  test('límites raros: limit 1.5 admite 1 y bloquea el 2; windowMs 0.5 permite (anotado por el tester r2)', async () => {
    expect((await checkRateLimit('f', { limit: 1.5, windowMs: 60_000 })).allowed).toBe(true);
    expect((await checkRateLimit('f', { limit: 1.5, windowMs: 60_000 })).allowed).toBe(false);
    expect((await checkRateLimit('w', { limit: 1, windowMs: 0.5 })).allowed).toBe(true);
  });

  test('store que devuelve resetAt en el pasado o count negativo no abre el cupo', async () => {
    const store: RateLimitStore = { async hit(entries) { return entries.map((e) => ({ key: e.key, count: -5, resetAt: new Date(0) })); } };
    const o = { limit: 1, windowMs: 60_000 };
    expect((await checkRateLimit('neg', o, { store })).allowed).toBe(true);
    // La memoria ya tiene 1; el store dice -5 → manda el max → bloquea.
    expect((await checkRateLimit('neg', o, { store })).allowed).toBe(false);
  });
});
