/**
 * Etiquetas de peso sin conexión (PRODUCTOS-POR-PESO-BASCULA.md §2.10): la
 * réplica del catálogo tiene un índice local por PLU de balanza. Los productos
 * sin PLU no entran en el índice y el PLU es por organización.
 */
import 'fake-indexeddb/auto';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('no debe usarse en tests'); }, rpc: () => { throw new Error('no debe usarse en tests'); } } }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: () => false,
  desktopReportsConnectivity: () => false,
  onDesktopConnectivity: () => () => {},
  getDesktopBridge: () => null,
}));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: () => true }));

import { clearCatalog, closeCatalogDB, getCatalogRowsByIndex, putCatalogRows, type CatalogProduct } from '@/lib/offline/catalogStore';

const ORG = 120;

function producto(id: number, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    organization_id: ORG,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    description: null,
    barcode: null,
    status: 'active',
    category_id: null,
    unit_code: 'KG',
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
  await closeCatalogDB();
});

it('índice by_org_scale_plu: encuentra por (organización, PLU) e ignora productos sin PLU', async () => {
  await putCatalogRows('products', [
    producto(1, { scale_plu: 104 }),
    producto(2, { scale_plu: null }),
    producto(3),
    { ...producto(4, { scale_plu: 104 }), organization_id: 121 },
  ]);
  expect((await getCatalogRowsByIndex('products', 'by_org_scale_plu', [ORG, 104])).map((p) => p.id)).toEqual([1]);
  expect((await getCatalogRowsByIndex('products', 'by_org_scale_plu', [121, 104])).map((p) => p.id)).toEqual([4]);
  expect(await getCatalogRowsByIndex('products', 'by_org_scale_plu', [ORG, 999])).toEqual([]);
});
