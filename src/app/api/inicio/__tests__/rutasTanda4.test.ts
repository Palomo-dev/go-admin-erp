/**
 * Rutas nuevas del inicio, tanda 4 (Figma 445:137185 y 445:137617):
 * `GET /api/inicio/actividad` y `GET /api/inicio/primeros-pasos`. Reglas
 * duras 5 y 6 de CLAUDE.md:
 *
 *  - Sin sesión: 401 (lo responde `withOrg`; aquí el doble lo imita).
 *  - La organización es SIEMPRE la de la sesión, nunca la de la query.
 *  - Solo el panel completo (por id de rol): el resto, 403 sin consultar.
 *  - Periodo, sucursal, filtro o página inválidos: 400 sin consultar.
 *  - Un 42501 de la base se traduce a 403.
 *
 * Organización ficticia 120; sin datos reales.
 */
import { NextRequest } from 'next/server';

type Sesion = { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean; memberId: number };
let sesion: Sesion | null;

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError') as typeof import('@/lib/utils/orgContextError');
  return {
    withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
      if (!sesion) return new Response(JSON.stringify({ error: 'No hay sesión activa' }), { status: 401 });
      try {
        return await handler({ ...sesion, supabase: {} }, req);
      } catch (err) {
        if (err instanceof OrgContextError) return new Response(JSON.stringify({ code: err.code }), { status: err.statusCode });
        throw err;
      }
    },
  };
});

jest.mock('@/lib/dashboard/bloqueHoy.server', () => ({
  sucursalValida: async (_ctx: unknown, s: number) => s === 7,
}));

const llamadas: Array<{ que: string; org: number; sucursal?: number | null; extra?: unknown }> = [];
let fallaConPermiso = false;
jest.mock('@/lib/dashboard/inicio.server', () => {
  const real = jest.requireActual('@/lib/dashboard/errorInicio');
  const rango = { inicio: 'a', fin: 'b', inicioAnterior: 'c', finAnterior: 'd' };
  return {
    ErrorInicio: real.ErrorInicio,
    rangoDelPeriodo: async () => rango,
    actividadDelInicio: async (ctx: { organizationId: number }, _r: unknown, sucursal: number | null, pedido: unknown) => {
      llamadas.push({ que: 'actividad', org: ctx.organizationId, sucursal, extra: pedido });
      if (fallaConPermiso) throw new real.ErrorInicio(403, 'sin_permiso', 'Sin permiso');
      return { tipos: ['venta'], conteos: { venta: 1 }, total: 1, filas: [] };
    },
    primerosPasos: async (ctx: { organizationId: number }) => {
      llamadas.push({ que: 'pasos', org: ctx.organizationId });
      return { pasos: [], hechos: 0, hayMovimientos: true, hrefProductos: null, hrefPos: null };
    },
  };
});

import { GET as getActividad } from '../actividad/route';
import { GET as getPasos } from '../primeros-pasos/route';

type Handler = (r: Request) => Promise<Response>;
const pedir = (h: unknown, ruta: string) => (h as Handler)(new NextRequest(`http://localhost/api/inicio/${ruta}`));

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 2, isSuperAdmin: false, memberId: 55 };
  llamadas.length = 0;
  fallaConPermiso = false;
});

describe('GET /api/inicio/actividad', () => {
  test('sin sesión: 401 y ninguna consulta', async () => {
    sesion = null;
    expect((await pedir(getActividad, 'actividad?periodo=hoy')).status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });

  test('administrador: organización de la sesión, sucursal, filtro y página', async () => {
    const res = await pedir(getActividad, 'actividad?periodo=30d&sucursal=7&tipo=factura&pagina=3&organization_id=999');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(llamadas).toEqual([{ que: 'actividad', org: 120, sucursal: 7, extra: { tipo: 'factura', pagina: 3, tamano: 4 } }]);
    expect(await res.json()).toMatchObject({ pagina: 3, tamano: 4, total: 1 });
  });

  test('«Todo» no filtra por tipo', async () => {
    await pedir(getActividad, 'actividad?periodo=hoy&tipo=todo');
    expect(llamadas[0].extra).toEqual({ tipo: null, pagina: 1, tamano: 4 });
  });

  test('empleado: 403 y ninguna consulta', async () => {
    sesion!.roleId = 4;
    expect((await pedir(getActividad, 'actividad?periodo=hoy')).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  test.each([
    ['periodo', 'actividad?periodo=semana'],
    ['sucursal ajena', 'actividad?periodo=hoy&sucursal=99'],
    ['tipo', 'actividad?periodo=hoy&tipo=nomina'],
    ['página', 'actividad?periodo=hoy&pagina=0'],
    ['tamaño', 'actividad?periodo=hoy&tamano=500'],
  ])('%s inválido: 400 y ninguna consulta', async (_n, ruta) => {
    expect((await pedir(getActividad, ruta)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });

  test('42501 de la base: 403', async () => {
    fallaConPermiso = true;
    expect((await pedir(getActividad, 'actividad?periodo=hoy')).status).toBe(403);
  });
});

describe('GET /api/inicio/primeros-pasos', () => {
  test('sin sesión: 401', async () => {
    sesion = null;
    expect((await pedir(getPasos, 'primeros-pasos')).status).toBe(401);
  });

  test('administrador: 200 con la organización de la sesión', async () => {
    const res = await pedir(getPasos, 'primeros-pasos?organization_id=999');
    expect(res.status).toBe(200);
    expect(llamadas).toEqual([{ que: 'pasos', org: 120 }]);
  });

  test('empleado: 403 y ninguna consulta', async () => {
    sesion!.roleId = 4;
    expect((await pedir(getPasos, 'primeros-pasos')).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });
});
