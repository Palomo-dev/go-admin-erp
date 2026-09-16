/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-parte D) — store persistente sobre `fn_rate_limit_hit`.
 * La RPC se dobla; la migración real se probó dentro de `begin; … rollback;`
 * (ver el informe de la ronda). Sin credenciales.
 */
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => { throw new Error('no debe usarse en este test'); }) }));

import { createDbRateLimitStore, getRateLimitStore, rateLimitStoreMode, RATE_LIMIT_RPC, RATE_LIMIT_STORE_ENV, _resetRateLimitStore } from '../rateLimitStore';

describe('rateLimitStore', () => {
  const originalEnv = process.env[RATE_LIMIT_STORE_ENV];
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[RATE_LIMIT_STORE_ENV];
    else process.env[RATE_LIMIT_STORE_ENV] = originalEnv;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    _resetRateLimitStore();
    jest.restoreAllMocks();
  });

  test('llama a la RPC con { key, limit, window_ms } y traduce la respuesta', async () => {
    const rpc = jest.fn(async () => ({
      data: { allowed: false, entries: [{ key: 'a', count: 6, reset_at: '2026-09-16T00:10:00.000Z', allowed: false }] },
      error: null,
    }));
    const store = createDbRateLimitStore({ rpc });
    const hits = await store.hit([{ key: 'a', limit: 5, windowMs: 600_000 }]);
    expect(rpc).toHaveBeenCalledWith(RATE_LIMIT_RPC, { p_entries: [{ key: 'a', limit: 5, window_ms: 600_000 }] });
    expect(hits).toEqual([{ key: 'a', count: 6, resetAt: new Date('2026-09-16T00:10:00.000Z') }]);
  });

  test('error de la RPC (p. ej. función inexistente antes de aplicar la migración) → lanza (rateLimit.ts bloquea)', async () => {
    const store = createDbRateLimitStore({ rpc: async () => ({ data: null, error: { message: 'function public.fn_rate_limit_hit(jsonb) does not exist' } }) });
    await expect(store.hit([{ key: 'a', limit: 5, windowMs: 1000 }])).rejects.toThrow(/fn_rate_limit_hit/);
  });

  test('respuesta mal formada → lanza', async () => {
    const store = createDbRateLimitStore({ rpc: async () => ({ data: { entries: [{ key: 'a' }] }, error: null }) });
    await expect(store.hit([{ key: 'a', limit: 5, windowMs: 1000 }])).rejects.toThrow(/mal formada/);
    const store2 = createDbRateLimitStore({ rpc: async () => ({ data: {}, error: null }) });
    await expect(store2.hit([{ key: 'a', limit: 5, windowMs: 1000 }])).rejects.toThrow(/entries/);
  });

  test('sin entradas no llama a la RPC', async () => {
    const rpc = jest.fn();
    expect(await createDbRateLimitStore({ rpc }).hit([])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  test('RATE_LIMIT_STORE: db → store; memory/ausente/otro → null (modo memoria)', () => {
    process.env[RATE_LIMIT_STORE_ENV] = 'db';
    expect(rateLimitStoreMode()).toBe('db');
    expect(getRateLimitStore()).not.toBeNull();
    for (const v of ['memory', '', 'redis']) {
      process.env[RATE_LIMIT_STORE_ENV] = v;
      _resetRateLimitStore();
      expect(rateLimitStoreMode()).toBe('memory');
      expect(getRateLimitStore()).toBeNull();
    }
    process.env[RATE_LIMIT_STORE_ENV] = ' DB ';
    _resetRateLimitStore();
    expect(rateLimitStoreMode()).toBe('db');
    delete process.env[RATE_LIMIT_STORE_ENV];
    _resetRateLimitStore();
    expect(getRateLimitStore()).toBeNull();
  });

  test('en producción sin db avisa UNA vez por proceso', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env[RATE_LIMIT_STORE_ENV];
    expect(getRateLimitStore()).toBeNull();
    expect(getRateLimitStore()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/RATE_LIMIT_STORE=db/);
  });
});
