/**
 * Regresión: el detalle de venta (`GET /api/pos/ventas/[id]`) respondía 500
 * para TODAS las ventas porque leía `serial_numbers.serial_number` (la columna
 * real es `serial`) y PostgREST devolvía 400. Ahora lee `serial` y, si la
 * lectura de seriales falla, devuelve la venta sin seriales.
 */
jest.mock('@/lib/pos/ventas/permisosVentas', () => ({
  resolverPermisosVentas: async () => ({ anular: false, devolver: false, vender: false, exportar: false }),
}));
import { detalleVenta } from '@/lib/pos/ventas/detalleServidor';

const SALE = 'ffb31b50-224a-4e7c-8c21-ac39b24c9ad4';
const COLUMNAS_SERIALES = new Set(['id', 'serial', 'product_id', 'sale_id', 'status']);

function fakeSupabase(opts: { serialesFallan?: boolean } = {}) {
  const selects: Record<string, string[]> = {};
  const datos: Record<string, unknown> = {
    sales: { id: SALE, organization_id: 333, branch_id: 538, customer_id: null, user_id: 'u1', source: 'web', status: 'paid', payment_status: 'paid', total: 104705.6, tax_total: 16717.7, subtotal: 104705.6, tax_breakdown: null, tax_included: false, web_order_id: null },
    sale_items: [{ id: 'l1', product_id: 105074, quantity: 3, unit_price: 26395.2, total: 79185.6, tax_amount: 12643.08, tax_rate: 0, serial_ids: [], notes: { product_name: 'Mesa' }, products: null }],
    invoice_sales: [], returns: [], commissions: [], branches: { name: 'Principal' }, accounts_receivable: [], payments: [], journal_entries: [], ops_audit_log: [], profiles: [],
    serial_numbers: [],
  };
  const from = (tabla: string) => {
    let cols = '';
    const res = () => {
      if (tabla === 'serial_numbers') {
        const malas = cols.split(',').map((c) => c.trim()).filter((c) => !COLUMNAS_SERIALES.has(c));
        if (opts.serialesFallan || malas.length) return { data: null, error: { message: `column serial_numbers.${malas[0] ?? 'x'} does not exist` } };
      }
      return { data: datos[tabla] ?? null, error: null };
    };
    const q: Record<string, unknown> = {};
    const encadenar = () => q;
    Object.assign(q, {
      select: (c: string) => { cols = c; (selects[tabla] ??= []).push(c); return q; },
      eq: encadenar, in: encadenar, or: encadenar, order: encadenar, limit: encadenar,
      maybeSingle: async () => res(),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko),
    });
    return q;
  };
  return { supabase: { from } as never, selects };
}

const ctx = (supabase: never) => ({ organizationId: 333, supabase, userId: 'u1', roleId: 1, isSuperAdmin: false }) as never;

describe('detalleVenta — seriales', () => {
  it('lee la columna real `serial` y no se cae (venta web pagada sin seriales)', async () => {
    const f = fakeSupabase();
    const v = await detalleVenta(ctx(f.supabase), SALE);
    expect(v.id).toBe(SALE);
    expect(v.origen).toBe('web');
    expect(v.lineas).toHaveLength(1);
    expect(f.selects.serial_numbers?.[0]).toContain('serial');
    expect(f.selects.serial_numbers?.[0]).not.toContain('serial_number');
  });

  it('si la lectura de seriales falla, devuelve la venta sin seriales (no 500)', async () => {
    const f = fakeSupabase({ serialesFallan: true });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const v = await detalleVenta(ctx(f.supabase), SALE);
    expect(v.lineas[0].seriales).toEqual([]);
    spy.mockRestore();
  });
});
