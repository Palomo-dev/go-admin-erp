/// <reference types="jest" />
/**
 * Selector de organización tras una sesión revocada (2026-11-06). GoTrue revocó
 * la familia de tokens por reutilización y el selector mostraba «no se pudieron
 * cargar tus organizaciones». `sesionMurio` decide si se va al login o se
 * ofrece reintentar; un fallo de red nunca expulsa.
 */
const getSession = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: { auth: { getSession: () => getSession(), signOut: jest.fn(async () => ({ error: null })) } },
}));
jest.mock('@/lib/supabase/auth-manager', () => ({ clearSessionCache: jest.fn(async () => undefined) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { sesionMurio } from '../deadSession';

beforeEach(() => getSession.mockReset());

describe('sesionMurio', () => {
  it('el error de reutilización basta, sin consultar la sesión', async () => {
    const err = { code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used', status: 400 };
    expect(await sesionMurio(err)).toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('si ya no hay sesión, murió', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await sesionMurio(new Error('fallo al entrar'))).toBe(true);
  });

  it('si leer la sesión da un error irrecuperable, murió', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: { code: 'refresh_token_not_found', message: 'x' } });
    expect(await sesionMurio(new Error('x'))).toBe(true);
  });

  it('con sesión viva no expulsa', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'a' } }, error: null });
    expect(await sesionMurio(new Error('consulta fallida'))).toBe(false);
  });

  it('un fallo de red al leer la sesión no expulsa', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
    expect(await sesionMurio(new Error('x'))).toBe(false);
    getSession.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await sesionMurio(new Error('x'))).toBe(false);
  });
});

describe('cableado', () => {
  const raiz = join(__dirname, '..', '..', '..', '..');
  it('el selector va al login con el aviso de sesión vencida en ambos fallos', () => {
    const pagina = readFileSync(join(raiz, 'src/app/auth/select-organization/page.tsx'), 'utf8');
    expect(pagina.match(/await sesionMurio\(err\)/g)?.length).toBe(2);
    expect(pagina).toContain("'/auth/login?reason=expired'");
    expect(pagina).toContain('limpiarSesionMuerta()');
  });

  it('el registro de cuentas sigue las rotaciones del token', () => {
    const ctx = readFileSync(join(raiz, 'src/lib/context/SessionContext.tsx'), 'utf8');
    expect(ctx).toContain('initAccountRegistrySync();');
  });
});
