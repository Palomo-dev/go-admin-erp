/**
 * GO-sec (auditoría 2026-09-24): el middleware verifica la FIRMA del JWT de la
 * cookie de sesión. Antes lo decodificaba sin verificar (`decodeJwt`) y una
 * cookie inventada con cualquier `sub` pasaba la protección de rutas.
 *
 * Se ejercita el middleware real con NextRequest y tokens firmados con jose:
 *  - sin cookie, firma mala, `alg: none`, clave anon, vencido → sin sesión;
 *  - firma válida → pasa;
 *  - APIs sin sesión → 401 JSON (no el HTML del login);
 *  - webhooks y crons que se autentican solos llegan sin cookie;
 *  - sin SUPABASE_JWT_SECRET se pregunta a Auth (con caché) y, si Auth no
 *    responde, fail-closed;
 *  - la excepción del escritorio solo vale en el servidor embebido y en localhost.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from 'jose';
import { middleware } from '@/middleware';
import {
  verificarTokenAcceso,
  sesionHeredadaSoloEscritorio,
  _reiniciarVerificadorParaTests,
} from '@/lib/auth/verificarTokenAcceso';

const SECRETO = 'k3Jd9Qz7Lp2Xw8Rt5Yv1Bn4Mc6Hg0Fs-secreto-jwt-de-jest-middleware';
const OTRO_SECRETO = 'Zx8Cv7Bn6Mm5Lk4Jh3Gf2Ds1Aq0Wp-secreto-de-un-atacante-cualquiera';
const COOKIE = 'sb-proyectotest-auth-token';
const SUB = '11111111-2222-3333-4444-555555555555';

const originalFetch = global.fetch;
const fetchMock = jest.fn();

function ahora(): number {
  return Math.floor(Date.now() / 1000);
}

async function firmar(
  claims: Record<string, unknown>,
  opts: { secreto?: string; exp?: number } = {}
): Promise<string> {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(claims.sub ?? SUB))
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? ahora() + 3600)
    .sign(new TextEncoder().encode(opts.secreto ?? SECRETO));
}

/** Token con `alg: none` y un `sub` cualquiera: el ataque del hallazgo. */
function tokenSinFirma(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: SUB, role: 'authenticated', exp: ahora() + 3600 })}.`;
}

/** Token con firma basura pero payload creíble (HS256 declarado). */
function tokenFirmaInventada(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: SUB, role: 'authenticated', exp: ahora() + 3600 })}.firmainventada`;
}

function cookieDe(accessToken: string): string {
  return `${COOKIE}=${encodeURIComponent(JSON.stringify({ access_token: accessToken, refresh_token: 'r' }))}`;
}

function peticion(ruta: string, opts: { cookie?: string; method?: string; host?: string } = {}): NextRequest {
  const base = opts.host ? `http://${opts.host}` : 'https://app.goadmin.io';
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(`${base}${ruta}`, { method: opts.method ?? 'GET', headers });
}

const evento = { waitUntil: () => undefined } as unknown as NextFetchEvent;

function pasa(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

function destinoRedireccion(res: Response): URL | null {
  const loc = res.headers.get('location');
  return loc ? new URL(loc) : null;
}

beforeEach(() => {
  _reiniciarVerificadorParaTests();
  process.env.SUPABASE_JWT_SECRET = SECRETO;
  delete process.env.GOADMIN_DESKTOP_EMBEDDED;
  fetchMock.mockReset();
  // Por defecto, la red "no responde bien": el gate de /app hace fail-open y
  // nadie depende de Auth salvo que el test lo configure.
  fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('middleware · la cookie de sesión se verifica de verdad', () => {
  it('sin cookie: /app redirige al login con redirectTo', async () => {
    const res = await middleware(peticion('/app/inicio'), evento);
    const destino = destinoRedireccion(res);
    expect(destino?.pathname).toBe('/auth/login');
    expect(destino?.searchParams.get('redirectTo')).toBe('/app/inicio');
  });

  it('firma válida: pasa', async () => {
    const res = await middleware(peticion('/app/inicio', { cookie: cookieDe(await firmar({ sub: SUB })) }), evento);
    expect(pasa(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
  });

  it.each([
    ['firmado con otro secreto', async () => firmar({ sub: SUB }, { secreto: OTRO_SECRETO })],
    ['alg none (sin firma)', async () => tokenSinFirma()],
    ['firma inventada', async () => tokenFirmaInventada()],
    ['clave anon (sin sub, role anon)', async () =>
      new SignJWT({ role: 'anon' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(ahora() + 3600)
        .sign(new TextEncoder().encode(SECRETO))],
    ['role service_role', async () => firmar({ sub: SUB, role: 'service_role' })],
    ['basura que no es JWT', async () => 'esto.no.esunjwt'],
  ])('cookie con JWT no válido (%s): sin sesión → login', async (_nombre, crear) => {
    const res = await middleware(peticion('/app/pos', { cookie: cookieDe(await crear()) }), evento);
    expect(pasa(res)).toBe(false);
    expect(destinoRedireccion(res)?.pathname).toBe('/auth/login');
  });

  it('vencido (firma válida): sin sesión → login con reason=expired para que el cliente refresque', async () => {
    const token = await firmar({ sub: SUB }, { exp: ahora() - 120 });
    const res = await middleware(peticion('/app/finanzas', { cookie: cookieDe(token) }), evento);
    const destino = destinoRedireccion(res);
    expect(pasa(res)).toBe(false);
    expect(destino?.pathname).toBe('/auth/login');
    expect(destino?.searchParams.get('reason')).toBe('expired');
    expect(destino?.searchParams.get('redirectTo')).toBe('/app/finanzas');
  });

  it('vencido hace 1 hora (antes se aceptaba hasta 7 días): ya no da sesión', async () => {
    const token = await firmar({ sub: SUB }, { exp: ahora() - 3600 });
    const res = await middleware(peticion('/app/inicio', { cookie: cookieDe(token) }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('una cookie inventada tampoco saca al usuario del login como si tuviera sesión', async () => {
    const res = await middleware(peticion('/auth/login', { cookie: cookieDe(tokenSinFirma()) }), evento);
    expect(pasa(res)).toBe(true); // se queda en el login
    expect(res.headers.get('location')).toBeNull();
  });

  it('con sesión válida, /auth/login sí manda a /app/inicio', async () => {
    const res = await middleware(peticion('/auth/login', { cookie: cookieDe(await firmar({ sub: SUB })) }), evento);
    expect(destinoRedireccion(res)?.pathname).toBe('/app/inicio');
  });
});

describe('middleware · APIs', () => {
  it('API sin cookie → 401 JSON', async () => {
    const res = await middleware(peticion('/api/organization/members'), evento);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('API con cookie inventada → 401 JSON, nunca pasa', async () => {
    const res = await middleware(
      peticion('/api/ai-assistant/suggestions', { cookie: cookieDe(tokenSinFirma()), method: 'POST' }),
      evento
    );
    expect(res.status).toBe(401);
    expect(pasa(res)).toBe(false);
  });

  it('API con token vencido → 401 SESSION_EXPIRED', async () => {
    const token = await firmar({ sub: SUB }, { exp: ahora() - 60 });
    const res = await middleware(peticion('/api/modules', { cookie: cookieDe(token) }), evento);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('API con sesión válida pasa', async () => {
    const res = await middleware(peticion('/api/modules', { cookie: cookieDe(await firmar({ sub: SUB })) }), evento);
    expect(pasa(res)).toBe(true);
  });
});

describe('middleware · webhooks y crons que se autentican solos llegan sin cookie', () => {
  const EXCLUIDAS = [
    '/api/integrations/bancolombia/webhook',
    '/api/integrations/bold/webhook',
    '/api/integrations/breb/webhook',
    '/api/integrations/wompi/webhook',
    '/api/integrations/redeban/webhook',
    '/api/integrations/sendgrid/webhook',
    '/api/crm/contracts/webhook',
    '/api/crm/voice-agents/campaigns/run',
    // Ya excluidas antes (se comprueba que siguen):
    '/api/cron/reconcile-web-orders',
    '/api/crm/jobs/run',
    '/api/factus/process-pending',
    '/api/email/webhook',
    '/api/integrations/open-finance/webhook',
  ];

  it.each(EXCLUIDAS)('%s: el middleware no la toca (ni redirige ni 401)', async (ruta) => {
    const res = await middleware(peticion(ruta, { method: 'POST' }), evento);
    expect(pasa(res)).toBe(true);
    expect(res.status).not.toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  it('el matcher real tampoco invoca el middleware en los webhooks nuevos, y sí en las rutas protegidas', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'middleware.ts'), 'utf8');
    const matcher = /matcher:\s*\[[\s\S]*?'([^']+)'/.exec(src)?.[1] ?? '';
    const re = new RegExp(`^/${matcher.replace(/^\/\((.*)\)$/, '$1')}$`);
    for (const ruta of EXCLUIDAS.slice(0, 8)) expect(re.test(ruta)).toBe(false);
    for (const ruta of ['/app/inicio', '/app/pos', '/api/organization/members', '/api/integrations/mercadopago/webhook', '/api/webhooks/facebook/1']) {
      expect(re.test(ruta)).toBe(true);
    }
  });

  it('los webhooks que NO son fail-closed siguen pasando por el middleware (no se excluyen)', async () => {
    for (const ruta of ['/api/integrations/mercadopago/webhook', '/api/integrations/tiktok/webhook', '/api/webhooks/instagram/9']) {
      const res = await middleware(peticion(ruta, { method: 'POST' }), evento);
      expect(res.status).toBe(401);
    }
  });
});

describe('verificarTokenAcceso · sin SUPABASE_JWT_SECRET pregunta a Auth', () => {
  beforeEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('Auth acepta el token → válido, y la segunda vez sale de la caché (una sola llamada)', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/auth/v1/user')
        ? new Response(JSON.stringify({ id: SUB }), { status: 200 })
        : new Response('{}', { status: 500 })
    );
    const token = await firmar({ sub: SUB });
    const [a, b] = await Promise.all([verificarTokenAcceso(token), verificarTokenAcceso(token)]);
    const c = await verificarTokenAcceso(token);
    for (const v of [a, b, c]) expect(v).toMatchObject({ estado: 'valido', metodo: 'servidor-auth' });
    const llamadasAuth = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/v1/user'));
    expect(llamadasAuth).toHaveLength(1);
    expect(llamadasAuth[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('Auth rechaza (401) → inválido → el middleware no deja pasar', async () => {
    fetchMock.mockImplementation(async () => new Response('{"msg":"bad jwt"}', { status: 401 }));
    expect(await verificarTokenAcceso(tokenFirmaInventada())).toMatchObject({ estado: 'invalido' });
    const res = await middleware(peticion('/app/inicio', { cookie: cookieDe(tokenFirmaInventada()) }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('Auth devuelve otro usuario → inválido', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'otro' }), { status: 200 }));
    expect(await verificarTokenAcceso(await firmar({ sub: SUB }))).toMatchObject({ estado: 'invalido' });
  });

  it('Auth no responde → no verificable → fail-closed en la web', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    const token = await firmar({ sub: SUB });
    expect(await verificarTokenAcceso(token)).toMatchObject({ estado: 'no_verificable' });
    const res = await middleware(peticion('/app/inicio', { cookie: cookieDe(token) }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('un token vencido se descarta sin preguntar a Auth', async () => {
    const token = await firmar({ sub: SUB }, { exp: ahora() - 10 });
    expect(await verificarTokenAcceso(token)).toEqual({ estado: 'vencido' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un secreto de relleno cuenta como ausente (no se firma con el valor de .env.example)', async () => {
    process.env.SUPABASE_JWT_SECRET = 'your-supabase-jwt-secret';
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    const token = await firmar({ sub: SUB }, { secreto: 'your-supabase-jwt-secret' });
    expect(await verificarTokenAcceso(token)).toMatchObject({ estado: 'invalido' });
  });
});

describe('servidor embebido del escritorio (sin red)', () => {
  beforeEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed'); // sin internet
    });
  });

  it('en localhost con GOADMIN_DESKTOP_EMBEDDED=1 navega offline (criterio heredado: sub y < 7 días)', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    const token = await firmar({ sub: SUB }, { exp: ahora() - 3600 });
    const res = await middleware(peticion('/app/pos', { cookie: cookieDe(token), host: 'localhost:47800' }), evento);
    expect(pasa(res)).toBe(true);
  });

  it('la excepción NO vale fuera de localhost aunque la variable exista', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    const token = await firmar({ sub: SUB });
    const res = await middleware(peticion('/app/pos', { cookie: cookieDe(token) }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('la excepción NO vale en localhost sin la marca del servidor embebido', async () => {
    const token = await firmar({ sub: SUB });
    const res = await middleware(peticion('/app/pos', { cookie: cookieDe(token), host: 'localhost:3000' }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('un token que Auth RECHAZA no entra ni en el escritorio', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    const res = await middleware(
      peticion('/app/pos', { cookie: cookieDe(tokenFirmaInventada()), host: 'localhost:47800' }),
      evento
    );
    expect(pasa(res)).toBe(false);
  });

  it('una firma mala con el secreto presente tampoco entra en el escritorio', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    process.env.SUPABASE_JWT_SECRET = SECRETO;
    const token = await firmar({ sub: SUB }, { secreto: OTRO_SECRETO });
    const res = await middleware(peticion('/app/pos', { cookie: cookieDe(token), host: 'localhost:47800' }), evento);
    expect(pasa(res)).toBe(false);
  });

  it('sesión abandonada (> 7 días vencida) no entra', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const viejo = `${b64({ alg: 'HS256' })}.${b64({ sub: SUB, exp: ahora() - 8 * 24 * 3600 })}.x`;
    expect(sesionHeredadaSoloEscritorio(viejo)).toBeNull();
  });
});

describe('verificarTokenAcceso · claves asimétricas (JWKS)', () => {
  it('ES256 firmado por la clave publicada en el JWKS → válido; firmado por otra clave → inválido', async () => {
    const http = await import('http');
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const otro = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'clave-1', alg: 'ES256', use: 'sig' };
    const servidor = http.createServer((req, res) => {
      if (req.url === '/auth/v1/.well-known/jwks.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
    const puerto = (servidor.address() as { port: number }).port;
    const urlOriginal = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${puerto}`;
    try {
      const firmarEs = (clave: KeyLike) =>
        new SignJWT({ role: 'authenticated' })
          .setProtectedHeader({ alg: 'ES256', kid: 'clave-1' })
          .setSubject(SUB)
          .setExpirationTime(ahora() + 600)
          .sign(clave);
      expect(await verificarTokenAcceso(await firmarEs(privateKey))).toMatchObject({ estado: 'valido', metodo: 'jwks' });
      expect(await verificarTokenAcceso(await firmarEs(otro.privateKey))).toMatchObject({ estado: 'invalido' });
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = urlOriginal;
      await new Promise<void>((r) => servidor.close(() => r()));
    }
  });
});
