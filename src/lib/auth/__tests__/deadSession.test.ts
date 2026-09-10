/// <reference types="jest" />
/**
 * Clasificación de errores de sesión. Lo que decide si al usuario se le manda
 * al login (sesión muerta) o se le ofrece reintentar (fallo de red).
 *
 * Caso real del 2026-09-10 en app.goadmin.io: `refresh_token_not_found`
 * mostraba el error crudo de Supabase y el enlace "inicia sesión de nuevo" no
 * hacía nada, porque el token muerto seguía en la cookie y el middleware
 * devolvía al usuario a /app/inicio.
 */

jest.mock('@/lib/supabase/config', () => ({
  supabase: { auth: { signOut: jest.fn(async () => ({ error: null })) } },
}));
jest.mock('@/lib/supabase/auth-manager', () => ({
  clearSessionCache: jest.fn(async () => undefined),
}));

import { esSesionMuerta, limpiarSesionMuerta } from '../deadSession';
import { supabase } from '@/lib/supabase/config';
import { clearSessionCache } from '@/lib/supabase/auth-manager';

describe('esSesionMuerta', () => {
  it('reconoce el error exacto de producción por código', () => {
    const errorReal = {
      name: 'AuthApiError',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
      code: 'refresh_token_not_found',
      status: 400,
    };
    expect(esSesionMuerta(errorReal)).toBe(true);
  });

  it('reconoce los demás códigos irrecuperables de GoTrue', () => {
    for (const code of ['refresh_token_already_used', 'session_not_found', 'user_not_found', 'invalid_grant']) {
      expect(esSesionMuerta({ code, message: 'x' })).toBe(true);
    }
  });

  it('cae al texto cuando el SDK no trae código', () => {
    expect(esSesionMuerta({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(true);
    expect(esSesionMuerta('Refresh Token Not Found')).toBe(true);
  });

  it('NO confunde un fallo de red con una sesión muerta', () => {
    // Estos deben seguir ofreciendo "Reintentar", no expulsar al usuario.
    expect(esSesionMuerta({ name: 'TypeError', message: 'Failed to fetch' })).toBe(false);
    expect(esSesionMuerta({ message: 'Network request failed' })).toBe(false);
    expect(esSesionMuerta({ code: 'over_request_rate_limit', message: 'Too Many Requests' })).toBe(false);
    expect(esSesionMuerta(null)).toBe(false);
    expect(esSesionMuerta(undefined)).toBe(false);
  });
});

describe('limpiarSesionMuerta', () => {
  it('cierra sesión SOLO en local y vacía la caché', async () => {
    await limpiarSesionMuerta();
    // scope 'local': no llama al servidor a revocar un token que ya no existe.
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearSessionCache).toHaveBeenCalled();
  });

  it('no propaga si signOut falla: el siguiente paso es el login igualmente', async () => {
    (supabase.auth.signOut as jest.Mock).mockRejectedValueOnce(new Error('storage roto'));
    await expect(limpiarSesionMuerta()).resolves.toBeUndefined();
    expect(clearSessionCache).toHaveBeenCalled();
  });
});
