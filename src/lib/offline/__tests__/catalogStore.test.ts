/**
 * Fase 4A (Desktop): catálogo local en IndexedDB `goadmin-catalog` y su
 * replicación por lotes desde PostgREST (paginación de 500).
 */
import 'fake-indexeddb/auto';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('no debe usarse en tests'); }, rpc: () => { throw new Error('no debe usarse en tests'); } } }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: () => typeof window !== 'undefined' && 'goAdminDesktop' in (window as object),
  desktopReportsConnectivity: () => false,
  onDesktopConnectivity: () => () => {},
  getDesktopBridge: () => null,
}));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: () => true }));

import {
  clearCatalog,
  closeCatalogDB,
  getCatalogRow,
  getCatalogRowsByIndex,
  getCatalogRowsByOrg,
  getCatalogRowsByProducts,
  getCatalogStatus,
  pruneCatalogRows,
  putCatalogRows,
  rowKey,
  setCatalogStoreMeta,
  type CatalogProduct,
} from '../catalogStore';
import { REPLICATION_BATCH_SIZE, CUSTOMERS_LIMIT, pickPrimaryImages, replicateCatalog, startCatalogReplication, stopCatalogReplication } from '../catalogReplicator';
import { createFakeCatalogClient } from './fakeCatalogClient';

const ORG = 120;
const OTHER_ORG = 121;

function product(id: number, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    organization_id: ORG,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    description: null,
    barcode: null,
    status: 'active',
    category_id: null,
    unit_code: 'UN',
    parent_product_id: null,
    is_parent: false,
    variant_data: null,
    track_stock: true,
    track_serial: false,
    tag_id: null,
    station: null,
    product_type: null,
    production_type: null,
    is_composite: false,
    brand: null,
    reference: null,
    warranty_months: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    is_favorite: false,
    ...extra,
  };
}

beforeEach(async () => {
  await clearCatalog();
});

afterAll(async () => {
  stopCatalogReplication();
  await closeCatalogDB();
});

describe('catalogStore', () => {
  it('escribe, lee por organización, por índice y por producto; poda lo que ya no existe', async () => {
    await putCatalogRows('products', [product(1, { barcode: '770001' }), product(2, { parent_product_id: 1 }), { ...product(3), organization_id: OTHER_ORG }]);
    await putCatalogRows('product_prices', [
      { id: 10, organization_id: ORG, product_id: 1, price: '1500', compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      { id: 11, organization_id: ORG, product_id: 2, price: '1600', compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
    ]);

    expect((await getCatalogRowsByOrg('products', ORG)).map((p) => p.id).sort()).toEqual([1, 2]);
    expect((await getCatalogRowsByIndex('products', 'by_org_barcode', [ORG, '770001'])).map((p) => p.id)).toEqual([1]);
    expect((await getCatalogRowsByIndex('products', 'by_org_parent', [ORG, 1])).map((p) => p.id)).toEqual([2]);
    expect((await getCatalogRowsByProducts('product_prices', [1, 2])).map((p) => p.id).sort()).toEqual([10, 11]);
    expect((await getCatalogRow('products', 3))?.organization_id).toBe(OTHER_ORG);

    // Poda: solo quedan las claves indicadas, y solo dentro de la organización.
    expect(await pruneCatalogRows('products', ORG, new Set([rowKey('products', product(1))]))).toBe(1);
    expect((await getCatalogRowsByOrg('products', ORG)).map((p) => p.id)).toEqual([1]);
    expect((await getCatalogRowsByOrg('products', OTHER_ORG)).map((p) => p.id)).toEqual([3]);
  });

  it('getCatalogStatus: vacío hasta que `products` tenga meta; replicated_at es el mínimo entre stores', async () => {
    expect((await getCatalogStatus(ORG)).isEmpty).toBe(true);
    await setCatalogStoreMeta('categories', ORG, 2000, 4);
    expect((await getCatalogStatus(ORG)).isEmpty).toBe(true);
    await setCatalogStoreMeta('products', ORG, 3000, 25);
    await setCatalogStoreMeta('customers', ORG, 1000, 7);
    const status = await getCatalogStatus(ORG);
    expect(status).toMatchObject({ isEmpty: false, productsCount: 25, customersCount: 7, replicatedAt: 1000 });
    expect((await getCatalogStatus(OTHER_ORG)).isEmpty).toBe(true);
  });

  it('pickPrimaryImages deja una imagen por producto: la primaria o la de menor orden', () => {
    const out = pickPrimaryImages([
      { id: 1, product_id: 1, is_primary: false, display_order: 0 },
      { id: 2, product_id: 1, is_primary: true, display_order: 3 },
      { id: 3, product_id: 2, is_primary: false, display_order: 2 },
      { id: 4, product_id: 2, is_primary: false, display_order: 1 },
    ]);
    expect(out.map((i) => i.id).sort()).toEqual([2, 4]);
  });
});

describe('catalogReplicator', () => {
  function buildTables(productCount: number, customerCount = 5) {
    const products = Array.from({ length: productCount }, (_, i) => ({
      id: i + 1,
      organization_id: ORG,
      sku: `SKU-${i + 1}`,
      name: `Producto ${i + 1}`,
      status: i === 0 ? 'inactive' : 'active',
      category_id: 1,
      parent_product_id: null,
      is_parent: false,
      track_stock: true,
      barcode: null,
    }));
    return {
      product_favorites: [{ organization_id: ORG, product_id: 2 }],
      category_favorites: [{ organization_id: ORG, category_id: 1 }],
      products,
      product_prices: [
        { id: 1, product_id: 2, price: 1000, compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
        { id: 2, product_id: 2, price: 900, compare_price: null, effective_from: '2025-01-01T00:00:00Z', effective_to: '2026-01-01T00:00:00Z' },
      ],
      product_images: [
        { id: 1, product_id: 2, storage_path: 'products/a.jpg', is_primary: false, display_order: 1 },
        { id: 2, product_id: 2, storage_path: 'products/b.jpg', is_primary: true, display_order: 2 },
      ],
      product_tax_relations: [{ product_id: 2, tax_id: 'tax-1' }],
      branches: [{ id: 7, organization_id: ORG }, { id: 8, organization_id: ORG }],
      stock_levels: [
        { id: 1, product_id: 2, branch_id: 7, lot_id: null, qty_on_hand: 5, qty_reserved: 1 },
        { id: 2, product_id: 2, branch_id: 7, lot_id: 99, qty_on_hand: 50, qty_reserved: 0 },
        { id: 3, product_id: 2, branch_id: 8, lot_id: null, qty_on_hand: 2, qty_reserved: 0 },
      ],
      categories: [{ id: 1, organization_id: ORG, name: 'Bebidas', slug: 'bebidas', rank: 1 }],
      customers: Array.from({ length: customerCount }, (_, i) => ({
        id: `c-${i}`,
        organization_id: ORG,
        full_name: `Cliente ${i}`,
        updated_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
      })),
      organization_payment_methods: [{ organization_id: ORG, payment_method_code: 'cash', is_active: true, settings: null, payment_methods: { name: 'Efectivo' } }],
      organization_taxes: [{ id: 'tax-1', organization_id: ORG, name: 'IVA 19', rate: 19, is_active: true }],
      product_modifier_groups: [{ id: 1, organization_id: ORG, product_id: 2 }],
      product_recipes: [{ id: 1, organization_id: ORG, product_id: 2, name: 'Receta', is_active: true }],
    };
  }

  it('replica por lotes de 500 (paginación PostgREST), funde favoritos y anota replicated_at por store', async () => {
    const tables = buildTables(1203, CUSTOMERS_LIMIT + 50);
    const client = createFakeCatalogClient(tables, {
      get_organization_currencies: [{ code: 'COP', name: 'Peso', symbol: '$', decimals: 0, auto_update: false, is_base: true, org_auto_update: false }],
    });
    const progress: string[] = [];
    const status = await replicateCatalog({ organizationId: ORG, client, onProgress: (store) => progress.push(store) });

    // 1202 activos (el id 1 está inactivo) → 3 páginas de products: 0-499, 500-999, 1000-1499.
    const productPages = client.requests.filter((r) => r.table === 'products');
    expect(productPages.map((r) => [r.from, r.to])).toEqual([
      [0, REPLICATION_BATCH_SIZE - 1],
      [REPLICATION_BATCH_SIZE, 2 * REPLICATION_BATCH_SIZE - 1],
      [2 * REPLICATION_BATCH_SIZE, 3 * REPLICATION_BATCH_SIZE - 1],
    ]);
    expect(status.isEmpty).toBe(false);
    expect(status.productsCount).toBe(1202);
    expect(status.stores.products?.replicated_at).toBeGreaterThan(0);
    expect(progress).toContain('customers');

    // Favoritos fundidos en productos y categorías.
    expect((await getCatalogRow('products', 2))?.is_favorite).toBe(true);
    expect((await getCatalogRow('products', 3))?.is_favorite).toBe(false);
    expect((await getCatalogRow('categories', 1))?.is_favorite).toBe(true);

    // Precios vigentes (effective_to null), una imagen (la primaria), stock sin lote de ambas sucursales.
    expect((await getCatalogRowsByProducts('product_prices', [2])).map((p) => p.id)).toEqual([1]);
    expect((await getCatalogRowsByProducts('product_images', [2])).map((i) => i.storage_path)).toEqual(['products/b.jpg']);
    expect((await getCatalogRowsByProducts('stock_levels', [2])).map((s) => s.branch_id).sort()).toEqual([7, 8]);

    // Clientes acotados a 2000 aunque haya más.
    expect(status.customersCount).toBe(CUSTOMERS_LIMIT);
    const customerPages = client.requests.filter((r) => r.table === 'customers');
    expect(customerPages[customerPages.length - 1].to).toBe(CUSTOMERS_LIMIT - 1);

    // Monedas, métodos de pago e impuestos con organization_id añadido.
    expect(await getCatalogRowsByOrg('currencies', ORG)).toHaveLength(1);
    expect((await getCatalogRowsByOrg('payment_methods', ORG))[0]).toMatchObject({ payment_method_code: 'cash', organization_id: ORG });
    expect(await getCatalogRowsByOrg('organization_taxes', ORG)).toHaveLength(1);
  }, 30000);

  it('una segunda replicación retira lo que desapareció en el servidor y conserva lo demás', async () => {
    const tables = buildTables(10);
    await replicateCatalog({ organizationId: ORG, client: createFakeCatalogClient(tables) });
    expect((await getCatalogRowsByOrg('products', ORG)).length).toBe(9);

    tables.products = tables.products.filter((p) => p.id !== 5);
    await replicateCatalog({ organizationId: ORG, client: createFakeCatalogClient(tables) });
    const ids = (await getCatalogRowsByOrg('products', ORG)).map((p) => p.id);
    expect(ids).not.toContain(5);
    expect(ids).toHaveLength(8);
  });

  it('un fallo del servidor propaga error y no deja el catálogo marcado como replicado', async () => {
    const client = createFakeCatalogClient(buildTables(3));
    const failing = {
      from: (table: string) => {
        if (table === 'products') {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) };
        }
        return client.from(table);
      },
      rpc: client.rpc,
    };
    await expect(replicateCatalog({ organizationId: ORG, client: failing })).rejects.toThrow(/products: boom/);
    expect((await getCatalogStatus(ORG)).isEmpty).toBe(true);
  });

  it('startCatalogReplication no hace nada fuera del Desktop', () => {
    const stop = startCatalogReplication(ORG, createFakeCatalogClient({}));
    expect(typeof stop).toBe('function');
    stop();
  });
});
