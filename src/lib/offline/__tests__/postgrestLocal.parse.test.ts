/**
 * Fase 4C (Desktop): parser de peticiones PostgREST → plan local.
 * Cubre select con alias/casts/embeds, operadores, `or` anidado, filtros
 * sobre embeds, order, limit/offset/Range, count y single.
 */
import { UnsupportedQueryError, parsePostgrestRequest, parseSelect, restTableFromUrl, type EmbedNode } from '../postgrestLocal';

const BASE = 'https://proyecto.supabase.co/rest/v1/';

function url(table: string, params: Record<string, string | string[]>): string {
  const u = new URL(BASE + table);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const x of v) u.searchParams.append(k, x);
    else u.searchParams.set(k, v);
  }
  return u.toString();
}

describe('restTableFromUrl', () => {
  it('extrae la tabla y descarta RPC', () => {
    expect(restTableFromUrl(url('invoice_sales', { select: '*' }))).toBe('invoice_sales');
    expect(restTableFromUrl(BASE + 'rpc/pos_product_ranking')).toBeNull();
    expect(restTableFromUrl('https://x/auth/v1/token')).toBeNull();
  });
});

describe('parseSelect', () => {
  it('columnas, alias y casts', () => {
    const items = parseSelect('id,nombre:name,total::text,"quoted col"');
    expect(items).toEqual([
      { kind: 'column', name: 'id', alias: undefined },
      { kind: 'column', name: 'name', alias: 'nombre' },
      { kind: 'column', name: 'total', alias: undefined },
      { kind: 'column', name: 'quoted col', alias: undefined },
    ]);
  });

  it('embeds anidados con hints, inner y alias', () => {
    const items = parseSelect('id,customers(name),sale_items(*,products!inner(name,sku)),cat:categories!products_category_id_fkey(name)');
    expect(items[0]).toEqual({ kind: 'column', name: 'id', alias: undefined });
    const customers = items[1] as EmbedNode;
    expect(customers.kind).toBe('embed');
    expect(customers.name).toBe('customers');
    expect(customers.inner).toBe(false);
    expect(customers.select).toEqual([{ kind: 'column', name: 'name', alias: undefined }]);
    const saleItems = items[2] as EmbedNode;
    expect(saleItems.select[0]).toEqual({ kind: 'column', name: '*', alias: undefined });
    const products = saleItems.select[1] as EmbedNode;
    expect(products.inner).toBe(true);
    expect(products.select.map((s) => (s as { name: string }).name)).toEqual(['name', 'sku']);
    const cat = items[3] as EmbedNode;
    expect(cat.alias).toBe('cat');
    expect(cat.hint).toBe('products_category_id_fkey');
  });

  it('rechaza agregados, rutas JSON y spread', () => {
    expect(() => parseSelect('count()')).toThrow(UnsupportedQueryError);
    expect(() => parseSelect('total.sum()')).toThrow(UnsupportedQueryError);
    expect(() => parseSelect('metadata->>key')).toThrow(UnsupportedQueryError);
    expect(() => parseSelect('...customers(name)')).toThrow(UnsupportedQueryError);
  });
});

describe('parsePostgrestRequest', () => {
  it('filtros simples con negación, in con comillas y valores con comas', () => {
    const plan = parsePostgrestRequest({
      url: url('products', { select: 'id,name', organization_id: 'eq.120', status: 'not.eq.archived', id: 'in.(1,2,"a,b")', name: 'ilike.*zapato*' }),
    });
    expect(plan.table).toBe('products');
    expect(plan.filters).toEqual([
      { kind: 'cond', column: 'organization_id', op: 'eq', value: '120', negate: false, quantifier: undefined },
      { kind: 'cond', column: 'status', op: 'eq', value: 'archived', negate: true, quantifier: undefined },
      { kind: 'cond', column: 'id', op: 'in', value: '(1,2,"a,b")', negate: false, quantifier: undefined },
      { kind: 'cond', column: 'name', op: 'ilike', value: '*zapato*', negate: false, quantifier: undefined },
    ]);
  });

  it('or anidado con and y not', () => {
    const plan = parsePostgrestRequest({
      url: url('customers', { or: '(first_name.ilike.*ana*,and(email.eq.a@b.co,not.phone.is.null),not.and(city.eq.Cali,tags.cs.{vip}))' }),
    });
    expect(plan.filters).toHaveLength(1);
    const or = plan.filters[0];
    expect(or.kind).toBe('logic');
    if (or.kind !== 'logic') return;
    expect(or.op).toBe('or');
    expect(or.children).toHaveLength(3);
    expect(or.children[0]).toMatchObject({ kind: 'cond', column: 'first_name', op: 'ilike', value: '*ana*' });
    expect(or.children[1]).toMatchObject({ kind: 'logic', op: 'and', negate: false });
    const and = or.children[1];
    if (and.kind !== 'logic') return;
    expect(and.children[1]).toMatchObject({ kind: 'cond', column: 'phone', op: 'is', value: 'null', negate: true });
    expect(or.children[2]).toMatchObject({ kind: 'logic', op: 'and', negate: true });
  });

  it('like(any) y fts con configuración', () => {
    const plan = parsePostgrestRequest({ url: url('products', { name: 'like(any).{*a*,*b*}', description: 'fts(spanish).zapato' }) });
    expect(plan.filters[0]).toMatchObject({ op: 'like', quantifier: 'any', value: '{*a*,*b*}' });
    expect(plan.filters[1]).toMatchObject({ op: 'fts', value: 'zapato' });
  });

  it('filtros, order y limit sobre embeds', () => {
    const plan = parsePostgrestRequest({
      url: url('invoice_sales', {
        select: 'id,invoice_items(id,qty),customers!inner(name)',
        'invoice_items.qty': 'gt.1',
        'invoice_items.order': 'qty.desc',
        'invoice_items.limit': '5',
        'customers.name': 'ilike.*sa*',
      }),
    });
    const items = plan.select[1] as EmbedNode;
    expect(items.filters).toEqual([{ kind: 'cond', column: 'qty', op: 'gt', value: '1', negate: false, quantifier: undefined }]);
    expect(items.order).toEqual([{ column: 'qty', asc: false, nullsFirst: true }]);
    expect(items.limit).toBe(5);
    const customers = plan.select[2] as EmbedNode;
    expect(customers.inner).toBe(true);
    expect(customers.filters[0]).toMatchObject({ column: 'name', op: 'ilike' });
    expect(plan.filters).toHaveLength(0);
  });

  it('order con varias columnas y nulls', () => {
    const plan = parsePostgrestRequest({ url: url('sales', { order: 'sale_date.desc.nullslast,id.asc,total.desc' }) });
    expect(plan.order).toEqual([
      { column: 'sale_date', asc: false, nullsFirst: false },
      { column: 'id', asc: true, nullsFirst: false },
      { column: 'total', asc: false, nullsFirst: true },
    ]);
  });

  it('limit/offset de la URL, Range de la cabecera, count y single', () => {
    const byParams = parsePostgrestRequest({ url: url('sales', { limit: '10', offset: '20' }) });
    expect(byParams.limit).toBe(10);
    expect(byParams.offset).toBe(20);

    const byRange = parsePostgrestRequest({ url: url('sales', {}), headers: { Range: '0-9', Prefer: 'count=exact', Accept: 'application/json' } });
    expect(byRange.offset).toBe(0);
    expect(byRange.limit).toBe(10);
    expect(byRange.count).toBe(true);
    expect(byRange.single).toBe(false);

    const single = parsePostgrestRequest({ url: url('sales', { id: 'eq.x' }), headers: { accept: 'application/vnd.pgrst.object+json' } });
    expect(single.single).toBe(true);

    const head = parsePostgrestRequest({ url: url('sales', {}), method: 'HEAD', headers: { Prefer: 'count=planned' } });
    expect(head.head).toBe(true);
    expect(head.count).toBe(true);
  });

  it('rechaza operadores de rango, order por embed, filtro sobre relación no seleccionada y métodos de escritura', () => {
    expect(() => parsePostgrestRequest({ url: url('sales', { total: 'sl.(1,2)' }) })).toThrow(UnsupportedQueryError);
    expect(() => parsePostgrestRequest({ url: url('sales', { order: 'customers(name).asc' }) })).toThrow(UnsupportedQueryError);
    expect(() => parsePostgrestRequest({ url: url('sales', { select: 'id', 'customers.name': 'eq.x' }) })).toThrow(UnsupportedQueryError);
    expect(() => parsePostgrestRequest({ url: url('sales', {}), method: 'POST' })).toThrow(UnsupportedQueryError);
    expect(() => parsePostgrestRequest({ url: url('sales', { total: 'foo.1' }) })).toThrow(UnsupportedQueryError);
  });

  it('select ausente equivale a *', () => {
    const plan = parsePostgrestRequest({ url: url('branches', {}) });
    expect(plan.select).toEqual([{ kind: 'column', name: '*', alias: undefined }]);
  });
});
