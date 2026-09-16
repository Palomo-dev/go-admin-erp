/**
 * Fase 4C (Desktop): almacén local genérico `goadmin-replica` sobre
 * `fake-indexeddb`. Stores e índices derivados del manifiesto, escritura,
 * lectura por índice, poda, meta/estado, cambio de organización y la fuente
 * de datos que consume el resolutor local.
 */
import 'fake-indexeddb/auto';

import {
  clearOfflineDb,
  closeOfflineDB,
  ensureOfflineDbOrganization,
  getOfflineDbStatus,
  getOfflineKeysByOrg,
  getOfflineRow,
  getOfflineRowsByIndex,
  getOfflineRowsByOrg,
  getStoredOrganizationId,
  hasLocalIndex,
  indexedDbDataSource,
  isTableReplicated,
  keyToString,
  pruneOfflineRows,
  putOfflineRows,
  rowKeyOf,
  setOfflineTableMeta,
  storeDefsFromManifest,
  type OfflineTableMeta,
} from '../offlineDb';
import { REPLICATION_MANIFEST, getTableManifest, inverseRelations, isReplicatedTable, totalMaxRows } from '../replicationManifest';
import { resolveLocalPostgrest } from '../postgrestLocal';

const ORG = 120;

function meta(table: string, count: number, at = 1_700_000_000_000, extra: Partial<OfflineTableMeta> = {}): OfflineTableMeta {
  return { key: `${table}:${ORG}`, table, organization_id: ORG, replicated_at: at, full_at: at, count, bytes: count * 100, cursor: null, error: null, attempted_at: at, ...extra };
}

beforeEach(async () => {
  await clearOfflineDb();
});

afterAll(async () => {
  await closeOfflineDB();
});

describe('manifiesto', () => {
  it('cubre las tablas mínimas pedidas, con PK e índices coherentes', () => {
    for (const t of ['products', 'product_prices', 'product_costs', 'product_images', 'product_modifier_groups', 'categories', 'stock_levels', 'stock_movements',
      'inventory_adjustments', 'suppliers', 'customers', 'sales', 'sale_items', 'invoice_sales', 'invoice_items', 'invoice_purchase', 'purchase_orders',
      'purchase_order_items', 'payments', 'accounts_receivable', 'accounts_payable', 'cash_sessions', 'cash_movements', 'payment_methods', 'organization_taxes',
      'currencies', 'branches', 'organization_members', 'roles']) {
      expect(isReplicatedTable(t)).toBe(true);
    }
    expect(isReplicatedTable('warehouses')).toBe(false); // no existe en el esquema
    for (const m of REPLICATION_MANIFEST) {
      const pk = Array.isArray(m.pk) ? m.pk : [m.pk];
      for (const c of pk) expect(m.columns).toContain(c);
      for (const c of m.indexes) expect(m.columns).toContain(c);
      for (const fk of m.fks) expect(m.columns).toContain(fk.column);
      if (m.incremental) expect(m.columns).toContain(m.incremental);
      if (m.window) expect(m.columns).toContain(m.window.column);
      expect(m.hasOrganizationId).toBe(m.columns.includes('organization_id'));
      if (m.scope.kind === 'org') expect(m.hasOrganizationId).toBe(true);
    }
    // Presupuesto documentado: la suma de topes queda por debajo de ~450k filas.
    expect(totalMaxRows()).toBeLessThan(450_000);
  });

  it('organization_members no replica columnas sensibles y las FK inversas se derivan', () => {
    const members = getTableManifest('organization_members')!;
    expect(members.columns).not.toContain('password');
    expect(inverseRelations('sales').map((r) => r.fromTable).sort()).toEqual(['accounts_receivable', 'invoice_sales', 'sale_items', 'web_orders']);
    const defs = storeDefsFromManifest();
    expect(defs.stock_levels.indexes.map((i) => i.name)).toEqual(['by_org', 'by_product_id', 'by_branch_id', 'by_lot_id']);
    expect(defs.products.indexes[0]).toEqual({ name: 'by_org', keyPath: 'organization_id' });
    expect(hasLocalIndex('products', 'id')).toBe(true);
    expect(hasLocalIndex('products', 'name')).toBe(false);
  });
});

describe('offlineDb', () => {
  it('escribe, lee por organización e índice, poda y cuenta', async () => {
    await putOfflineRows('products', [
      { id: 1, organization_id: ORG, sku: 'A', name: 'Uno', category_id: 10 },
      { id: 2, organization_id: ORG, sku: 'B', name: 'Dos', category_id: 10 },
      { id: 3, organization_id: 121, sku: 'C', name: 'Otra org', category_id: 10 },
    ]);
    expect((await getOfflineRowsByOrg('products', ORG)).map((r) => r.id)).toEqual([1, 2]);
    expect((await getOfflineRowsByIndex('products', 'category_id', [10])).map((r) => r.id)).toEqual([1, 2, 3]);
    expect((await getOfflineRowsByIndex('products', 'id', [2, 99])).map((r) => r.id)).toEqual([2]);
    expect((await getOfflineRow('products', 1))?.name).toBe('Uno');
    expect(await pruneOfflineRows('products', ORG, new Set(['1']))).toBe(1);
    expect((await getOfflineKeysByOrg('products', ORG)).map(keyToString)).toEqual(['1']);
    // La otra organización no se toca.
    expect((await getOfflineRowsByOrg('products', 121)).length).toBe(1);
  });

  it('claves compuestas', async () => {
    const row = { product_id: 5, tax_id: 'abc', organization_id: ORG };
    expect(rowKeyOf(['product_id', 'tax_id'], row)).toBe('5␟abc');
    await putOfflineRows('product_tax_relations', [row]);
    expect(await getOfflineRow('product_tax_relations', [5, 'abc'])).toEqual(row);
  });

  it('meta y estado agregado; tabla replicada con 0 filas cuenta como replicada', async () => {
    expect((await getOfflineDbStatus(ORG)).isEmpty).toBe(true);
    await setOfflineTableMeta(meta('products', 2, 1000));
    await setOfflineTableMeta(meta('suppliers', 0, 2000));
    await setOfflineTableMeta(meta('sales', 0, 0, { error: 'permiso denegado', attempted_at: 3000 }));
    const status = await getOfflineDbStatus(ORG);
    expect(status.isEmpty).toBe(false);
    expect(status.replicatedAt).toBe(1000);
    expect(status.latestAt).toBe(2000);
    expect(status.totalRows).toBe(2);
    expect(status.estimatedBytes).toBe(200);
    expect(status.tables.sales.error).toBe('permiso denegado');
    expect(status.missing).toContain('sales');
    expect(status.missing).not.toContain('suppliers');
    expect(await isTableReplicated('suppliers', ORG)).toBe(true);
    expect(await isTableReplicated('sales', ORG)).toBe(false);
    expect(await isTableReplicated('kitchen_tickets', ORG)).toBe(false);
  });

  it('cambiar de organización vacía la réplica', async () => {
    expect(await ensureOfflineDbOrganization(ORG)).toBe(false);
    await putOfflineRows('customers', [{ id: 'c1', organization_id: ORG }]);
    await setOfflineTableMeta(meta('customers', 1));
    expect(await ensureOfflineDbOrganization(ORG)).toBe(false);
    expect((await getOfflineRowsByOrg('customers', ORG)).length).toBe(1);
    expect(await ensureOfflineDbOrganization(121)).toBe(true);
    expect((await getOfflineRowsByOrg('customers', ORG)).length).toBe(0);
    expect((await getOfflineDbStatus(ORG)).isEmpty).toBe(true);
  });

  it('la fuente IndexedDB alimenta al resolutor local de punta a punta', async () => {
    await putOfflineRows('customers', [
      { id: 'c1', organization_id: ORG, full_name: 'Ana', email: 'a@x.co' },
      { id: 'c2', organization_id: ORG, full_name: 'Bea', email: null },
    ]);
    await putOfflineRows('invoice_sales', [{ id: 'f1', organization_id: ORG, customer_id: 'c2', number: 'FV-1', total: 10 }]);
    await setOfflineTableMeta(meta('customers', 2));
    await setOfflineTableMeta(meta('invoice_sales', 1));
    const url = `https://x.supabase.co/rest/v1/invoice_sales?select=${encodeURIComponent('id,number,customers(full_name)')}&organization_id=eq.${ORG}`;
    const res = await resolveLocalPostgrest({ url, headers: { Prefer: 'count=exact' } }, ORG, indexedDbDataSource);
    expect(res).not.toBeNull();
    expect(await res!.json()).toEqual([{ id: 'f1', number: 'FV-1', customers: { full_name: 'Bea' } }]);
    expect(res!.headers.get('content-range')).toBe('0-0/1');
    // Tabla del manifiesto sin replicar todavía → null (cae a la caché por URL).
    const sales = await resolveLocalPostgrest({ url: `https://x.supabase.co/rest/v1/sales?select=id` }, ORG, indexedDbDataSource);
    expect(sales).toBeNull();
  });

  it('getStoredOrganizationId lee currentOrganizationId u organizacionActiva', () => {
    const g = globalThis as Record<string, unknown>;
    const store = new Map<string, string>();
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null } };
    expect(getStoredOrganizationId()).toBeNull();
    store.set('organizacionActiva', JSON.stringify({ id: 120, name: 'x' }));
    expect(getStoredOrganizationId()).toBe(120);
    store.set('currentOrganizationId', '121');
    expect(getStoredOrganizationId()).toBe(121);
    delete g.window;
  });
});
