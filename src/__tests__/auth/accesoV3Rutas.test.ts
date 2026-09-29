/**
 * Acceso v3 — fase 6 (docs/design/AUTH-ACCESO-V2.md §6): rutas.
 *  - R15: `redirectTo` conserva la query y vale para cualquier ruta protegida;
 *  - R7:  «Olvidé mi contraseña» se abre también con sesión;
 *  - R12: sin ninguna organización activa, /app lleva a la selección (estado vacío);
 *  - R2:  sin la regla vieja de /auth/session-expired.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { SignJWT } from 'jose';
import { middleware } from '@/middleware';
import { _reiniciarVerificadorParaTests } from '@/lib/auth/verificarTokenAcceso';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const SECRETO = 'k3Jd9Qz7Lp2Xw8Rt5Yv1Bn4Mc6Hg0Fs-secreto-jwt-de-jest-rutas-v3';
const COOKIE = 'sb-proyectotest-auth-token';
const SUB = '11111111-2222-3333-4444-555555555555';
const evento = { waitUntil: () => undefined } as unknown as NextFetchEvent;
const originalFetch = global.fetch;

async function firmar(): Promise<string> {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(SECRETO));
}
const cookieSesion = (t: string) => `${COOKIE}=${encodeURIComponent(JSON.stringify({ access_token: t, refresh_token: 'r' }))}`;
function peticion(ruta: string, cookie?: string, host = 'app.goadmin.io'): NextRequest {
  return new NextRequest(`https://${host}${ruta}`, { headers: { ...(cookie ? { cookie } : {}), host } });
}
const pasa = (res: Response) => res.headers.get('x-middleware-next') === '1';
const destino = (res: Response) => {
  const loc = res.headers.get('location');
  return loc ? new URL(loc, 'https://app.goadmin.io') : null;
};

/** PostgREST simulado: `membresias` es lo que devuelve organization_members; el resto, 500 (fail open). */
let membresias: unknown[] | null = [];
const consultas: string[] = [];

beforeEach(() => {
  _reiniciarVerificadorParaTests();
  _resetRateLimits();
  process.env.SUPABASE_JWT_SECRET = SECRETO;
  membresias = [];
  consultas.length = 0;
  global.fetch = jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    consultas.push(u);
    if (u.includes('/rest/v1/organization_members')) {
      return membresias === null ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(membresias), { status: 200 });
    }
    return new Response('{}', { status: 500 });
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('R15 · redirectTo con la ruta completa', () => {
  it('sin sesión conserva la query', async () => {
    const res = await middleware(peticion('/app/inventario/productos?categoria=3&pagina=2'), evento);
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('redirectTo')).toBe('/app/inventario/productos?categoria=3&pagina=2');
  });

  it('vale también para rutas protegidas fuera de /app', async () => {
    const res = await middleware(peticion('/pos?caja=1'), evento);
    expect(destino(res)?.pathname).toBe('/auth/login');
    expect(destino(res)?.searchParams.get('redirectTo')).toBe('/pos?caja=1');
  });
});

describe('R7 · «Olvidé mi contraseña» con sesión', () => {
  it('se abre en vez de mandar a /app/inicio', async () => {
    const res = await middleware(peticion('/auth/forgot-password', cookieSesion(await firmar())), evento);
    expect(pasa(res)).toBe(true);
  });
});

describe('R3 · /auth/logout', () => {
  it('se abre con sesión (el cierre lo hace la pantalla)', async () => {
    const res = await middleware(peticion('/auth/logout', cookieSesion(await firmar())), evento);
    expect(pasa(res)).toBe(true);
  });
});

describe('R12 · sin organización activa', () => {
  it('sin ninguna membresía activa, /app lleva a la selección con el destino', async () => {
    membresias = [];
    const res = await middleware(peticion('/app/inicio?x=1', cookieSesion(await firmar())), evento);
    expect(destino(res)?.pathname).toBe('/auth/select-organization');
    expect(destino(res)?.searchParams.get('dest')).toBe('/app/inicio?x=1');
  });

  it('con alguna membresía activa deja pasar', async () => {
    membresias = [{ id: 9 }];
    const res = await middleware(peticion('/app/inicio', cookieSesion(await firmar())), evento);
    expect(destino(res)?.pathname).not.toBe('/auth/select-organization');
  });

  it('con la organización ya elegida (cookie org_id) no consulta', async () => {
    membresias = [];
    const res = await middleware(peticion('/app/inicio', `${cookieSesion(await firmar())}; org_id=7`), evento);
    expect(destino(res)?.pathname).not.toBe('/auth/select-organization');
    expect(consultas.some((u) => u.includes('/rest/v1/organization_members'))).toBe(false);
  });

  it('si la consulta falla, deja pasar (fail open)', async () => {
    membresias = null;
    const res = await middleware(peticion('/app/inicio', cookieSesion(await firmar())), evento);
    expect(destino(res)?.pathname).not.toBe('/auth/select-organization');
  });

  it('Perfil queda abierto sin organización', async () => {
    membresias = [];
    const res = await middleware(peticion('/app/perfil', cookieSesion(await firmar())), evento);
    expect(destino(res)?.pathname).not.toBe('/auth/select-organization');
  });
});
