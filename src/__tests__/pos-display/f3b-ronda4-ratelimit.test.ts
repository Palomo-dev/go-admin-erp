/**
 * Fase 3, parte B · ronda 4 — correcciones de rate limit y de la credencial
 * del latido. Lo que aquí se fija:
 *
 *  · qa/tester 1: `/api/pos/display/pair` EXIGE el store persistente en
 *    producción (`RATE_LIMIT_STORE=db`), porque el análisis de
 *    `PAIR_GLOBAL_RATE_LIMIT` está escrito sobre un techo del DESPLIEGUE y el
 *    Map por instancia no lo cumple. Y cuando el store existe, los dos cubos
 *    del canje pasan de verdad por él (si no, `db` no serviría de nada).
 *  · qa/tester 2: el techo del cubo global quedó en 60/min al rehacer el
 *    cálculo sobre el conjunto de códigos vivos.
 *  · qa/tester 3: la clave del cubo de `/bootstrap` es un digest de DOMINIO
 *    PROPIO, nunca `display_token_hash` (el store persistente escribe esa
 *    clave en `rate_limit_buckets`).
 *
 * Fixtures sin nombres de organizaciones: solo ids.
 */

import type { RateLimitStore, RateLimitStoreEntry, RateLimitStoreHit } from '@/lib/security/rateLimit';

let storeParaLaRuta: RateLimitStore | null = null;
jest.mock('@/lib/security/rateLimitStore', () => ({
  getRateLimitStore: () => storeParaLaRuta,
  RATE_LIMIT_STORE_ENV: 'RATE_LIMIT_STORE',
}));

import {
  BOOTSTRAP_RATE_LIMIT,
  BOOTSTRAP_RATE_LIMIT_PREFIX,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT_KEY,
  PAIR_RATE_LIMIT_PREFIX,
  bootstrapRateLimitKey,
  generateDisplayToken,
  hashDisplayToken,
} from '@/lib/pos/display/server/displayTokens';
import {
  RATE_LIMIT_STORE_REQUIRED_CODE,
  displayCostRateLimitStore,
  requireDisplayRateLimitStore,
  _resetDisplayRateLimitWarning,
} from '@/lib/pos/display/server/displayRateLimit';

const env = process.env as Record<string, string | undefined>;
let nodeEnvOriginal: string | undefined;

beforeEach(() => {
  storeParaLaRuta = null;
  nodeEnvOriginal = env.NODE_ENV;
  _resetDisplayRateLimitWarning();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  env.NODE_ENV = nodeEnvOriginal;
  jest.restoreAllMocks();
});

/** Store de mentira que anota las claves que se le piden. */
function storeEspia(): { store: RateLimitStore; claves: string[] } {
  const claves: string[] = [];
  return {
    claves,
    store: {
      async hit(entries: RateLimitStoreEntry[]): Promise<RateLimitStoreHit[]> {
        for (const e of entries) claves.push(e.key);
        return entries.map((e) => ({ key: e.key, count: 1, resetAt: new Date(Date.now() + e.windowMs) }));
      },
    },
  };
}

describe('F3-B r4 · postura de RATE_LIMIT_STORE en las rutas de la pantalla', () => {
  it('con store: `requireDisplayRateLimitStore` lo devuelve tal cual, en producción y fuera de ella', () => {
    const { store } = storeEspia();
    storeParaLaRuta = store;
    for (const modo of ['production', 'test']) {
      env.NODE_ENV = modo;
      const r = requireDisplayRateLimitStore('pair');
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('inalcanzable');
      expect(r.store).toBe(store);
    }
  });

  it('sin store y en PRODUCCIÓN: 503 RATE_LIMIT_STORE_REQUIRED (fail-closed) y se registra el motivo', async () => {
    env.NODE_ENV = 'production';
    const r = requireDisplayRateLimitStore('pair');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('inalcanzable');
    expect(r.response.status).toBe(503);
    expect((await r.response.json()).code).toBe(RATE_LIMIT_STORE_REQUIRED_CODE);
    expect(r.response.headers.get('cache-control')).toBe('no-store');
    expect(console.error).toHaveBeenCalled();
  });

  it('sin store y FUERA de producción: se sigue con el Map y se avisa UNA vez por proceso', () => {
    env.NODE_ENV = 'test';
    expect(requireDisplayRateLimitStore('pair').ok).toBe(true);
    expect(requireDisplayRateLimitStore('pair').ok).toBe(true);
    expect((console.warn as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('el cubo de COSTE nunca bloquea por faltar el store: devuelve null y la ruta sigue', () => {
    env.NODE_ENV = 'production';
    expect(displayCostRateLimitStore()).toBeNull();
    const { store } = storeEspia();
    storeParaLaRuta = store;
    expect(displayCostRateLimitStore()).toBe(store);
  });
});

describe('F3-B r4 · los cubos del canje pasan por el store persistente cuando lo hay', () => {
  it('con `db`, las claves por IP y GLOBAL del canje llegan al store (si no, activar `db` no cambiaría nada)', async () => {
    const { store, claves } = storeEspia();
    storeParaLaRuta = store;
    const { NextRequest } = await import('next/server');
    const { POST: pair } = await import('@/app/api/pos/display/pair/route');
    const { _resetRateLimits } = await import('@/lib/security/rateLimit');
    _resetRateLimits();
    const res = await pair(
      new NextRequest('http://localhost/api/pos/display/pair', {
        method: 'POST',
        // Body sin `code`: el canje falla en la validación de forma, que es
        // justo el camino que registra el cubo global. No hace falta base.
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.44' },
      }),
    );
    expect(res.status).toBe(400);
    expect(claves).toContain(`${PAIR_RATE_LIMIT_PREFIX}203.0.113.44`);
    expect(claves).toContain(PAIR_GLOBAL_RATE_LIMIT_KEY);
  });
});

describe('F3-B r4 · techos y claves', () => {
  it('el cubo global del canje quedó en 60/min al rehacer el cálculo sobre el conjunto de códigos vivos', () => {
    expect(PAIR_GLOBAL_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60 * 1000 });
  });

  it('el cubo de /bootstrap es de unas pocas llamadas por minuto (el cliente legítimo llama una vez por carga)', () => {
    expect(BOOTSTRAP_RATE_LIMIT.windowMs).toBe(60 * 1000);
    expect(BOOTSTRAP_RATE_LIMIT.limit).toBeGreaterThanOrEqual(5);
    expect(BOOTSTRAP_RATE_LIMIT.limit).toBeLessThanOrEqual(20);
  });

  it('la clave del cubo de /bootstrap NO es el token ni `display_token_hash`: es un digest de dominio propio', () => {
    const token = generateDisplayToken();
    const clave = bootstrapRateLimitKey(token);
    expect(clave.startsWith(BOOTSTRAP_RATE_LIMIT_PREFIX)).toBe(true);
    expect(clave).not.toContain(token);
    expect(clave).not.toContain(hashDisplayToken(token));
    // Determinista (el mismo token cae siempre en el mismo cubo) y distinto por token.
    expect(bootstrapRateLimitKey(token)).toBe(clave);
    expect(bootstrapRateLimitKey(generateDisplayToken())).not.toBe(clave);
  });
});
