/**
 * Documentos (factura de venta, factura de compra, orden de compra): «Agregar
 * productos» toma el precio/costo PROPIO de la sucursal del documento y, sin
 * él, el general de siempre (docs/inventario/PRECIOS-POR-SEDE.md).
 *
 * Datos inventados: organización 7, sucursal 3.
 */
type Resultado = { data: unknown; error: null };
const respuestas: Record<string, unknown[]> = {};
const llamadas: Array<{ tabla: string; ops: Array<[string, unknown[]]> }> = [];

jest.mock('@/lib/supabase/config', () => {
  const crear = (tabla: string) => {
    const reg = { tabla, ops: [] as Array<[string, unknown[]]> };
    llamadas.push(reg);
    const res = (): Resultado => ({ data: respuestas[tabla] ?? [], error: null });
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'gt', 'not', 'is', 'limit', 'abortSignal', 'ilike']) {
      c[m] = (...a: unknown[]) => {
        reg.ops.push([m, a]);
        return c;
      };
    }
    (c as { then: unknown }).then = (r: (v: Resultado) => unknown) => Promise.resolve(res()).then(r);
    return c;
  };
  return {
    supabase: {
      from: (t: string) => crear(t),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }) },
    },
  };
});

import { buscarProductosDocumento } from '@/lib/services/documentos/edicionDocumento';

const producto = {
  id: 10,
  name: 'Zapatilla',
  sku: 'ZAP-1',
  barcode: '770',
  description: null,
  track_stock: true,
  track_serial: false,
  product_prices: [{ price: 320000, effective_from: '2026-01-01T00:00:00Z', effective_to: null }],
  product_costs: [{ cost: 150000, effective_from: '2026-01-01T00:00:00Z', effective_to: null }],
  product_tax_relations: [],
  product_images: [],
};

beforeEach(() => {
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  llamadas.length = 0;
});

const tablas = () => llamadas.map((l) => l.tabla);

test('venta en una sucursal con precio propio: ese precio; la consulta va por ESA sucursal', async () => {
  respuestas.products = [producto];
  respuestas.product_branch_prices = [{ product_id: 10, price: 335000, compare_price: null, effective_from: '2026-09-01T00:00:00Z', effective_to: null }];
  const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'venta', sucursal: 3 });
  expect(p).toEqual(expect.objectContaining({ precio: 335000, precioVenta: 335000 }));
  const sede = llamadas.find((l) => l.tabla === 'product_branch_prices')!;
  expect(sede.ops).toEqual(expect.arrayContaining([['eq', ['branch_id', 3]], ['in', ['product_id', [10]]]]));
  expect(tablas()).not.toContain('product_branch_costs');
});

test('venta en una sucursal sin precio propio: el general, como antes', async () => {
  respuestas.products = [producto];
  const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'venta', sucursal: 3 });
  expect(p.precio).toBe(320000);
});

test('compra: costo propio de la sucursal antes que el general; el del proveedor sigue mandando', async () => {
  respuestas.products = [producto];
  respuestas.product_branch_costs = [{ product_id: 10, cost: 155000, supplier_id: null, effective_from: '2026-09-01T00:00:00Z', effective_to: null }];
  const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: 3 });
  expect(p.precio).toBe(155000);

  respuestas.product_suppliers = [{ product_id: 10, cost: 140000, lead_time_days: 5, min_order_qty: 1, supplier_sku: 'X' }];
  const [q] = await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: 3, proveedor: 55 });
  expect(q.precio).toBe(140000);
});

test('sin sucursal no se consultan precios ni costos de sede', async () => {
  respuestas.products = [producto];
  const [p] = await buscarProductosDocumento(7, { texto: '', variante: 'compra', sucursal: null });
  expect(p.precio).toBe(150000);
  expect(tablas()).not.toContain('product_branch_prices');
  expect(tablas()).not.toContain('product_branch_costs');
});
