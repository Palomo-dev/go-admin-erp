/**
 * GET /api/sitio-web/resumen — reglas duras 5 y 6 (CLAUDE.md) y el contrato de
 * errores que pinta el Resumen (A/02d error, A/02e sin permiso).
 *
 * - Sin sesión 401, sin pertenencia 403 (puerta `withOrg`).
 * - La organización es la de la sesión; una distinta en la query → 403.
 * - 42501 de la base (RLS) → 403 «sin_permiso»; cualquier otro fallo → 500
 *   sin filtrar el mensaje interno.
 *
 * Organización ficticia 120; sin datos reales.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';

type Sesion = { organizationId: number; userId: string };
let sesion: Sesion | { error: number } = { organizationId: 120, userId: 'u-1' };
const leer = jest.fn();

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
  return {
    OrgContextError: Err,
    withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
      if ('error' in sesion) return new Response('{}', { status: sesion.error });
      try {
        return await handler({ ...sesion, supabase: {} }, req);
      } catch (e) {
        if (e instanceof Err) return new Response(JSON.stringify({ code: e.code }), { status: e.statusCode });
        throw e;
      }
    },
    readOrgBody: async (ctx: Sesion, req: Request) => {
      const otra = new URL(req.url).searchParams.get('organization_id');
      if (otra && Number(otra) !== ctx.organizationId) throw new Err('Organización distinta', 403);
      return {};
    },
  };
});
jest.mock('@/lib/website/resumenSitio.server', () => ({ leerResumenSitio: (...a: unknown[]) => leer(...a) }));

import { GET } from '../resumen/route';

const pedir = (qs = '') => (GET as unknown as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/sitio-web/resumen${qs}`));

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1' };
  leer.mockReset();
  leer.mockResolvedValue({ estado: 'listo', permisos: { editar: true, publicar: false } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

test('sin sesión 401 y sin pertenencia 403, sin leer nada', async () => {
  sesion = { error: 401 };
  expect((await pedir()).status).toBe(401);
  sesion = { error: 403 };
  expect((await pedir()).status).toBe(403);
  expect(leer).not.toHaveBeenCalled();
});

test('200 con el resumen de la organización de la sesión y sin caché', async () => {
  const r = await pedir();
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ estado: 'listo', permisos: { editar: true, publicar: false } });
  expect(leer.mock.calls[0][0]).toMatchObject({ organizationId: 120 });
  expect(r.headers.get('Cache-Control')).toContain('no-store');
});

test('otra organización en la query: 403 y no se lee', async () => {
  expect((await pedir('?organization_id=999')).status).toBe(403);
  expect(leer).not.toHaveBeenCalled();
});

test('42501 de la base → 403 sin_permiso (A/02e)', async () => {
  leer.mockRejectedValue({ code: '42501', message: 'permission denied for table website_site_states' });
  const r = await pedir();
  expect(r.status).toBe(403);
  expect((await r.json()).codigo).toBe('sin_permiso');
});

test('fallo interno → 500 sin filtrar el mensaje (A/02d)', async () => {
  leer.mockRejectedValue(new Error('detalle interno de la base'));
  const r = await pedir();
  expect(r.status).toBe(500);
  const json = await r.json();
  expect(json.codigo).toBe('error_interno');
  expect(JSON.stringify(json)).not.toContain('detalle interno');
});

test('un OrgContextError del lector lo responde withOrg', async () => {
  leer.mockRejectedValue(new OrgContextError('no', 403));
  expect((await pedir()).status).toBe(403);
});
