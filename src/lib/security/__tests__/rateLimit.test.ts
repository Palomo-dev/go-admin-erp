/// <reference types="jest" />
import { checkRateLimit, checkRateLimits, getClientIp, _resetRateLimits } from '../rateLimit';

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

  test('contador persistente se combina (max)', async () => {
    const r = await checkRateLimit('p', { limit: 5, persistentCount: async () => 4 });
    expect(r.count).toBe(5);
    expect(r.allowed).toBe(true);
    const r2 = await checkRateLimit('p', { limit: 5, persistentCount: async () => 5 });
    expect(r2.allowed).toBe(false);
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

  test('persistentCount que lanza → BLOQUEA y registra (antes caía en memoria: fail-open)', async () => {
    const r = await checkRateLimit('p', { limit: 5, persistentCount: async () => { throw new Error('db caída'); } });
    expect(r.allowed).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/fail-closed/), expect.objectContaining({ key: 'p' }));
    // y no dejó rastro en memoria: la siguiente (con la BD sana) es la primera de la ventana
    expect((await checkRateLimit('p', { limit: 5, persistentCount: async () => 0 })).count).toBe(1);
  });

  test('persistentCount que devuelve NaN → bloquea', async () => {
    expect((await checkRateLimit('n', { limit: 5, persistentCount: async () => Number.NaN })).allowed).toBe(false);
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
