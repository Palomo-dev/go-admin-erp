/**
 * Middleware → Sentry (5-nov-2026): la redirección al login por cookie de sesión dañada queda en
 * Sentry como warning, con la ruta y el motivo y NUNCA el valor de la cookie. Las redirecciones
 * normales al login (sin cookie) y la respuesta 401 de /api no reportan.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

const reportarSentryServidor = jest.fn(async () => 'id');
jest.mock('@/lib/monitoring/sentryServidor', () => ({ reportarSentryServidor: (...a: unknown[]) => reportarSentryServidor(...(a as [])) }));

import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { middleware } from '@/middleware';
import { _reiniciarVerificadorParaTests } from '@/lib/auth/verificarTokenAcceso';

const COOKIE = 'sb-proyectotest-auth-token';
const VALOR_DANADO = 'xx-valor-de-cookie-que-no-debe-salir-xx';

function peticion(ruta: string, cookie?: string): NextRequest {
  return new NextRequest(`https://app.goadmin.io${ruta}`, { headers: cookie ? { cookie } : {} });
}

const originalFetch = global.fetch;
let waitUntil: jest.Mock;
let evento: NextFetchEvent;

beforeEach(() => {
  _reiniciarVerificadorParaTests();
  process.env.SUPABASE_JWT_SECRET = 'k3Jd9Qz7Lp2Xw8Rt5Yv1Bn4Mc6Hg0Fs-secreto-jwt-de-jest-middleware';
  reportarSentryServidor.mockClear();
  waitUntil = jest.fn();
  evento = { waitUntil } as unknown as NextFetchEvent;
  global.fetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('middleware · sesión dañada → Sentry', () => {
  it('cookie dañada en /app: redirige a corrupted-session y reporta (warning, ruta y motivo)', async () => {
    const res = await middleware(peticion('/app/inventario/productos', `${COOKIE}=${VALOR_DANADO}; org_id=120`), evento);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('corrupted-session');
    expect(reportarSentryServidor).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const [ev] = reportarSentryServidor.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(ev).toMatchObject({
      nivel: 'warning',
      tags: { area: 'sesion_corrupta', motivo: 'no_json', organization_id: '120' },
      extra: { ruta: '/app/inventario/productos' },
    });
    expect(JSON.stringify(ev)).not.toContain(VALOR_DANADO);
  });

  it('cookie "[object Object]": motivo object_object', async () => {
    await middleware(peticion('/app/inicio', `${COOKIE}=${encodeURIComponent('[object Object]')}`), evento);
    expect(reportarSentryServidor).toHaveBeenCalledWith(expect.objectContaining({ tags: expect.objectContaining({ motivo: 'object_object', organization_id: null }) }));
  });

  it('sin cookie: redirección normal al login, sin reporte', async () => {
    const res = await middleware(peticion('/app/inicio'), evento);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/login');
    expect(reportarSentryServidor).not.toHaveBeenCalled();
  });

  it('cookie dañada en /api (401 JSON) o en /auth (sin redirección): sin reporte', async () => {
    const api = await middleware(peticion('/api/modules', `${COOKIE}=${VALOR_DANADO}`), evento);
    expect(api.status).toBe(401);
    await middleware(peticion('/auth/login', `${COOKIE}=${VALOR_DANADO}`), evento);
    expect(reportarSentryServidor).not.toHaveBeenCalled();
  });
});
