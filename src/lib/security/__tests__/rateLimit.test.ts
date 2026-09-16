/// <reference types="jest" />
import { checkRateLimit, checkRateLimits, getClientIp, _resetRateLimits, effectiveLimit, isUnknownClientKey, UNKNOWN_CLIENT_IP, UNKNOWN_CLIENT_LIMIT_DIVISOR, type RateLimitOptions } from '../rateLimit';

describe('rateLimit', () => {
  beforeEach(() => _resetRateLimits());

  test('permite hasta `limit` hits en la ventana y bloquea el siguiente', async () => {
    const opts = { limit: 3, windowMs: 60_000 };
    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimit('k', opts);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }
    const blocked = await checkRateLimit('k', opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test('claves independientes no se afectan', async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await checkRateLimit('a', opts)).allowed).toBe(true);
    expect((await checkRateLimit('b', opts)).allowed).toBe(true);
    expect((await checkRateLimit('a', opts)).allowed).toBe(false);
  });

  test('la ventana expira', async () => {
    const opts = { limit: 1, windowMs: 10 };
    expect((await checkRateLimit('w', opts)).allowed).toBe(true);
    expect((await checkRateLimit('w', opts)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 15));
    expect((await checkRateLimit('w', opts)).allowed).toBe(true);
  });

  test('clave vacía → bloqueado (fail-closed)', async () => {
    expect((await checkRateLimit('', { limit: 5 })).allowed).toBe(false);
  });

  test('`persistentCount` (legado) ya no existe: el único mecanismo persistente es el `store` atómico (F0-SEC C+D r3)', async () => {
    // @ts-expect-error — la opción se retiró de RateLimitOptions; ts-jest (diagnósticos activos) lo comprueba.
    const legacy: RateLimitOptions = { limit: 5, persistentCount: async () => 4 };
    // Y en tiempo de ejecución se ignora: cuenta solo la memoria.
    expect((await checkRateLimit('p', legacy)).count).toBe(1);
  });

  test('checkRateLimits bloquea si cualquiera excede', async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    await checkRateLimit('ip:1', opts);
    const r = await checkRateLimits([
      { key: 'user:1', opts },
      { key: 'ip:1', opts },
    ]);
    expect(r.allowed).toBe(false);
    expect(r.blockedKey).toBe('ip:1');
  });

  test('getClientIp toma la primera IP de x-forwarded-for', () => {
    const req = new Request('https://x/', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } });
    expect(getClientIp(req)).toBe('1.2.3.4');
    expect(getClientIp(new Request('https://x/'))).toBe('unknown');
    expect(getClientIp(new Request('https://x/'))).toBe(UNKNOWN_CLIENT_IP);
  });
});

// ─── F0-pulido (qa r4 A+B §3 bajo 3): cubo `unknown` con límite reducido ─────
describe('rateLimit · cubo unknown (sin cabecera de IP)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    _resetRateLimits();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  test('isUnknownClientKey: solo las claves terminadas en ":unknown"', () => {
    expect(isUnknownClientKey(`wa_webhook:ip:${UNKNOWN_CLIENT_IP}`)).toBe(true);
    expect(isUnknownClientKey('invite:send:ip:unknown')).toBe(true);
    expect(isUnknownClientKey('wa_webhook:ip:198.51.100.1')).toBe(false);
    expect(isUnknownClientKey('assistant:chat:unknown-user')).toBe(false);
    expect(isUnknownClientKey('unknown')).toBe(false);
  });

  test('effectiveLimit: limit/10 (mínimo 1) por defecto; unknownClientLimit válido manda; inválido o > limit se ignora; claves normales no cambian', () => {
    expect(UNKNOWN_CLIENT_LIMIT_DIVISOR).toBe(10);
    expect(effectiveLimit('r:ip:unknown', { limit: 120 })).toBe(12);
    expect(effectiveLimit('r:ip:unknown', { limit: 5 })).toBe(1);
    expect(effectiveLimit('r:ip:unknown', { limit: 1 })).toBe(1);
    expect(effectiveLimit('r:ip:unknown', { limit: 120, unknownClientLimit: 30 })).toBe(30);
    expect(effectiveLimit('r:ip:unknown', { limit: 120, unknownClientLimit: 120 })).toBe(120);
    for (const bad of [0, -1, 1.5, NaN, Infinity, 121]) {
      expect(effectiveLimit('r:ip:unknown', { limit: 120, unknownClientLimit: bad })).toBe(12);
    }
    expect(effectiveLimit('r:ip:1.2.3.4', { limit: 120, unknownClientLimit: 3 })).toBe(120);
    // Límite inválido: no se toca aquí; `checkRateLimits` lo bloquea (fail-closed).
    expect(effectiveLimit('r:ip:unknown', { limit: 0 })).toBe(0);
  });

  test('checkRateLimit sobre "...:unknown" agota en limit/10 y no en limit; la misma opción sobre una IP real sigue en limit', async () => {
    const opts = { limit: 30, windowMs: 60_000 };
    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimit('r:ip:unknown', opts);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }
    const blocked = await checkRateLimit('r:ip:unknown', opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(4);
    for (let i = 0; i < 30; i++) expect((await checkRateLimit('r:ip:198.51.100.7', opts)).allowed).toBe(true);
    expect((await checkRateLimit('r:ip:198.51.100.7', opts)).allowed).toBe(false);
  });

  test('unknownClientLimit configurable por opción: 12 de 120', async () => {
    const opts = { limit: 120, windowMs: 60_000, unknownClientLimit: 12 };
    for (let i = 0; i < 12; i++) expect((await checkRateLimit('wa_webhook:ip:unknown', opts)).allowed).toBe(true);
    expect((await checkRateLimit('wa_webhook:ip:unknown', opts)).allowed).toBe(false);
  });

  test('console.warn UNA sola vez por proceso (se reinicia con _resetRateLimits) y nunca para claves con IP', async () => {
    const opts = { limit: 50, windowMs: 60_000 };
    await checkRateLimit('a:ip:1.1.1.1', opts);
    expect(warn).not.toHaveBeenCalled();
    await checkRateLimit('a:ip:unknown', opts);
    await checkRateLimit('b:ip:unknown', opts);
    await checkRateLimits([{ key: 'c:ip:unknown', opts }, { key: 'c:user:u1', opts }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('sin cabecera de IP');
    expect(warn.mock.calls[0][1]).toEqual({ key: 'a:ip:unknown', limit: 5 });
    _resetRateLimits();
    await checkRateLimit('a:ip:unknown', opts);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('en checkRateLimits el cubo unknown bloquea sin consumir el cupo de las otras claves (evaluar todo, luego registrar)', async () => {
    const opts = { limit: 10, windowMs: 60_000 };
    await checkRateLimit('x:ip:unknown', opts);
    const r = await checkRateLimits([{ key: 'x:user:u9', opts }, { key: 'x:ip:unknown', opts }]);
    expect(r.allowed).toBe(false);
    expect(r.blockedKey).toBe('x:ip:unknown');
    expect((await checkRateLimit('x:user:u9', opts)).count).toBe(1);
  });

  test('el store persistente recibe el límite efectivo del cubo unknown', async () => {
    const seen: Array<{ key: string; limit: number }> = [];
    const store = { async hit(entries: Array<{ key: string; limit: number; windowMs: number }>) { seen.push(...entries.map((e) => ({ key: e.key, limit: e.limit }))); return entries.map((e) => ({ key: e.key, count: 1, resetAt: new Date(Date.now() + e.windowMs) })); } };
    await checkRateLimits([{ key: 'r:ip:unknown', opts: { limit: 100, windowMs: 60_000 } }, { key: 'r:ip:9.9.9.9', opts: { limit: 100, windowMs: 60_000 } }], { store });
    expect(seen).toEqual([{ key: 'r:ip:unknown', limit: 10 }, { key: 'r:ip:9.9.9.9', limit: 100 }]);
  });
});

// ─── F0-SEC r2 (sub-parte D): fail-closed, evaluar-antes-de-registrar, store ─
import type { RateLimitStore, RateLimitStoreEntry } from '../rateLimit';

describe('rateLimit · sub-parte D', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    _resetRateLimits();
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => error.mockRestore());

  test('sin store, el camino en memoria es síncrono: 5 concurrentes con limit 3 → exactamente 3 (sin el await del `persistentCount` retirado)', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => checkRateLimit('conc', { limit: 3, windowMs: 60_000 })));
    expect(rs.filter((r) => r.allowed)).toHaveLength(3);
  });

  test('checkRateLimits evalúa TODAS las claves antes de registrar: una bloqueada no consume las demás', async () => {
    const opts = { limit: 2, windowMs: 60_000 };
    await checkRateLimit('to:+57300', { limit: 1, windowMs: 60_000 });
    const r = await checkRateLimits([
      { key: 'ip:1', opts },
      { key: 'user:u', opts },
      { key: 'to:+57300', opts: { limit: 1, windowMs: 60_000 } },
    ]);
    expect(r.allowed).toBe(false);
    expect(r.blockedKey).toBe('to:+57300');
    // ip y user siguen a cero: una ráfaga a un número bloqueado no agota el cupo del usuario para otros números
    expect((await checkRateLimit('ip:1', opts)).count).toBe(1);
    expect((await checkRateLimit('user:u', opts)).count).toBe(1);
  });

  test('una petición bloqueada no mueve la ventana (resetAt estable)', async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const first = await checkRateLimit('w1', opts);
    const blockedR = await checkRateLimit('w1', opts);
    expect(blockedR.allowed).toBe(false);
    expect(blockedR.resetAt.getTime()).toBe(first.resetAt.getTime());
  });

  test('windowMs 0/negativo/NaN y limit inválido → bloqueado (configuración = fail-closed)', async () => {
    for (const windowMs of [0, -5, Number.NaN]) expect((await checkRateLimit('cfg', { limit: 5, windowMs })).allowed).toBe(false);
    for (const limit of [0, -1, Number.NaN]) expect((await checkRateLimit('cfg', { limit })).allowed).toBe(false);
  });

  test('sin entradas → permitido (no hay nada que limitar)', async () => {
    expect((await checkRateLimits([])).allowed).toBe(true);
  });

  function fakeStore(counts: Record<string, number>, calls: RateLimitStoreEntry[][] = []): RateLimitStore {
    return {
      async hit(entries) {
        calls.push(entries);
        const blocked = entries.some((e) => (counts[e.key] ?? 0) + 1 > e.limit);
        return entries.map((e) => {
          const count = (counts[e.key] ?? 0) + 1;
          if (!blocked) counts[e.key] = count;
          return { key: e.key, count, resetAt: new Date(Date.now() + e.windowMs) };
        });
      },
    };
  }

  test('store persistente: el recuento manda aunque la memoria de esta instancia esté a cero', async () => {
    const store = fakeStore({ 'verify:to:+1': 5 });
    const r = await checkRateLimits([{ key: 'verify:to:+1', opts: { limit: 5, windowMs: 60_000 } }], { store });
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(6);
  });

  test('store persistente: recibe todas las claves en una sola llamada y solo se registra en memoria si el store permite', async () => {
    const calls: RateLimitStoreEntry[][] = [];
    const store = fakeStore({}, calls);
    const opts = { limit: 3, windowMs: 60_000 };
    const r = await checkRateLimits([{ key: 'a', opts }, { key: 'b', opts }], { store });
    expect(r.allowed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((e) => e.key)).toEqual(['a', 'b']);
    expect(calls[0][0]).toEqual({ key: 'a', limit: 3, windowMs: 60_000 });
  });

  test('store que lanza → BLOQUEA (fail-closed) y registra, sin consumir memoria', async () => {
    const store: RateLimitStore = { async hit() { throw new Error('rpc no existe'); } };
    const r = await checkRateLimits([{ key: 'z', opts: { limit: 5, windowMs: 60_000 } }], { store });
    expect(r.allowed).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/store persistente falló/), expect.objectContaining({ keys: ['z'] }));
    expect((await checkRateLimit('z', { limit: 5, windowMs: 60_000 })).count).toBe(1);
  });

  test('store que omite una clave → bloquea', async () => {
    const store: RateLimitStore = { async hit() { return []; } };
    expect((await checkRateLimits([{ key: 'q', opts: { limit: 5 } }], { store })).allowed).toBe(false);
  });

  test('la memoria por instancia bloquea antes de molestar al store', async () => {
    const calls: RateLimitStoreEntry[][] = [];
    const store = fakeStore({}, calls);
    const opts = { limit: 1, windowMs: 60_000 };
    await checkRateLimits([{ key: 'm', opts }], { store });
    const r = await checkRateLimits([{ key: 'm', opts }], { store });
    expect(r.allowed).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
