/**
 * El Next embebido del escritorio no lleva clave de servicio. El ingreso
 * reenvía el cuerpo a la web pública solo con la marca del proceso y un
 * host local. En la web pública (sin la marca) no reenvía.
 */
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => {
    throw new Error('sin clave de servicio');
  }),
}));

import { POST } from '@/app/api/auth/acceso/route';
import { reenviarAccesoEscritorio, urlAccesoPublico } from '@/lib/auth/accesoEscritorio';
import { getServiceClient } from '@/lib/supabase/server-service';

const DESTINO = 'https://app.goadmin.io/api/auth/acceso';

function respuesta(status: number, cuerpo: string, headers: Record<string, string> = {}): Response {
  return new Response(cuerpo, { status, headers });
}

function peticionLocal(cuerpo: unknown = { email: 'ana@ejemplo.com', password: 'una-clave-larga' }) {
  return new Request('http://localhost:47800/api/auth/acceso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

function entorno(url?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
  if (url !== undefined) env.NEXT_PUBLIC_APP_URL = url;
  return env;
}

describe('urlAccesoPublico', () => {
  test('por defecto apunta al ingreso de la web pública por https', () => {
    expect(urlAccesoPublico(entorno())).toBe(DESTINO);
  });

  test('respeta NEXT_PUBLIC_APP_URL cuando es https y no es local', () => {
    expect(urlAccesoPublico(entorno('https://app.goadmin.io'))).toBe(DESTINO);
  });

  test('rechaza http y un destino en localhost (no se manda la contraseña ahí)', () => {
    expect(urlAccesoPublico(entorno('http://app.goadmin.io'))).toBeNull();
    expect(urlAccesoPublico(entorno('https://localhost:3000'))).toBeNull();
    expect(urlAccesoPublico(entorno('https://127.0.0.1'))).toBeNull();
    expect(urlAccesoPublico(entorno('no-es-una-url'))).toBeNull();
  });
});

describe('reenviarAccesoEscritorio', () => {
  const originalFetch = global.fetch;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    delete process.env.GOADMIN_DESKTOP_EMBEDDED;
    if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('sin la marca del escritorio no reenvía, aunque el host sea localhost', async () => {
    delete process.env.GOADMIN_DESKTOP_EMBEDDED;
    const fetchImpl = jest.fn();
    const res = await reenviarAccesoEscritorio(
      new Request('http://localhost/api/auth/acceso'),
      { email: 'ana@ejemplo.com', password: 'clave' },
      fetchImpl,
    );
    expect(res).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('con la marca, un host que no es local no reenvía (no hay bucle desde la web pública)', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    const fetchImpl = jest.fn();
    const res = await reenviarAccesoEscritorio(
      new Request('https://app.goadmin.io/api/auth/acceso'),
      { email: 'ana@ejemplo.com', password: 'clave' },
      fetchImpl,
    );
    expect(res).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('en el escritorio reenvía solo correo y contraseña, sin seguir redirecciones', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.goadmin.io';
    const fetchImpl = jest.fn(async () =>
      respuesta(200, JSON.stringify({ ok: true, session: { access_token: 'at' } }), {
        'content-type': 'application/json',
        'retry-after': '12',
        'set-cookie': 'no-debe-pasar=1',
      }),
    );
    const res = await reenviarAccesoEscritorio(
      new Request('http://127.0.0.1:47800/api/auth/acceso'),
      { email: 'ana@ejemplo.com', password: 'una-clave' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      DESTINO,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        body: JSON.stringify({ email: 'ana@ejemplo.com', password: 'una-clave' }),
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true, session: { access_token: 'at' } });
    expect(res!.headers.get('retry-after')).toBe('12');
    expect(res!.headers.get('set-cookie')).toBeNull();
  });

  test('una redirección no se sigue y se responde inesperado', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    const fetchImpl = jest.fn(async () => respuesta(302, '', { location: 'https://otro.ejemplo/robo' }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await reenviarAccesoEscritorio(
      new Request('http://localhost/api/auth/acceso'),
      { email: 'ana@ejemplo.com', password: 'clave' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(res!.status).toBe(502);
    expect(await res!.json()).toEqual({ ok: false, codigo: 'inesperado' });
  });

  test('si la web pública no responde, inesperado 503', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    const fetchImpl = jest.fn(async () => {
      throw new Error('red caída');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await reenviarAccesoEscritorio(
      new Request('http://[::1]:47800/api/auth/acceso'),
      { email: 'ana@ejemplo.com', password: 'clave' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(res!.status).toBe(503);
    expect(await res!.json()).toEqual({ ok: false, codigo: 'inesperado' });
  });
});

describe('POST /api/auth/acceso en el escritorio', () => {
  const originalFetch = global.fetch;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    (getServiceClient as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete process.env.GOADMIN_DESKTOP_EMBEDDED;
    if (appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = appUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('reenvía y no pide la clave de servicio', async () => {
    process.env.GOADMIN_DESKTOP_EMBEDDED = '1';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.goadmin.io';
    global.fetch = jest.fn(async () =>
      respuesta(401, JSON.stringify({ ok: false, codigo: 'credenciales' }), { 'content-type': 'application/json' }),
    ) as unknown as typeof fetch;

    const res = await POST(peticionLocal());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, codigo: 'credenciales' });
    expect(global.fetch).toHaveBeenCalledWith(DESTINO, expect.objectContaining({ method: 'POST', redirect: 'manual' }));
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  test('sin la marca, si falta la clave de servicio la respuesta es JSON 503', async () => {
    delete process.env.GOADMIN_DESKTOP_EMBEDDED;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await POST(peticionLocal());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, codigo: 'inesperado' });
    expect(getServiceClient).toHaveBeenCalled();
  });
});
