/**
 * GO-sec (2026-09-24): con el middleware verificando la firma, un token vencido
 * manda a /auth/login?reason=expired&redirectTo=…; el cliente refresca y
 * vuelve. `redirectTo` viene de la URL: solo destinos internos (sin open
 * redirect) y un intento por pestaña cada 30 s (sin bucles).
 */

import {
  destinoInternoSeguro,
  registrarIntentoRecuperacion,
  VENTANA_RECUPERACION_MS,
} from '@/lib/auth/recuperacionSesion';

describe('destinoInternoSeguro', () => {
  it.each([
    ['/app/pos', '/app/pos'],
    ['/app/finanzas/facturas?x=1', '/app/finanzas/facturas?x=1'],
    [null, '/app/inicio'],
    ['', '/app/inicio'],
    ['https://malicioso.example/app', '/app/inicio'],
    ['//malicioso.example/app', '/app/inicio'],
    ['/\\malicioso.example', '/app/inicio'],
    ['javascript:alert(1)', '/app/inicio'],
    ['/auth/login', '/app/inicio'],
    ['/app/\u0000x', '/app/inicio'],
  ])('%p → %p', (entrada, esperado) => {
    expect(destinoInternoSeguro(entrada as string | null)).toBe(esperado);
  });
});

describe('registrarIntentoRecuperacion', () => {
  function memoria(): Pick<Storage, 'getItem' | 'setItem'> {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  }

  it('un intento por ventana: el segundo dentro de 30 s no se hace, pasado el plazo sí', () => {
    const s = memoria();
    expect(registrarIntentoRecuperacion(s, 1_000)).toBe(true);
    expect(registrarIntentoRecuperacion(s, 1_000 + VENTANA_RECUPERACION_MS - 1)).toBe(false);
    expect(registrarIntentoRecuperacion(s, 1_000 + VENTANA_RECUPERACION_MS)).toBe(true);
  });

  it('sin storage (o si lanza) no intenta', () => {
    expect(registrarIntentoRecuperacion(null)).toBe(false);
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => undefined };
    expect(registrarIntentoRecuperacion(roto)).toBe(false);
  });
});
