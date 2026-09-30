/**
 * GET /api/analitica-web — reglas duras 5 y 6 (CLAUDE.md).
 *
 *  - Sin sesión 401, sin pertenencia 403 (puerta `withOrg`).
 *  - La organización es la de la sesión; la de la query se ignora.
 *  - Ver: panel completo (id de rol / super admin) o permiso `reports.sales`
 *    resuelto en el servidor; nunca el nombre del rol. Si no: 403 sin consultar.
 *  - Exportar: panel completo o `reports.export`.
 *  - Petición inválida o sucursal de otra organización: 400.
 *
 * Organización ficticia 120; sin datos reales.
 */
type Sesion = { organizationId: number; userId: string; roleId: number; roleName: string; isSuperAdmin: boolean };
let sesion: Sesion | { error: number } = { organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false };
let permisos = new Set<string>();
const rpcLlamadas: Array<[string, Record<string, unknown>]> = [];
let rpcRespuesta: { data: unknown; error: { message: string; code?: string } | null } = {
  data: { zona: 'America/Bogota', actual: { visitantes: 3 }, anterior: {}, serie: [], paises: [], visitas_con_pais: 0, visitas_sin_ubicacion_total: 9 },
  error: null,
};

const supabase = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcLlamadas.push([fn, args]);
    return rpcRespuesta;
  },
};

jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
    if ('error' in sesion) return new Response('{}', { status: sesion.error });
    return handler({ ...sesion, supabase }, req);
  },
  hasOrgAdminOrPermission: async (ctx: Sesion, code: string) =>
    ctx.isSuperAdmin || ctx.roleId === 1 || ctx.roleId === 2 || permisos.has(code),
  jsonError: (status: number, code: string, message?: string) =>
    new Response(JSON.stringify({ error: message ?? code, code }), { status }),
}));

import { GET } from '../route';

const pedir = (qs: string) => (GET as unknown as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/analitica-web${qs}`));
const OK = '?desde=2026-09-01&hasta=2026-09-30';

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false };
  permisos = new Set();
  rpcLlamadas.length = 0;
  rpcRespuesta = { ...rpcRespuesta, error: null };
});

test('sin sesión: 401; sin pertenencia: 403', async () => {
  sesion = { error: 401 };
  expect((await pedir(OK)).status).toBe(401);
  sesion = { error: 403 };
  expect((await pedir(OK)).status).toBe(403);
  expect(rpcLlamadas).toHaveLength(0);
});

test('administrador: 200, organización de la sesión aunque la query traiga otra', async () => {
  const res = await pedir(`${OK}&organization_id=999&sucursal=7&pais=co`);
  expect(res.status).toBe(200);
  expect(rpcLlamadas).toEqual([
    ['fn_analitica_web', { p_organization_id: 120, p_desde: '2026-09-01', p_hasta: '2026-09-30', p_branch_id: 7, p_pais: 'CO' }],
  ]);
  const json = await res.json();
  expect(json.organizationId).toBe(120);
  expect(json.puedeExportar).toBe(true);
  expect(json.datos.actual.visitantes).toBe(3);
  expect(json.datos.visitasSinUbicacionTotal).toBe(9);
  expect(res.headers.get('Cache-Control')).toContain('no-store');
});

test('empleado sin reports.sales: 403 y ninguna consulta (un rol LLAMADO «Admin» no cuenta)', async () => {
  sesion = { organizationId: 120, userId: 'u-2', roleId: 4, roleName: 'Admin', isSuperAdmin: false };
  expect((await pedir(OK)).status).toBe(403);
  expect(rpcLlamadas).toHaveLength(0);
});

test('empleado con reports.sales: ve; exporta solo con reports.export', async () => {
  sesion = { organizationId: 120, userId: 'u-2', roleId: 4, roleName: 'x', isSuperAdmin: false };
  permisos = new Set(['reports.sales']);
  expect((await (await pedir(OK)).json()).puedeExportar).toBe(false);
  permisos = new Set(['reports.sales', 'reports.export']);
  expect((await (await pedir(OK)).json()).puedeExportar).toBe(true);
});

test('petición inválida: 400 sin consultar', async () => {
  expect((await pedir('?desde=2026-09-30&hasta=2026-09-01')).status).toBe(400);
  expect((await pedir('?desde=x&hasta=y')).status).toBe(400);
  expect(rpcLlamadas).toHaveLength(0);
});

test('sucursal de otra organización (la RPC responde 42501): 400', async () => {
  rpcRespuesta = { data: null, error: { message: 'La sucursal no es de la organización', code: '42501' } };
  expect((await pedir(`${OK}&sucursal=99`)).status).toBe(400);
});

test('error inesperado de la RPC: 500', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  rpcRespuesta = { data: null, error: { message: 'boom', code: 'XX000' } };
  expect((await pedir(OK)).status).toBe(500);
  err.mockRestore();
});
