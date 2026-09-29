/**
 * GET /api/inicio/hoy — reglas duras 5 y 6 (CLAUDE.md).
 *
 *  - La organización es la de la sesión (`withOrg`), nunca la de la query.
 *  - Solo quien ve el panel completo recibe las cifras (misma regla que la
 *    pantalla, por id de rol, no por nombre); el resto, 403 sin consultar.
 *  - Una sucursal que no es de la organización: 400 sin consultar.
 *
 * Organización ficticia 120; sin datos reales.
 */
import { NextRequest } from 'next/server';

type Sesion = { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean };
let sesion: Sesion = { organizationId: 120, userId: 'u-1', roleId: 2, isSuperAdmin: false };

jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) =>
    handler({ ...sesion, supabase: {} }, req),
}));

const llamadas: Array<{ org: number; sucursal: number | null }> = [];
let sucursalesDeLaOrg = [7];
jest.mock('@/lib/dashboard/bloqueHoy.server', () => ({
  sucursalValida: async (_ctx: unknown, s: number) => sucursalesDeLaOrg.includes(s),
  datosHoy: async (ctx: { organizationId: number }, sucursal: number | null) => {
    llamadas.push({ org: ctx.organizationId, sucursal });
    return { porCobrar: null, stock: null, pedidosWeb: null, cajasAnteriores: null, tareas: { abiertas: 1, vencenHoy: 0, vencidas: 0 }, unaSucursal: sucursal !== null };
  },
}));

import { GET } from '../route';

const pedir = (qs = '') => (GET as unknown as (r: Request) => Promise<Response>)(new NextRequest(`http://localhost/api/inicio/hoy${qs}`));

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 2, isSuperAdmin: false };
  sucursalesDeLaOrg = [7];
  llamadas.length = 0;
});

test('administrador: 200 con las cifras de su organización y la sucursal pedida', async () => {
  const res = await pedir('?sucursal=7');
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.tareas).toEqual({ abiertas: 1, vencenHoy: 0, vencidas: 0 });
  expect(typeof json.generadoEn).toBe('string');
  expect(llamadas).toEqual([{ org: 120, sucursal: 7 }]);
  expect(res.headers.get('Cache-Control')).toContain('no-store');
});

test('sin sucursal: todas las que ve la persona', async () => {
  await pedir();
  expect(llamadas).toEqual([{ org: 120, sucursal: null }]);
});

test('empleado (rol fuera del panel completo): 403 y ninguna consulta', async () => {
  sesion.roleId = 4;
  const res = await pedir('?sucursal=7');
  expect(res.status).toBe(403);
  expect(llamadas).toHaveLength(0);
});

test('super admin de la organización: sí ve el bloque', async () => {
  sesion = { ...sesion, roleId: 4, isSuperAdmin: true };
  expect((await pedir()).status).toBe(200);
});

test('sucursal de otra organización o basura: 400 y ninguna consulta', async () => {
  expect((await pedir('?sucursal=99')).status).toBe(400);
  expect((await pedir('?sucursal=abc')).status).toBe(400);
  expect(llamadas).toHaveLength(0);
});

test('una organización en la query no cambia la de la sesión', async () => {
  await pedir('?organization_id=999');
  expect(llamadas).toEqual([{ org: 120, sucursal: null }]);
});
