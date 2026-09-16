/**
 * Lecturas del POS resueltas sobre el catálogo local (`goadmin-catalog`)
 * cuando Go Admin Desktop está sin red. Fase 4A.
 *
 * Cada función devuelve EXACTAMENTE la misma forma que su equivalente
 * online de `posService.ts`, que las llama al inicio de cada lectura con
 * `if (POSService.usesLocalCatalog()) return posOfflineReads.X(...)`.
 * Aquí no hay SQL ni conocimiento de Supabase: solo filtros en memoria
 * sobre las filas replicadas por `catalogReplicator.ts`.
 *
 * Límites conocidos (documentados en FASE-4A-LECTURA-OFFLINE.md):
 *  - El ranking de ventas de 90 días (`pos_product_ranking`) no se replica:
 *    el orden es favoritos → nombre, y `sales_count_90d` siempre es 0.
 *  - La búsqueda por nombre de modificador (grupo/opción) no está: solo se
 *    replican los ids de los grupos, para el indicador «tiene modificadores».
 *  - Clientes: solo los 2000 más recientes de la organización.
 */

import {
  getCatalogRow,
  getCatalogRowsByIndex,
  getCatalogRowsByOrg,
  getCatalogRowsByProducts,
  getCatalogStatus,
  type CatalogCategory,
  type CatalogCustomer,
  type CatalogProduct,
  type CatalogProductImage,
  type CatalogProductPrice,
  type CatalogStatus,
  type CatalogStockLevel,
} from './catalogStore';

/** Mensaje único para «no hay catálogo local todavía». */
export const CATALOG_NOT_REPLICATED_MESSAGE = 'Catálogo local aún no replicado: conecta a internet una vez';

export class CatalogNotReplicatedError extends Error {
  constructor() {
    super(CATALOG_NOT_REPLICATED_MESSAGE);
    this.name = 'CatalogNotReplicatedError';
  }
}

export function isCatalogNotReplicatedError(err: unknown): err is CatalogNotReplicatedError {
  return err instanceof CatalogNotReplicatedError || (err instanceof Error && err.message === CATALOG_NOT_REPLICATED_MESSAGE);
}

/** Resuelve la URL pública de una imagen de Storage; lo aporta posService. */
export type ImageUrlResolver = (storagePath: string) => string;

async function requireCatalog(organizationId: number): Promise<CatalogStatus> {
  const status = await getCatalogStatus(organizationId);
  if (status.isEmpty) throw new CatalogNotReplicatedError();
  return status;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase();
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

/** Precio vigente: el de `effective_from` más reciente (igual que online). */
function currentPrice(prices: CatalogProductPrice[]): CatalogProductPrice | null {
  if (prices.length === 0) return null;
  return [...prices].sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
}

function groupBy<T, K extends string | number>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function sumStock(rows: CatalogStockLevel[], branchId: number | null): { qty_on_hand: number; qty_reserved: number } {
  let on = 0;
  let reserved = 0;
  for (const s of rows) {
    if (branchId !== null && s.branch_id !== branchId) continue;
    on += num(s.qty_on_hand);
    reserved += num(s.qty_reserved);
  }
  return { qty_on_hand: on, qty_reserved: reserved };
}

// ── Productos ──

export interface OfflineProductsPaginatedParams {
  organizationId: number;
  /** null = todas las sucursales (consolidado). */
  branchId: number | null;
  page?: number;
  limit?: number;
  search?: string;
  category_id?: number | null;
  status?: string;
  includeVariants?: boolean;
}

/**
 * Equivalente offline de `POSService.getProductsPaginated`. Reproduce la
 * búsqueda de `pos_product_ranking` (sku/nombre/descripción `ILIKE`, barcode
 * exacto, y variantes hijas → padre) y el enriquecimiento del servicio.
 */
export async function getProductsPaginated(params: OfflineProductsPaginatedParams, imageUrl: ImageUrlResolver) {
  const { organizationId, branchId, page = 1, limit = 12, search = '', category_id = null, status = 'active', includeVariants = false } = params;
  await requireCatalog(organizationId);

  const all = await getCatalogRowsByOrg('products', organizationId);
  const term = norm(search.trim());
  const hasSearch = term.length > 0;

  // Padres alcanzados por una variante hija que coincide con la búsqueda.
  const parentsByVariantMatch = new Set<number>();
  if (hasSearch) {
    for (const p of all) {
      if (p.parent_product_id === null) continue;
      if (norm(p.sku).includes(term) || norm(p.name).includes(term) || (p.barcode ?? '') === search.trim()) {
        parentsByVariantMatch.add(p.parent_product_id);
      }
    }
  }

  const matches = all.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (!includeVariants && p.parent_product_id !== null) return false;
    if (category_id !== null && p.category_id !== category_id) return false;
    if (!hasSearch) return true;
    return (
      norm(p.sku).includes(term) ||
      norm(p.name).includes(term) ||
      norm(p.description).includes(term) ||
      (p.barcode ?? '') === search.trim() ||
      parentsByVariantMatch.has(p.id)
    );
  });

  // Sin ventas de 90 días en local: favoritos primero, luego nombre.
  matches.sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    return byName !== 0 ? byName : a.id - b.id;
  });

  const total = matches.length;
  const pageRows = matches.slice((page - 1) * limit, page * limit);
  if (pageRows.length === 0) {
    return { data: [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  const productIds = pageRows.map((p) => p.id);
  const parentIds = pageRows.filter((p) => p.is_parent).map((p) => p.id);
  const variants = (
    await Promise.all(parentIds.map((id) => getCatalogRowsByIndex('products', 'by_org_parent', [organizationId, id])))
  ).flat();
  const activeVariants = variants.filter((v) => v.status === 'active');
  const variantCount = new Map<number, number>();
  const variantToParent = new Map<number, number>();
  for (const v of activeVariants) {
    variantCount.set(v.parent_product_id as number, (variantCount.get(v.parent_product_id as number) ?? 0) + 1);
  }
  for (const v of variants) variantToParent.set(v.id, v.parent_product_id as number);

  const [images, modifierGroups, stockRows, prices, recipes, variantStockRows] = await Promise.all([
    getCatalogRowsByProducts('product_images', productIds),
    getCatalogRowsByProducts('product_modifier_groups', productIds),
    getCatalogRowsByProducts('stock_levels', productIds),
    getCatalogRowsByProducts('product_prices', productIds),
    getCatalogRowsByProducts('product_recipes', productIds),
    getCatalogRowsByProducts(
      'stock_levels',
      variants.map((v) => v.id),
    ),
  ]);
  const categoryIds = [...new Set(pageRows.map((p) => p.category_id).filter((id): id is number => id !== null))];
  const categories = await Promise.all(categoryIds.map((id) => getCatalogRow('categories', id)));
  const categoriesMap = new Map<number, CatalogCategory>();
  for (const c of categories) if (c) categoriesMap.set(c.id, c);

  const imagesByProduct = groupBy(images, (i) => i.product_id);
  const withModifiers = new Set(modifierGroups.map((g) => g.product_id));
  const stockByProduct = groupBy(stockRows, (s) => s.product_id);
  const pricesByProduct = groupBy(prices, (p) => p.product_id);
  const recipeByProduct = new Map<number, { id: number; name: string | null }>();
  for (const r of recipes) if (!recipeByProduct.has(r.product_id)) recipeByProduct.set(r.product_id, { id: r.id, name: r.name });
  const variantStockByParent = new Map<number, CatalogStockLevel[]>();
  for (const s of variantStockRows) {
    const parent = variantToParent.get(s.product_id);
    if (parent === undefined) continue;
    const list = variantStockByParent.get(parent) ?? [];
    list.push(s);
    variantStockByParent.set(parent, list);
  }

  const data = pageRows.map((product) => {
    const own = sumStock(stockByProduct.get(product.id) ?? [], branchId);
    const fromVariants = sumStock(variantStockByParent.get(product.id) ?? [], branchId);
    const stockQty = own.qty_on_hand + fromVariants.qty_on_hand;
    const reservedQty = own.qty_reserved + fromVariants.qty_reserved;
    const price = currentPrice(pricesByProduct.get(product.id) ?? []);
    const productImages = imagesByProduct.get(product.id) ?? [];
    const recipe = recipeByProduct.get(product.id);
    return {
      ...product,
      category: categoriesMap.get(product.category_id as number) ?? null,
      price: price ? num(price.price) : null,
      compare_price: price?.compare_price != null ? num(price.compare_price) : null,
      product_images: productImages,
      has_variants: product.is_parent === true,
      variant_count: variantCount.get(product.id) ?? 0,
      has_modifiers: withModifiers.has(product.id),
      track_stock: product.track_stock,
      stock_quantity: stockQty,
      qty_reserved: reservedQty,
      is_out_of_stock: product.track_stock === true && stockQty <= 0,
      is_favorite: product.is_favorite,
      sales_count_90d: 0,
      has_recipe: recipe !== undefined,
      recipe_id: recipe?.id ?? null,
      recipe_name: recipe?.name ?? null,
      image: productImages[0]?.storage_path ? imageUrl(productImages[0].storage_path) : null,
    };
  });

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Equivalente offline de `POSService.getProductVariants`. */
export async function getProductVariants(organizationId: number, parentProductId: number, imageUrl: ImageUrlResolver) {
  await requireCatalog(organizationId);
  const variants = (await getCatalogRowsByIndex('products', 'by_org_parent', [organizationId, parentProductId]))
    .filter((v) => v.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const ids = variants.map((v) => v.id);
  const [images, prices, parentImages] = await Promise.all([
    getCatalogRowsByProducts('product_images', ids),
    getCatalogRowsByProducts('product_prices', ids),
    getCatalogRowsByProducts('product_images', [parentProductId]),
  ]);
  const imagesByProduct = groupBy(images, (i) => i.product_id);
  const pricesByProduct = groupBy(prices, (p) => p.product_id);
  const parentImage: CatalogProductImage | undefined = parentImages.find((i) => i.is_primary) ?? parentImages[0];
  const categoryIds = [...new Set(variants.map((v) => v.category_id).filter((id): id is number => id !== null))];
  const categories = new Map<number, CatalogCategory>();
  for (const c of await Promise.all(categoryIds.map((id) => getCatalogRow('categories', id)))) if (c) categories.set(c.id, c);

  return variants.map((variant) => {
    const own = imagesByProduct.get(variant.id) ?? [];
    const primary = own.find((i) => i.is_primary) ?? own[0];
    const price = currentPrice(pricesByProduct.get(variant.id) ?? []);
    const category = variant.category_id !== null ? categories.get(variant.category_id) : undefined;
    return {
      ...variant,
      categories: category
        ? { id: category.id, name: category.name, slug: category.slug, station: category.station, requires_preparation: category.requires_preparation }
        : null,
      product_prices: price ? [{ price: price.price }] : [],
      price: price ? num(price.price) : null,
      product_images: own.length > 0 ? own : parentImages,
      image: primary?.storage_path ? imageUrl(primary.storage_path) : parentImage?.storage_path ? imageUrl(parentImage.storage_path) : null,
    };
  });
}

/** Equivalente offline de `POSService.getProductByBarcode` (fila cruda de `products`). */
export async function getProductByBarcode(organizationId: number, barcode: string): Promise<CatalogProduct | null> {
  await requireCatalog(organizationId);
  const rows = await getCatalogRowsByIndex('products', 'by_org_barcode', [organizationId, barcode]);
  return rows.find((p) => p.status === 'active') ?? null;
}

/** Equivalente offline de `POSService.getProductById` (forma reducida del servicio). */
export async function getProductById(organizationId: number, productId: number) {
  await requireCatalog(organizationId);
  const product = await getCatalogRow('products', productId);
  if (!product || product.organization_id !== organizationId) return null;
  const [prices, category] = await Promise.all([
    getCatalogRowsByProducts('product_prices', [productId]),
    product.category_id !== null ? getCatalogRow('categories', product.category_id) : Promise.resolve(undefined),
  ]);
  const price = currentPrice(prices);
  return {
    id: product.id,
    organization_id: product.organization_id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    barcode: product.barcode,
    price: price ? num(price.price) : 0,
    cost: 0,
    stock_quantity: 0,
    min_stock_level: 0,
    category_id: product.category_id,
    category: category ? { id: category.id, name: category.name, station: category.station, requires_preparation: category.requires_preparation } : null,
    unit_code: product.unit_code,
    status: product.status,
    image: undefined,
    created_at: product.created_at,
    updated_at: product.updated_at,
    tag_id: product.tag_id,
    parent_product_id: product.parent_product_id,
  };
}

// ── Categorías ──

/** Equivalente offline de `POSService.getCategories` (orden por `rank`). */
export async function getCategories(organizationId: number): Promise<CatalogCategory[]> {
  await requireCatalog(organizationId);
  const rows = await getCatalogRowsByOrg('categories', organizationId);
  return rows.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.id - b.id);
}

/** Equivalente offline de `POSService.getCategoryRanking`: favorita sí, ventas 90 d no (0). */
export async function getCategoryRanking(organizationId: number): Promise<Record<number, { is_favorite: boolean; sales_count_90d: number }>> {
  await requireCatalog(organizationId);
  const rows = await getCatalogRowsByOrg('categories', organizationId);
  const map: Record<number, { is_favorite: boolean; sales_count_90d: number }> = {};
  for (const c of rows) map[c.id] = { is_favorite: c.is_favorite, sales_count_90d: 0 };
  return map;
}

// ── Clientes ──

const CUSTOMER_SEARCH_FIELDS: Array<keyof CatalogCustomer> = ['full_name', 'email', 'phone', 'doc_number', 'company_name', 'trade_name', 'identification_number'];

/** Equivalente offline de `POSService.searchCustomers` (mismos campos y límites). */
export async function searchCustomers(organizationId: number, search: string | undefined): Promise<CatalogCustomer[]> {
  await requireCatalog(organizationId);
  const rows = await getCatalogRowsByOrg('customers', organizationId);
  const term = norm(search?.trim());
  const filtered = term
    ? rows.filter((c) => CUSTOMER_SEARCH_FIELDS.some((f) => norm(c[f] as string | null).includes(term)))
    : rows;
  return filtered
    .sort((a, b) => norm(a.full_name).localeCompare(norm(b.full_name), 'es'))
    .slice(0, term ? 20 : 50);
}

// ── Métodos de pago, monedas e impuestos ──

/** Filas crudas de `organization_payment_methods` (posService las mapea). */
export async function getPaymentMethodRows(organizationId: number) {
  await requireCatalog(organizationId);
  return (await getCatalogRowsByOrg('payment_methods', organizationId)).filter((m) => m.is_active !== false);
}

/** Filas con la forma de `get_organization_currencies` (posService las mapea). */
export async function getCurrencyRows(organizationId: number) {
  await requireCatalog(organizationId);
  return (await getCatalogRowsByOrg('currencies', organizationId)).sort((a, b) => Number(!!b.is_base) - Number(!!a.is_base) || a.code.localeCompare(b.code));
}

/** Equivalente offline de `POSService.getOrganizationTaxes` (activos, por nombre). */
export async function getOrganizationTaxes(organizationId: number) {
  await requireCatalog(organizationId);
  return (await getCatalogRowsByOrg('organization_taxes', organizationId))
    .filter((t) => t.is_active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Equivalente offline de `POSService.getProductTaxes`. */
export async function getProductTaxes(organizationId: number, productId: number) {
  await requireCatalog(organizationId);
  const relations = await getCatalogRowsByProducts('product_tax_relations', [productId]);
  if (relations.length === 0) return [];
  const taxIds = new Set(relations.map((r) => r.tax_id));
  const taxes = (await getCatalogRowsByOrg('organization_taxes', organizationId)).filter((t) => taxIds.has(t.id) && t.is_active !== false);
  return taxes.map((tax) => ({ product_id: productId, tax_id: tax.id, organization_taxes: tax }));
}

export const posOfflineReads = {
  getProductsPaginated,
  getProductVariants,
  getProductByBarcode,
  getProductById,
  getCategories,
  getCategoryRanking,
  searchCustomers,
  getPaymentMethodRows,
  getCurrencyRows,
  getOrganizationTaxes,
  getProductTaxes,
};

export type PosOfflineReads = typeof posOfflineReads;
