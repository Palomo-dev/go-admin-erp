/**
 * Servicio del formulario de documento (`lib/services/documentos/
 * edicionDocumento.ts`): lo que consulta y lo que escribe, con el cliente de
 * la sesión simulado.
 *
 * - «Agregar productos»: precio de venta vigente, costo del proveedor antes
 *   que el último costo, stock de la sucursal sumando lotes, sin padres de
 *   variantes, descripción sin HTML, «Solo del proveedor» y «Con stock».
 * - Alta rápida de cliente: la fila de `buildCustomerInsert` (nunca las
 *   columnas GENERATED `full_name` / `doc_type` / `doc_number`), control de
 *   duplicado por documento, organización de la sesión.
 * - Formas de pago en UNA consulta (hallazgo H6).
 * - Impuestos separados de retenciones por su clase.
 */
type Resultado = { data: unknown; error: null };
const respuestas: Record<string, unknown[]> = {};
const llamadas: Array<{ tabla: string; ops: Array<[string, unknown[]]> }> = [];
const inserciones: Array<{ tabla: string; filas: unknown }> = [];

jest.mock('@/lib/supabase/config', () => {
  const crear = (tabla: string) => {
    const reg = { tabla, ops: [] as Array<[string, unknown[]]> };
    llamadas.push(reg);
    const res = (): Resultado => ({ data: respuestas[tabla] ?? [], error: null });
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'gt', 'not', 'limit', 'abortSignal', 'ilike']) {
      c[m] = (...a: unknown[]) => {
        reg.ops.push([m, a]);
        return c;
      };
    }
    c.insert = (filas: unknown) => {
      inserciones.push({ tabla, filas });
      return c;
    };
    c.single = async () => ({ data: (respuestas[`${tabla}:single`] ?? respuestas[tabla] ?? [])[0] ?? null, error: null });
    (c as { then: unknown }).then = (r: (v: Resultado) => unknown) => Promise.resolve(res()).then(r);
    return c;
  };
  return {
    supabase: {
      from: (t: string) => crear(t),
      rpc: async (nombre: string) => ({ data: respuestas[`rpc:${nombre}`]?.[0] ?? null, error: null }),
      storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }) },
    },
  };
});

import {
  ClienteDuplicadoError,
  buscarProductosDocumento,
  crearClienteRapido,
  impuestosOrganizacion,
  metodosPagoOrganizacion,
} from '@/lib/services/documentos/edicionDocumento';

beforeEach(() => {
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  llamadas.length = 0;
  inserciones.length = 0;
});

const ops = (tabla: string) => llamadas.filter((l) => l.tabla === tabla).flatMap((l) => l.ops);

describe('buscarProductosDocumento', () => {
  const producto = {
    id: 10,
    name: 'Zapatilla',
    sku: 'ZAP-1',
    barcode: '770',
    description: '<p>Cuero <b>negro</b></p>',
    track_stock: true,
    track_serial: false,
    product_prices: [
      { price: 100, effective_from: '2020-01-01T00:00:00Z', effective_to: '2021-01-01T00:00:00Z' },
      { price: 320000, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      { price: 999999, effective_from: '2999-01-01T00:00:00Z', effective_to: null },
    ],
    product_costs: [{ cost: 150000, effective_from: '2026-01-01T00:00:00Z', effective_to: null }],
    product_tax_relations: [
      { organization_taxes: { id: 't1', name: 'IVA 19%', rate: 19, is_default: true, is_active: true, kind: 'tax', tax_templates: { code: 'IVA_19' } } },
      { organization_taxes: { id: 't2', name: 'ReteFuente', rate: 2.5, is_default: false, is_active: true, kind: 'withholding', tax_templates: { code: 'RETE_25' } } },
    ],
    product_images: [{ storage_path: 'products/7/a.jpg', is_primary: true, display_order: 0 }],
  };

  test('venta: precio vigente, stock de la sucursal (suma de lotes), impuestos sin retenciones y descripción en texto plano', async () => {
    respuestas.products = [producto];
    respuestas.stock_levels = [
      { product_id: 10, lot_id: 1, qty_on_hand: 10 },
      { product_id: 10, lot_id: 2, qty_on_hand: 4 },
    ];
    const [p] = await buscarProductosDocumento(7, { texto: 'zap', variante: 'venta', sucursal: 3 });
    expect(p).toEqual(
      expect.objectContaining({ id: 10, precio: 320000, precioVenta: 320000, stock: 14, lotes: 2, descripcion: 'Cuero negro', imagen: 'https://cdn/products/7/a.jpg' }),
    );
    expect(p.impuestos).toEqual([{ id: 't1', codigo: 'IVA_19', nombre: 'IVA 19%', tarifa: 19, predeterminado: true }]);
    const o = ops('products');
    expect(o).toEqual(expect.arrayContaining([['eq', ['organization_id', 7]], ['eq', ['status', 'active']], ['not', ['is_parent', 'is', true]]]));
    // Búsqueda literal y entrecomillada en nombre, SKU, código de barras y referencia.
    expect(o.find(([m]) => m === 'or')?.[1][0]).toBe('name.ilike."%zap%",sku.ilike."%zap%",barcode.ilike."%zap%",reference.ilike."%zap%"');
    expect(ops('stock_levels')).toEqual(expect.arrayContaining([['eq', ['branch_id', 3]]]));
  });

  test('compra: costo del proveedor antes que el último costo; «Solo del proveedor» limita a su catálogo', async () => {
    respuestas.product_suppliers = [{ product_id: 10, cost: 140000, lead_time_days: 5, min_order_qty: 12, supplier_sku: 'DN-Z1' }];
    respuestas.products = [producto];
    const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: 3, proveedor: 55, soloProveedor: true });
    expect(p).toEqual(expect.objectContaining({ precio: 140000, precioVenta: 320000, tiempoEntregaDias: 5, minimoPedido: 12, referenciaProveedor: 'DN-Z1', delProveedor: true }));
    expect(ops('product_suppliers')).toEqual(expect.arrayContaining([['eq', ['supplier_id', 55]]]));
    expect(ops('products')).toEqual(expect.arrayContaining([['in', ['id', [10]]]]));
  });

  test('compra sin catálogo del proveedor: el último costo vigente; «Solo del proveedor» vacío no consulta productos', async () => {
    respuestas.products = [producto];
    const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: null, proveedor: 55 });
    expect(p.precio).toBe(150000);
    expect(p.stock).toBeNull();
    llamadas.length = 0;
    expect(await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: 3, proveedor: 55, soloProveedor: true })).toEqual([]);
    expect(llamadas.some((l) => l.tabla === 'products')).toBe(false);
  });
});

describe('crearClienteRapido', () => {
  test('escribe first_name/last_name e identification_*; nunca las columnas GENERATED', async () => {
    respuestas.customers = [];
    respuestas['customers:single'] = [{ id: 'c-nuevo' }];
    respuestas['rpc:fn_clientes_listado'] = [];
    const r = await crearClienteRapido(7, 3, {
      tipo: 'persona',
      tipoDocumento: 'cc',
      numeroDocumento: '1.020.304.050',
      dv: '',
      nombres: 'Laura',
      apellidos: 'Gómez',
      razonSocial: '',
      contacto: '',
      correo: 'laura@ejemplo.com',
      telefono: '3000000000',
      diasCredito: null,
    });
    expect(r.id).toBe('c-nuevo');
    const fila = (inserciones.find((i) => i.tabla === 'customers')?.filas as Record<string, unknown>[])[0];
    expect(fila).toEqual(
      expect.objectContaining({
        organization_id: 7,
        branch_id: 3,
        first_name: 'Laura',
        last_name: 'Gómez',
        identification_type: 'cc',
        identification_number: '1020304050',
        customer_type: 'person',
        email: 'laura@ejemplo.com',
      }),
    );
    for (const generada of ['full_name', 'doc_type', 'doc_number']) expect(fila).not.toHaveProperty(generada);
  });

  test('empresa: la razón social va en first_name y el DV del NIT se guarda', async () => {
    respuestas['customers:single'] = [{ id: 'c-emp' }];
    await crearClienteRapido(7, null, {
      tipo: 'empresa',
      tipoDocumento: 'nit',
      numeroDocumento: '900123456',
      dv: '8',
      nombres: '',
      apellidos: '',
      razonSocial: 'Comercial Andina S.A.S.',
      contacto: '',
      correo: '',
      telefono: '',
      diasCredito: null,
    });
    const fila = (inserciones[0].filas as Record<string, unknown>[])[0];
    expect(fila).toEqual(expect.objectContaining({ first_name: 'Comercial Andina S.A.S.', last_name: '', company_name: 'Comercial Andina S.A.S.', dv: 8, customer_type: 'company' }));
  });

  test('documento repetido: no inserta y devuelve el existente para elegirlo', async () => {
    respuestas.customers = [{ id: 'c-viejo', full_name: 'Laura Gómez' }];
    await expect(
      crearClienteRapido(7, 3, { tipo: 'persona', tipoDocumento: 'cc', numeroDocumento: '1020304050', dv: '', nombres: 'Laura', apellidos: '', razonSocial: '', contacto: '', correo: '', telefono: '', diasCredito: null }),
    ).rejects.toBeInstanceOf(ClienteDuplicadoError);
    expect(inserciones).toHaveLength(0);
    expect(ops('customers')).toEqual(expect.arrayContaining([['eq', ['organization_id', 7]], ['eq', ['identification_number', '1020304050']]]));
  });
});

describe('lecturas de la organización', () => {
  test('formas de pago en una sola consulta con su nombre', async () => {
    respuestas.organization_payment_methods = [
      { payment_method_code: 'cash', payment_methods: { name: 'Efectivo' } },
      { payment_method_code: 'card', payment_methods: null },
    ];
    expect(await metodosPagoOrganizacion(7)).toEqual([
      { codigo: 'cash', nombre: 'Efectivo' },
      { codigo: 'card', nombre: 'card' },
    ]);
    expect(llamadas.filter((l) => l.tabla === 'payment_methods')).toHaveLength(0);
    expect(llamadas.filter((l) => l.tabla === 'organization_payment_methods')).toHaveLength(1);
  });

  test('impuestos y retenciones separados por su clase', async () => {
    respuestas.organization_taxes = [
      { id: 'a', name: 'IVA 19%', rate: 19, is_default: true, is_active: true, kind: 'tax', tax_templates: { code: 'IVA_19' } },
      { id: 'b', name: 'ReteFuente 2,5%', rate: 2.5, is_default: false, is_active: true, kind: 'withholding', min_base_uvt: '27', tax_templates: { code: 'RETE_25' } },
      { id: 'c', name: 'ReteICA', rate: 0.966, is_default: false, is_active: true, kind: 'withholding', min_base_uvt: null, tax_templates: null },
    ];
    const r = await impuestosOrganizacion(7);
    expect(r.impuestos.map((i) => i.id)).toEqual(['a']);
    expect(r.impuestos[0]).not.toHaveProperty('baseMinimaUvt');
    expect(r.retenciones.map((i) => [i.id, i.baseMinimaUvt])).toEqual([
      ['b', 27],
      ['c', null],
    ]);
  });
});
