/**
 * /api/sitio-web/dominios/** — reglas duras 5 y 6 (CLAUDE.md) y el contrato de
 * errores que pinta Dominios (B/07-04 error, B/07-05 sin permiso, B/07-11 en
 * uso): sesión y organización de `withOrg`, organización ajena en la query o
 * el body → 403, id que no es uuid → 404, límite de verificaciones (429) y
 * ningún mensaje interno (base o Vercel) en la respuesta.
 *
 * Organización ficticia 120; sin datos reales.
 */
type Sesion = { organizationId: number; userId: string };
let sesion: Sesion | { error: number } = { organizationId: 120, userId: 'u-1' };

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError: Err,
    hasOrgAdminOrPermission: async () => true,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
      async (req: Request, rp: unknown) => {
        if ('error' in sesion) return new Response('{}', { status: sesion.error });
        try {
          return await handler({ ...sesion, supabase: {} }, req, rp);
        } catch (e) {
          if (e instanceof Err) {
            const err = e as { code: string; statusCode: number };
            return new Response(JSON.stringify({ code: err.code }), { status: err.statusCode });
          }
          throw e;
        }
      },
    readOrgBody: async (ctx: Sesion, req: Request) => {
      const otra = new URL(req.url).searchParams.get('organization_id');
      if (otra && Number(otra) !== ctx.organizationId) throw new Err('Organización distinta', 403);
      if (req.method === 'GET' || req.method === 'DELETE') return {};
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (body.organization_id !== undefined && body.organization_id !== ctx.organizationId) throw new Err('Organización distinta', 403);
      return body;
    },
  };
});

const servicio = {
  leerDominios: jest.fn(),
  conectarDominio: jest.fn(),
  leerDetalle: jest.fn(),
  hacerPrincipal: jest.fn(),
  cambiarAutoRenovar: jest.fn(),
  quitarDominio: jest.fn(),
  verificar: jest.fn(),
  cambiarSubdominio: jest.fn(),
  solicitarCodigoTransferencia: jest.fn(),
};
jest.mock('@/lib/services/website/dominios/dominiosSitioService', () => {
  const real = jest.requireActual('@/lib/services/website/dominios/dominiosSitioService');
  return {
    ErrorDominios: real.ErrorDominios,
    dependenciasDominios: async () => ({}),
    leerDominios: (...a: unknown[]) => servicio.leerDominios(...a),
    conectarDominio: (...a: unknown[]) => servicio.conectarDominio(...a),
    leerDetalle: (...a: unknown[]) => servicio.leerDetalle(...a),
    hacerPrincipal: (...a: unknown[]) => servicio.hacerPrincipal(...a),
    cambiarAutoRenovar: (...a: unknown[]) => servicio.cambiarAutoRenovar(...a),
    quitarDominio: (...a: unknown[]) => servicio.quitarDominio(...a),
    verificar: (...a: unknown[]) => servicio.verificar(...a),
    cambiarSubdominio: (...a: unknown[]) => servicio.cambiarSubdominio(...a),
    solicitarCodigoTransferencia: (...a: unknown[]) => servicio.solicitarCodigoTransferencia(...a),
  };
});
let permitido = true;
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimits: async () => ({ allowed: permitido, resetAt: new Date(Date.now() + 60_000) }) }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null }));

import { ErrorDominios } from '@/lib/services/website/dominios/dominiosSitioService';
import { ErrorVercel } from '@/lib/services/website/dominios/vercelDominios';
import { GET as LISTA, POST as CONECTAR } from '../dominios/route';
import { GET as DETALLE, PATCH, DELETE } from '../dominios/[id]/route';
import { POST as VERIFICAR } from '../dominios/[id]/verificar/route';
import { PUT as SUBDOMINIO } from '../dominios/subdominio/route';
import { POST as CODIGO } from '../dominios/[id]/codigo-transferencia/route';

type Handler = (r: Request, rp: { params: Promise<Record<string, string>> }) => Promise<Response>;
const ID = '7f3c1f0e-1111-4222-8333-444455556666';
const llamar = (h: unknown, metodo: string, ruta: string, opts: { id?: string; body?: unknown } = {}) =>
  (h as Handler)(
    new Request(`http://localhost/api/sitio-web/dominios${ruta}`, {
      method: metodo,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body), headers: { 'Content-Type': 'application/json' } }),
    }),
    { params: Promise.resolve<Record<string, string>>(opts.id === undefined ? {} : { id: opts.id }) },
  );

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1' };
  permitido = true;
  for (const f of Object.values(servicio)) f.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GET /api/sitio-web/dominios', () => {
  test('sin sesión 401 y sin pertenencia 403, sin leer nada', async () => {
    sesion = { error: 401 };
    expect((await llamar(LISTA, 'GET', '')).status).toBe(401);
    sesion = { error: 403 };
    expect((await llamar(LISTA, 'GET', '')).status).toBe(403);
    expect(servicio.leerDominios).not.toHaveBeenCalled();
  });

  test('200 con la organización de la sesión y sin caché', async () => {
    servicio.leerDominios.mockResolvedValue({ dominios: [] });
    const r = await llamar(LISTA, 'GET', '');
    expect(r.status).toBe(200);
    expect(servicio.leerDominios.mock.calls[0][0]).toMatchObject({ organizationId: 120 });
    expect(r.headers.get('Cache-Control')).toContain('no-store');
  });

  test('?sede= pasa al servicio, que la valida con la organización de la sesión', async () => {
    servicio.leerDominios.mockResolvedValue({ dominios: [], sede: null });
    expect((await llamar(LISTA, 'GET', '?sede=7')).status).toBe(200);
    expect(servicio.leerDominios.mock.calls[0][2]).toEqual({ sede: '7' });
  });

  test('otra organización en la query: 403 y no se lee', async () => {
    expect((await llamar(LISTA, 'GET', '?organization_id=999')).status).toBe(403);
    expect(servicio.leerDominios).not.toHaveBeenCalled();
  });

  test('sin website.domains → 403 sin_permiso (B/07-05)', async () => {
    servicio.leerDominios.mockRejectedValue(new ErrorDominios(403, 'sin_permiso', 'No tienes permiso para gestionar dominios.'));
    const r = await llamar(LISTA, 'GET', '');
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
  });

  test('fallo interno → 500 sin filtrar el mensaje (B/07-04)', async () => {
    servicio.leerDominios.mockRejectedValue(new Error('detalle interno de la base'));
    const r = await llamar(LISTA, 'GET', '');
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('detalle interno');
  });
});

describe('POST /api/sitio-web/dominios (conectar)', () => {
  test('organización ajena en el body: 403 sin conectar', async () => {
    expect((await llamar(CONECTAR, 'POST', '', { body: { host: 'tumarca.com', organization_id: 999 } })).status).toBe(403);
    expect(servicio.conectarDominio).not.toHaveBeenCalled();
  });

  test('201 y solo host y sede viajan al servicio', async () => {
    servicio.conectarDominio.mockResolvedValue({ dominio: { id: ID } });
    const r = await llamar(CONECTAR, 'POST', '', { body: { host: 'tumarca.com', sedeId: 7, otro: 'x' } });
    expect(r.status).toBe(201);
    expect(servicio.conectarDominio.mock.calls[0][1]).toEqual({ host: 'tumarca.com', sedeId: 7 });
  });

  test('dominio de otra organización → 409 en_otra_organizacion (B/07-11)', async () => {
    servicio.conectarDominio.mockRejectedValue(new ErrorDominios(409, 'en_otra_organizacion', 'Este dominio ya está conectado a otro sitio.'));
    const r = await llamar(CONECTAR, 'POST', '', { body: { host: 'ajeno.com' } });
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe('en_otra_organizacion');
  });

  test('Vercel falla → 502 sin su mensaje', async () => {
    servicio.conectarDominio.mockRejectedValue(new ErrorVercel(500, 'internal', 'token xyz inválido'));
    const r = await llamar(CONECTAR, 'POST', '', { body: { host: 'tumarca.com' } });
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain('xyz');
  });
});

describe('/api/sitio-web/dominios/[id]', () => {
  test('id que no es uuid: 404 sin llamar al servicio', async () => {
    expect((await llamar(DETALLE, 'GET', '/x', { id: '../otro' })).status).toBe(404);
    expect((await llamar(DELETE, 'DELETE', '/x', { id: 'abc' })).status).toBe(404);
    expect(servicio.leerDetalle).not.toHaveBeenCalled();
    expect(servicio.quitarDominio).not.toHaveBeenCalled();
  });

  test('PATCH: principal o autoRenovar; cualquier otra cosa 400', async () => {
    servicio.hacerPrincipal.mockResolvedValue({ id: ID });
    servicio.cambiarAutoRenovar.mockResolvedValue({ id: ID });
    expect((await llamar(PATCH, 'PATCH', `/${ID}`, { id: ID, body: { principal: true } })).status).toBe(200);
    expect((await llamar(PATCH, 'PATCH', `/${ID}`, { id: ID, body: { autoRenovar: false } })).status).toBe(200);
    expect(servicio.cambiarAutoRenovar.mock.calls[0].slice(1, 3)).toEqual([ID, false]);
    expect((await llamar(PATCH, 'PATCH', `/${ID}`, { id: ID, body: { status: 'verified' } })).status).toBe(400);
  });

  test('DELETE del subdominio del sistema → 422', async () => {
    servicio.quitarDominio.mockRejectedValue(new ErrorDominios(422, 'subdominio_sistema', 'No se puede quitar.'));
    const r = await llamar(DELETE, 'DELETE', `/${ID}`, { id: ID });
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('subdominio_sistema');
  });
});

describe('verificar, subdominio y código', () => {
  test('verificar: límite por organización → 429 con Retry-After', async () => {
    permitido = false;
    const r = await llamar(VERIFICAR, 'POST', `/${ID}/verificar`, { id: ID });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBeTruthy();
    expect(servicio.verificar).not.toHaveBeenCalled();
  });

  test('verificar: 200 con el resultado del servidor', async () => {
    servicio.verificar.mockResolvedValue({ resultado: 'verificando' });
    const r = await llamar(VERIFICAR, 'POST', `/${ID}/verificar`, { id: ID });
    expect(r.status).toBe(200);
    expect((await r.json()).resultado).toBe('verificando');
  });

  test('subdominio: el valor viaja al servicio, que valida', async () => {
    servicio.cambiarSubdominio.mockResolvedValue({ subdominio: 'mi-tienda', host: 'mi-tienda.goadmin.io' });
    expect((await llamar(SUBDOMINIO, 'PUT', '/subdominio', { body: { subdominio: 'mi-tienda' } })).status).toBe(200);
    expect(servicio.cambiarSubdominio.mock.calls[0][1]).toBe('mi-tienda');
  });

  test('código de transferencia: la respuesta no trae el código', async () => {
    servicio.solicitarCodigoTransferencia.mockResolvedValue({ correo: 'admin@tumarca.com' });
    const r = await llamar(CODIGO, 'POST', `/${ID}/codigo-transferencia`, { id: ID });
    expect(await r.json()).toEqual({ correo: 'admin@tumarca.com' });
  });
});
