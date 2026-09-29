/**
 * Caracterización del acceso ANTES de aplicar la v3 (docs/design/AUTH-ACCESO-V2.md §12.3).
 *
 * Fija el comportamiento de los flujos críticos que la v3 debe conservar:
 * middleware (sin sesión, sesión vencida, rutas de /auth con sesión),
 * callback OAuth / PKCE y /auth/verify. Donde la v3 cambia algo a propósito,
 * el test lo dice en su nombre y remite a la fila de la tabla de rutas (R1-R15)
 * o a la decisión (v2-1…v2-13) que lo cambia.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { SignJWT } from 'jose';

// --- Dobles de Supabase para callback y verify ------------------------------
type Fila = Record<string, unknown> | null;
const estado: {
  exchange: { data: { session: Fila; user: Fila }; error: { message: string; code?: string } | null };
  verify: { data: { session: Fila; user: Fila }; error: { message: string } | null };
  perfil: Fila;
  membresia: Fila;
  invitacion: Fila;
} = {
  exchange: { data: { session: null, user: null }, error: null },
  verify: { data: { session: null, user: null }, error: null },
  perfil: null,
  membresia: null,
  invitacion: null,
};
const signOut = jest.fn(async () => ({ error: null }));

function builder(tabla: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  for (const m of ['select', 'eq', 'or', 'gt', 'is', 'order', 'limit', 'update', 'insert', 'in', 'upsert']) b[m] = jest.fn(self);
  const fila = () =>
    tabla === 'profiles' ? estado.perfil : tabla === 'organization_members' ? estado.membresia : tabla === 'invitations' ? estado.invitacion : null;
  b.single = async () => ({ data: fila(), error: fila() ? null : { code: 'PGRST116', message: 'sin filas' } });
  b.maybeSingle = async () => ({ data: fila(), error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return b;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: async () => estado.exchange,
      verifyOtp: async () => estado.verify,
      signOut,
      signInWithOtp: async () => ({ error: null }),
    },
    from: (t: string) => builder(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }) }),
}));

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

jest.mock('@/lib/services/defaultTaxService', () => ({
  parseCodigoTarifaPorDefecto: () => null,
  setOrganizationDefaultTaxByCode: async () => undefined,
}));

import { middleware } from '@/middleware';
import { _reiniciarVerificadorParaTests } from '@/lib/auth/verificarTokenAcceso';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const SECRETO = 'k3Jd9Qz7Lp2Xw8Rt5Yv1Bn4Mc6Hg0Fs-secreto-jwt-de-jest-caracterizacion';
const COOKIE = 'sb-proyectotest-auth-token';
const SUB = '11111111-2222-3333-4444-555555555555';
const evento = { waitUntil: () => undefined } as unknown as NextFetchEvent;
const originalFetch = global.fetch;

const ahora = () => Math.floor(Date.now() / 1000);
async function firmar(exp = ahora() + 3600): Promise<string> {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(SECRETO));
}
const cookieDe = (t: string) => `${COOKIE}=${encodeURIComponent(JSON.stringify({ access_token: t, refresh_token: 'r' }))}`;
function peticion(ruta: string, cookie?: string): NextRequest {
  return new NextRequest(`https://app.goadmin.io${ruta}`, { headers: cookie ? { cookie } : {} });
}
const pasa = (res: Response) => res.headers.get('x-middleware-next') === '1';
const destino = (res: Response) => {
  const loc = res.headers.get('location');
  return loc ? new URL(loc, 'https://app.goadmin.io') : null;
};

beforeEach(() => {
  _reiniciarVerificadorParaTests();
  _resetRateLimits();
  process.env.SUPABASE_JWT_SECRET = SECRETO;
  global.fetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  estado.exchange = { data: { session: null, user: null }, error: null };
  estado.verify = { data: { session: null, user: null }, error: null };
  estado.perfil = null;
  estado.membresia = null;
  estado.invitacion = null;
  signOut.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Caracterización · middleware', () => {
  it('sin sesión, una ruta de /app va al login con redirectTo', async () => {
    const res = await middleware(peticion('/app/inventario'), evento);
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('redirectTo')).toBe('/app/inventario');
  });

  it('sesión vencida: login con reason=expired y redirectTo (el cliente la recupera)', async () => {
    const res = await middleware(peticion('/app/pos', cookieDe(await firmar(ahora() - 120))), evento);
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('reason')).toBe('expired');
    expect(destino(res)?.searchParams.get('redirectTo')).toBe('/app/pos');
  });

  it('las pantallas públicas de acceso se abren sin sesión', async () => {
    for (const ruta of ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password', '/auth/invite?invite_code=x', '/auth/verify/failed']) {
      const res = await middleware(peticion(ruta), evento);
      expect(pasa(res)).toBe(true);
    }
  });

  it('con sesión, /auth/login manda a /app/inicio salvo ?addAccount=1 (selector de cuentas)', async () => {
    const cookie = cookieDe(await firmar());
    expect(destino(await middleware(peticion('/auth/login', cookie), evento))?.pathname).toBe('/app/inicio');
    expect(pasa(await middleware(peticion('/auth/login?addAccount=1', cookie), evento))).toBe(true);
  });

  it('con sesión, invitación, verificación, selección, registro y restablecer siguen abiertos', async () => {
    const cookie = cookieDe(await firmar());
    for (const ruta of ['/auth/invite', '/auth/verify/failed', '/auth/select-organization', '/auth/signup', '/auth/reset-password']) {
      expect(pasa(await middleware(peticion(ruta, cookie), evento))).toBe(true);
    }
  });
});

describe('Caracterización · /auth/callback', () => {
  const usuarioGoogle = { id: SUB, email: 'ana@ejemplo.com', app_metadata: { provider: 'google' }, user_metadata: {} };
  const sesion = { access_token: 'a', refresh_token: 'r' };

  async function callback(query: string) {
    const { GET } = await import('@/app/auth/callback/route');
    return GET(new NextRequest(`https://app.goadmin.io/auth/callback?${query}`));
  }

  it('Google con organización → selección de organización con dest', async () => {
    estado.exchange = { data: { session: sesion, user: usuarioGoogle }, error: null };
    estado.membresia = { id: 1, organization_id: 7 };
    const res = await callback('code=abc&next=/app/pos');
    expect(destino(res)?.pathname).toBe('/auth/select-organization');
    expect(destino(res)?.searchParams.get('dest')).toBe('/app/pos');
  });

  it('Google sin organización → selección de organización (estado vacío)', async () => {
    estado.exchange = { data: { session: sesion, user: usuarioGoogle }, error: null };
    const res = await callback('code=abc');
    expect(destino(res)?.pathname).toBe('/auth/select-organization');
  });

  it('código ya consumido por otra petición → selección de organización', async () => {
    estado.exchange = { data: { session: null, user: null }, error: { message: 'x', code: 'flow_state_not_found' } };
    const res = await callback('code=abc');
    expect(destino(res)?.pathname).toBe('/auth/select-organization');
  });

  it('error del proveedor → login con error', async () => {
    const res = await callback('error=access_denied&error_description=cancelado');
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('error')).toBe('access_denied');
  });

  it('sin código → login', async () => {
    const res = await callback('');
    expect(destino(res)?.pathname).toBe('/auth/login');
  });
});

describe('Caracterización · /auth/verify', () => {
  const usuario = { id: SUB, email: 'ana@ejemplo.com', user_metadata: {} };
  const sesion = { access_token: 'a', refresh_token: 'r' };

  async function verify(query: string) {
    const { GET } = await import('@/app/auth/verify/route');
    return GET(new NextRequest(`https://app.goadmin.io/auth/verify?${query}`, { headers: { 'x-forwarded-for': '198.51.100.9' } }));
  }

  it('recovery sin invitación → restablecer contraseña', async () => {
    estado.verify = { data: { session: sesion, user: usuario }, error: null };
    const res = await verify('token=t&type=recovery');
    expect(destino(res)?.pathname).toBe('/auth/reset-password');
  });

  it('email_change → login con aviso de correo cambiado', async () => {
    estado.verify = { data: { session: sesion, user: usuario }, error: null };
    const res = await verify('token=t&type=email_change');
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('success')).toBe('email-changed');
  });

  it('token de signup fallido → login con error de verificación', async () => {
    estado.verify = { data: { session: null, user: null }, error: { message: 'expirado' } };
    const res = await verify('token=t&type=signup');
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('error')).toBe('email-verification-failed');
  });

  it('sin token → login con enlace no válido', async () => {
    const res = await verify('');
    expect(destino(res)?.searchParams.get('error')).toBe('invalid-verification-link');
  });
});
