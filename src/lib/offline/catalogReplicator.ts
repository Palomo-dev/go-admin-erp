/**
 * Replicación del catálogo del POS al IndexedDB local (`goadmin-catalog`).
 * Fase 4A del Desktop: lectura offline de productos, precios, stock,
 * categorías, clientes, métodos de pago, impuestos y monedas.
 *
 * Cuándo corre (solo en Desktop y con red): al entrar al POS y a
 * `/app/inicio` (`useDesktopCatalog`), y cada 10 minutos en background.
 * Cómo: paginación PostgREST de 500 filas por petición, escribiendo cada
 * lote según llega para no retener todo en memoria ni bloquear la UI; al
 * terminar cada store se retiran las filas que ya no existen en el servidor
 * y se anota `replicated_at` en `meta`.
 *
 * Columnas verificadas por MCP el 2026-09-16 (ver
 * docs/desktop/FASE-4A-LECTURA-OFFLINE.md). Recordatorio de las trampas:
 * `products` NO tiene `price`/`cost`/`is_active`; los precios están en
 * `product_prices` con vigencia; `stock_levels.branch_id` es NOT NULL y las
 * filas sin lote (`lot_id IS NULL`) son las que consume el POS.
 */

import { supabase } from '@/lib/supabase/config';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { getStorageImageUrl } from '@/lib/utils/storageImageUrl';
import { restorePendingCustomersToCatalog } from './customersOutbox';
import { warmMediaCache, type FetchLike, type WarmMediaCacheResult } from './mediaCache';
import {
  CATALOG_STORES,
  getCatalogStatus,
  isCatalogAvailable,
  pruneCatalogRows,
  putCatalogRows,
  rowKey,
  setCatalogStoreMeta,
  type CatalogCategory,
  type CatalogCurrency,
  type CatalogCustomer,
  type CatalogModifierGroup,
  type CatalogOrganizationTax,
  type CatalogPaymentMethod,
  type CatalogProduct,
  type CatalogProductImage,
  type CatalogProductPrice,
  type CatalogProductTaxRelation,
  type CatalogRecipe,
  type CatalogRowMap,
  type CatalogStatus,
  type CatalogStockLevel,
  type CatalogStoreName,
} from './catalogStore';

/** Tamaño de página PostgREST y de los `IN (...)` por ids. */
export const REPLICATION_BATCH_SIZE = 500;
/** Clientes replicados: los 2000 más recientes por `updated_at`. */
export const CUSTOMERS_LIMIT = 2000;
/** Intervalo del refresco en background. */
export const REPLICATION_INTERVAL_MS = 10 * 60 * 1000;
/** Evento de `window` al terminar una replicación (detail: CatalogStatus). */
export const CATALOG_REPLICATED_EVENT = 'goadmin:catalog-replicated';

/**
 * Subconjunto del cliente de Supabase que usa el replicador. Se recibe por
 * parámetro para poder probarlo con un cliente falso; por defecto es el
 * cliente del navegador (`@/lib/supabase/config`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalogClient = Pick<typeof supabase, 'from' | 'rpc'> | { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

export interface ReplicateCatalogOptions {
  organizationId: number;
  client?: CatalogClient;
  /** Se llama tras cada store replicado (progreso para la UI). */
  onProgress?: (store: CatalogStoreName, count: number) => void;
  /**
   * Fase 4D: precalentar la caché de medios (`goadmin-media`) con la imagen
   * primaria de cada producto al terminar, en segundo plano. Por defecto sí
   * en Desktop; los tests lo apagan o inyectan `fetchImpl`.
   */
  warmMedia?: boolean;
  fetchImpl?: FetchLike;
  imageUrl?: (storagePath: string) => string;
}

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

function unwrap<T>(result: PageResult<T>, context: string): T[] {
  if (result.error) throw new Error(`[catálogo] ${context}: ${result.error.message}`);
  return result.data ?? [];
}

/**
 * Recorre una consulta PostgREST por páginas de `REPLICATION_BATCH_SIZE`
 * llamando a `onBatch` con cada lote. `build` recibe el cliente y devuelve
 * la consulta SIN `.range()`; se le añade `.order('id')` implícito por
 * `orderBy` para que la paginación sea estable.
 */
async function forEachPage<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<PageResult<T>> },
  onBatch: (rows: T[]) => Promise<void>,
  context: string,
  maxRows = Number.POSITIVE_INFINITY,
): Promise<number> {
  let from = 0;
  let total = 0;
  for (;;) {
    const to = Math.min(from + REPLICATION_BATCH_SIZE, maxRows) - 1;
    if (to < from) break;
    const rows = unwrap(await build().range(from, to), context);
    if (rows.length > 0) {
      await onBatch(rows);
      total += rows.length;
    }
    if (rows.length < to - from + 1) break;
    from = to + 1;
    // Ceder el hilo entre lotes: la UI del POS sigue respondiendo.
    await yieldToUi();
  }
  return total;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function chunk<T>(items: T[], size = REPLICATION_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Guarda un lote, recuerda sus claves y, al cerrar, poda y anota meta. */
class StoreWriter<S extends CatalogStoreName> {
  private keys = new Set<string>();
  private count = 0;
  constructor(private store: S, private organizationId: number) {}

  async write(rows: CatalogRowMap[S][]): Promise<void> {
    for (const row of rows) this.keys.add(rowKey(this.store, row));
    this.count += rows.length;
    await putCatalogRows(this.store, rows);
  }

  async finish(): Promise<number> {
    await pruneCatalogRows(this.store, this.organizationId, this.keys);
    await setCatalogStoreMeta(this.store, this.organizationId, Date.now(), this.count);
    return this.count;
  }
}

const PRODUCT_COLUMNS =
  'id, organization_id, uuid, sku, name, description, barcode, status, category_id, unit_code, parent_product_id, is_parent, variant_data, track_stock, track_serial, tag_id, station, product_type, production_type, is_composite, brand, reference, warranty_months, created_at, updated_at';

const CUSTOMER_COLUMNS =
  'id, organization_id, branch_id, first_name, last_name, full_name, email, phone, doc_type, doc_number, identification_type, identification_number, company_name, trade_name, address, city, customer_type, avatar_url, roles, tags, preferences, fiscal_municipality_id, created_at, updated_at';

let replicationInFlight: Promise<CatalogStatus> | null = null;

/**
 * Replica el catálogo completo de la organización. Idempotente y
 * reentrante: si ya hay una replicación en curso devuelve esa promesa.
 * Lanza si no hay IndexedDB o si alguna consulta falla (el llamador decide
 * si avisar; el catálogo anterior queda intacto salvo los stores ya
 * completados en esta pasada).
 */
export function replicateCatalog(options: ReplicateCatalogOptions): Promise<CatalogStatus> {
  if (replicationInFlight) return replicationInFlight;
  replicationInFlight = runReplication(options).finally(() => {
    replicationInFlight = null;
  });
  return replicationInFlight;
}

export function isCatalogReplicating(): boolean {
  return replicationInFlight !== null;
}

async function runReplication({ organizationId, client = supabase, onProgress, warmMedia, fetchImpl, imageUrl }: ReplicateCatalogOptions): Promise<CatalogStatus> {
  if (!isCatalogAvailable()) throw new Error('IndexedDB no disponible: no se puede replicar el catálogo');
  if (!organizationId) throw new Error('Sin organización activa: no se puede replicar el catálogo');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const org = organizationId;
  const report = (store: CatalogStoreName, count: number) => onProgress?.(store, count);

  // 1. Favoritos (pequeños) antes que productos y categorías, para fundirlos.
  const favoriteProductIds = new Set<number>(
    unwrap<{ product_id: number }>(await db.from('product_favorites').select('product_id').eq('organization_id', org), 'product_favorites').map((r) => r.product_id),
  );
  const favoriteCategoryIds = new Set<number>(
    unwrap<{ category_id: number }>(await db.from('category_favorites').select('category_id').eq('organization_id', org), 'category_favorites').map((r) => r.category_id),
  );

  // 2. Productos activos (padres y variantes), por páginas.
  const productIds: number[] = [];
  const products = new StoreWriter('products', org);
  await forEachPage<Omit<CatalogProduct, 'is_favorite'>>(
    () => db.from('products').select(PRODUCT_COLUMNS).eq('organization_id', org).eq('status', 'active').order('id'),
    async (rows) => {
      for (const r of rows) productIds.push(r.id);
      await products.write(rows.map((r) => ({ ...r, is_favorite: favoriteProductIds.has(r.id) })));
    },
    'products',
  );
  report('products', await products.finish());

  // 3. Tablas hijas por product_id, en trozos de 500 ids.
  const collectedImages: Array<{ storage_path: string }> = [];
  const prices = new StoreWriter('product_prices', org);
  const images = new StoreWriter('product_images', org);
  const taxRelations = new StoreWriter('product_tax_relations', org);
  for (const ids of chunk(productIds)) {
    const priceRows = unwrap<Omit<CatalogProductPrice, 'organization_id'>>(
      await db.from('product_prices').select('id, product_id, price, compare_price, effective_from, effective_to').in('product_id', ids).is('effective_to', null),
      'product_prices',
    );
    await prices.write(priceRows.map((r) => ({ ...r, organization_id: org })));

    const imageRows = unwrap<Omit<CatalogProductImage, 'organization_id'>>(
      await db.from('product_images').select('id, product_id, storage_path, is_primary, display_order').in('product_id', ids).order('display_order'),
      'product_images',
    );
    const primaryImages = pickPrimaryImages(imageRows);
    await images.write(primaryImages.map((r) => ({ ...r, organization_id: org })));
    collectedImages.push(...primaryImages.map((r) => ({ storage_path: r.storage_path })));

    const taxRows = unwrap<Omit<CatalogProductTaxRelation, 'organization_id'>>(
      await db.from('product_tax_relations').select('product_id, tax_id').in('product_id', ids),
      'product_tax_relations',
    );
    await taxRelations.write(taxRows.map((r) => ({ ...r, organization_id: org })));
    await yieldToUi();
  }
  report('product_prices', await prices.finish());
  report('product_images', await images.finish());
  report('product_tax_relations', await taxRelations.finish());

  // 4. Stock sin lote de todas las sucursales de la organización (permite
  //    cambiar de sucursal y el consolidado «todas» sin red).
  const branchIds = unwrap<{ id: number }>(await db.from('branches').select('id').eq('organization_id', org), 'branches').map((b) => b.id);
  const stock = new StoreWriter('stock_levels', org);
  if (branchIds.length > 0) {
    await forEachPage<Omit<CatalogStockLevel, 'organization_id'>>(
      () => db.from('stock_levels').select('id, product_id, branch_id, lot_id, qty_on_hand, qty_reserved').in('branch_id', branchIds).is('lot_id', null).order('id'),
      async (rows) => stock.write(rows.map((r) => ({ ...r, organization_id: org }))),
      'stock_levels',
    );
  }
  report('stock_levels', await stock.finish());

  // 5. Categorías (con favorita fundida).
  const categories = new StoreWriter('categories', org);
  await forEachPage<Omit<CatalogCategory, 'is_favorite'>>(
    () => db.from('categories').select('*').eq('organization_id', org).order('id'),
    async (rows) => categories.write(rows.map((r) => ({ ...r, is_favorite: favoriteCategoryIds.has(r.id) }))),
    'categories',
  );
  report('categories', await categories.finish());

  // 6. Clientes: los 2000 más recientes de la organización.
  const customers = new StoreWriter('customers', org);
  await forEachPage<CatalogCustomer>(
    () => db.from('customers').select(CUSTOMER_COLUMNS).eq('organization_id', org).order('updated_at', { ascending: false }).order('id'),
    async (rows) => customers.write(rows),
    'customers',
    CUSTOMERS_LIMIT,
  );
  report('customers', await customers.finish());
  // Fase 4D: la poda retiró los clientes creados sin red que aún no están en
  // Supabase; se vuelven a poner (con `pending_sync`) para que el POS los vea.
  try {
    await restorePendingCustomersToCatalog(org);
  } catch (err) {
    console.warn('[catálogo] No se pudieron restaurar los clientes pendientes:', err);
  }

  // 7. Métodos de pago activos, con el nombre del catálogo global.
  const paymentMethods = new StoreWriter('payment_methods', org);
  const pmRows = unwrap<Omit<CatalogPaymentMethod, 'organization_id'>>(
    await db.from('organization_payment_methods').select('payment_method_code, is_active, settings, payment_methods!inner ( name )').eq('organization_id', org).eq('is_active', true),
    'organization_payment_methods',
  );
  await paymentMethods.write(pmRows.map((r) => ({ ...r, organization_id: org })));
  report('payment_methods', await paymentMethods.finish());

  // 8. Impuestos activos.
  const taxes = new StoreWriter('organization_taxes', org);
  await taxes.write(unwrap<CatalogOrganizationTax>(await db.from('organization_taxes').select('*').eq('organization_id', org).eq('is_active', true), 'organization_taxes'));
  report('organization_taxes', await taxes.finish());

  // 9. Monedas: la misma RPC que usa el POS (lectura; también queda en la caché de RPC).
  const currencies = new StoreWriter('currencies', org);
  const currencyRows = unwrap<Omit<CatalogCurrency, 'organization_id'>>(await db.rpc('get_organization_currencies', { p_organization_id: org }), 'get_organization_currencies');
  await currencies.write(currencyRows.map((r) => ({ ...r, organization_id: org })));
  report('currencies', await currencies.finish());

  // 10. Grupos de modificadores (solo ids) y recetas activas (id + nombre).
  const modifierGroups = new StoreWriter('product_modifier_groups', org);
  await forEachPage<CatalogModifierGroup>(
    () => db.from('product_modifier_groups').select('id, organization_id, product_id').eq('organization_id', org).order('id'),
    async (rows) => modifierGroups.write(rows),
    'product_modifier_groups',
  );
  report('product_modifier_groups', await modifierGroups.finish());

  const recipes = new StoreWriter('product_recipes', org);
  await forEachPage<CatalogRecipe>(
    () => db.from('product_recipes').select('id, organization_id, product_id, name').eq('organization_id', org).eq('is_active', true).order('id'),
    async (rows) => recipes.write(rows),
    'product_recipes',
  );
  report('product_recipes', await recipes.finish());

  const status = await getCatalogStatus(org);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALOG_REPLICATED_EVENT, { detail: status }));
  }
  // Fase 4D: imágenes en segundo plano, sin retener la replicación.
  if (warmMedia ?? isDesktop()) {
    const urls = new Set(collectedImages.map((r) => (imageUrl ?? getStorageImageUrl)(r.storage_path)).filter(Boolean));
    void warmProductImages(urls, fetchImpl);
  }
  return status;
}

/**
 * Precalienta `goadmin-media` con las URLs públicas de las imágenes primarias
 * del catálogo. Lotes de 2, cede el hilo entre lotes y se detiene si se va
 * la red. Nunca lanza: un fallo aquí no afecta al catálogo.
 */
export async function warmProductImages(urls: Set<string>, fetchImpl?: FetchLike): Promise<WarmMediaCacheResult | null> {
  if (urls.size === 0) return null;
  try {
    return await warmMediaCache(urls, { fetchImpl, concurrency: 2, shouldContinue: () => isAppOnline() });
  } catch (err) {
    console.warn('[catálogo] Precalentado de imágenes fallido:', err);
    return null;
  }
}

/** Una imagen por producto: la primaria o, si no hay, la de menor `display_order`. */
export function pickPrimaryImages<T extends { product_id: number; is_primary: boolean | null; display_order: number }>(rows: T[]): T[] {
  const byProduct = new Map<number, T>();
  for (const row of rows) {
    const current = byProduct.get(row.product_id);
    if (!current) {
      byProduct.set(row.product_id, row);
      continue;
    }
    const rowWins = (row.is_primary && !current.is_primary) || (!!row.is_primary === !!current.is_primary && row.display_order < current.display_order);
    if (rowWins) byProduct.set(row.product_id, row);
  }
  return [...byProduct.values()];
}

// ── Planificador en background (solo Desktop) ──

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let scheduledOrgId: number | null = null;
/** Suscriptores vivos (POS, inicio, banner): el planificador para al llegar a 0. */
let subscribers = 0;

/**
 * Arranca (o reprograma) la replicación periódica para la organización.
 * Replica ya mismo si hay red y luego cada `REPLICATION_INTERVAL_MS`.
 * Fuera del Desktop no hace nada. Devuelve la función para darse de baja;
 * el intervalo se detiene cuando se da de baja el último suscriptor.
 */
export function startCatalogReplication(organizationId: number, client?: CatalogClient): () => void {
  if (!isDesktop() || !organizationId) return () => {};
  if (!intervalHandle || scheduledOrgId !== organizationId) {
    if (intervalHandle) clearInterval(intervalHandle);
    scheduledOrgId = organizationId;
    const tick = () => {
      if (!isAppOnline() || isCatalogReplicating()) return;
      replicateCatalog({ organizationId, client }).catch((err) => {
        console.warn('[catálogo] Replicación en background fallida:', err);
      });
    };
    tick();
    intervalHandle = setInterval(tick, REPLICATION_INTERVAL_MS);
  }
  subscribers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) stopCatalogReplication();
  };
}

export function stopCatalogReplication(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  scheduledOrgId = null;
  subscribers = 0;
}

export { CATALOG_STORES };
