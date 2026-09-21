/**
 * Catálogo local del POS para Go Admin Desktop (fase 4A, lectura offline).
 *
 * IndexedDB `goadmin-catalog`, independiente de `goadmin-offline` (la caché
 * por URL de `offlineCache.ts`). Aquí no se guardan respuestas HTTP sino
 * filas por entidad, con índices por organización (y sucursal donde aplica),
 * para que `posOfflineReads.ts` pueda paginar, buscar y filtrar sin red
 * aunque esa combinación exacta de búsqueda nunca se haya pedido antes.
 *
 * Todas las filas llevan `organization_id` (se añade al escribir en las
 * tablas que no lo tienen en Postgres: precios, imágenes, stock, relaciones
 * de impuestos). El catálogo es solo lectura desde la UI: lo escribe
 * `catalogReplicator.ts`.
 *
 * Solo tiene sentido en Desktop; en navegador nada lo abre.
 *
 * La capa IndexedDB (apertura versionada, promesas sobre peticiones y
 * transacciones, claves compuestas) es la genérica de `offlineDb.ts`
 * (fase 4C): aquí solo queda la forma de las filas del POS.
 */

import { closeIdb, keyToString, openIdb, requestToPromise, txDone, KEY_SEP, type IdbStoreDef } from './offlineDb';

export const CATALOG_DB_NAME = 'goadmin-catalog';
export const CATALOG_DB_VERSION = 1;

export const CATALOG_STORES = [
  'products',
  'product_prices',
  'product_images',
  'stock_levels',
  'categories',
  'customers',
  'payment_methods',
  'organization_taxes',
  'product_tax_relations',
  'currencies',
  'product_modifier_groups',
  'product_recipes',
] as const;

export type CatalogStoreName = (typeof CATALOG_STORES)[number];

const META_STORE = 'meta';

/** Definición de cada store: clave e índices. Todos llevan `by_org`. */
const STORE_DEFS: Record<CatalogStoreName, IdbStoreDef> = {
  products: {
    keyPath: 'id',
    indexes: [
      { name: 'by_org_parent', keyPath: ['organization_id', 'parent_product_id'] },
      { name: 'by_org_barcode', keyPath: ['organization_id', 'barcode'] },
      { name: 'by_org_category', keyPath: ['organization_id', 'category_id'] },
    ],
  },
  product_prices: { keyPath: 'id', indexes: [{ name: 'by_product', keyPath: 'product_id' }] },
  product_images: { keyPath: 'id', indexes: [{ name: 'by_product', keyPath: 'product_id' }] },
  stock_levels: {
    keyPath: 'id',
    indexes: [
      { name: 'by_org_branch', keyPath: ['organization_id', 'branch_id'] },
      { name: 'by_product', keyPath: 'product_id' },
    ],
  },
  categories: { keyPath: 'id', indexes: [] },
  customers: { keyPath: 'id', indexes: [] },
  payment_methods: { keyPath: ['organization_id', 'payment_method_code'], indexes: [] },
  organization_taxes: { keyPath: 'id', indexes: [] },
  product_tax_relations: { keyPath: ['product_id', 'tax_id'], indexes: [{ name: 'by_product', keyPath: 'product_id' }] },
  currencies: { keyPath: ['organization_id', 'code'], indexes: [] },
  product_modifier_groups: { keyPath: 'id', indexes: [{ name: 'by_product', keyPath: 'product_id' }] },
  product_recipes: { keyPath: 'id', indexes: [{ name: 'by_product', keyPath: 'product_id' }] },
};

// ── Tipos de las filas replicadas (columnas verificadas por MCP, 2026-09-16) ──

export interface CatalogProduct {
  id: number;
  organization_id: number;
  uuid?: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  status: string | null;
  category_id: number | null;
  unit_code: string | null;
  parent_product_id: number | null;
  is_parent: boolean | null;
  variant_data: unknown;
  track_stock: boolean;
  track_serial: boolean | null;
  tag_id: number | null;
  station: string | null;
  product_type: string | null;
  production_type: string | null;
  is_composite: boolean | null;
  brand: string | null;
  reference: string | null;
  warranty_months: number | null;
  created_at: string | null;
  updated_at: string | null;
  /** Derivado de `product_favorites` al replicar. */
  is_favorite: boolean;
}

export interface CatalogProductPrice {
  id: number;
  organization_id: number;
  product_id: number;
  price: number | string;
  compare_price: number | string | null;
  effective_from: string;
  effective_to: string | null;
}

export interface CatalogProductImage {
  id: number;
  organization_id: number;
  product_id: number;
  storage_path: string;
  is_primary: boolean | null;
  display_order: number;
}

export interface CatalogStockLevel {
  id: number;
  organization_id: number;
  product_id: number;
  branch_id: number;
  lot_id: number | null;
  qty_on_hand: number | string | null;
  qty_reserved: number | string | null;
}

export interface CatalogCategory {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  rank: number;
  icon: string | null;
  color: string | null;
  image_url: string | null;
  description: string | null;
  is_active: boolean | null;
  display_order: number | null;
  requires_preparation: boolean | null;
  station: string | null;
  branch_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  /** Derivado de `category_favorites` al replicar. */
  is_favorite: boolean;
}

export interface CatalogCustomer {
  id: string;
  organization_id: number;
  branch_id: number | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  doc_type: string | null;
  doc_number: string | null;
  identification_type: string | null;
  identification_number: string | null;
  company_name: string | null;
  trade_name: string | null;
  address: string | null;
  city: string | null;
  customer_type: string;
  avatar_url: string | null;
  roles: string[] | null;
  tags: string[] | null;
  preferences: unknown;
  fiscal_municipality_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  /**
   * Fase 4D: true si el cliente se creó sin red y aún no está en Supabase
   * (vive en `customersOutbox`). Las filas replicadas no traen el campo.
   */
  pending_sync?: boolean;
}

/** Misma forma que la fila de `organization_payment_methods` con el join. */
export interface CatalogPaymentMethod {
  organization_id: number;
  payment_method_code: string;
  is_active: boolean | null;
  settings: Record<string, unknown> | null;
  payment_methods: { name: string } | null;
}

export interface CatalogOrganizationTax {
  id: string;
  organization_id: number;
  template_id: number | null;
  name: string;
  rate: number | string;
  description: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  tax_included: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CatalogProductTaxRelation {
  organization_id: number;
  product_id: number;
  tax_id: string;
}

/** Misma forma que devuelve la RPC `get_organization_currencies`. */
export interface CatalogCurrency {
  organization_id: number;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  auto_update: boolean | null;
  is_base: boolean | null;
  org_auto_update: boolean | null;
}

export interface CatalogModifierGroup {
  id: number;
  organization_id: number;
  product_id: number;
}

export interface CatalogRecipe {
  id: number;
  organization_id: number;
  product_id: number;
  name: string | null;
}

export interface CatalogRowMap {
  products: CatalogProduct;
  product_prices: CatalogProductPrice;
  product_images: CatalogProductImage;
  stock_levels: CatalogStockLevel;
  categories: CatalogCategory;
  customers: CatalogCustomer;
  payment_methods: CatalogPaymentMethod;
  organization_taxes: CatalogOrganizationTax;
  product_tax_relations: CatalogProductTaxRelation;
  currencies: CatalogCurrency;
  product_modifier_groups: CatalogModifierGroup;
  product_recipes: CatalogRecipe;
}

export interface CatalogStoreMeta {
  /** `${store}:${organization_id}` */
  key: string;
  store: CatalogStoreName;
  organization_id: number;
  /** ms epoch de la última replicación completa de ese store. */
  replicated_at: number;
  count: number;
}

/**
 * Entrada genérica del store `meta` (fase 4F): estado local que no es una
 * fila replicada, p. ej. la caja abierta sin red (`cashOutbox.ts`). Se
 * distingue de `CatalogStoreMeta` por `kind`; `getCatalogStatus` la ignora.
 */
export interface CatalogMetaEntry<T = unknown> {
  key: string;
  kind: string;
  organization_id: number;
  value: T;
  updated_at: number;
}

export interface CatalogStatus {
  organization_id: number;
  /** true si `products` no se ha replicado nunca para la organización. */
  isEmpty: boolean;
  productsCount: number;
  customersCount: number;
  /** ms epoch de la replicación más antigua entre los stores replicados, o null. */
  replicatedAt: number | null;
  stores: Partial<Record<CatalogStoreName, { replicated_at: number; count: number }>>;
}

// ── Apertura (capa genérica de offlineDb.ts) ──

export function isCatalogAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Stores del catálogo con el índice `by_org` que llevan todos. */
function catalogStoreDefs(): Record<string, IdbStoreDef> {
  const defs: Record<string, IdbStoreDef> = {};
  for (const name of CATALOG_STORES) {
    const def = STORE_DEFS[name];
    defs[name] = { keyPath: def.keyPath, indexes: [{ name: 'by_org', keyPath: 'organization_id' }, ...def.indexes] };
  }
  return defs;
}

function openCatalogDB(): Promise<IDBDatabase> {
  return openIdb(CATALOG_DB_NAME, CATALOG_DB_VERSION, catalogStoreDefs(), META_STORE);
}

/** Cierra la conexión (tests y cambio de versión). */
export function closeCatalogDB(): Promise<void> {
  return closeIdb(CATALOG_DB_NAME);
}

// ── Escritura (la usa el replicador) ──

/** Inserta o reemplaza un lote de filas en `store` (una sola transacción). */
export async function putCatalogRows<S extends CatalogStoreName>(store: S, rows: CatalogRowMap[S][]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const row of rows) os.put(row);
  await txDone(tx);
}

/** Borra una fila por clave primaria (fase 4D: remapeo de un cliente local al id del servidor). */
export async function deleteCatalogRow(store: CatalogStoreName, key: IDBValidKey): Promise<void> {
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

/**
 * Borra de `store` las filas de la organización cuya clave primaria NO esté
 * en `keepKeys`. Se llama al terminar una replicación completa para retirar
 * lo que ya no existe en el servidor (productos eliminados, precios cerrados).
 */
export async function pruneCatalogRows(store: CatalogStoreName, organizationId: number, keepKeys: Set<string>): Promise<number> {
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  // `getAllKeys` sobre el índice devuelve las claves primarias de la
  // organización de una vez (un cursor fila a fila es mucho más lento).
  const primaryKeys = await requestToPromise(os.index('by_org').getAllKeys(IDBKeyRange.only(organizationId)));
  let removed = 0;
  for (const key of primaryKeys) {
    if (keepKeys.has(keyToString(key))) continue;
    os.delete(key);
    removed++;
  }
  await txDone(tx);
  return removed;
}

export { keyToString };

/** Clave primaria de una fila según la definición del store. */
export function rowKey<S extends CatalogStoreName>(store: S, row: CatalogRowMap[S]): string {
  const kp = STORE_DEFS[store].keyPath;
  const r = row as unknown as Record<string, unknown>;
  return Array.isArray(kp) ? kp.map((k) => String(r[k])).join(KEY_SEP) : String(r[kp]);
}

export async function setCatalogStoreMeta(store: CatalogStoreName, organizationId: number, replicatedAt: number, count: number): Promise<void> {
  const db = await openCatalogDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  const meta: CatalogStoreMeta = { key: `${store}:${organizationId}`, store, organization_id: organizationId, replicated_at: replicatedAt, count };
  tx.objectStore(META_STORE).put(meta);
  await txDone(tx);
}

// ── Meta genérica (fase 4F: estado local de caja) ──

export async function putCatalogMeta<T>(entry: Omit<CatalogMetaEntry<T>, 'updated_at'>): Promise<void> {
  const db = await openCatalogDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  tx.objectStore(META_STORE).put({ ...entry, updated_at: Date.now() } satisfies CatalogMetaEntry<T>);
  await txDone(tx);
}

export async function getCatalogMeta<T>(key: string): Promise<CatalogMetaEntry<T> | null> {
  const db = await openCatalogDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const row = (await requestToPromise(tx.objectStore(META_STORE).get(key))) as CatalogMetaEntry<T> | undefined;
  return row && typeof row.kind === 'string' ? row : null;
}

/** Entradas genéricas de un `kind` para la organización. */
export async function listCatalogMeta<T>(kind: string, organizationId: number): Promise<CatalogMetaEntry<T>[]> {
  const db = await openCatalogDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const all = (await requestToPromise(tx.objectStore(META_STORE).getAll())) as Array<CatalogMetaEntry<T> | CatalogStoreMeta>;
  return all.filter((m): m is CatalogMetaEntry<T> => 'kind' in m && m.kind === kind && m.organization_id === organizationId);
}

export async function deleteCatalogMeta(key: string): Promise<void> {
  const db = await openCatalogDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  tx.objectStore(META_STORE).delete(key);
  await txDone(tx);
}

/** Vacía todo el catálogo (cambio de organización, soporte). */
export async function clearCatalog(): Promise<void> {
  if (!isCatalogAvailable()) return;
  const db = await openCatalogDB();
  const names = [...CATALOG_STORES, META_STORE];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await txDone(tx);
}

// ── Lectura (la usa posOfflineReads) ──

export async function getCatalogRowsByOrg<S extends CatalogStoreName>(store: S, organizationId: number): Promise<CatalogRowMap[S][]> {
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readonly');
  const result = await requestToPromise(tx.objectStore(store).index('by_org').getAll(IDBKeyRange.only(organizationId)));
  return result as CatalogRowMap[S][];
}

export async function getCatalogRowsByIndex<S extends CatalogStoreName>(store: S, indexName: string, key: IDBValidKey): Promise<CatalogRowMap[S][]> {
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readonly');
  const result = await requestToPromise(tx.objectStore(store).index(indexName).getAll(IDBKeyRange.only(key)));
  return result as CatalogRowMap[S][];
}

export async function getCatalogRow<S extends CatalogStoreName>(store: S, key: IDBValidKey): Promise<CatalogRowMap[S] | undefined> {
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readonly');
  const result = await requestToPromise(tx.objectStore(store).get(key));
  return result as CatalogRowMap[S] | undefined;
}

/** Filas de `store` cuyo `product_id` esté en `productIds` (índice `by_product`). */
export async function getCatalogRowsByProducts<S extends 'product_prices' | 'product_images' | 'stock_levels' | 'product_tax_relations' | 'product_modifier_groups' | 'product_recipes'>(
  store: S,
  productIds: number[],
): Promise<CatalogRowMap[S][]> {
  if (productIds.length === 0) return [];
  const db = await openCatalogDB();
  const tx = db.transaction(store, 'readonly');
  const index = tx.objectStore(store).index('by_product');
  const chunks = await Promise.all(productIds.map((id) => requestToPromise(index.getAll(IDBKeyRange.only(id)))));
  return chunks.flat() as CatalogRowMap[S][];
}

export async function getCatalogStatus(organizationId: number): Promise<CatalogStatus> {
  const empty: CatalogStatus = { organization_id: organizationId, isEmpty: true, productsCount: 0, customersCount: 0, replicatedAt: null, stores: {} };
  if (!isCatalogAvailable()) return empty;
  try {
    const db = await openCatalogDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const all = (await requestToPromise(tx.objectStore(META_STORE).getAll())) as Array<CatalogStoreMeta | CatalogMetaEntry>;
    const status: CatalogStatus = { ...empty, stores: {} };
    for (const meta of all) {
      // Las entradas genéricas (`kind`, fase 4F) no son stores replicados.
      if ('kind' in meta || typeof meta.replicated_at !== 'number') continue;
      if (meta.organization_id !== organizationId) continue;
      status.stores[meta.store] = { replicated_at: meta.replicated_at, count: meta.count };
      status.replicatedAt = status.replicatedAt === null ? meta.replicated_at : Math.min(status.replicatedAt, meta.replicated_at);
    }
    status.productsCount = status.stores.products?.count ?? 0;
    status.customersCount = status.stores.customers?.count ?? 0;
    status.isEmpty = status.stores.products === undefined;
    return status;
  } catch {
    return empty;
  }
}
