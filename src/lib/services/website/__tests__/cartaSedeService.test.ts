/**
 * Carta por sede: escritura en lote, «volver a como el principal» y rechazo de
 * lo que no es de la organización de la sesión. Supabase doblado: cada
 * consulta registra sus filtros y responde según la tabla.
 */
import { guardarCartaSede, listarCartaSede, type ContextoCartaSede } from '../cartaSedeService';
import { AJUSTE_PRINCIPAL, escrituraCartaSedeSchema, fusionarAjuste, instanteAgotadoHasta, diaAgotadoHasta } from '../cartaSede';

const ORG = 120;
const OTRA_ORG = 999;
const SEDE = 7;
const SEDE_AJENA = 70;
const TZ = 'America/Bogota';

interface Consulta {
  tabla: string;
  filtros: Array<[string, string, unknown]>;
  upsert?: { filas: Record<string, unknown>[]; opciones: unknown };
}

interface Mundo {
  sedes: Array<{ id: number; organization_id: number }>;
  productos: Array<{ id: number; organization_id: number; category_id: number | null; name?: string; sku?: string }>;
  ajustes: Array<Record<string, unknown>>;
  precios?: Array<Record<string, unknown>>;
  /** Filas de product_branch_prices (precio propio de una sede). */
  preciosSede?: Array<Record<string, unknown>>;
  permiso?: boolean;
  errorUpsert?: { message: string; code: string } | null;
}

function dobleSupabase(mundo: Mundo) {
  const consultas: Consulta[] = [];
  const rpc = jest.fn(async () => ({ data: mundo.permiso ?? true, error: null }));

  const valor = (c: Consulta, col: string, op = 'eq') => c.filtros.find(([k, o]) => k === col && o === op)?.[2];

  function resolver(c: Consulta): { data: unknown; error: unknown; count?: number } {
    if (c.upsert) return { data: null, error: mundo.errorUpsert ?? null };
    if (c.tabla === 'branches') {
      const fila = mundo.sedes.find((s) => s.id === valor(c, 'id') && s.organization_id === valor(c, 'organization_id'));
      return { data: fila ? { id: fila.id } : null, error: null };
    }
    if (c.tabla === 'products') {
      const ids = valor(c, 'id', 'in') as number[] | undefined;
      const cat = valor(c, 'category_id');
      const filas = mundo.productos.filter(
        (p) => p.organization_id === valor(c, 'organization_id') && (!ids || ids.includes(p.id)) && (cat === undefined || p.category_id === cat),
      );
      return { data: filas.map((p) => ({ id: p.id, name: p.name ?? `P${p.id}`, sku: p.sku ?? `SKU${p.id}`, category_id: p.category_id })), error: null, count: filas.length };
    }
    if (c.tabla === 'website_branch_products') {
      const ids = valor(c, 'product_id', 'in') as number[] | undefined;
      const filas = mundo.ajustes.filter(
        (a) => a.branch_id === valor(c, 'branch_id') && a.organization_id === valor(c, 'organization_id') && (!ids || ids.includes(a.product_id as number)),
      );
      return { data: filas, error: null };
    }
    if (c.tabla === 'product_prices') {
      const ids = (valor(c, 'product_id', 'in') as number[]) ?? [];
      return { data: (mundo.precios ?? []).filter((p) => ids.includes(p.product_id as number)), error: null };
    }
    if (c.tabla === 'product_branch_prices') {
      const ids = (valor(c, 'product_id', 'in') as number[]) ?? [];
      const sede = valor(c, 'branch_id');
      return { data: (mundo.preciosSede ?? []).filter((p) => ids.includes(p.product_id as number) && p.branch_id === sede), error: null };
    }
    return { data: null, error: { message: 'tabla no doblada' } };
  }

  function builder(tabla: string) {
    const c: Consulta = { tabla, filtros: [] };
    consultas.push(c);
    const b: Record<string, unknown> = {};
    const encadenar = (op: string) => (col: string, v: unknown) => {
      c.filtros.push([col, op, v]);
      return b;
    };
    b.select = () => b;
    b.eq = encadenar('eq');
    b.in = encadenar('in');
    b.is = encadenar('is');
    b.not = encadenar('not');
    b.lte = encadenar('lte');
    b.or = encadenar('or');
    b.order = () => b;
    b.range = () => b;
    b.limit = () => b;
    b.upsert = (filas: Record<string, unknown>[], opciones: unknown) => {
      c.upsert = { filas, opciones };
      return b;
    };
    b.maybeSingle = () => Promise.resolve(resolver(c));
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver(c)).then(ok, ko);
    return b;
  }

  const supabase = { from: jest.fn((t: string) => builder(t)), rpc };
  return { supabase, consultas, rpc };
}

function ctxCon(mundo: Mundo) {
  const doble = dobleSupabase(mundo);
  const ctx: ContextoCartaSede = { organizationId: ORG, userId: 'u-1', supabase: doble.supabase as never, timezone: TZ };
  return { ctx, ...doble };
}

const MUNDO_BASE = (): Mundo => ({
  sedes: [
    { id: SEDE, organization_id: ORG },
    { id: SEDE_AJENA, organization_id: OTRA_ORG },
  ],
  productos: [
    { id: 1, organization_id: ORG, category_id: 10 },
    { id: 2, organization_id: ORG, category_id: 10 },
    { id: 3, organization_id: ORG, category_id: 11 },
    { id: 50, organization_id: OTRA_ORG, category_id: 10 },
  ],
  ajustes: [{ organization_id: ORG, branch_id: SEDE, product_id: 2, is_listed: false, web_price: '26000.00', is_sold_out: true, sold_out_until: null }],
});

const upserts = (consultas: Consulta[]) => consultas.filter((c) => c.upsert);

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('guardarCartaSede: lote', () => {
  test('un lote de varios productos es UN solo upsert con onConflict de la PK y la organización de la sesión', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    const r = await guardarCartaSede(ctx, {
      tipo: 'productos',
      branch_id: SEDE,
      cambios: [
        { product_id: 1, web_price: 29000 },
        { product_id: 2, is_listed: true },
        { product_id: 3, is_sold_out: true, agotado_hasta: '2026-10-12' },
      ],
    });
    expect(r).toEqual({ guardados: 3 });
    const u = upserts(consultas);
    expect(u).toHaveLength(1);
    expect(u[0].upsert!.opciones).toEqual({ onConflict: 'branch_id,product_id' });
    const filas = u[0].upsert!.filas;
    expect(filas.every((f) => f.organization_id === ORG && f.branch_id === SEDE)).toBe(true);
    expect(filas.find((f) => f.product_id === 1)).toMatchObject({ is_listed: true, web_price: 29000, is_sold_out: false, sold_out_until: null });
    // El producto 2 conserva lo que ya tenía (precio y agotado) y solo cambia is_listed.
    expect(filas.find((f) => f.product_id === 2)).toMatchObject({ is_listed: true, web_price: 26000, is_sold_out: true });
    // «Hasta el 12» = disponible desde el 13 a las 00:00 de Bogotá.
    expect(filas.find((f) => f.product_id === 3)).toMatchObject({ is_sold_out: true, sold_out_until: '2026-10-13T00:00:00.000-05:00' });
  });

  test('acción de categoría: toma los productos de la categoría en la organización y escribe un solo upsert', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    const r = await guardarCartaSede(ctx, { tipo: 'categoria', branch_id: SEDE, category_id: 10, accion: 'ocultar' });
    expect(r).toEqual({ guardados: 2 });
    const consultaProductos = consultas.find((c) => c.tabla === 'products');
    expect(consultaProductos!.filtros).toEqual(expect.arrayContaining([['organization_id', 'eq', ORG], ['category_id', 'eq', 10]]));
    const u = upserts(consultas);
    expect(u).toHaveLength(1);
    expect(u[0].upsert!.filas.map((f) => f.product_id).sort()).toEqual([1, 2]);
    expect(u[0].upsert!.filas.every((f) => f.is_listed === false)).toBe(true);
  });

  test('los cambios se aplican en orden: restablecer y luego ocultar deja el producto oculto con el precio heredado', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    await guardarCartaSede(ctx, {
      tipo: 'productos',
      branch_id: SEDE,
      cambios: [
        { product_id: 2, restablecer: true },
        { product_id: 2, is_listed: false },
      ],
    });
    const filas = upserts(consultas)[0].upsert!.filas;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ product_id: 2, is_listed: false, web_price: null, is_sold_out: false, sold_out_until: null });
  });
});

describe('guardarCartaSede: volver a como el principal', () => {
  test('restablecer escribe la fila neutra (sin DELETE)', async () => {
    // El doble no expone `delete`: si el servicio lo llamara, la prueba fallaría.
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    await guardarCartaSede(ctx, { tipo: 'productos', branch_id: SEDE, cambios: [{ product_id: 2, restablecer: true }] });
    const filas = upserts(consultas)[0].upsert!.filas;
    expect(filas[0]).toEqual({ organization_id: ORG, branch_id: SEDE, product_id: 2, ...AJUSTE_PRINCIPAL });
  });

  test('restablecer una categoría deja todos sus productos como el principal', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    await guardarCartaSede(ctx, { tipo: 'categoria', branch_id: SEDE, category_id: 10, accion: 'restablecer' });
    const filas = upserts(consultas)[0].upsert!.filas;
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f).toMatchObject(AJUSTE_PRINCIPAL);
  });
});

describe('guardarCartaSede: organización ajena', () => {
  test('una sede de otra organización es 404 y no se escribe nada', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    await expect(
      guardarCartaSede(ctx, { tipo: 'productos', branch_id: SEDE_AJENA, cambios: [{ product_id: 1, is_listed: false }] }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'sede_no_encontrada' });
    expect(upserts(consultas)).toHaveLength(0);
  });

  test('un solo producto de otra organización rechaza el lote entero (403) y no se escribe nada', async () => {
    const { ctx, consultas } = ctxCon(MUNDO_BASE());
    await expect(
      guardarCartaSede(ctx, {
        tipo: 'productos',
        branch_id: SEDE,
        cambios: [
          { product_id: 1, is_listed: false },
          { product_id: 50, is_listed: false },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'producto_de_otra_organizacion' });
    expect(upserts(consultas)).toHaveLength(0);
    // La comprobación filtra por la organización de la SESIÓN.
    const c = consultas.find((q) => q.tabla === 'products')!;
    expect(c.filtros).toContainEqual(['organization_id', 'eq', ORG]);
  });

  test('sin website.sites.edit es 403 antes de leer nada más', async () => {
    const mundo = { ...MUNDO_BASE(), permiso: false };
    const { ctx, consultas, rpc } = ctxCon(mundo);
    await expect(
      guardarCartaSede(ctx, { tipo: 'productos', branch_id: SEDE, cambios: [{ product_id: 1, is_listed: false }] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'sin_permiso' });
    expect(rpc).toHaveBeenCalledWith('fn_website_tiene_permiso', { p_org: ORG, p_code: 'website.sites.edit' });
    expect(consultas).toHaveLength(0);
  });

  test('si la base rechaza el upsert por RLS (42501) responde 403', async () => {
    const mundo = { ...MUNDO_BASE(), errorUpsert: { message: 'new row violates row-level security policy', code: '42501' } };
    const { ctx } = ctxCon(mundo);
    await expect(
      guardarCartaSede(ctx, { tipo: 'productos', branch_id: SEDE, cambios: [{ product_id: 1, is_listed: false }] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('el esquema del body no admite claves de organización ni campos desconocidos', () => {
    const r = escrituraCartaSedeSchema.safeParse({ tipo: 'productos', branch_id: SEDE, organization_id: OTRA_ORG, cambios: [{ product_id: 1 }] });
    expect(r.success).toBe(false);
    const r2 = escrituraCartaSedeSchema.safeParse({ tipo: 'productos', branch_id: SEDE, cambios: [{ product_id: 1, organization_id: OTRA_ORG }] });
    expect(r2.success).toBe(false);
  });
});

describe('listarCartaSede', () => {
  test('precio vigente con la regla única de product_prices y ajuste de la sede', async () => {
    const mundo: Mundo = {
      ...MUNDO_BASE(),
      precios: [
        { product_id: 1, price: '30000', effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-06-01T00:00:00Z' },
        { product_id: 1, price: '32000', effective_from: '2026-06-01T00:00:00Z', effective_to: null },
        { product_id: 2, price: '26000', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      ],
    };
    const { ctx } = ctxCon(mundo);
    const r = await listarCartaSede(ctx, { branch_id: SEDE, filtro: 'todos', pagina: 1 });
    const p1 = r.productos.find((p) => p.id === 1)!;
    const p2 = r.productos.find((p) => p.id === 2)!;
    expect(p1.precio_vigente).toBe(32000);
    expect(p1.ajuste).toBeNull();
    expect(p2.ajuste).toMatchObject({ is_listed: false, web_price: 26000, is_sold_out: true, agotado_ahora: true });
    expect(r.productos.some((p) => p.id === 50)).toBe(false);
    expect(r.puedeEditar).toBe(true);
  });

  test('el placeholder es el precio DE LA SEDE; sin precio de sede, el general (como antes)', async () => {
    const mundo: Mundo = {
      ...MUNDO_BASE(),
      precios: [
        { product_id: 1, price: '32000', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
        { product_id: 3, price: '15000', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      ],
      preciosSede: [
        { branch_id: SEDE, product_id: 1, price: '34000', compare_price: null, effective_from: '2026-02-01T00:00:00Z', effective_to: null },
        // De otra sede: no cuenta.
        { branch_id: 8, product_id: 3, price: '99999', compare_price: null, effective_from: '2026-02-01T00:00:00Z', effective_to: null },
      ],
    };
    const { ctx, consultas } = ctxCon(mundo);
    const r = await listarCartaSede(ctx, { branch_id: SEDE, filtro: 'todos', pagina: 1 });
    expect(r.productos.find((p) => p.id === 1)).toMatchObject({ precio_vigente: 34000, precio_origen: 'sede' });
    expect(r.productos.find((p) => p.id === 3)).toMatchObject({ precio_vigente: 15000, precio_origen: 'general' });
    expect(r.productos.find((p) => p.id === 2)).toMatchObject({ precio_vigente: null, precio_origen: null });
    const sede = consultas.find((c) => c.tabla === 'product_branch_prices')!;
    expect(sede.filtros).toContainEqual(['branch_id', 'eq', SEDE]);
  });

  test('si la tabla de sede aún no existe (migración sin aplicar), se usa el general sin fallar', async () => {
    const mundo: Mundo = {
      ...MUNDO_BASE(),
      precios: [{ product_id: 1, price: '32000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }],
    };
    const doble = ctxCon(mundo);
    const original = doble.supabase.from.getMockImplementation()!;
    let consultada = false;
    doble.supabase.from.mockImplementation((t: string) => {
      if (t !== 'product_branch_prices') return original(t);
      consultada = true;
      const fallo = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.product_branch_prices'" } };
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'lte', 'or']) cadena[m] = () => cadena;
      cadena.then = (ok: (v: unknown) => unknown) => Promise.resolve(fallo).then(ok);
      return cadena as never;
    });
    const r = await listarCartaSede(doble.ctx, { branch_id: SEDE, filtro: 'todos', pagina: 1 });
    expect(consultada).toBe(true);
    expect(r.productos.find((p) => p.id === 1)).toMatchObject({ precio_vigente: 32000, precio_origen: 'general' });
  });

  test('una sede ajena es 404', async () => {
    const { ctx } = ctxCon(MUNDO_BASE());
    await expect(listarCartaSede(ctx, { branch_id: SEDE_AJENA, filtro: 'todos', pagina: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('reglas puras', () => {
  test('agotado hasta un día ↔ instante del inicio del día siguiente en la zona de la organización', () => {
    const inst = instanteAgotadoHasta('2026-10-12', TZ);
    expect(inst).toBe('2026-10-13T00:00:00.000-05:00');
    expect(diaAgotadoHasta(inst, TZ)).toBe('2026-10-12');
  });

  test('volver a marcar agotado algo con la fecha vencida no hereda la fecha vieja', () => {
    const r = fusionarAjuste({ is_listed: true, web_price: null, is_sold_out: true, sold_out_until: '2020-01-01T05:00:00Z' }, { product_id: 1, is_sold_out: true }, TZ);
    expect(r).toEqual({ is_listed: true, web_price: null, is_sold_out: true, sold_out_until: null });
  });
});
