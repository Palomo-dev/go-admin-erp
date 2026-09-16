/**
 * Fase 4C (Desktop): evaluador PostgREST local contra fixtures en memoria.
 * Facturas de venta con líneas y cliente embebidos, count=exact, `.single()`
 * con 406, `!inner`, filtros sobre embeds, order, range, operadores.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
import { memoryDataSource, type OfflineRow } from '../offlineDb';
import { evaluatePlan, parsePostgrestRequest, resolveLocalPostgrest, UnsupportedQueryError } from '../postgrestLocal';

const ORG = 120;
const BASE = 'https://proyecto.supabase.co/rest/v1/';

function url(table: string, params: Record<string, string>): string {
  const u = new URL(BASE + table);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

const customers: OfflineRow[] = [
  { id: 'c1', organization_id: ORG, first_name: 'Ana', last_name: 'Pérez', full_name: 'Ana Pérez', email: 'ana@ejemplo.co', phone: null, tags: ['vip'], city: 'Cali', updated_at: '2026-08-01T10:00:00+00:00' },
  { id: 'c2', organization_id: ORG, first_name: 'Bruno', last_name: 'Díaz', full_name: 'Bruno Díaz', email: null, phone: '300', tags: [], city: 'Bogotá', updated_at: '2026-08-02T10:00:00+00:00' },
  { id: 'c9', organization_id: 121, first_name: 'Otra', last_name: 'Org', full_name: 'Otra Org', email: null, phone: null, tags: [], city: 'Cali', updated_at: '2026-08-02T10:00:00+00:00' },
];

const invoices: OfflineRow[] = [
  { id: 'f1', organization_id: ORG, branch_id: 7, customer_id: 'c1', number: 'FV-1', issue_date: '2026-09-01T12:00:00+00:00', total: 100, balance: 0, status: 'paid', created_at: '2026-09-01T12:00:00+00:00' },
  { id: 'f2', organization_id: ORG, branch_id: 7, customer_id: 'c2', number: 'FV-2', issue_date: '2026-09-02T12:00:00+00:00', total: 250.5, balance: 250.5, status: 'pending', created_at: '2026-09-02T12:00:00+00:00' },
  { id: 'f3', organization_id: ORG, branch_id: 8, customer_id: null, number: 'FV-3', issue_date: null, total: 30, balance: 30, status: 'pending', created_at: '2026-09-03T12:00:00+00:00' },
  { id: 'f4', organization_id: ORG, branch_id: 7, customer_id: 'c1', number: 'NC-1', issue_date: '2026-09-04T12:00:00+00:00', total: -20, balance: 0, status: 'paid', document_type: 'credit_note', related_invoice_id: 'f1', created_at: '2026-09-04T12:00:00+00:00' },
];

const items: OfflineRow[] = [
  { id: 'i1', organization_id: ORG, invoice_id: 'f1', invoice_sales_id: 'f1', invoice_purchase_id: null, product_id: 1, description: 'Zapato', qty: 2, unit_price: 50, total_line: 100 },
  { id: 'i2', organization_id: ORG, invoice_id: 'f2', invoice_sales_id: 'f2', invoice_purchase_id: null, product_id: 2, description: 'Bota', qty: 1, unit_price: 250.5, total_line: 250.5 },
  { id: 'i3', organization_id: ORG, invoice_id: 'f2', invoice_sales_id: 'f2', invoice_purchase_id: null, product_id: 1, description: 'Zapato', qty: 3, unit_price: 0, total_line: 0 },
];

const products: OfflineRow[] = [
  { id: 1, organization_id: ORG, sku: 'ZAP-1', name: 'Zapato clásico', category_id: 10, status: 'active', barcode: '770001', description: 'Cuero negro', updated_at: '2026-09-01T00:00:00+00:00' },
  { id: 2, organization_id: ORG, sku: 'BOT-1', name: 'Bota de montaña', category_id: 11, status: 'active', barcode: null, description: null, updated_at: '2026-09-02T00:00:00+00:00' },
  { id: 3, organization_id: ORG, sku: 'ARCH', name: 'Archivado', category_id: null, status: 'archived', barcode: null, description: null, updated_at: '2026-01-01T00:00:00+00:00' },
];

const categories: OfflineRow[] = [
  { id: 10, organization_id: ORG, name: 'Calzado', parent_id: null },
  { id: 11, organization_id: ORG, name: 'Botas', parent_id: 10 },
];

const prices: OfflineRow[] = [
  { id: 100, organization_id: ORG, product_id: 1, price: 50, effective_from: '2026-01-01T00:00:00+00:00', effective_to: null },
  { id: 101, organization_id: ORG, product_id: 1, price: 45, effective_from: '2025-01-01T00:00:00+00:00', effective_to: null },
  { id: 102, organization_id: ORG, product_id: 2, price: 250.5, effective_from: '2026-01-01T00:00:00+00:00', effective_to: null },
];

const source = memoryDataSource(
  { customers, invoice_sales: invoices, invoice_items: items, products, categories, product_prices: prices, suppliers: [] },
  ['customers', 'invoice_sales', 'invoice_items', 'products', 'categories', 'product_prices', 'suppliers'],
);

async function run(table: string, params: Record<string, string>, headers: Record<string, string> = {}, method = 'GET') {
  const plan = parsePostgrestRequest({ url: url(table, params), headers, method });
  const res = await evaluatePlan(plan, ORG, source);
  return { ...res, json: res.body === null ? null : JSON.parse(res.body) };
}

describe('evaluatePlan: facturas con items y cliente embebidos', () => {
  it('lista con embeds directo (objeto) e inverso (array), order y columnas proyectadas', async () => {
    const r = await run('invoice_sales', {
      select: 'id,number,total,customers(full_name,email),invoice_items(id,qty,products(name))',
      organization_id: `eq.${ORG}`,
      order: 'issue_date.desc.nullslast',
    });
    expect(r.status).toBe(200);
    expect(r.json.map((f: OfflineRow) => f.id)).toEqual(['f4', 'f2', 'f1', 'f3']);
    const f2 = r.json[1];
    expect(f2).toEqual({
      id: 'f2', number: 'FV-2', total: 250.5,
      customers: { full_name: 'Bruno Díaz', email: null },
      invoice_items: [
        { id: 'i2', qty: 1, products: { name: 'Bota de montaña' } },
        { id: 'i3', qty: 3, products: { name: 'Zapato clásico' } },
      ],
    });
    const f3 = r.json[3];
    expect(f3.customers).toBeNull();
    expect(f3.invoice_items).toEqual([]);
    expect(Object.keys(f3)).toEqual(['id', 'number', 'total', 'customers', 'invoice_items']);
  });

  it('count=exact con range: Content-Range exacto y 206 parcial', async () => {
    const r = await run('invoice_sales', { select: 'id', organization_id: `eq.${ORG}`, order: 'created_at.asc' }, { Prefer: 'count=exact', Range: '1-2' });
    expect(r.status).toBe(206);
    expect(r.headers['Content-Range']).toBe('1-2/4');
    expect(r.json.map((f: OfflineRow) => f.id)).toEqual(['f2', 'f3']);

    const full = await run('invoice_sales', { select: 'id', organization_id: `eq.${ORG}` }, { Prefer: 'count=exact' });
    expect(full.status).toBe(200);
    expect(full.headers['Content-Range']).toBe('0-3/4');

    const none = await run('invoice_sales', { select: 'id', status: 'eq.void' }, { Prefer: 'count=exact' });
    expect(none.json).toEqual([]);
    expect(none.headers['Content-Range']).toBe('*/0');
  });

  it('HEAD con count devuelve solo la cabecera', async () => {
    const r = await run('invoice_sales', { select: 'id', organization_id: `eq.${ORG}` }, { Prefer: 'count=exact' }, 'HEAD');
    expect(r.body).toBeNull();
    expect(r.headers['Content-Range']).toBe('0-3/4');
  });

  it('single: 200 con objeto, 406 PGRST116 con 0 o varias filas', async () => {
    const one = await run('invoice_sales', { select: '*', id: 'eq.f1' }, { Accept: 'application/vnd.pgrst.object+json' });
    expect(one.status).toBe(200);
    expect(one.json.number).toBe('FV-1');
    expect('qr_image' in one.json).toBe(false); // `*` = columnas del manifiesto (qr_image no se replica)
    const explicit = await run('invoice_sales', { select: 'number,qr_image', id: 'eq.f1' }, { Accept: 'application/vnd.pgrst.object+json' });
    expect(explicit.json).toEqual({ number: 'FV-1', qr_image: null }); // pedida a mano → null, no error

    const zero = await run('invoice_sales', { select: '*', id: 'eq.nope' }, { Accept: 'application/vnd.pgrst.object+json' });
    expect(zero.status).toBe(406);
    expect(zero.json.code).toBe('PGRST116');
    expect(zero.json.details).toContain('0 rows');

    const many = await run('invoice_sales', { select: 'id', status: 'eq.pending' }, { Accept: 'application/vnd.pgrst.object+json' });
    expect(many.status).toBe(406);
    expect(many.json.details).toContain('2 rows');
  });

  it('!inner descarta padres sin hijo y aplica el filtro del embed antes del count', async () => {
    const r = await run('invoice_sales', { select: 'id,customers!inner(full_name)', 'customers.full_name': 'ilike.*ana*' }, { Prefer: 'count=exact' });
    expect(r.json.map((f: OfflineRow) => f.id).sort()).toEqual(['f1', 'f4']);
    expect(r.headers['Content-Range']).toBe('0-1/2');

    const byItems = await run('invoice_sales', { select: 'id,invoice_items!inner(qty)', 'invoice_items.qty': 'gte.3' });
    expect(byItems.json).toEqual([{ id: 'f2', invoice_items: [{ qty: 3 }] }]);
  });

  it('filtro sobre embed sin inner no descarta al padre', async () => {
    const r = await run('invoice_sales', { select: 'id,invoice_items(qty)', 'invoice_items.qty': 'gte.3', order: 'id.asc' });
    expect(r.json).toEqual([
      { id: 'f1', invoice_items: [] },
      { id: 'f2', invoice_items: [{ qty: 3 }] },
      { id: 'f3', invoice_items: [] },
      { id: 'f4', invoice_items: [] },
    ]);
  });

  it('embed con hint de FK, self-join y alias', async () => {
    const r = await run('invoice_sales', { select: 'id,nota:invoice_sales!invoice_sales_related_invoice_id_fkey(number)', id: 'eq.f4' });
    expect(r.json).toEqual([{ id: 'f4', nota: { number: 'FV-1' } }]);

    const cats = await run('categories', { select: 'id,name,parent:categories!parent_id(name)', order: 'id.asc' });
    expect(cats.json).toEqual([
      { id: 10, name: 'Calzado', parent: null },
      { id: 11, name: 'Botas', parent: { name: 'Calzado' } },
    ]);

    // Inversa sin ambigüedad: factura desde la línea (directa) y producto con !inner filtrado.
    const lines = await run('invoice_items', { select: 'id,invoice_sales(number),products!inner(sku)', 'products.sku': 'eq.ZAP-1', order: 'id.asc' });
    expect(lines.json).toEqual([
      { id: 'i1', invoice_sales: { number: 'FV-1' }, products: { sku: 'ZAP-1' } },
      { id: 'i3', invoice_sales: { number: 'FV-2' }, products: { sku: 'ZAP-1' } },
    ]);
  });

  it('embed con order y limit propios', async () => {
    const r = await run('products', { select: 'id,product_prices(price)', id: 'eq.1', 'product_prices.order': 'effective_from.desc', 'product_prices.limit': '1' });
    expect(r.json).toEqual([{ id: 1, product_prices: [{ price: 50 }] }]);
  });

  it('nunca devuelve filas de otra organización aunque no se filtre por ella', async () => {
    const r = await run('customers', { select: 'id', order: 'id.asc' });
    expect(r.json).toEqual([{ id: 'c1' }, { id: 'c2' }]);
  });
});

describe('evaluatePlan: operadores', () => {
  const ids = async (params: Record<string, string>) => (await run('products', { select: 'id', order: 'id.asc', ...params })).json.map((p: OfflineRow) => p.id);

  it('eq/neq/gt/gte/lt/lte con coerción numérica y de fechas', async () => {
    expect(await ids({ id: 'eq.2' })).toEqual([2]);
    expect(await ids({ id: 'neq.2' })).toEqual([1, 3]);
    expect(await ids({ id: 'gt.1' })).toEqual([2, 3]);
    expect(await ids({ id: 'gte.2', id2: 'eq.x' })).toEqual([]); // columna inexistente → ninguna fila
    expect(await ids({ updated_at: 'gte.2026-09-01' })).toEqual([1, 2]);
    expect(await ids({ updated_at: 'lt.2026-09-01T12:00:00.000Z' })).toEqual([1, 3]);
    expect(await ids({ updated_at: 'lte.2026-09-02T00:00:00Z' })).toEqual([1, 2, 3]);
  });

  it('in, is, not, like/ilike con * y %', async () => {
    expect(await ids({ id: 'in.(1,3)' })).toEqual([1, 3]);
    expect(await ids({ id: 'in.(1,1,3)' })).toEqual([1, 3]); // sin duplicados
    expect(await ids({ barcode: 'is.null' })).toEqual([2, 3]);
    expect(await ids({ barcode: 'not.is.null' })).toEqual([1]);
    expect(await ids({ status: 'not.eq.archived' })).toEqual([1, 2]);
    expect(await ids({ name: 'ilike.*bota*' })).toEqual([2]);
    expect(await ids({ name: 'like.Bota%' })).toEqual([2]);
    expect(await ids({ name: 'like.bota%' })).toEqual([]);
    expect(await ids({ name: 'ilike(any).{*zapato*,*bota*}' })).toEqual([1, 2]);
    expect(await ids({ name: 'ilike(all).{*zapato*,*bota*}' })).toEqual([]);
  });

  it('or anidado con and y filtros de texto (fts)', async () => {
    expect(await ids({ or: '(name.ilike.*zapato*,and(status.eq.archived,category_id.is.null))' })).toEqual([1, 3]);
    expect(await ids({ or: '(sku.eq.BOT-1,sku.eq.ARCH)', status: 'eq.active' })).toEqual([2]);
    expect(await ids({ name: 'fts.zapato clasico' })).toEqual([1]);
    expect(await ids({ description: 'plfts.negro' })).toEqual([1]);
  });

  it('cs/cd/ov sobre arrays', async () => {
    const cids = async (params: Record<string, string>) => (await run('customers', { select: 'id', order: 'id.asc', ...params })).json.map((c: OfflineRow) => c.id);
    expect(await cids({ tags: 'cs.{vip}' })).toEqual(['c1']);
    expect(await cids({ tags: 'cd.{vip,otro}' })).toEqual(['c1', 'c2']);
    expect(await cids({ tags: 'ov.{vip,x}' })).toEqual(['c1']);
  });

  it('order con nulls first/last y varias columnas', async () => {
    const r = await run('invoice_sales', { select: 'id', order: 'customer_id.asc.nullsfirst,total.desc' });
    expect(r.json.map((f: OfflineRow) => f.id)).toEqual(['f3', 'f1', 'f4', 'f2']);
    const r2 = await run('invoice_sales', { select: 'id', order: 'customer_id.desc' });
    expect(r2.json.map((f: OfflineRow) => f.id)[0]).toBe('f3'); // desc → nulos primero por defecto
  });

  it('limit/offset y tabla replicada sin filas → []', async () => {
    const r = await run('products', { select: 'id', order: 'id.asc', limit: '2', offset: '1' });
    expect(r.json.map((p: OfflineRow) => p.id)).toEqual([2, 3]);
    expect(r.status).toBe(206);
    const empty = await run('suppliers', { select: 'id', organization_id: `eq.${ORG}` });
    expect(empty.status).toBe(200);
    expect(empty.json).toEqual([]);
  });

  it('* se expande a las columnas del manifiesto y no filtra organization_id sintético', async () => {
    const r = await run('product_prices', { select: '*', product_id: 'eq.2' });
    expect(r.json).toEqual([{ id: 102, product_id: 2, price: 250.5, effective_from: '2026-01-01T00:00:00+00:00', effective_to: null, created_at: null, compare_price: null }]);
  });
});

describe('resolveLocalPostgrest: cuándo devuelve null', () => {
  it('tabla fuera del manifiesto, sin replicar, relación desconocida u operador no soportado', async () => {
    expect(await resolveLocalPostgrest({ url: url('kitchen_tickets', { select: '*' }) }, ORG, source)).toBeNull();
    expect(await resolveLocalPostgrest({ url: url('sales', { select: '*' }) }, ORG, source)).toBeNull();
    expect(await resolveLocalPostgrest({ url: url('invoice_sales', { select: 'id,payments(amount)' }) }, ORG, source)).toBeNull();
    expect(await resolveLocalPostgrest({ url: url('invoice_sales', { total: 'sl.(1,2)' }) }, ORG, source)).toBeNull();
    expect(await resolveLocalPostgrest({ url: url('invoice_sales', { select: 'count()' }) }, ORG, source)).toBeNull();
    expect(await resolveLocalPostgrest({ url: BASE + 'rpc/pos_product_ranking', method: 'POST' }, ORG, source)).toBeNull();
  });

  it('devuelve una Response con cuerpo y Content-Range cuando puede', async () => {
    const res = await resolveLocalPostgrest({ url: url('customers', { select: 'id,full_name', id: 'eq.c1' }), headers: { Prefer: 'count=exact' } }, ORG, source);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-range')).toBe('0-0/1');
    expect(res!.headers.get('x-offline-local')).toBe('true');
    expect(await res!.json()).toEqual([{ id: 'c1', full_name: 'Ana Pérez' }]);
  });

  it('autorreferencia sin hint es ambigua (como en PostgREST)', async () => {
    const plan = parsePostgrestRequest({ url: url('invoice_sales', { select: 'id,invoice_sales(number)' }) });
    await expect(evaluatePlan(plan, ORG, source)).rejects.toThrow(UnsupportedQueryError);
  });
});
