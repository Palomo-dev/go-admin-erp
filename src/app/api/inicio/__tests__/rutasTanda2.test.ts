/**
 * Rutas del inicio, tanda 2 (ventas, tienda web, módulos, preferencias,
 * turno) — reglas duras 5 y 6 de CLAUDE.md:
 *
 *  - Sin sesión: 401 (lo responde `withOrg`; aquí el doble lo imita).
 *  - La organización es SIEMPRE la de la sesión, nunca la de la query o el body.
 *  - Las cifras del panel completo (ventas, tienda, módulos) solo para quien
 *    ve el panel completo (por id de rol, no por nombre): el resto, 403 sin
 *    consultar. Periodo o sucursal inválidos: 400 sin consultar.
 *  - Preferencias: un body con otra organización responde 403 (readOrgBody
 *    real); una forma inválida, 400; los módulos se validan contra el menú.
 *  - Un 42501 de la base se traduce a 403.
 *
 * Organización ficticia 120; sin datos reales.
 */
import { NextRequest } from 'next/server';

type Sesion = { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean; memberId: number };
let sesion: Sesion | null;

jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError') as typeof import('@/lib/utils/orgContextError');
  return {
    readOrgBody: real.readOrgBody,
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
    ventasDelPeriodo: async (ctx: { organizationId: number }, _r: unknown, sucursal: number | null) => {
      llamadas.push({ que: 'ventas', org: ctx.organizationId, sucursal });
      if (fallaConPermiso) throw new real.ErrorInicio(403, 'sin_permiso', 'Sin permiso');
      return { actual: { neto: 1 }, anterior: { neto: 0 }, monedas: ['COP'], moneda_base: 'COP', sucursales: {} };
    },
    tiendaWeb: async (ctx: { organizationId: number }, _r: unknown, sucursal: number | null) => {
      llamadas.push({ que: 'tienda', org: ctx.organizationId, sucursal });
      return { activa: false, hrefPedidos: null, hrefAnalitica: null };
    },
    leerPreferencias: async (ctx: { organizationId: number }) => {
      llamadas.push({ que: 'leerPrefs', org: ctx.organizationId });
      return { bloquesOcultos: [], modulosOrden: [], modulosOcultos: ['pos'] };
    },
    modulosDelInicio: async (ctx: { organizationId: number }, _r: unknown, sucursal: number | null, prefs: unknown) => {
      llamadas.push({ que: 'modulos', org: ctx.organizationId, sucursal, extra: prefs });
      return { modulos: [], badgeSolido: null, moneda: 'COP', zona: 'America/Bogota', calculadoEn: 'x' };
    },
    modulosVisibles: async () => [{ codigo: 'finance' }, { codigo: 'pos' }],
    guardarPreferencias: async (ctx: { organizationId: number }, p: unknown) => {
      llamadas.push({ que: 'guardarPrefs', org: ctx.organizationId, extra: p });
      return p;
    },
    turnoDeHoy: async (ctx: { organizationId: number; userId: string }) => {
      llamadas.push({ que: 'turno', org: ctx.organizationId, extra: ctx.userId });
      return { visible: true, estado: 'antes' };
    },
  };
});

import { GET as getVentas } from '../ventas/route';
import { GET as getTienda } from '../tienda-web/route';
import { GET as getModulos } from '../modulos/route';
import { GET as getPrefs, PUT as putPrefs } from '../preferencias/route';
import { GET as getTurno } from '../turno/route';

type Handler = (r: Request) => Promise<Response>;
const pedir = (h: unknown, ruta: string, init?: RequestInit) => (h as Handler)(new NextRequest(`http://localhost/api/inicio/${ruta}`, init as never));

beforeEach(() => {
  sesion = { organizationId: 120, userId: 'u-1', roleId: 2, isSuperAdmin: false, memberId: 55 };
  llamadas.length = 0;
  fallaConPermiso = false;
});

describe.each([
  ['ventas', getVentas, 'ventas'],
  ['tienda-web', getTienda, 'tienda'],
  ['modulos', getModulos, 'modulos'],
])('GET /api/inicio/%s', (ruta, handler, que) => {
  test('sin sesión: 401', async () => {
    sesion = null;
    expect((await pedir(handler, `${ruta}?periodo=hoy`)).status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });

  test('administrador: 200 con la organización de la sesión y la sucursal pedida', async () => {
    const res = await pedir(handler, `${ruta}?periodo=7d&sucursal=7&organization_id=999`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(llamadas.find((l) => l.que === que)).toMatchObject({ org: 120, sucursal: 7 });
  });

  test('empleado (rol fuera del panel completo): 403 y ninguna consulta', async () => {
    sesion!.roleId = 4;
    expect((await pedir(handler, `${ruta}?periodo=hoy`)).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  test('periodo o sucursal inválidos: 400 y ninguna consulta', async () => {
    expect((await pedir(handler, `${ruta}?periodo=semana`)).status).toBe(400);
    expect((await pedir(handler, `${ruta}?periodo=hoy&sucursal=99`)).status).toBe(400);
    expect((await pedir(handler, `${ruta}?periodo=hoy&sucursal=abc`)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});

test('ventas: un 42501 de la base se responde 403', async () => {
  fallaConPermiso = true;
  expect((await pedir(getVentas, 'ventas?periodo=hoy')).status).toBe(403);
});

test('módulos: aplica las preferencias leídas de la sesión (los ocultos no se consultan)', async () => {
  await pedir(getModulos, 'modulos?periodo=hoy');
  expect(llamadas.find((l) => l.que === 'modulos')?.extra).toEqual({ bloquesOcultos: [], modulosOrden: [], modulosOcultos: ['pos'] });
});

describe('/api/inicio/preferencias', () => {
  const put = (body: unknown, qs = '') =>
    pedir(putPrefs, `preferencias${qs}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('sin sesión: 401', async () => {
    sesion = null;
    expect((await pedir(getPrefs, 'preferencias')).status).toBe(401);
    expect((await put({})).status).toBe(401);
  });

  test('cualquier miembro guarda SU inicio en la organización de la sesión; módulos no visibles se descartan', async () => {
    sesion!.roleId = 4;
    const res = await put({ bloquesOcultos: ['tiendaWeb'], modulosOrden: ['pos', 'hrm'], modulosOcultos: [] });
    expect(res.status).toBe(200);
    expect(llamadas.find((l) => l.que === 'guardarPrefs')).toEqual({
      que: 'guardarPrefs',
      org: 120,
      extra: { bloquesOcultos: ['tiendaWeb'], modulosOrden: ['pos'], modulosOcultos: [] },
    });
  });

  test('body con otra organización: 403 y no se guarda', async () => {
    expect((await put({ organization_id: 999, bloquesOcultos: [] })).status).toBe(403);
    expect((await put({ bloquesOcultos: [] }, '?organization_id=999')).status).toBe(403);
    expect(llamadas.filter((l) => l.que === 'guardarPrefs')).toHaveLength(0);
  });

  test('forma inválida: 400', async () => {
    expect((await put({ bloquesOcultos: ['hoy'] })).status).toBe(400);
    expect((await put({ modulosOrden: 'pos' })).status).toBe(400);
    expect(llamadas.filter((l) => l.que === 'guardarPrefs')).toHaveLength(0);
  });
});

describe('/api/inicio/turno', () => {
  test('sin sesión: 401', async () => {
    sesion = null;
    expect((await pedir(getTurno, 'turno')).status).toBe(401);
  });

  test('cualquier miembro ve SU turno (persona y organización de la sesión)', async () => {
    sesion!.roleId = 4;
    const res = await pedir(getTurno, 'turno?organization_id=999&user_id=otro');
    expect(res.status).toBe(200);
    expect(llamadas).toEqual([{ que: 'turno', org: 120, extra: 'u-1' }]);
  });
});
