/**
 * Fase 4C (Desktop): las CUATRO pantallas del criterio de aceptación del
 * dueño, reproduciendo las consultas exactas que emiten sus servicios
 * (rastreadas en el código el 2026-09-16) contra fixtures locales:
 *
 *  1. CRM → Gestión de clientes (`src/app/app/clientes/page.tsx`): count
 *     exacto con HEAD, página con `or(...ilike)`, RPC
 *     `get_accounts_receivable_for_customers` (equivalente local), ventas
 *     por cliente, municipios y contactos de empresa con hint de FK.
 *  2. Finanzas → Facturas de compra (`FacturasCompraService`): lista con
 *     `supplier:suppliers(...)`, `or`, rango de fechas, count; proveedores;
 *     «próximas a vencer» con `in`, `lte`, `gt`.
 *  3. Inventario → Stock (`stockService`): `stock_levels` con
 *     `products!inner(..., categories(...))` filtrado por
 *     `products.organization_id`/`products.status`, y `branches(...)`.
 *  4. POS → Historial de ventas (`VentasService`): `sales` con `neq`,
 *     `or(notes.ilike)`, count, más la venta del outbox (4B) marcada
 *     `pending_sync`; clientes y líneas por `in`.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
import { memoryDataSource, type OfflineRow } from '../offlineDb';
import { resolveLocalPostgrest } from '../postgrestLocal';
import { resolveLocalRpc } from '../rpcLocal';
import { withOutboxRows } from '../outboxVirtualRows';
import type { OutboxSaleRecord } from '../salesOutbox';

const ORG = 120;
const BASE = 'https://proyecto.supabase.co/rest/v1/';

function url(table: string, params: Record<string, string>): string {
  const u = new URL(BASE + table);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

const T = (d: string) => `${d}T12:00:00+00:00`;

const fixtures: Record<string, OfflineRow[]> = {
  customers: [
    { id: 'c1', organization_id: ORG, branch_id: 7, first_name: 'Ana', last_name: 'Pérez', full_name: 'Ana Pérez', company_name: null, trade_name: null, email: 'ana@x.co', phone: '300', identification_number: '1', doc_number: '1', customer_type: 'person', fiscal_municipality_id: 'm1', created_at: T('2026-01-01'), updated_at: T('2026-01-01') },
    { id: 'c2', organization_id: ORG, branch_id: 7, first_name: null, last_name: null, full_name: 'Calzados SAS', company_name: 'Calzados SAS', trade_name: 'Calzados', email: null, phone: null, identification_number: '9', doc_number: '9', customer_type: 'company', fiscal_municipality_id: null, created_at: T('2026-02-01'), updated_at: T('2026-02-01') },
    { id: 'c3', organization_id: ORG, branch_id: 8, first_name: 'Beto', last_name: 'Ruiz', full_name: 'Beto Ruiz', company_name: null, trade_name: null, email: null, phone: null, identification_number: '3', doc_number: '3', customer_type: 'person', fiscal_municipality_id: null, created_at: T('2026-03-01'), updated_at: T('2026-03-01') },
  ],
  accounts_receivable: [
    { id: 'ar1', organization_id: ORG, customer_id: 'c1', invoice_id: 'f1', balance: 150, days_overdue: 12, status: 'overdue', due_date: T('2026-08-01') },
    { id: 'ar2', organization_id: ORG, customer_id: 'c1', invoice_id: 'f2', balance: 50, days_overdue: 0, status: 'pending', due_date: T('2026-10-01') },
    { id: 'ar9', organization_id: 121, customer_id: 'c1', invoice_id: 'f9', balance: 999, days_overdue: 99, status: 'overdue', due_date: T('2026-01-01') },
  ],
  sales: [
    { id: 's1', organization_id: ORG, branch_id: 7, customer_id: 'c1', user_id: 'u1', sale_date: T('2026-09-01'), total: 200, balance: 0, status: 'completed', payment_status: 'paid', source: 'pos', notes: 'entrega en tienda', created_at: T('2026-09-01') },
    { id: 's2', organization_id: ORG, branch_id: 7, customer_id: null, user_id: 'u1', sale_date: T('2026-09-05'), total: 80, balance: 0, status: 'completed', payment_status: 'paid', source: 'web', notes: null, created_at: T('2026-09-05') },
    { id: 's3', organization_id: ORG, branch_id: 8, customer_id: 'c3', user_id: 'u2', sale_date: T('2026-09-06'), total: 30, balance: 30, status: 'cancelled', payment_status: 'pending', source: 'pos', notes: null, created_at: T('2026-09-06') },
  ],
  sale_items: [
    { id: 'si1', organization_id: ORG, sale_id: 's1', product_id: 1, quantity: 2, unit_price: 100, total: 200, tax_amount: 0, discount_amount: 0, notes: null },
  ],
  // Tabla global: el replicador le añade organization_id localmente.
  municipalities: [{ id: 'm1', organization_id: ORG, code: '76001', name: 'Cali', state_name: 'Valle del Cauca' }],
  customer_company_links: [
    { id: 'l1', organization_id: ORG, person_id: 'c1', company_id: 'c2', position: 'Gerente', is_primary: true },
    { id: 'l2', organization_id: ORG, person_id: 'c3', company_id: 'c2', position: 'Ventas', is_primary: false },
  ],
  suppliers: [
    { id: 1, organization_id: ORG, name: 'Cueros del Sur', nit: '900', contact: 'Luis', phone: '1', email: 'l@s.co', is_active: true },
    { id: 2, organization_id: ORG, name: 'Adhesivos SA', nit: '901', contact: null, phone: null, email: null, is_active: true },
  ],
  invoice_purchase: [
    { id: 'p1', organization_id: ORG, branch_id: 7, supplier_id: 1, number_ext: 'FC-100', issue_date: T('2026-09-01'), due_date: T('2026-09-20'), total: 1000, balance: 400, status: 'received', notes: 'suelas', created_at: T('2026-09-01') },
    { id: 'p2', organization_id: ORG, branch_id: 7, supplier_id: 2, number_ext: 'FC-101', issue_date: T('2026-08-15'), due_date: T('2026-08-30'), total: 300, balance: 0, status: 'paid', notes: null, created_at: T('2026-08-15') },
    { id: 'p3', organization_id: ORG, branch_id: 8, supplier_id: 1, number_ext: 'FC-102', issue_date: T('2026-09-10'), due_date: T('2026-09-12'), total: 500, balance: 500, status: 'partial', notes: null, created_at: T('2026-09-10') },
  ],
  branches: [
    { id: 7, organization_id: ORG, name: 'Centro', branch_code: 'CEN', is_active: true },
    { id: 8, organization_id: ORG, name: 'Norte', branch_code: 'NOR', is_active: true },
    { id: 9, organization_id: ORG, name: 'Cerrada', branch_code: 'CER', is_active: false },
  ],
  categories: [
    { id: 10, organization_id: ORG, name: 'Calzado' },
    { id: 11, organization_id: ORG, name: 'Insumos' },
  ],
  products: [
    { id: 1, organization_id: ORG, uuid: 'u-1', name: 'Zapato', sku: 'ZAP', barcode: '770', category_id: 10, status: 'active' },
    { id: 2, organization_id: ORG, uuid: 'u-2', name: 'Pegante', sku: 'PEG', barcode: null, category_id: 11, status: 'active' },
    { id: 3, organization_id: ORG, uuid: 'u-3', name: 'Viejo', sku: 'OLD', barcode: null, category_id: 10, status: 'archived' },
  ],
  stock_levels: [
    { id: 100, organization_id: ORG, product_id: 1, branch_id: 7, lot_id: null, qty_on_hand: 5, qty_reserved: 1, avg_cost: 40, min_level: 2, created_at: T('2026-09-01') },
    { id: 101, organization_id: ORG, product_id: 2, branch_id: 7, lot_id: null, qty_on_hand: 0, qty_reserved: 0, avg_cost: 3, min_level: 10, created_at: T('2026-09-02') },
    { id: 102, organization_id: ORG, product_id: 1, branch_id: 8, lot_id: null, qty_on_hand: 1, qty_reserved: 0, avg_cost: 40, min_level: 2, created_at: T('2026-09-03') },
    { id: 103, organization_id: ORG, product_id: 3, branch_id: 7, lot_id: null, qty_on_hand: 9, qty_reserved: 0, avg_cost: 1, min_level: 0, created_at: T('2026-09-04') },
  ],
  web_orders: [],
  web_order_items: [],
};

const base = memoryDataSource(fixtures);

const outboxSale: OutboxSaleRecord = {
  id: 'off-1',
  envelope: {
    checkout: {
      cart: {
        id: 'cart-1', organization_id: ORG, branch_id: 7, customer_id: 'c1', status: 'completed',
        items: [{ id: 'ci-1', cart_id: 'cart-1', product_id: 1, product: {} as never, quantity: 1, unit_price: 100, total: 100, created_at: T('2026-09-15'), updated_at: T('2026-09-15') }],
        subtotal: 100, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 100, notes: 'sin red', created_at: T('2026-09-15'), updated_at: T('2026-09-15'),
      },
      payments: [{ method: 'cash', amount: 100 }], change: 0, total_paid: 100, saleId: 'off-1', createdAt: T('2026-09-15'), userId: 'u1',
    } as never,
    totals: { subtotal: 100, tax_total: 0, discount_total: 0, total: 100, total_paid: 100, change: 0 },
    organization_id: ORG, branch_id: 7, user_id: 'u1',
  },
  created_at: T('2026-09-15'), updated_at: T('2026-09-15'), status: 'pending', attempts: 0, last_error: null, next_attempt_at: null, receipt_number_local: 'OFF-7-1', synced_at: null,
};
const source = withOutboxRows(base, async () => [outboxSale]);

async function get(table: string, params: Record<string, string>, headers: Record<string, string> = {}, method = 'GET') {
  const res = await resolveLocalPostgrest({ url: url(table, params), method, headers }, ORG, source);
  if (!res) throw new Error(`sin respuesta local para ${table}`);
  const text = await res.text();
  return { status: res.status, count: res.headers.get('content-range')?.split('/')[1], json: text ? JSON.parse(text) : null };
}

describe('1. CRM → Gestión de clientes', () => {
  const orFilter = (t: string) => `(full_name.ilike.%${t}%,first_name.ilike.%${t}%,last_name.ilike.%${t}%,company_name.ilike.%${t}%,trade_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%,identification_number.ilike.%${t}%,doc_number.ilike.%${t}%)`;

  it('Total clientes (HEAD + count=exact) y página de clientes', async () => {
    const count = await get('customers', { select: 'id', organization_id: `eq.${ORG}` }, { Prefer: 'count=exact' }, 'HEAD');
    expect(count.count).toBe('3');
    const branch = await get('customers', { select: 'id', organization_id: `eq.${ORG}`, branch_id: 'eq.7' }, { Prefer: 'count=exact' }, 'HEAD');
    expect(branch.count).toBe('2');
    const search = await get('customers', { select: '*', organization_id: `eq.${ORG}`, or: orFilter('calza'), offset: '0', limit: '10' });
    expect(search.json.map((c: OfflineRow) => c.id)).toEqual(['c2']);
    const page = await get('customers', { select: '*', organization_id: `eq.${ORG}`, offset: '0', limit: '2' });
    expect(page.json).toHaveLength(2);
    expect(page.status).toBe(206);
  });

  it('cartera por cliente: la RPC se resuelve localmente y solo con datos de la organización', async () => {
    const res = await resolveLocalRpc('get_accounts_receivable_for_customers', JSON.stringify({ customer_ids: ['c1', 'c2'], org_id: ORG }), ORG, source);
    expect(res).not.toBeNull();
    const rows = await res!.json();
    expect(rows).toEqual([
      { customer_id: 'c1', balance: 150, days_overdue: 12, status: 'overdue', due_date: T('2026-08-01') },
      { customer_id: 'c1', balance: 50, days_overdue: 0, status: 'pending', due_date: T('2026-10-01') },
    ]);
    // Totales que la página calcula en cliente: con saldo 1, CxC 200, vencidas 1.
    const byCustomer = new Map<string, number>();
    for (const r of rows) byCustomer.set(r.customer_id, (byCustomer.get(r.customer_id) ?? 0) + r.balance);
    expect([...byCustomer.values()].reduce((a, b) => a + b, 0)).toBe(200);
    expect(await resolveLocalRpc('get_accounts_receivable_for_customers', JSON.stringify({ customer_ids: ['c1'], org_id: 999 }), ORG, source)).toBeNull();
    expect(await resolveLocalRpc('otra_rpc', '{}', ORG, source)).toBeNull();
  });

  it('ventas por cliente, municipios y contacto principal de empresas (hint de FK)', async () => {
    const sales = await get('sales', { select: 'customer_id,sale_date,total,balance,status,payment_status', customer_id: 'in.(c1,c2)', organization_id: `eq.${ORG}`, order: 'sale_date.desc' });
    expect(sales.json.map((s: OfflineRow) => s.total)).toEqual([100, 200]); // incluye la venta offline
    const munis = await get('municipalities', { select: 'id,name,state_name', id: 'in.(m1)' });
    expect(munis.json).toEqual([{ id: 'm1', name: 'Cali', state_name: 'Valle del Cauca' }]);
    const links = await get('customer_company_links', { select: 'company_id,is_primary,position,person:customers!customer_company_links_person_id_fkey(first_name,last_name)', company_id: 'in.(c2)', order: 'is_primary.desc' });
    expect(links.json).toEqual([
      { company_id: 'c2', is_primary: true, position: 'Gerente', person: { first_name: 'Ana', last_name: 'Pérez' } },
      { company_id: 'c2', is_primary: false, position: 'Ventas', person: { first_name: 'Beto', last_name: 'Ruiz' } },
    ]);
  });
});

describe('2. Finanzas → Facturas de compra', () => {
  it('lista con proveedor embebido, filtros, rango de fechas, orden y count', async () => {
    const r = await get('invoice_purchase', {
      select: '*,supplier:suppliers(id,name,nit,contact,phone,email)', organization_id: `eq.${ORG}`, status: 'eq.received', supplier_id: 'eq.1',
      or: '(number_ext.ilike.%FC%,notes.ilike.%FC%)', issue_date: 'gte.2026-09-01', branch_id: 'eq.7', order: 'created_at.desc', offset: '0', limit: '10',
    }, { Prefer: 'count=exact' });
    expect(r.count).toBe('1');
    expect(r.json[0].number_ext).toBe('FC-100');
    expect(r.json[0].supplier).toEqual({ id: 1, name: 'Cueros del Sur', nit: '900', contact: 'Luis', phone: '1', email: 'l@s.co' });
    const all = await get('invoice_purchase', { select: 'id', organization_id: `eq.${ORG}`, order: 'created_at.desc', offset: '0', limit: '10' }, { Prefer: 'count=exact' });
    expect(all.json.map((f: OfflineRow) => f.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('filtro de proveedores y facturas próximas a vencer (in, lte, gt)', async () => {
    const sup = await get('suppliers', { select: '*', organization_id: `eq.${ORG}`, order: 'name' });
    expect(sup.json.map((s: OfflineRow) => s.name)).toEqual(['Adhesivos SA', 'Cueros del Sur']);
    const due = await get('invoice_purchase', {
      select: '*,supplier:suppliers(name,contact,phone)', organization_id: `eq.${ORG}`, status: 'in.(received,partial)', due_date: 'lte.2026-09-25T00:00:00.000Z', balance: 'gt.0', order: 'due_date',
    });
    expect(due.json.map((f: OfflineRow) => [f.id, f.balance, (f.supplier as OfflineRow).name])).toEqual([['p3', 500, 'Cueros del Sur'], ['p1', 400, 'Cueros del Sur']]);
  });
});

describe('3. Inventario → Stock', () => {
  it('sucursales activas y categorías', async () => {
    const b = await get('branches', { select: 'id,name', organization_id: `eq.${ORG}`, is_active: 'eq.true', order: 'name' });
    expect(b.json).toEqual([{ id: 7, name: 'Centro' }, { id: 8, name: 'Norte' }]);
    const c = await get('categories', { select: 'id,name', organization_id: `eq.${ORG}`, order: 'name' });
    expect(c.json.map((x: OfflineRow) => x.name)).toEqual(['Calzado', 'Insumos']);
  });

  it('stock con products!inner (filtro por organización y estado del producto) y branches embebida', async () => {
    const r = await get('stock_levels', {
      select: '*,products!inner(id,uuid,name,sku,barcode,category_id,organization_id,status,categories(id,name)),branches(id,name,branch_code)',
      'products.organization_id': `eq.${ORG}`, 'products.status': 'eq.active', branch_id: 'eq.7', order: 'created_at.desc',
    });
    expect(r.json.map((s: OfflineRow) => s.id)).toEqual([101, 100]); // 103 es de un producto archivado
    expect(r.json[1].products).toEqual({ id: 1, uuid: 'u-1', name: 'Zapato', sku: 'ZAP', barcode: '770', category_id: 10, organization_id: ORG, status: 'active', categories: { id: 10, name: 'Calzado' } });
    expect(r.json[1].branches).toEqual({ id: 7, name: 'Centro', branch_code: 'CEN' });
    expect('organization_id' in r.json[1]).toBe(false); // stock_levels no la tiene en Postgres
    const stats = await get('stock_levels', { select: 'id,qty_on_hand,qty_reserved,avg_cost,min_level,branch_id,products!inner(organization_id)', 'products.organization_id': `eq.${ORG}` });
    expect(stats.json).toHaveLength(4);
    const totalValue = stats.json.reduce((s: number, x: OfflineRow) => s + Number(x.qty_on_hand) * Number(x.avg_cost), 0);
    expect(totalValue).toBe(5 * 40 + 0 + 40 + 9);
  });
});

describe('4. POS → Historial de ventas', () => {
  it('ventas del POS con neq/or/count y la venta del outbox marcada pending_sync', async () => {
    const r = await get('sales', { select: '*', organization_id: `eq.${ORG}`, source: 'neq.web', order: 'created_at.desc' }, { Prefer: 'count=exact' });
    expect(r.count).toBe('3');
    expect(r.json.map((s: OfflineRow) => [s.id, s.status])).toEqual([['off-1', 'pending_sync'], ['s3', 'cancelled'], ['s1', 'completed']]);
    const off = r.json[0];
    expect(off.total).toBe(100);
    expect(off.payment_status).toBe('paid');
    // Los extras locales no salen con `*` (solo columnas reales); sí al pedirlos por nombre.
    expect('receipt_number_local' in off).toBe(false);
    const extras = await get('sales', { select: 'id,receipt_number_local,pending_sync', id: 'eq.off-1' });
    expect(extras.json).toEqual([{ id: 'off-1', receipt_number_local: 'OFF-7-1', pending_sync: true }]);
    const search = await get('sales', { select: '*', organization_id: `eq.${ORG}`, source: 'neq.web', or: '(notes.ilike.%sin red%)', order: 'created_at.desc' });
    expect(search.json.map((s: OfflineRow) => s.id)).toEqual(['off-1']);
    const byBranch = await get('sales', { select: 'id', organization_id: `eq.${ORG}`, source: 'neq.web', branch_id: 'eq.8' });
    expect(byBranch.json).toEqual([{ id: 's3' }]);
  });

  it('clientes y líneas de las ventas de la página (incluida la offline)', async () => {
    const customers = await get('customers', { select: 'id,full_name,email,phone,doc_number', id: 'in.(c1,c3)' });
    expect(customers.json.map((c: OfflineRow) => c.full_name).sort()).toEqual(['Ana Pérez', 'Beto Ruiz']);
    const items = await get('sale_items', { select: 'id,sale_id,product_id,quantity,unit_price,total,tax_amount,discount_amount,notes', sale_id: 'in.(s1,off-1)' });
    expect(items.json.map((i: OfflineRow) => [i.sale_id, i.total])).toEqual([['s1', 200], ['off-1', 100]]);
    const web = await get('web_orders', { select: '*', organization_id: `eq.${ORG}`, order: 'created_at.desc' }, { Prefer: 'count=exact' });
    expect(web.json).toEqual([]);
    expect(web.count).toBe('0');
  });

  it('una venta ya sincronizada (fila real con el mismo id) gana a la virtual', async () => {
    const synced = withOutboxRows(memoryDataSource({ ...fixtures, sales: [...fixtures.sales, { id: 'off-1', organization_id: ORG, branch_id: 7, status: 'completed', source: 'pos', total: 100, created_at: T('2026-09-15') }] }), async () => [outboxSale]);
    const res = await resolveLocalPostgrest({ url: url('sales', { select: 'id,status', id: 'eq.off-1' }) }, ORG, synced);
    expect(await res!.json()).toEqual([{ id: 'off-1', status: 'completed' }]);
  });
});
