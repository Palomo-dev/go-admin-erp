/**
 * Sin SUPABASE_JWT_SECRET el cron igual abre la sesión del destinatario
 * por Auth (la clave de servicio). Con el secreto, firma el JWT local y
 * no llama a Auth.
 */
const estado = {
  secreto: null as string | null,
  signOut: jest.fn<Promise<{ data: null; error: null }>, [string, string]>(async () => ({ data: null, error: null })),
  getUser: jest.fn<Promise<{ data: { user: { email: string } }; error: null }>, [string]>(async () => ({
    data: { user: { email: 'ana@example.com' } },
    error: null,
  })),
  generateLink: jest.fn<Promise<{ data: { properties: { hashed_token: string } }; error: null }>, [unknown]>(async () => ({
    data: { properties: { hashed_token: 'hash' } },
    error: null,
  })),
};

jest.mock('@/lib/security/secrets', () => ({
  readRealSecret: () => estado.secreto,
}));

jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({
    auth: {
      admin: {
        getUserById: (id: string) => estado.getUser(id),
        generateLink: (p: unknown) => estado.generateLink(p),
        signOut: (token: string, scope: string) => estado.signOut(token, scope),
      },
    },
  }),
}));

const creado = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => creado(...args),
}));

import { sesionDeMiembro } from '../programados/sesionMiembro.server';

const USUARIO = '11111111-2222-4333-8444-555555555555';

function clienteMiembro() {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({
      data: { id: 3, role_id: 2, is_super_admin: false, organizations: { name: 'Tienda de prueba' } },
      error: null,
    }),
  };
  return { from: () => q };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
  estado.secreto = null;
  estado.signOut.mockClear();
  estado.getUser.mockClear();
  estado.generateLink.mockClear();
  creado.mockReset();
  creado.mockImplementation((_url: unknown, _key: unknown, opts?: { global?: { headers?: { Authorization?: string } } }) => {
    if (opts?.global?.headers?.Authorization) return clienteMiembro();
    return { auth: { verifyOtp: async () => ({ data: { session: { access_token: 'token-corto' } }, error: null }) } };
  });
});

describe('sesión del destinatario', () => {
  test('sin secreto JWT abre la sesión por Auth y la cierra al terminar', async () => {
    const sesion = await sesionDeMiembro(120, USUARIO);
    expect(estado.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'ana@example.com' });
    expect(sesion).toMatchObject({ userId: USUARIO, organizationId: 120, organizationName: 'Tienda de prueba' });
    await sesion?.cerrar?.();
    expect(estado.signOut).toHaveBeenCalledWith('token-corto', 'local');
  });

  test('con secreto firma el JWT local y no llama a Auth', async () => {
    estado.secreto = 'x'.repeat(40);
    const sesion = await sesionDeMiembro(120, USUARIO);
    expect(estado.generateLink).not.toHaveBeenCalled();
    expect(sesion?.cerrar).toBeUndefined();
    expect(sesion?.userId).toBe(USUARIO);
  });
});
