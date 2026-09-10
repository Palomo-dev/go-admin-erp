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
