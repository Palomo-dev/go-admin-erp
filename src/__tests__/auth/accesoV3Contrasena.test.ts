/**
 * Acceso v3 — fase 5: cambio de contraseña desde Perfil › Seguridad por
 * POST /api/auth/contrasena (antes: navegador, regla de 8 caracteres).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

const ACTUAL = 'la-clave-de-siempre';
let usuario: { id: string; email: string } | null = { id: 'u-1', email: 'ana@ejemplo.com' };
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: usuario }, error: usuario ? null : { message: 'sin sesión' } }),
      getSession: async () => ({ data: { session: usuario ? { access_token: 'token-actual' } : null } }),
    },
  }),
}));

const updateUserById = jest.fn(async () => ({ error: null }));
const signOut = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { updateUserById, signOut } } }),
}));

const signInWithPassword = jest.fn(async ({ password }: { email: string; password: string }) =>
  password === ACTUAL
    ? { data: { session: { access_token: 'token-prueba' }, user: { id: 'u-1' } }, error: null }
    : { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } },
);
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));

import { POST } from '@/app/api/auth/contrasena/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const peticion = (cuerpo: unknown) =>
  new Request('http://localhost/api/auth/contrasena', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

beforeEach(() => {
  _resetRateLimits();
  usuario = { id: 'u-1', email: 'ana@ejemplo.com' };
  updateUserById.mockClear();
  signOut.mockClear();
  signInWithPassword.mockClear();
  // Have I Been Pwned: sin coincidencias.
  global.fetch = jest.fn(async () => new Response('ABCDEF:1\n')) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/contrasena', () => {
  test('sin sesión: 401 y no toca nada', async () => {
    usuario = null;
    const r = await POST(peticion({ actual: ACTUAL, nueva: 'otra-clave-bien-larga' }));
    expect(r.status).toBe(401);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('actual correcta y nueva válida: cambia y cierra las otras sesiones', async () => {
    const r = await POST(peticion({ actual: ACTUAL, nueva: 'otra-clave-bien-larga' }));
    expect(r.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@ejemplo.com', password: ACTUAL });
    expect(updateUserById).toHaveBeenCalledWith('u-1', { password: 'otra-clave-bien-larga' });
    expect(signOut).toHaveBeenCalledWith('token-actual', 'others');
  });

  test('sin cerrar las otras: solo se cierra la sesión de comprobación', async () => {
    await POST(peticion({ actual: ACTUAL, nueva: 'otra-clave-bien-larga', cerrarOtras: false }));
    expect(signOut).toHaveBeenCalledWith('token-prueba', 'local');
  });

  test('actual incorrecta: no cambia', async () => {
    const r = await POST(peticion({ actual: 'no-es-la-actual', nueva: 'otra-clave-bien-larga' }));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe('actual_incorrecta');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('política única: 10 caracteres, distinta del correo y distinta de la actual', async () => {
    expect((await (await POST(peticion({ actual: ACTUAL, nueva: 'corta123' }))).json()).codigo).toBe('longitud');
    expect((await (await POST(peticion({ actual: ACTUAL, nueva: 'ana@ejemplo.com' }))).json()).codigo).toBe('igual_al_correo');
    expect((await (await POST(peticion({ actual: ACTUAL, nueva: ACTUAL }))).json()).codigo).toBe('igual_a_la_actual');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('límite por usuario: al sexto intento en 15 min responde 429 sin probar la actual', async () => {
    for (let i = 0; i < 5; i++) await POST(peticion({ actual: `mala-${i}-xxxx`, nueva: 'otra-clave-bien-larga' }));
    signInWithPassword.mockClear();
    const r = await POST(peticion({ actual: ACTUAL, nueva: 'otra-clave-bien-larga' }));
    expect(r.status).toBe(429);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
