/**
 * GET /api/busqueda-global — reglas duras 5 y 6.
 *
 *  - Sin sesión: 401 antes de leer nada.
 *  - Organización ajena en la query: 403 y ninguna consulta.
 *  - La organización de TODAS las consultas es la de la sesión.
 *  - Solo se consultan los grupos de módulos activos con página visible para
 *    el cargo; las acciones exigen además permiso (o admin).
 *  - Si no se pueden leer los módulos o los permisos: 500, fail-closed.
 *
 * Organizaciones ficticias (120, 999); sin datos reales.
 */
import { NextRequest } from 'next/server';

const ORG_SESION = 120;

type Sesion = { organizationId: number; userId: string; roleId: number; isSuperAdmin: boolean } | null;
let sesion: Sesion = { organizationId: ORG_SESION, userId: 'u-1', roleId: 5, isSuperAdmin: false };

// ─── Doble de Supabase: registra cada consulta ──────────────────────────────
interface Consulta {
  tabla: string;
  filtros: Array<[string, string, unknown]>;
}
const consultas: Consulta[] = [];
const rpcs: Array<{ nombre: string; args: Record<string, unknown> }> = [];
const datosTabla: Record<string, unknown[]> = {};
let permisos: string[] | null = [];

function cadena(tabla: string) {
  const c: Consulta = { tabla, filtros: [] };
  consultas.push(c);
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit']) q[m] = () => q;
  for (const m of ['eq', 'in', 'ilike', 'or']) {
    q[m] = (col: string, val?: unknown) => {
      c.filtros.push([m, col, val]);
      return q;
    };
  }
  q.then = (ok: (x: unknown) => void) => ok({ data: datosTabla[tabla] ?? [], error: null });
  return q;
}

const supabase = {
  from: (tabla: string) => cadena(tabla),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    rpcs.push({ nombre, args });
    if (nombre === 'get_user_permission_codes') {
      return permisos === null ? { data: null, error: { message: 'caída' } } : { data: permisos, error: null };
    }
    if (nombre === 'fn_clientes_buscar') {
      return {
        data: {
          total: 1,
          filas: [{ id: '11111111-1111-1111-1111-111111111111', full_name: 'María Pérez', doc_type: 'CC', doc_number: '1020456789', email: 'maria@ejemplo.co' }],
        },
        error: null,
      };
    }
    if (nombre === 'buscar_productos') return { data: [{ id: 7, nombre: 'Taladro', sku: 'TL-600', stock: 12 }], error: null };
    return { data: null, error: null };
  },
};

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError,
    withOrg: (handler: (ctx: unknown, req: Request) => Promise<Response>) => async (req: Request) => {
      try {
        if (!sesion) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
        return await handler({ ...sesion, supabase }, req);
      } catch (err) {
        if (err instanceof OrgContextError) {
          const e = err as { message: string; code: string; statusCode: number };
          return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.statusCode });
        }
        throw err;
      }
    },
  };
});

let modulos: string[] | Error = [];
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: {
    getActiveModules: async (orgId: number) => {
      if (orgId !== ORG_SESION) throw new Error('organización equivocada');
      if (modulos instanceof Error) throw modulos;
      return modulos.map((code) => ({ code }));
    },
    getHiddenModulePages: async () => ({}),
  },
}));
let paginasCargo: string[] | null = null;
jest.mock('@/lib/services/jobPositionModuleAccessService', () => ({
  jobPositionModuleAccessService: {
    getUserAccess: async (_u: string, orgId: number) => {
      if (orgId !== ORG_SESION) throw new Error('organización equivocada');
      return { visibleModules: null, visiblePages: paginasCargo };
    },
  },
}));

import { GET } from '../route';

const llamar = (qs: string) => (GET as unknown as (r: Request) => Promise<Response>)(new NextRequest(`http://localhost/api/busqueda-global${qs}`));
const tablas = () => consultas.map((c) => c.tabla);

beforeEach(() => {
  consultas.length = 0;
  rpcs.length = 0;
  for (const k of Object.keys(datosTabla)) delete datosTabla[k];
  sesion = { organizationId: ORG_SESION, userId: 'u-1', roleId: 5, isSuperAdmin: false };
  modulos = ['clientes', 'inventory'];
  paginasCargo = null;
  permisos = [];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sesión y organización (regla dura 5)', () => {
  it('sin sesión: 401 y ninguna consulta', async () => {
    sesion = null;
    const res = await llamar('?q=maria');
    expect(res.status).toBe(401);
    expect(consultas).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it.each(['organization_id=999', 'organizationId=999', 'orgId=999&q=maria', 'org_id=120&org_id=999'])(
    'organización ajena en la query (%s): 403 y ninguna consulta',
    async (qs) => {
      const res = await llamar(`?${qs}`);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
      expect(consultas).toEqual([]);
      expect(rpcs).toEqual([]);
    },
  );

  it('la misma organización de la sesión en la query no molesta', async () => {
    const res = await llamar('?organization_id=120&q=maria');
    expect(res.status).toBe(200);
  });

  it('todas las consultas y RPC usan la organización de la sesión', async () => {
    const res = await llamar('?q=bodega');
    expect(res.status).toBe(200);
    for (const c of consultas) {
      const org = c.filtros.find(([, col]) => col === 'organization_id' || col === 'branches.organization_id');
      expect(org?.[2]).toBe(ORG_SESION);
    }
    for (const r of rpcs) {
      const org = r.args.p_organization_id ?? r.args.p_org;
      expect(org).toBe(ORG_SESION);
    }
  });
});

describe('módulos, cargo y permisos (regla dura 6)', () => {
  it('solo consulta tablas de módulos activos', async () => {
    await llamar('?q=bodega');
    expect(tablas()).toEqual(expect.arrayContaining(['suppliers', 'categories']));
    for (const ajena of ['invoice_sales', 'web_orders', 'reservations', 'spaces', 'memberships', 'parking_vehicles', 'branches']) {
      expect(tablas()).not.toContain(ajena);
    }
  });

  it('el cargo que no ve «Proveedores» no los busca', async () => {
    paginasCargo = ['/app/inventario/productos', '/app/inventario/categorias'];
    await llamar('?q=bodega');
    expect(tablas()).not.toContain('suppliers');
    expect(tablas()).toContain('categories');
  });

  it('acciones: sin permiso no hay; con permiso, solo las de módulos activos', async () => {
    let cuerpo = await (await llamar('')).json();
    expect(cuerpo.acciones).toEqual([]);
    permisos = ['inventory.create', 'finance.create'];
    cuerpo = await (await llamar('')).json();
    expect(cuerpo.acciones.map((a: { id: string }) => a.id)).toEqual(['nuevoProducto']);
  });

  it('el admin (por id de rol, nunca por nombre) tiene todas las acciones de sus módulos', async () => {
    sesion = { organizationId: ORG_SESION, userId: 'u-1', roleId: 2, isSuperAdmin: false };
    const cuerpo = await (await llamar('')).json();
    expect(cuerpo.acciones.map((a: { id: string }) => a.id)).toEqual(['nuevoCliente', 'nuevoProducto']);
  });

  it('sin consulta suficiente solo devuelve acciones, sin tocar tablas de negocio', async () => {
    const cuerpo = await (await llamar('?q=m')).json();
    expect(cuerpo.grupos).toEqual([]);
    expect(tablas()).toEqual([]);
  });

  it('módulos ilegibles: 500 fail-closed, sin buscar nada', async () => {
    modulos = new Error('red');
    const res = await llamar('?q=maria');
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('ACCESO_NO_RESUELTO');
    expect(rpcs.map((r) => r.nombre)).not.toContain('fn_clientes_buscar');
  });

  it('permisos ilegibles: 500 fail-closed', async () => {
    permisos = null;
    const res = await llamar('?q=maria');
    expect(res.status).toBe(500);
  });
});

describe('resultados', () => {
  it('clientes por la RPC única y productos con el uuid de su ruta de detalle', async () => {
    datosTabla.products = [{ id: 7, uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Taladro percutor 600 W', sku: 'TL-600' }];
    const cuerpo = await (await llamar('?q=maria')).json();
    const clientes = cuerpo.grupos.find((g: { tipo: string }) => g.tipo === 'customer');
    expect(clientes.items[0]).toMatchObject({ titulo: 'María Pérez', url: '/app/clientes/11111111-1111-1111-1111-111111111111' });
    const productos = cuerpo.grupos.find((g: { tipo: string }) => g.tipo === 'product');
    expect(productos.items[0]).toMatchObject({ url: '/app/inventario/productos/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', detalle: { sku: 'TL-600', stock: 12 } });
  });

  it('proveedores sin tildes: «medellin» encuentra «Medellín» y enlaza por uuid', async () => {
    datosTabla.suppliers = [
      { id: 3, uuid: 'uuid-prov', name: 'Ferretería Medellín', nit: '900.123.456-7', email: null, city: 'Medellín' },
      { id: 4, uuid: 'uuid-otro', name: 'Otro proveedor', nit: null, email: null, city: null },
    ];
    const cuerpo = await (await llamar('?q=ferreteria%20medellin')).json();
    const grupo = cuerpo.grupos.find((g: { tipo: string }) => g.tipo === 'supplier');
    expect(grupo.items.map((i: { url: string }) => i.url)).toEqual(['/app/inventario/proveedores/uuid-prov']);
    const or = consultas.find((c) => c.tabla === 'suppliers')!.filtros.find(([m]) => m === 'or')![1] as string;
    expect(or).toMatch(/^[a-z_.,%0-9]+$/);
  });

  it('un grupo que falla no tumba a los demás: va en «fallidos»', async () => {
    const original = supabase.from;
    supabase.from = (tabla: string) => {
      if (tabla === 'categories') throw new Error('permiso denegado');
      return original(tabla);
    };
    try {
      const cuerpo = await (await llamar('?q=maria')).json();
      expect(cuerpo.fallidos).toEqual(['category']);
      expect(cuerpo.grupos.some((g: { tipo: string }) => g.tipo === 'customer')).toBe(true);
    } finally {
      supabase.from = original;
    }
  });
});
