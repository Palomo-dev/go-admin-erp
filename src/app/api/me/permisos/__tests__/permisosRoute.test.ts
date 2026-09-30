/**
 * GET /api/me/permisos — reglas duras 5 y 6 (CLAUDE.md).
 *
 *  - Sin sesión: 401; sin pertenencia a la organización: 403 (puerta `withOrg`).
 *  - La organización y el usuario son los de la SESIÓN; una organización en la
 *    query no cambia nada.
 *  - «Acceso total» por id de rol / super admin, nunca por nombre; en ese caso
 *    no se pregunta a la RPC.
 *  - Un error de lectura es 500, no una lista vacía.
 *
 * Organización ficticia 120; sin datos reales.
 */
type Sesion = { organizationId: number; userId: string; roleId: number; roleName: string; isSuperAdmin: boolean };
let sesion: Sesion | { error: number } = { organizationId: 120, userId: 'u-1', roleId: 4, roleName: 'Admin', isSuperAdmin: false };

const rpcLlamadas: Array<[string, unknown]> = [];
let rpcRespuesta: { data: unknown; error: { message: string } | null } = { data: ['pos.vender'], error: null };
let catalogoRespuesta: { data: unknown; error: { message: string } | null } = {
  data: [
    { code: 'pos.vender', name: 'Vender', description: 'Permite vender en el POS', module: 'pos' },
    { code: 'pos.cajas.cerrar_ajenas', name: 'Cerrar', description: 'Cerrar una caja del POS que abrió otra persona', module: 'pos' },
    { code: 'crm.contacts.create', name: 'Crear Contactos', description: 'Crear contactos', module: 'crm' },
  ],
  error: null,
};

const supabase = {
  from: () => {
    const q = { select: () => q, order: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve(catalogoRespuesta).then(r) };
    return q;
  },
  rpc: async (fn: string, args: unknown) => {
    rpcLlamadas.push([fn, args]);
    return rpcRespuesta;
  },
};

jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
    if ('error' in sesion) {
      return new Response(JSON.stringify({ error: 'x' }), { status: sesion.error });
    }
    return handler({ ...sesion, supabase }, req);
  },
  // Mismo criterio que el real (`isOrgAdminLike`): super admin o rol 1/2 por id.
  isOrgAdminContext: (ctx: Sesion) => ctx.isSuperAdmin || ctx.roleId === 1 || ctx.roleId === 2,
}));

import { GET } from '../route';

const pedir = (qs = '') => (GET as unknown as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/me/permisos${qs}`));

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 4, roleName: 'Admin', isSuperAdmin: false };
  rpcLlamadas.length = 0;
  rpcRespuesta = { data: ['pos.vender'], error: null };
  catalogoRespuesta = { ...catalogoRespuesta, error: null };
});

test('sin sesión: 401 y ninguna consulta', async () => {
  sesion = { error: 401 };
  expect((await pedir()).status).toBe(401);
  expect(rpcLlamadas).toHaveLength(0);
});

test('sin pertenencia a la organización: 403', async () => {
  sesion = { error: 403 };
  expect((await pedir()).status).toBe(403);
});

test('empleado: permisos del usuario de la sesión en la organización de la sesión, agrupados', async () => {
  const res = await pedir('?organization_id=999&user_id=otro');
  expect(res.status).toBe(200);
  expect(rpcLlamadas).toEqual([['get_user_permission_codes', { p_user_id: 'u-1', p_organization_id: 120 }]]);
  const json = await res.json();
  expect(json.organizationId).toBe(120);
  expect(json.accesoTotal).toBe(false);
  expect(json.total).toBe(1);
  expect(json.grupos).toEqual([
    {
      modulo: 'pos',
      permitidos: [{ codigo: 'pos.vender', nombre: 'Vender en el POS' }],
      noIncluidos: [{ codigo: 'pos.cajas.cerrar_ajenas', nombre: 'Cerrar una caja del POS que abrió otra persona' }],
    },
  ]);
  expect(res.headers.get('Cache-Control')).toContain('no-store');
});

test('un rol LLAMADO «Admin» con id de empleado no da acceso total (regla 6)', async () => {
  const json = await (await pedir()).json();
  expect(json.accesoTotal).toBe(false);
});

test('administrador por id de rol o super admin: acceso total sin preguntar a la RPC', async () => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'Cualquiera', isSuperAdmin: false };
  const json = await (await pedir()).json();
  expect(json.accesoTotal).toBe(true);
  expect(json.total).toBe(3);
  expect(rpcLlamadas).toHaveLength(0);

  sesion = { organizationId: 120, userId: 'u-1', roleId: 7, roleName: 'x', isSuperAdmin: true };
  expect((await (await pedir()).json()).accesoTotal).toBe(true);
});

test('error de la RPC o del catálogo: 500, nunca una lista vacía', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  rpcRespuesta = { data: null, error: { message: 'boom' } };
  expect((await pedir()).status).toBe(500);
  rpcRespuesta = { data: [], error: null };
  catalogoRespuesta = { ...catalogoRespuesta, error: { message: 'rls' } };
  expect((await pedir()).status).toBe(500);
  err.mockRestore();
});
