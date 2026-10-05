/**
 * /api/inventario/precios-sede/** — sesión, organización y permisos
 * (reglas duras 5 y 6), con el servicio REAL y Supabase doblado:
 *   - una organización ajena en el body o la query: 403 sin tocar la base;
 *   - la RPC recibe SIEMPRE la organización de la sesión;
 *   - 42501 de la base (permiso o dato de otra organización) → 403 registrado;
 *   - costos sin inventory.costs.view → 403; sede ajena → 404;
 *   - lote: hijo/padre (heredar_padre) y variantes (incluir_variantes) llegan a la RPC.
 *
 * Datos inventados: organización 120 (sesión), 999 (ajena), sedes 7 y 8.
 */
const ORG_SESION = 120;
const ORG_AJENA = 999;

type Llamada = { fn: string; args: Record<string, unknown> };
const mundo = {
  sesion: true,
  llamadas: [] as Llamada[],
  tablas: [] as string[],
  verCostos: true,
  errorRpc: null as null | { code: string; message: string },
  respuestaRpc: {} as Record<string, unknown>,
  sedes: [{ id: 7, organization_id: ORG_SESION, name: 'Centro' }, { id: 8, organization_id: ORG_SESION, name: 'Norte' }, { id: 70, organization_id: ORG_AJENA, name: 'X' }],
  filas: {} as Record<string, unknown[]>,
};

function dobleSupabase() {
  const builder = (tabla: string) => {
    mundo.tablas.push(tabla);
    const filtros: Array<[string, unknown]> = [];
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'lte', 'or', 'order', 'is']) b[m] = () => b;
    b.eq = (col: string, v: unknown) => {
      filtros.push([col, v]);
      return b;
    };
    const resolver = () => {
      if (tabla === 'branches') {
        const id = filtros.find(([c]) => c === 'id')?.[1];
        const org = filtros.find(([c]) => c === 'organization_id')?.[1];
        const lista = mundo.sedes.filter((s) => s.organization_id === org && (id === undefined || s.id === id));
        return { data: id === undefined ? lista : lista[0] ?? null, error: null };
      }
      if (tabla === 'products') {
        const id = filtros.find(([c]) => c === 'id')?.[1];
        const org = filtros.find(([c]) => c === 'organization_id')?.[1];
        return { data: org === ORG_SESION && id === 1001 ? { id: 1001 } : null, error: null };
      }
      return { data: mundo.filas[tabla] ?? [], error: null };
    };
    b.maybeSingle = () => Promise.resolve(resolver());
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko);
    return b;
  };
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mundo.llamadas.push({ fn, args });
      if (fn === 'fn_receta_int_puede_ver_costos') return { data: mundo.verCostos, error: null };
      if (mundo.errorRpc) return { data: null, error: mundo.errorRpc };
      return { data: mundo.respuestaRpc[fn] ?? null, error: null };
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
  const jsonError = (status: number, code: string, message?: string) =>
    new Response(JSON.stringify({ error: message ?? code, code }), { status, headers: { 'Content-Type': 'application/json' } });
  return {
    OrgContextError,
    jsonError,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
      async (req: Request, rp: unknown) => {
        try {
          if (!mundo.sesion) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
          const ctx = { userId: 'u-1', organizationId: ORG_SESION, roleId: 5, isSuperAdmin: false, supabase: dobleSupabase() };
          return await handler(ctx, req, rp);
        } catch (err) {
          if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code, err.message);
          throw err;
        }
      },
  };
});

import { GET, POST } from '@/app/api/inventario/precios-sede/route';
import { POST as POST_RESOLVER } from '@/app/api/inventario/precios-sede/resolver/route';

const rp = { params: Promise.resolve({}) };
const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const FIJAR = { tipo: 'precio', branch_ids: [7, 8], product_ids: [1001], valor: 20000 };

beforeEach(() => {
  mundo.sesion = true;
  mundo.llamadas = [];
  mundo.tablas = [];
  mundo.verCostos = true;
  mundo.errorRpc = null;
  mundo.respuestaRpc = {};
  mundo.filas = {};
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('organización de la sesión', () => {
  it('sin sesión: 401 y no se llama a la base', async () => {
    mundo.sesion = false;
    const r = await POST(post('http://x/api/inventario/precios-sede', FIJAR), rp);
    expect(r.status).toBe(401);
    expect(mundo.llamadas).toHaveLength(0);
  });

  it.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('POST con %s ajena en el body: 403 y la RPC no se llama', async (clave) => {
    const r = await POST(post('http://x/api/inventario/precios-sede', { ...FIJAR, [clave]: ORG_AJENA }), rp);
    expect(r.status).toBe(403);
    expect(mundo.llamadas).toHaveLength(0);
  });

  it('GET con organization_id ajena en la query: 403 sin tocar la base', async () => {
    const r = await GET(new Request(`http://x/api/inventario/precios-sede?product_id=1001&organization_id=${ORG_AJENA}`), rp);
    expect(r.status).toBe(403);
    expect(mundo.tablas).toHaveLength(0);
  });

  it('resolver con orgId ajena en el body: 403', async () => {
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { branch_id: 7, product_ids: [1], orgId: ORG_AJENA }), rp);
    expect(r.status).toBe(403);
    expect(mundo.llamadas).toHaveLength(0);
  });

  it('la misma organización de la sesión en el body no es ajena: pasa, y la RPC recibe la de la sesión', async () => {
    mundo.respuestaRpc.fn_productos_sede_fijar = { tipo: 'precio', cambiados: 2, sin_cambio: 0, productos: 1, sedes: 2, omitidos_eliminados: 0, desde: '2026-10-05T15:00:00Z' };
    const r = await POST(post('http://x/api/inventario/precios-sede', { ...FIJAR, organization_id: ORG_SESION }), rp);
    expect(r.status).toBe(200);
    expect(mundo.llamadas[0]).toMatchObject({
      fn: 'fn_productos_sede_fijar',
      args: { p_organization_id: ORG_SESION, p_tipo: 'precio', p_branch_ids: [7, 8], p_product_ids: [1001], p_valor: 20000, p_incluir_variantes: false },
    });
  });
});

describe('fijar', () => {
  it('padre con todas sus variantes: incluir_variantes llega a la RPC', async () => {
    mundo.respuestaRpc.fn_productos_sede_fijar = { cambiados: 5 };
    const r = await POST(post('http://x/api/inventario/precios-sede', { ...FIJAR, incluir_variantes: true, desde: '2026-10-06T00:00:00-05:00' }), rp);
    expect(r.status).toBe(200);
    expect(mundo.llamadas[0].args).toMatchObject({ p_incluir_variantes: true, p_desde: '2026-10-06T00:00:00-05:00' });
  });

  it('valor null = quitar el precio de la sede (vuelve el general)', async () => {
    mundo.respuestaRpc.fn_productos_sede_fijar = { cambiados: 1 };
    const r = await POST(post('http://x/api/inventario/precios-sede', { ...FIJAR, valor: null }), rp);
    expect(r.status).toBe(200);
    expect(mundo.llamadas[0].args.p_valor).toBeNull();
  });

  it.each([
    ['producto_de_otra_organizacion'],
    ['sucursal_de_otra_organizacion'],
    ['sin_permiso'],
  ])('42501 de la base (%s) → 403 con su código', async (motivo) => {
    mundo.errorRpc = { code: '42501', message: motivo };
    const r = await POST(post('http://x/api/inventario/precios-sede', FIJAR), rp);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: motivo });
  });

  it('22023 de la base (p. ej. desde en el pasado) → 400', async () => {
    mundo.errorRpc = { code: '22023', message: 'desde_en_el_pasado' };
    const r = await POST(post('http://x/api/inventario/precios-sede', FIJAR), rp);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: 'desde_en_el_pasado' });
  });

  it.each([
    [{ ...FIJAR, tipo: 'otro' }],
    [{ ...FIJAR, branch_ids: [] }],
    [{ ...FIJAR, valor: -1 }],
    [{ ...FIJAR, comparacion: 30000, tipo: 'costo' }],
    [{ ...FIJAR, supplier_id: 4 }],
    [{ ...FIJAR, desde: '2026-10-06' }],
    [{ ...FIJAR, campo_extra: 1 }],
  ])('body inválido → 400 sin llamar a la RPC (%#)', async (body) => {
    const r = await POST(post('http://x/api/inventario/precios-sede', body), rp);
    expect(r.status).toBe(400);
    expect(mundo.llamadas).toHaveLength(0);
  });
});

describe('resolver en lote', () => {
  it('precio: llama al lote con la organización de la sesión, la sede y heredar_padre', async () => {
    mundo.respuestaRpc.fn_precios_vigentes_lote = [
      { product_id: 1, precio: '20000', precio_comparacion: null, origen: 'sede' },
      { product_id: 2, precio: '18000.00', precio_comparacion: '21000', origen: 'general' },
      { product_id: 3, precio: '15000', precio_comparacion: null, origen: 'padre_general' },
      { product_id: 4, precio: null, precio_comparacion: null, origen: null },
    ];
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { branch_id: 7, product_ids: [1, 2, 3, 4], heredar_padre: true }), rp);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      valores: [
        { product_id: 1, valor: 20000, comparacion: null, origen: 'sede' },
        { product_id: 2, valor: 18000, comparacion: 21000, origen: 'general' },
        { product_id: 3, valor: 15000, comparacion: null, origen: 'padre_general' },
        { product_id: 4, valor: null, comparacion: null, origen: null },
      ],
    });
    expect(mundo.llamadas.at(-1)).toMatchObject({
      fn: 'fn_precios_vigentes_lote',
      args: { p_organization_id: ORG_SESION, p_branch_id: 7, p_product_ids: [1, 2, 3, 4], p_heredar_padre: true },
    });
  });

  it('sede de otra organización → 404 y el lote no se consulta', async () => {
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { branch_id: 70, product_ids: [1] }), rp);
    expect(r.status).toBe(404);
    expect(mundo.llamadas.some((l) => l.fn === 'fn_precios_vigentes_lote')).toBe(false);
  });

  it('costos sin inventory.costs.view → 403 (permiso resuelto en el servidor)', async () => {
    mundo.verCostos = false;
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { tipo: 'costo', branch_id: 7, product_ids: [1] }), rp);
    expect(r.status).toBe(403);
    expect(mundo.llamadas.some((l) => l.fn === 'fn_costos_vigentes_lote')).toBe(false);
  });

  it('costos (insumos de una receta) en la sede: lote de costos', async () => {
    mundo.respuestaRpc.fn_costos_vigentes_lote = [
      { product_id: 501, costo: '4200', origen: 'sede' },
      { product_id: 502, costo: '900', origen: 'general' },
    ];
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { tipo: 'costo', branch_id: 8, product_ids: [501, 502] }), rp);
    expect(r.status).toBe(200);
    expect((await r.json()).valores).toEqual([
      { product_id: 501, valor: 4200, comparacion: null, origen: 'sede' },
      { product_id: 502, valor: 900, comparacion: null, origen: 'general' },
    ]);
  });

  it('branch_id null = precio general (sin consultar sedes)', async () => {
    mundo.respuestaRpc.fn_precios_vigentes_lote = [];
    const r = await POST_RESOLVER(post('http://x/api/inventario/precios-sede/resolver', { branch_id: null, product_ids: [1] }), rp);
    expect(r.status).toBe(200);
    expect(mundo.tablas).not.toContain('branches');
    expect(mundo.llamadas.at(-1)?.args.p_branch_id).toBeNull();
  });
});

describe('detalle de un producto', () => {
  it('general y lo propio de cada sede; producto ajeno → 404', async () => {
    mundo.filas.product_prices = [{ price: '18000', compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null }];
    mundo.filas.product_costs = [{ cost: '9000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }];
    mundo.filas.product_branch_prices = [{ branch_id: 8, product_id: 1001, price: '21000', compare_price: null, effective_from: '2026-09-01T00:00:00Z', effective_to: null }];
    mundo.filas.product_branch_costs = [{ branch_id: 7, product_id: 1001, cost: '9500', supplier_id: null, effective_from: '2026-09-01T00:00:00Z', effective_to: null }];
    const r = await GET(new Request('http://x/api/inventario/precios-sede?product_id=1001'), rp);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      product_id: 1001,
      precio_general: 18000,
      comparacion_general: null,
      costo_general: 9000,
      puede_ver_costos: true,
      sedes: [
        { branch_id: 7, nombre: 'Centro', precio_sede: null, comparacion_sede: null, costo_sede: 9500 },
        { branch_id: 8, nombre: 'Norte', precio_sede: 21000, comparacion_sede: null, costo_sede: null },
      ],
    });

    const ajeno = await GET(new Request('http://x/api/inventario/precios-sede?product_id=5'), rp);
    expect(ajeno.status).toBe(404);
  });

  it('sin inventory.costs.view los costos salen en null y no se consultan', async () => {
    mundo.verCostos = false;
    const r = await GET(new Request('http://x/api/inventario/precios-sede?product_id=1001'), rp);
    const cuerpo = await r.json();
    expect(cuerpo.puede_ver_costos).toBe(false);
    expect(cuerpo.costo_general).toBeNull();
    expect(mundo.tablas).not.toContain('product_costs');
    expect(mundo.tablas).not.toContain('product_branch_costs');
  });
});
