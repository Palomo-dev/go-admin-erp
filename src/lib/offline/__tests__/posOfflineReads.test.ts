/**
 * Fase 4A (Desktop): lecturas del POS sobre el catálogo local. Búsqueda,
 * paginación, favoritos primero, stock por sucursal, precios vigentes,
 * clientes, métodos de pago, monedas e impuestos; y el error claro cuando
 * el catálogo aún no se replicó.
 */
import 'fake-indexeddb/auto';

import { clearCatalog, closeCatalogDB, putCatalogRows, setCatalogStoreMeta, type CatalogProduct } from '../catalogStore';
import { CATALOG_NOT_REPLICATED_MESSAGE, isCatalogNotReplicatedError, posOfflineReads } from '../posOfflineReads';

const ORG = 120;
const BRANCH = 7;
const OTHER_BRANCH = 8;
const imageUrl = (path: string) => `https://cdn.test/${path}`;

function product(id: number, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    organization_id: ORG,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    description: null,
    barcode: null,
    status: 'active',
    category_id: 1,
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

async function seed() {
  await putCatalogRows('products', [
    product(1, { name: 'Zapato cuero', sku: 'ZAP-001', barcode: '7700000001', is_parent: true, description: 'Calzado formal' }),
    product(2, { name: 'Zapato cuero 38', sku: 'ZAP-001-38', parent_product_id: 1, barcode: '7700000038' }),
    product(3, { name: 'Zapato cuero 40', sku: 'ZAP-001-40', parent_product_id: 1, status: 'inactive' }),
    product(4, { name: 'Bolso', sku: 'BOL-001', category_id: 2, is_favorite: true }),
    product(5, { name: 'Cinturón', sku: 'CIN-001', track_stock: false }),
    product(6, { name: 'Abrigo', sku: 'ABR-001', category_id: 2 }),
    { ...product(7, { name: 'Zapato ajeno', sku: 'ZAP-X' }), organization_id: 999 },
  ]);
  await putCatalogRows('product_prices', [
    { id: 1, organization_id: ORG, product_id: 1, price: '120000', compare_price: '150000', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
    { id: 2, organization_id: ORG, product_id: 1, price: '99000', compare_price: null, effective_from: '2025-01-01T00:00:00Z', effective_to: null },
    { id: 3, organization_id: ORG, product_id: 2, price: '121000', compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
    { id: 4, organization_id: ORG, product_id: 4, price: '80000', compare_price: null, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
  ]);
  await putCatalogRows('product_images', [{ id: 1, organization_id: ORG, product_id: 1, storage_path: 'products/zapato.jpg', is_primary: true, display_order: 0 }]);
  await putCatalogRows('stock_levels', [
    { id: 1, organization_id: ORG, product_id: 2, branch_id: BRANCH, lot_id: null, qty_on_hand: '3', qty_reserved: '1' },
    { id: 2, organization_id: ORG, product_id: 2, branch_id: OTHER_BRANCH, lot_id: null, qty_on_hand: '10', qty_reserved: '0' },
    { id: 3, organization_id: ORG, product_id: 4, branch_id: BRANCH, lot_id: null, qty_on_hand: '0', qty_reserved: '0' },
    { id: 4, organization_id: ORG, product_id: 6, branch_id: OTHER_BRANCH, lot_id: null, qty_on_hand: '4', qty_reserved: '0' },
  ]);
  await putCatalogRows('categories', [
    { id: 1, organization_id: ORG, parent_id: null, name: 'Calzado', slug: 'calzado', rank: 2, icon: null, color: null, image_url: null, description: null, is_active: true, display_order: null, requires_preparation: false, station: null, branch_id: null, created_at: null, updated_at: null, is_favorite: false },
    { id: 2, organization_id: ORG, parent_id: null, name: 'Accesorios', slug: 'accesorios', rank: 1, icon: null, color: null, image_url: null, description: null, is_active: true, display_order: null, requires_preparation: false, station: null, branch_id: null, created_at: null, updated_at: null, is_favorite: true },
  ]);
  await putCatalogRows('product_modifier_groups', [{ id: 1, organization_id: ORG, product_id: 5 }]);
  await putCatalogRows('product_recipes', [{ id: 9, organization_id: ORG, product_id: 6, name: 'Confección' }]);
  await putCatalogRows('customers', [
    customer('c1', 'Ana Pérez', { email: 'ana@example.com', phone: '3001112233' }),
    customer('c2', 'Bruno Díaz', { doc_number: '1020304050' }),
    customer('c3', 'Carla Ruiz', { company_name: 'Calzados del Norte' }),
  ]);
  await putCatalogRows('payment_methods', [
    { organization_id: ORG, payment_method_code: 'cash', is_active: true, settings: null, payment_methods: { name: 'Efectivo' } },
    { organization_id: ORG, payment_method_code: 'nequi', is_active: true, settings: { color: '#000' }, payment_methods: { name: 'Nequi' } },
  ]);
  await putCatalogRows('organization_taxes', [
    { id: 't-iva', organization_id: ORG, template_id: null, name: 'IVA 19%', rate: '19', description: null, is_default: true, is_active: true, tax_included: true, created_at: null, updated_at: null },
    { id: 't-inc', organization_id: ORG, template_id: null, name: 'INC 8%', rate: '8', description: null, is_default: false, is_active: true, tax_included: false, created_at: null, updated_at: null },
  ]);
  await putCatalogRows('product_tax_relations', [{ organization_id: ORG, product_id: 1, tax_id: 't-iva' }]);
  await putCatalogRows('currencies', [
    { organization_id: ORG, code: 'USD', name: 'Dólar', symbol: 'US$', decimals: 2, auto_update: true, is_base: false, org_auto_update: true },
    { organization_id: ORG, code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 0, auto_update: false, is_base: true, org_auto_update: false },
  ]);
  const now = Date.now();
  for (const store of ['products', 'customers', 'categories'] as const) await setCatalogStoreMeta(store, ORG, now, 0);
}

function customer(id: string, fullName: string, extra: Record<string, unknown> = {}) {
  const [first, ...rest] = fullName.split(' ');
  return {
    id,
    organization_id: ORG,
    branch_id: null,
    first_name: first,
    last_name: rest.join(' '),
    full_name: fullName,
    email: null,
    phone: null,
    doc_type: null,
    doc_number: null,
    identification_type: null,
    identification_number: null,
    company_name: null,
    trade_name: null,
    address: null,
    city: null,
    customer_type: 'person',
    avatar_url: null,
    roles: [],
    tags: [],
    preferences: null,
    fiscal_municipality_id: null,
    created_at: null,
    updated_at: null,
    ...extra,
  };
}

beforeEach(async () => {
  await clearCatalog();
});

afterAll(async () => {
  await closeCatalogDB();
});

describe('sin catálogo replicado', () => {
  it('toda lectura lanza el error claro de «conecta a internet una vez»', async () => {
    await expect(posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH }, imageUrl)).rejects.toThrow(CATALOG_NOT_REPLICATED_MESSAGE);
    await expect(posOfflineReads.getCategories(ORG)).rejects.toThrow(CATALOG_NOT_REPLICATED_MESSAGE);
    await expect(posOfflineReads.searchCustomers(ORG, 'ana')).rejects.toThrow(CATALOG_NOT_REPLICATED_MESSAGE);
    try {
      await posOfflineReads.getPaymentMethodRows(ORG);
    } catch (err) {
      expect(isCatalogNotReplicatedError(err)).toBe(true);
    }
  });
});

describe('productos', () => {
  beforeEach(seed);

  it('pagina solo padres/simples activos de la organización, favoritos primero y luego por nombre', async () => {
    const page1 = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, page: 1, limit: 3 }, imageUrl);
    expect(page1.total).toBe(4);
    expect(page1.totalPages).toBe(2);
    expect(page1.data.map((p) => p.name)).toEqual(['Bolso', 'Abrigo', 'Cinturón']);
    const page2 = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, page: 2, limit: 3 }, imageUrl);
    expect(page2.data.map((p) => p.name)).toEqual(['Zapato cuero']);
    expect(page2.data.map((p) => p.id)).not.toContain(7);
  });

  it('enriquece: precio vigente, imagen, variantes, modificadores, receta y stock de la sucursal (propio + variantes)', async () => {
    const { data } = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, limit: 10 }, imageUrl);
    const zapato = data.find((p) => p.id === 1)!;
    expect(zapato.price).toBe(120000);
    expect(zapato.compare_price).toBe(150000);
    expect(zapato.image).toBe('https://cdn.test/products/zapato.jpg');
    expect(zapato.has_variants).toBe(true);
    expect(zapato.variant_count).toBe(1); // la variante inactiva no cuenta
    expect(zapato.stock_quantity).toBe(3); // stock de la variante 2 en la sucursal 7
    expect(zapato.qty_reserved).toBe(1);
    expect(zapato.is_out_of_stock).toBe(false);
    expect(zapato.category?.name).toBe('Calzado');
    expect(zapato.sales_count_90d).toBe(0);

    const bolso = data.find((p) => p.id === 4)!;
    expect(bolso.is_favorite).toBe(true);
    expect(bolso.is_out_of_stock).toBe(true);
    const cinturon = data.find((p) => p.id === 5)!;
    expect(cinturon.has_modifiers).toBe(true);
    expect(cinturon.is_out_of_stock).toBe(false); // no controla stock
    expect(cinturon.price).toBeNull();
    const abrigo = data.find((p) => p.id === 6)!;
    expect(abrigo.has_recipe).toBe(true);
    expect(abrigo.recipe_name).toBe('Confección');
    expect(abrigo.stock_quantity).toBe(0); // su stock está en otra sucursal
  });

  it('branchId null consolida el stock de todas las sucursales', async () => {
    const { data } = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: null, limit: 10 }, imageUrl);
    expect(data.find((p) => p.id === 1)!.stock_quantity).toBe(13);
    expect(data.find((p) => p.id === 6)!.stock_quantity).toBe(4);
  });

  it('busca por nombre, sku, descripción, barcode exacto y por sku/barcode de variantes → padre', async () => {
    const byName = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, search: 'ZAPATO' }, imageUrl);
    expect(byName.data.map((p) => p.id)).toEqual([1]);
    const byDescription = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, search: 'formal' }, imageUrl);
    expect(byDescription.data.map((p) => p.id)).toEqual([1]);
    const byVariantSku = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, search: 'zap-001-38' }, imageUrl);
    expect(byVariantSku.data.map((p) => p.id)).toEqual([1]);
    const byVariantBarcode = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, search: '7700000038' }, imageUrl);
    expect(byVariantBarcode.data.map((p) => p.id)).toEqual([1]);
    const partialBarcode = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, search: '77000000' }, imageUrl);
    expect(partialBarcode.total).toBe(0);
  });

  it('filtra por categoría y admite includeVariants / status', async () => {
    const accesorios = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, category_id: 2 }, imageUrl);
    expect(accesorios.data.map((p) => p.id)).toEqual([4, 6]);
    const conVariantes = await posOfflineReads.getProductsPaginated({ organizationId: ORG, branchId: BRANCH, includeVariants: true, status: 'all', limit: 20 }, imageUrl);
    expect(conVariantes.total).toBe(6);
  });

  it('getProductVariants: activas por nombre, con precio e imagen heredada del padre', async () => {
    const variants = await posOfflineReads.getProductVariants(ORG, 1, imageUrl);
    expect(variants.map((v) => v.id)).toEqual([2]);
    expect(variants[0].price).toBe(121000);
    expect(variants[0].image).toBe('https://cdn.test/products/zapato.jpg');
    expect(variants[0].categories?.name).toBe('Calzado');
  });

  it('getProductByBarcode y getProductById respetan la organización', async () => {
    expect((await posOfflineReads.getProductByBarcode(ORG, '7700000001'))?.id).toBe(1);
    expect(await posOfflineReads.getProductByBarcode(ORG, 'no-existe')).toBeNull();
    const byId = await posOfflineReads.getProductById(ORG, 1);
    expect(byId).toMatchObject({ id: 1, price: 120000, category: { name: 'Calzado' } });
    expect(await posOfflineReads.getProductById(ORG, 7)).toBeNull();
  });
});

describe('categorías, clientes, pagos, monedas e impuestos', () => {
  beforeEach(seed);

  it('categorías por rank y ranking con favorita (ventas 90 d = 0)', async () => {
    expect((await posOfflineReads.getCategories(ORG)).map((c) => c.name)).toEqual(['Accesorios', 'Calzado']);
    expect(await posOfflineReads.getCategoryRanking(ORG)).toEqual({ 1: { is_favorite: false, sales_count_90d: 0 }, 2: { is_favorite: true, sales_count_90d: 0 } });
  });

  it('clientes por nombre, correo, teléfono, documento y empresa; sin término devuelve hasta 50 por nombre', async () => {
    expect((await posOfflineReads.searchCustomers(ORG, 'ANA')).map((c) => c.id)).toEqual(['c1']);
    expect((await posOfflineReads.searchCustomers(ORG, 'example.com')).map((c) => c.id)).toEqual(['c1']);
    expect((await posOfflineReads.searchCustomers(ORG, '300111')).map((c) => c.id)).toEqual(['c1']);
    expect((await posOfflineReads.searchCustomers(ORG, '10203')).map((c) => c.id)).toEqual(['c2']);
    expect((await posOfflineReads.searchCustomers(ORG, 'norte')).map((c) => c.id)).toEqual(['c3']);
    expect((await posOfflineReads.searchCustomers(ORG, undefined)).map((c) => c.full_name)).toEqual(['Ana Pérez', 'Bruno Díaz', 'Carla Ruiz']);
  });

  it('métodos de pago con la forma cruda del join, monedas con la base primero, impuestos por nombre y por producto', async () => {
    const methods = await posOfflineReads.getPaymentMethodRows(ORG);
    expect(methods.map((m) => m.payment_method_code).sort()).toEqual(['cash', 'nequi']);
    expect(methods.find((m) => m.payment_method_code === 'cash')?.payment_methods?.name).toBe('Efectivo');

    expect((await posOfflineReads.getCurrencyRows(ORG)).map((c) => c.code)).toEqual(['COP', 'USD']);

    expect((await posOfflineReads.getOrganizationTaxes(ORG)).map((t) => t.name)).toEqual(['INC 8%', 'IVA 19%']);
    const productTaxes = await posOfflineReads.getProductTaxes(ORG, 1);
    expect(productTaxes).toHaveLength(1);
    expect(productTaxes[0]).toMatchObject({ product_id: 1, tax_id: 't-iva', organization_taxes: { name: 'IVA 19%' } });
    expect(await posOfflineReads.getProductTaxes(ORG, 4)).toEqual([]);
  });
});
