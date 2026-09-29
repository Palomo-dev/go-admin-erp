import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { getTaxIncludedSetting } from '@/lib/utils/taxCalculations';
import { resolveLineTax } from '@/lib/services/taxResolver';
import { sinRetenciones } from '@/lib/services/taxResolverCore';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import { enqueueOfflineSale, shouldCheckoutOffline, newLocalUuid, newSaleId } from '@/lib/offline/salesOutbox';
import { buildCheckoutEnvelope, callCheckoutRpc, type LineaMesaSinCobrar } from '@/lib/offline/checkoutRpc';
import { enqueueOfflineCustomer, findLocalCustomerDuplicate, type OfflineCustomerPayload } from '@/lib/offline/customersOutbox';
import { posOfflineReads } from '@/lib/offline/posOfflineReads';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import {
  Product,
  Customer,
  Cart,
  CartItem,
  CartItemModifier,
  Sale,
  SaleItem,
  Payment,
  PaymentMethod,
  Currency,
  ProductFilter,
  CustomerFilter,
  CheckoutData,
  HoldWithDebtData,
  HoldWithDebtResult
} from '../../components/pos/types';

// URL pública de una imagen de Storage (compartida con el replicador del catálogo, fase 4D).
import { getStorageImageUrl } from '@/lib/utils/storageImageUrl';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { nombreVisibleMetodo, ordenarMetodosDeLaOrganizacion } from '@/lib/finanzas/metodosPagoOrganizacion';
import { precioVigente, importePrecioVigente, ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import { agotadoPorStock } from '@/lib/pos/stockDisponible';
import { calcularLineaVenta, totalesDeLineas } from '@/lib/pos/lineaVenta';
import { anularVentaEnServidor } from '@/lib/pos/anularVenta';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import {
  aplicarNotaALinea,
  aplicarRondaAlCarrito,
  type CambioNotaLinea,
  type RespuestaRonda,
} from '@/lib/pos/cocina/lineasCarrito';
import { decimalesCantidad, esMedido, redondearCantidadProducto } from '@/lib/pos/peso/modoVenta';
import type { Pesaje } from '@/lib/pos/peso/pesada';

export class POSService {
  /**
   * Organización activa, leída EN CADA acceso.
   *
   * Antes era `private static organizationId = getOrganizationId()`: un
   * inicializador de propiedad estática, que se evalúa una sola vez al cargar
   * el módulo. Si el usuario cambiaba de organización sin recargar la página
   * (la lista "Mis Organizaciones" navega con el router), o si el módulo se
   * cargaba antes de que hubiera organización en el almacenamiento, la clase
   * se quedaba clavada en la organización vieja —o en 0— y seguía sirviendo
   * productos, carritos y ventas del tenant anterior.
   */
  private static get organizationId(): number {
    const orgId = getOrganizationId();
    if (this.lastOrganizationId !== orgId) {
      // Cambió la organización: la sucursal cacheada es de la anterior.
      this.lastOrganizationId = orgId;
      this.branchId = null;
    }
    return orgId;
  }

  private static lastOrganizationId: number | null = null;
  private static branchId: number | null = null;

  /**
   * Fase 4A (Desktop): true cuando la app corre en Go Admin Desktop y el
   * health-check del proceso principal dice que NO hay red. Es el único
   * interruptor por el que las lecturas del POS pasan a resolverse sobre el
   * catálogo local (`posOfflineReads`) en vez de contra Supabase. Fuera del
   * Desktop siempre es false: la web no cambia.
   */
  static usesLocalCatalog(): boolean {
    return isDesktop() && !isAppOnline();
  }

  // Obtener branch_id dinámicamente (con detección de cambio de sucursal)
  private static async getBranchId(): Promise<number> {
    // 1. Verificar si el usuario cambió de sucursal en localStorage
    const localBranchId = getCurrentBranchId();
    if (localBranchId) {
      if (this.branchId !== localBranchId) {
        this.branchId = localBranchId;
      }
      return localBranchId;
    }

    // 2. Si no hay sucursal en localStorage, usar cache si existe
    if (this.branchId) return this.branchId;

    // 3. Consultar la primera branch de la organización
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('id')
        .limit(1)
        .single();

      if (error) throw error;
      this.branchId = data.id;
      return data.id;
    } catch (error) {
      console.warn('Error getting branch_id, querying all branches:', error);
      // 3. Último recurso: buscar sin filtro de is_active
      try {
        const { data: fallbackData } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', this.organizationId)
          .order('id')
          .limit(1)
          .single();
        if (fallbackData) {
          this.branchId = fallbackData.id;
          return fallbackData.id;
        }
      } catch (e) {
        console.error('No branches found for organization:', this.organizationId, e);
      }
      throw new Error(`No se encontró ninguna sucursal para la organización ${this.organizationId}`);
    }
  }

  // ===============================
  // PRODUCTOS
  // ===============================
  static async searchProducts(filter: ProductFilter): Promise<Product[]> {
    try {
      let query = supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name,
            slug,
            station,
            requires_preparation
          )
        `)
        .eq('organization_id', this.organizationId);

      if (filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }

      if (filter.search) {
        query = query.or(
          `sku.ilike.%${filter.search}%,name.ilike.%${filter.search}%,description.ilike.%${filter.search}%,barcode.eq.${filter.search}`
        );
      }

      if (filter.category_id) {
        query = query.eq('category_id', filter.category_id);
      }

      const { data, error } = await query
        .order('name')
        .limit(filter.limit || 50);

      if (error) throw error;

      // Obtener las imágenes principales de los productos
      const productIds = data?.map(p => p.id) || [];
      let productImages: Record<string | number, string> = {};
      
      if (productIds.length > 0) {
        const { data: images, error: imagesError } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', productIds)
          .eq('is_primary', true);
        
        if (!imagesError && images) {
          images.forEach((img: any) => {
            if (img.storage_path) {
              productImages[img.product_id] = img.storage_path;
            }
          });
        }
      }

      return data?.map((product: any) => ({
        ...product,
        category: product.categories,
        image: productImages[product.id] ? getStorageImageUrl(productImages[product.id]) : null
      })) || [];
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  static async getProductsPaginated({
    page = 1,
    limit = 12,
    search = '',
    category_id = null,
    status = 'active',
    includeVariants = false, // Nueva opción para incluir variantes
    branchFilter = undefined // null = todas (consolidado), number = sucursal concreta
  }: {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: number | null;
    status?: string;
    includeVariants?: boolean;
    branchFilter?: number | null;
  }) {
    try {
      // Si branchFilter viene del caller, usarlo; si no, fallback al legacy
      const currentBranchId = branchFilter !== undefined
        ? branchFilter
        : await this.getBranchId();

      // Desktop sin red: catálogo local (fase 4A). Mismo contrato de salida.
      if (this.usesLocalCatalog()) {
        return posOfflineReads.getProductsPaginated(
          { organizationId: this.organizationId, branchId: currentBranchId, page, limit, search, category_id, status, includeVariants },
          getStorageImageUrl,
        );
      }

      // === Ranking vía RPC: ordena por (is_favorite DESC, sales_count_90d DESC, id ASC) ===
      // La función pos_product_ranking devuelve los product_ids ya ordenados + total +
      // flags de favorito y conteo de ventas de los últimos 90 días. Esto permite que
      // los favoritos y los más vendidos aparezcan primero respetando la paginación.
      const { data: rankingRows, error: rankingError } = await supabase
        .rpc('pos_product_ranking', {
          p_org_id: this.organizationId,
          p_search: search || null,
          p_category_id: category_id ?? null,
          p_status: status,
          p_include_variants: includeVariants,
          p_page: page,
          p_limit: limit,
        });

      if (rankingError) throw rankingError;

      const rankingData = (rankingRows || []) as Array<{
        product_id: number;
        total_count: number;
        is_favorite: boolean;
        sales_count_90d: number;
      }>;

      const totalCount = rankingData.length > 0 ? Number(rankingData[0].total_count) : 0;
      const orderedIds = rankingData.map(r => r.product_id);

      // Mapas de ranking para mergear después
      const favoriteMap: Record<number, boolean> = {};
      const salesCountMap: Record<number, number> = {};
      rankingData.forEach(r => {
        favoriteMap[r.product_id] = r.is_favorite;
        salesCountMap[r.product_id] = Number(r.sales_count_90d) || 0;
      });

      // Si no hay productos en esta página, devolver vacío
      if (orderedIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0
        };
      }

      // Fetch de los productos por IDs (preservando el orden del ranking)
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .in('id', orderedIds);

      if (error) throw error;

      // Reordenar los productos según el orden del ranking (el .in() no garantiza orden)
      const productsById: Record<number, any> = {};
      (data || []).forEach((p: any) => { productsById[p.id] = p; });
      const orderedProducts = orderedIds
        .map(id => productsById[id])
        .filter(Boolean);

      const productIds = orderedProducts.map(p => p.id) || [];
      const parentIds = orderedProducts.filter(p => p.is_parent).map(p => p.id) || [];
      // Category IDs únicos para obtener las categorías en una query separada
      const categoryIds = [...new Set(data?.map(p => p.category_id).filter(Boolean))] as number[];

      let productImagesMap: Record<string | number, any[]> = {};
      let variantCountMap: Record<number, number> = {};
      let productsWithModifiers = new Set<number>();
      let stockMap: Record<number, { qty_on_hand: number; qty_reserved: number }> = {};
      let variantStockMap: Record<number, { qty_on_hand: number; qty_reserved: number }> = {};
      let variantToParent: Record<number, number> = {};
      let categoriesMap: Record<number, any> = {};
      let pricesMap: Record<number, any[]> = {};
      const recipeMap: Record<number, { id: number; name: string | null }> = {};

      // === Paralelizar todas las queries secundarias para reducir latencia ===
      // Antes se ejecutaban 5 queries secuenciales (N+1), ahora van en paralelo.
      // categories y product_prices se agregaron aquí para evitar los LATERAL JOINs
      // costosos que PostgREST generaba cuando estaban en el .select() principal.
      const [
        imagesResult,
        variantCountsResult,
        modifierGroupsResult,
        variantsResult,
        stockDataResult,
        categoriesResult,
        pricesResult,
        recipesResult,
      ] = await Promise.all([
        // 1. Imágenes de los productos de la página actual
        productIds.length > 0
          ? supabase
              .from('product_images')
              .select('id, product_id, storage_path, is_primary, display_order')
              .in('product_id', productIds)
              .order('display_order')
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 2. Contar variantes de los productos padre
        parentIds.length > 0
          ? supabase
              .from('products')
              .select('parent_product_id')
              .in('parent_product_id', parentIds)
              .eq('status', 'active')
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 3. Detectar productos con grupos de modificadores
        productIds.length > 0
          ? supabase
              .from('product_modifier_groups')
              .select('product_id')
              .in('product_id', productIds)
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 4. Variantes hijas (para acumular stock de los padres)
        parentIds.length > 0
          ? supabase
              .from('products')
              .select('id, parent_product_id')
              .in('parent_product_id', parentIds)
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 5. Stock de los productos de la página actual (incluye padres e hijos directos)
        //    Si currentBranchId es null (Todas las sucursales), suma stock de todas.
        productIds.length > 0
          ? currentBranchId
            ? supabase
                .from('stock_levels')
                .select('product_id, qty_on_hand, qty_reserved')
                .in('product_id', productIds)
                .eq('branch_id', currentBranchId)
                .is('lot_id', null)
            : supabase
                .from('stock_levels')
                .select('product_id, qty_on_hand, qty_reserved')
                .in('product_id', productIds)
                .is('lot_id', null)
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 6. Categorías de los productos de la página actual (query separada, no LATERAL JOIN)
        categoryIds.length > 0
          ? supabase
              .from('categories')
              .select('id, name, slug, station, requires_preparation')
              .in('id', categoryIds)
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 7. Precios de los productos de la página actual (query separada, no LATERAL JOIN)
        productIds.length > 0
          ? supabase
              .from('product_prices')
              .select('product_id, price, compare_price, effective_from, effective_to')
              .in('product_id', productIds)
          : Promise.resolve({ data: [] as any[], error: null as any }),

        // 8. Recetas activas vinculadas a los productos de la página actual
        // (para mostrar badge/acción de "ver receta" en el grid del POS)
        productIds.length > 0
          ? supabase
              .from('product_recipes')
              .select('id, product_id, name')
              .in('product_id', productIds)
              .eq('is_active', true)
          : Promise.resolve({ data: [] as any[], error: null as any }),
      ]);

      // Procesar imágenes
      if (!imagesResult.error && imagesResult.data) {
        imagesResult.data.forEach((img: any) => {
          if (!productImagesMap[img.product_id]) {
            productImagesMap[img.product_id] = [];
          }
          productImagesMap[img.product_id].push(img);
        });
      }

      // Procesar conteo de variantes
      if (!variantCountsResult.error && variantCountsResult.data) {
        variantCountsResult.data.forEach((v: any) => {
          variantCountMap[v.parent_product_id] = (variantCountMap[v.parent_product_id] || 0) + 1;
        });
      }

      // Procesar modificadores
      (modifierGroupsResult.data || []).forEach((g: any) => productsWithModifiers.add(g.product_id));

      // Procesar variantes hijas: mapear variant_id -> parent_product_id
      const variantIds = (variantsResult.data || []).map((v: any) => v.id);
      (variantsResult.data || []).forEach((v: any) => {
        variantToParent[v.id] = v.parent_product_id;
      });

      // Procesar stock de productos de la página actual
      (stockDataResult.data || []).forEach((s: any) => {
        stockMap[s.product_id] = {
          qty_on_hand: Number(s.qty_on_hand) || 0,
          qty_reserved: Number(s.qty_reserved) || 0,
        };
      });

      // Procesar categorías: mapear category_id -> datos de la categoría
      (categoriesResult.data || []).forEach((cat: any) => {
        categoriesMap[cat.id] = cat;
      });

      // Procesar precios: agrupar por product_id
      (pricesResult.data || []).forEach((price: any) => {
        if (!pricesMap[price.product_id]) {
          pricesMap[price.product_id] = [];
        }
        pricesMap[price.product_id].push(price);
      });

      // Procesar recetas: mapear product_id -> { id, name } (receta activa)
      (recipesResult.data || []).forEach((r: any) => {
        if (!recipeMap[r.product_id]) {
          recipeMap[r.product_id] = { id: r.id, name: r.name };
        }
      });

      // Consultar stock de las variantes hijas (query adicional, solo si hay variantes)
      // Se hace después de Promise.all porque depende de variantIds calculado arriba.
      // Si currentBranchId es null (Todas), suma stock de todas las sucursales.
      if (variantIds.length > 0) {
        const variantStockQuery = supabase
          .from('stock_levels')
          .select('product_id, qty_on_hand, qty_reserved')
          .in('product_id', variantIds)
          .is('lot_id', null);
        if (currentBranchId) {
          variantStockQuery.eq('branch_id', currentBranchId);
        }
        const { data: variantStockData } = await variantStockQuery;
        (variantStockData || []).forEach((s: any) => {
          const parentId = variantToParent[s.product_id];
          if (!variantStockMap[parentId]) {
            variantStockMap[parentId] = { qty_on_hand: 0, qty_reserved: 0 };
          }
          variantStockMap[parentId].qty_on_hand += Number(s.qty_on_hand) || 0;
          variantStockMap[parentId].qty_reserved += Number(s.qty_reserved) || 0;
        });
      }

      const products = orderedProducts.map((product: any) => {
        const stock = stockMap[product.id];
        const variantStock = variantStockMap[product.id];
        // Sumar stock propio + stock de variantes hijas
        const stockQty = (stock?.qty_on_hand ?? 0) + (variantStock?.qty_on_hand ?? 0);
        const reservedQty = (stock?.qty_reserved ?? 0) + (variantStock?.qty_reserved ?? 0);
        // Si track_stock es true y el stock disponible (propio + variantes) es <= 0,
        // el producto está agotado, aunque no exista registro en stock_levels para
        // la branch actual. Antes se requería hasStockData, pero eso hacía que
        // productos sin registro de stock aparecieran como disponibles.
        const isOutOfStock = agotadoPorStock(product.track_stock, stockQty);
        // Precio vigente (effective_from <= ahora < effective_to), no el último
        // registrado: un precio vencido o programado a futuro no se muestra.
        const vigente = precioVigente(pricesMap[product.id] || []);
        return {
          ...product,
          category: categoriesMap[product.category_id] || null,
          price: vigente?.price || null,
          compare_price: vigente?.compare_price || null,
          product_images: productImagesMap[product.id] || [],
          // Información de variantes
          has_variants: product.is_parent === true,
          variant_count: variantCountMap[product.id] || 0,
          has_modifiers: productsWithModifiers.has(product.id),
          // Información de stock
          track_stock: product.track_stock,
          stock_quantity: stockQty,
          qty_reserved: reservedQty,
          is_out_of_stock: isOutOfStock,
          // Favorito y ranking de ventas (últimos 90 días) desde la RPC de ranking
          is_favorite: favoriteMap[product.id] ?? false,
          sales_count_90d: salesCountMap[product.id] ?? 0,
          // Receta vinculada (activa) para mostrar badge/acción de "ver receta"
          has_recipe: recipeMap[product.id] !== undefined,
          recipe_id: recipeMap[product.id]?.id ?? null,
          recipe_name: recipeMap[product.id]?.name ?? null,
          // Mantener compatibilidad con código que use 'image'
          image: productImagesMap[product.id]?.[0]?.storage_path ? 
            getStorageImageUrl(productImagesMap[product.id][0].storage_path) : null
        };
      });

      return {
        data: products,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      };
    } catch (error) {
      console.error('Error getting products paginated:', error);
      throw error;
    }
  }

  /**
   * Variantes (productos hijos) de un producto padre, con su precio vigente.
   *
   * Con `opciones.branchFilter` (el mismo filtro de la grilla: número =
   * sucursal concreta, `null` = todas) cada variante trae además su stock
   * (`stock_quantity`, `qty_reserved`) y `is_out_of_stock` con la misma regla
   * que la tarjeta del catálogo (`agotadoPorStock`). Sin opciones la salida
   * es la de siempre (PMS, envíos, «Agregar productos»).
   */
  static async getProductVariants(parentProductId: number, opciones?: { branchFilter?: number | null }) {
    if (this.usesLocalCatalog()) {
      return posOfflineReads.getProductVariants(this.organizationId, parentProductId, getStorageImageUrl, opciones);
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name,
            slug,
            station,
            requires_preparation
          ),
          product_prices(price, effective_from, effective_to)
        `)
        .eq('parent_product_id', parentProductId)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      // Obtener imágenes de las variantes
      const variantIds = data?.map(p => p.id) || [];
      let variantImagesMap: Record<number, any[]> = {};
      
      if (variantIds.length > 0) {
        const { data: images } = await supabase
          .from('product_images')
          .select('id, product_id, storage_path, is_primary')
          .in('product_id', variantIds);
          
        if (images) {
          images.forEach((img: any) => {
            if (!variantImagesMap[img.product_id]) {
              variantImagesMap[img.product_id] = [];
            }
            variantImagesMap[img.product_id].push(img);
          });
        }
      }

      // Fallback: si una variante no tiene imagen propia, usar la del producto padre
      const { data: parentImages } = await supabase
        .from('product_images')
        .select('id, product_id, storage_path, is_primary')
        .eq('product_id', parentProductId);

      // Stock por variante en la sucursal que vende (solo si se pidió). Misma
      // consulta que la grilla: filas sin lote; sin sucursal, suma todas.
      const conStock = opciones !== undefined && opciones.branchFilter !== undefined;
      const stockPorVariante: Record<number, { qty_on_hand: number; qty_reserved: number }> = {};
      if (conStock && variantIds.length > 0) {
        let consultaStock = supabase
          .from('stock_levels')
          .select('product_id, qty_on_hand, qty_reserved')
          .in('product_id', variantIds)
          .is('lot_id', null);
        if (opciones.branchFilter !== null && opciones.branchFilter !== undefined) {
          consultaStock = consultaStock.eq('branch_id', opciones.branchFilter);
        }
        const { data: filasStock, error: errorStock } = await consultaStock;
        if (errorStock) throw errorStock;
        (filasStock || []).forEach((s: { product_id: number; qty_on_hand: number | string | null; qty_reserved: number | string | null }) => {
          const previo = stockPorVariante[s.product_id] ?? { qty_on_hand: 0, qty_reserved: 0 };
          previo.qty_on_hand += Number(s.qty_on_hand) || 0;
          previo.qty_reserved += Number(s.qty_reserved) || 0;
          stockPorVariante[s.product_id] = previo;
        });
      }

      const parentImage = parentImages?.find((img: any) => img.is_primary) || parentImages?.[0];

      return data?.map((variant: any) => {
        const ownImages = variantImagesMap[variant.id] || [];
        const primaryOwnImage = ownImages.find((img: any) => img.is_primary) || ownImages[0];
        const resolvedImage = primaryOwnImage?.storage_path
          ? getStorageImageUrl(primaryOwnImage.storage_path)
          : parentImage?.storage_path
            ? getStorageImageUrl(parentImage.storage_path)
            : null;

        const stock = stockPorVariante[variant.id] ?? { qty_on_hand: 0, qty_reserved: 0 };
        return {
          ...variant,
          price: precioVigente(variant.product_prices || [])?.price || null,
          product_images: ownImages.length > 0 ? ownImages : (parentImages || []),
          image: resolvedImage,
          ...(conStock
            ? {
                stock_quantity: stock.qty_on_hand,
                qty_reserved: stock.qty_reserved,
                is_out_of_stock: agotadoPorStock(variant.track_stock, stock.qty_on_hand),
              }
            : {}),
        };
      }) || [];
    } catch (error) {
      console.error('Error getting product variants:', error);
      throw error;
    }
  }

  static getProductPlaceholderImage(categoryId?: number): string | null {
    // No usar imagen placeholder, retornar null para mostrar "Sin imagen"
    return null;
  }

  static async getCategories() {
    if (this.usesLocalCatalog()) return posOfflineReads.getCategories(this.organizationId);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('rank');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  /**
   * Favorito y unidades vendidas en 90 días por categoría, calcado del
   * ranking de productos (`pos_product_ranking`). La RPC comprueba pertenencia
   * a la organización y no es ejecutable por `anon`.
   */
  static async getCategoryRanking(): Promise<
    Record<number, { is_favorite: boolean; sales_count_90d: number }>
  > {
    if (this.usesLocalCatalog()) return posOfflineReads.getCategoryRanking(this.organizationId);
    try {
      const { data, error } = await supabase.rpc('pos_category_ranking', {
        p_org_id: this.organizationId,
      });
      if (error) throw error;
      const map: Record<number, { is_favorite: boolean; sales_count_90d: number }> = {};
      for (const r of (data || []) as Array<{ category_id: number; is_favorite: boolean; sales_count_90d: number | string }>) {
        map[r.category_id] = { is_favorite: !!r.is_favorite, sales_count_90d: Number(r.sales_count_90d) || 0 };
      }
      return map;
    } catch (error) {
      // El ranking es un adorno: si falla, las categorías se muestran igual.
      console.warn('[posService] No se pudo cargar el ranking de categorías:', error);
      return {};
    }
  }

  /** Marca/desmarca una categoría como favorita de la organización. */
  static async toggleCategoryFavorite(categoryId: number): Promise<boolean> {
    const { data: existing, error: findError } = await supabase
      .from('category_favorites')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('category_id', categoryId)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { error } = await supabase.from('category_favorites').delete().eq('id', existing.id);
      if (error) throw error;
      return false;
    }

    const { error } = await supabase
      .from('category_favorites')
      .insert({ organization_id: this.organizationId, category_id: categoryId });
    if (error) throw error;
    return true;
  }

  static async getProductByBarcode(barcode: string): Promise<Product | null> {
    if (this.usesLocalCatalog()) {
      return (await posOfflineReads.getProductByBarcode(this.organizationId, barcode)) as unknown as Product | null;
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('barcode', barcode)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting product by barcode:', error);
      throw error;
    }
  }

  // getProductById is implemented later with proper price and tax integration

  // ===============================
  // FAVORITOS DE PRODUCTOS (por organización)
  // ===============================
  static async toggleProductFavorite(productId: number): Promise<boolean> {
    try {
      // Verificar si ya existe
      const { data: existing, error: findError } = await supabase
        .from('product_favorites')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('product_id', productId)
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        // Quitar favorito
        const { error: delError } = await supabase
          .from('product_favorites')
          .delete()
          .eq('id', existing.id);
        if (delError) throw delError;
        return false;
      }

      // Agregar favorito
      const { error: insertError } = await supabase
        .from('product_favorites')
        .insert({
          organization_id: this.organizationId,
          product_id: productId,
        });
      if (insertError) throw insertError;
      return true;
    } catch (error) {
      console.error('Error toggling product favorite:', error);
      throw error;
    }
  }

  // ===============================
  // CLIENTES
  // ===============================
  static async searchCustomers(filter: CustomerFilter): Promise<Customer[]> {
    if (this.usesLocalCatalog()) {
      return (await posOfflineReads.searchCustomers(this.organizationId, filter.search)) as unknown as Customer[];
    }
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .eq('organization_id', this.organizationId);

      if (filter.search) {
        query = query.or(
          `full_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%,phone.ilike.%${filter.search}%,doc_number.ilike.%${filter.search}%,company_name.ilike.%${filter.search}%,trade_name.ilike.%${filter.search}%,identification_number.ilike.%${filter.search}%`
        );
      }

      const { data, error } = await query
        .order('full_name')
        .limit(filter.search ? 20 : 50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching customers:', error);
      throw error;
    }
  }

  static async createCustomer(customerData: Partial<Customer>): Promise<Customer> {
    // Fase 4D (Desktop sin red): id generado aquí, catálogo local + outbox.
    if (this.usesLocalCatalog()) return this.createCustomerOffline(customerData);
    try {
      // Mapear los campos del formulario a la estructura de la base de datos
      const insertData = {
        organization_id: this.organizationId,
        branch_id: await this.getBranchId(),
        ...this.splitCustomerName(customerData),
        email: customerData.email,
        phone: customerData.phone,
        // Solo usar identification_type y identification_number (doc_type y doc_number son columnas generadas)
        identification_type: customerData.doc_type,
        identification_number: customerData.doc_number,
        address: customerData.address,
        roles: customerData.roles || ['cliente', 'huesped'],
        fiscal_responsibilities: ['R-99-PN'],
        fiscal_municipality_id: customerData.fiscal_municipality_id || 'aa4b6637-0060-41bb-9459-bc95f9789e08',
        tags: customerData.tags || [],
        preferences: customerData.preferences || {},
        metadata: {
          country: customerData.country
        }
      };

      console.log('Creating customer with data:', insertData);

      const { data, error } = await supabase
        .from('customers')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }
      
      console.log('Customer created successfully:', data);
      return data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  /** `first_name`/`last_name` explícitos si vienen; si no, se parte `full_name` (comportamiento histórico). */
  private static splitCustomerName(customerData: Partial<Customer>): { first_name: string; last_name: string } {
    if (customerData.first_name !== undefined || customerData.last_name !== undefined) {
      return { first_name: (customerData.first_name ?? '').trim(), last_name: (customerData.last_name ?? '').trim() };
    }
    const parts = (customerData.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') };
  }

  /**
   * Cliente sin red (Desktop, fase 4D). `customers.id` es `uuid` (verificado
   * por MCP), así que el id se genera aquí con `crypto.randomUUID()`. La fila
   * entra en el catálogo local con `pending_sync` y en el outbox de clientes;
   * `customersSync` la inserta al volver la red, antes que las ventas que la
   * referencien. No emite ningún fetch.
   *
   * Duplicados: mismos UNIQUE que Postgres (documento o email por
   * organización) comprobados contra el catálogo local. Si ya existe, se
   * lanza un error claro con el nombre del cliente existente.
   */
  private static async createCustomerOffline(customerData: Partial<Customer>): Promise<Customer> {
    const organizationId = this.organizationId;
    const branchId = getCurrentBranchId() ?? null;
    const doc = customerData.doc_number?.trim() || null;
    const email = customerData.email?.trim() || null;
    const duplicate = await findLocalCustomerDuplicate(organizationId, { identification_number: doc, email });
    if (duplicate) {
      const byDoc = !!doc && (duplicate.identification_number ?? '').trim().toLocaleLowerCase() === doc.toLocaleLowerCase();
      throw new Error(`Ya existe un cliente con ese ${byDoc ? 'documento' : 'email'}: ${duplicate.full_name ?? duplicate.id}`);
    }
    const name = this.splitCustomerName(customerData);
    if (!name.first_name && !name.last_name) throw new Error('El nombre del cliente es obligatorio');
    const isCompany = customerData.customer_type === 'company';
    const payload: OfflineCustomerPayload = {
      organization_id: organizationId,
      branch_id: branchId,
      first_name: name.first_name,
      last_name: name.last_name,
      email,
      phone: customerData.phone?.trim() || null,
      identification_type: customerData.doc_type || null,
      identification_number: doc,
      address: customerData.address?.trim() || null,
      customer_type: isCompany ? 'company' : 'person',
      company_name: isCompany ? customerData.full_name?.trim() || null : null,
      roles: customerData.roles || ['cliente', 'huesped'],
      tags: customerData.tags || [],
      preferences: customerData.preferences || {},
      fiscal_responsibilities: ['R-99-PN'],
      fiscal_municipality_id: customerData.fiscal_municipality_id || null,
      metadata: { ...(customerData.country ? { country: customerData.country } : {}), created_offline: true },
      created_at: new Date().toISOString(),
    };
    const row = await enqueueOfflineCustomer(payload, newLocalUuid());
    console.log(`Cliente ${row.id} creado sin conexión (pendiente de sincronizar)`);
    return row as unknown as Customer;
  }

  // ===============================
  // CARRITOS
  // ===============================
  static async createCart(branchId: number): Promise<Cart> {
    try {
      const cartId = crypto.randomUUID();
      
      const newCart: Cart = {
        id: cartId,
        organization_id: this.organizationId,
        branch_id: branchId,
        status: 'active',
        items: [],
        subtotal: 0,
        tax_amount: 0,
        tax_total: 0,
        discount_amount: 0,
        discount_total: 0,
        total: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Guardamos el carrito en el localStorage temporalmente
      this.saveCartToStorage(newCart);
      
      return newCart;
    } catch (error) {
      console.error('Error creating cart:', error);
      throw error;
    }
  }

  /**
   * Carritos vivos (activos o en espera) DE LA SUCURSAL. `pos_carts_<org>`
   * guarda los carritos de todas las sucursales de la organización en una
   * sola lista: antes el POS de la sucursal A mostraba (y cobraba o fiaba)
   * carritos creados en la B, y el efectivo quedaba en la caja equivocada.
   *
   * @param branchId sucursal del POS; sin argumento, la seleccionada
   *   (`getCurrentBranchId`). `null` = «Todas» (no se filtra). Un carrito sin
   *   `branch_id` (anterior a este filtro) se muestra en cualquier sucursal.
   */
  static async getActiveCarts(branchId?: number | null): Promise<Cart[]> {
    try {
      const sucursal = branchId === undefined ? (getCurrentBranchId() ?? null) : branchId;
      return this.readAllCarts().filter(
        (cart) => (cart.status === 'active' || cart.status === 'hold') && this.esDeLaSucursal(cart, sucursal),
      );
    } catch (error) {
      console.error('Error getting active carts:', error);
      return [];
    }
  }

  /** true si el carrito pertenece a la sucursal (o si no hay sucursal elegida, o el carrito no la tiene). */
  static esDeLaSucursal(cart: Pick<Cart, 'branch_id'>, branchId: number | null): boolean {
    if (branchId === null || branchId === undefined) return true;
    if (cart.branch_id === null || cart.branch_id === undefined) return true;
    return Number(cart.branch_id) === Number(branchId);
  }

  /**
   * Lista COMPLETA de `pos_carts_<org>` (todas las sucursales y estados). Las
   * mutaciones leen y guardan esta lista: guardar la filtrada borraba de paso
   * los carritos en deuda y, con el filtro por sucursal, los de otras sedes.
   */
  private static readAllCarts(): Cart[] {
    try {
      const data = localStorage.getItem(`pos_carts_${this.organizationId}`);
      const carts = data ? JSON.parse(data) : [];
      return Array.isArray(carts) ? carts : [];
    } catch (error) {
      console.error('Error leyendo los carritos guardados:', error);
      return [];
    }
  }

  /** Índice de un carrito vivo (activo o en espera) en la lista completa; -1 si no está. */
  private static indexOfLiveCart(carts: Cart[], cartId: string): number {
    return carts.findIndex((c) => c.id === cartId && (c.status === 'active' || c.status === 'hold'));
  }

  /**
   * Agrega el producto al carrito. Una línea por peso o medida
   * (PRODUCTOS-POR-PESO-BASCULA.md) nunca se funde con otra del mismo
   * producto: cada pesada es su propia línea, con su `pesaje`
   * (`notes.pesaje` en el cobro) y la cantidad redondeada a sus decimales.
   */
  static async addItemToCart(
    cartId: string,
    product: Product,
    quantity: number = 1,
    modifiers?: CartItemModifier[],
    opciones?: { pesaje?: Pesaje }
  ): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const modifiersKey = (mods?: CartItemModifier[]) =>
        (mods || []).map((m) => m.modifierId).sort().join(',');
      // Una línea con nota (cocina, cliente o alergia) no absorbe unidades sin
      // nota: «2 hamburguesas, una sin cebolla» son dos líneas (N4).
      const medido = esMedido(product);
      const cantidad = medido ? redondearCantidadProducto(quantity, decimalesCantidad(product)) : quantity;
      const existingItemIndex = medido ? -1 : cart.items.findIndex(
        item => item.product_id === product.id && modifiersKey(item.modifiers) === modifiersKey(modifiers)
          && !item.notes && !item.customer_note && !item.is_allergy
      );

      if (existingItemIndex >= 0) {
        // Actualizar cantidad del item existente
        cart.items[existingItemIndex].quantity += quantity;
        cart.items[existingItemIndex].total = cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].unit_price;
      } else {
        // Agregar nuevo item
        const basePrice = await this.getProductPrice(product.id, product.name);
        const extraTotal = (modifiers || []).reduce((sum, m) => sum + (m.extraPrice || 0), 0);
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          cart_id: cartId,
          product_id: product.id,
          product,
          quantity: cantidad,
          unit_price: basePrice + extraTotal,
          total: 0,
          discount_amount: 0,
          tax_amount: 0,
          tax_rate: 0,
          modifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
          ...(opciones?.pesaje ? { pesaje: opciones.pesaje } : {}),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        newItem.total = newItem.quantity * newItem.unit_price;
        cart.items.push(newItem);
      }

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  static async removeItemFromCart(cartId: string, itemId: string): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.items = cart.items.filter(item => item.id !== itemId);

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  static async updateCartItemQuantity(cartId: string, itemId: string, quantity: number): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);
      
      if (itemIndex === -1) throw new Error('Item no encontrado');

      if (quantity <= 0) {
        return await this.removeItemFromCart(cartId, itemId);
      }

      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].total = quantity * cart.items[itemIndex].unit_price;

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  /**
   * «Cambiar peso» de una línea por peso o medida: nueva cantidad (redondeada a
   * los decimales del producto) y su pesada. Notas, modificadores y precio se
   * conservan; el descuento se topa en cantidad × precio, como siempre.
   */
  static async updateCartItemPesaje(cartId: string, itemId: string, quantity: number, pesaje?: Pesaje): Promise<Cart> {
    const carts = this.readAllCarts();
    const cartIndex = this.indexOfLiveCart(carts, cartId);
    if (cartIndex === -1) throw new Error('Carrito no encontrado');
    const cart = carts[cartIndex];
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new Error('Item no encontrado');
    const cantidad = redondearCantidadProducto(quantity, decimalesCantidad(item.product));
    if (!(cantidad > 0)) return this.removeItemFromCart(cartId, itemId);
    item.quantity = cantidad;
    item.total = cantidad * item.unit_price;
    if (pesaje) item.pesaje = pesaje;
    if (item.discount_amount && item.discount_amount > item.total) item.discount_amount = item.total;
    item.updated_at = new Date().toISOString();
    await this.calculateCartTotals(cart);
    cart.updated_at = new Date().toISOString();
    carts[cartIndex] = cart;
    this.saveCartsToStorage(carts);
    return cart;
  }

  static async updateCartItemDiscount(cartId: string, itemId: string, discountAmount: number): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) throw new Error('Item no encontrado');

      const maxDiscount = cart.items[itemIndex].quantity * cart.items[itemIndex].unit_price;
      cart.items[itemIndex].discount_amount = Math.max(0, Math.min(discountAmount, maxDiscount));

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart item discount:', error);
      throw error;
    }
  }

  static async updateItemTaxIncluded(cartId: string, itemId: string, taxIncluded: boolean): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      const itemIndex = cart.items.findIndex(item => item.id === itemId);

      if (itemIndex === -1) throw new Error('Item no encontrado');

      cart.items[itemIndex].tax_included = taxIncluded;

      // Recalcular totales
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating item tax_included:', error);
      throw error;
    }
  }

  /**
   * Cambia un carrito guardado en `pos_carts_<org>` y lo guarda. Lee la lista
   * COMPLETA (no `getActiveCarts()`), para no borrar de paso los carritos
   * `hold_with_debt` o `cancelled` (misma razón que `removeCart`).
   */
  private static mutateStoredCart(cartId: string, mutate: (cart: Cart) => Cart): Cart {
    const allCarts: Cart[] = JSON.parse(localStorage.getItem(`pos_carts_${this.organizationId}`) || '[]');
    const cartIndex = allCarts.findIndex(c => c.id === cartId);
    if (cartIndex === -1) throw new Error('Carrito no encontrado');
    const updated = { ...mutate(allCarts[cartIndex]), updated_at: new Date().toISOString() };
    allCarts[cartIndex] = updated;
    this.saveCartsToStorage(allCarts);
    return updated;
  }

  /**
   * Nota de la línea (cocina, cliente, alergia). Hasta 2026-09-23 vivía solo
   * en el estado de la pantalla y se perdía con la siguiente operación del
   * servicio o al recargar (N1). No recalcula: la nota no toca importes.
   */
  static async updateCartItemNote(cartId: string, itemId: string, cambio: CambioNotaLinea): Promise<Cart> {
    return this.mutateStoredCart(cartId, (cart) => {
      if (!cart.items.some(item => item.id === itemId)) throw new Error('Item no encontrado');
      return { ...cart, items: cart.items.map(item => (item.id === itemId ? aplicarNotaALinea(item, cambio) : item)) };
    });
  }

  /**
   * «Excluir impuesto» de la línea: se guarda con la línea (N1) con la MISMA
   * semántica de siempre. No recalcula, igual que antes: `calculateCartTotals`
   * no lee este flag; lo leen el Resumen y el cobro (análisis en
   * docs/design/POS-CARRITO-LINEAS-NOTAS.md §7).
   */
  static async updateCartItemTaxExcluded(cartId: string, itemId: string, taxExcluded: boolean): Promise<Cart> {
    return this.mutateStoredCart(cartId, (cart) => {
      if (!cart.items.some(item => item.id === itemId)) throw new Error('Item no encontrado');
      return { ...cart, items: cart.items.map(item => (item.id === itemId ? { ...item, tax_excluded: taxExcluded } : item)) };
    });
  }

  /** Llave de la ronda «Enviar a cocina» en curso (se reutiliza al reintentar). */
  static async setCartKitchenRoundKey(cartId: string, roundKey: string | null): Promise<Cart> {
    return this.mutateStoredCart(cartId, (cart) => ({ ...cart, kitchen_round_key: roundKey }));
  }

  /** Guarda en el carrito lo que devolvió la ronda: comanda y lo enviado por línea. */
  static async applyKitchenRound(cartId: string, respuesta: RespuestaRonda): Promise<Cart> {
    return this.mutateStoredCart(cartId, (cart) => aplicarRondaAlCarrito(cart, respuesta));
  }

  static async getFrequentDiscounts(productId: number, organizationId: number): Promise<number[]> {
    try {
      const [saleItemsRes, invoiceItemsRes] = await Promise.all([
        supabase
          .from('sale_items')
          .select('discount_amount')
          .eq('product_id', productId)
          .gt('discount_amount', 0),
        supabase
          .from('invoice_items')
          .select('discount_amount')
          .eq('product_id', productId)
          .gt('discount_amount', 0),
      ]);

      const freqMap = new Map<number, number>();

      saleItemsRes.data?.forEach((row: any) => {
        const val = parseFloat(row.discount_amount);
        if (val > 0) freqMap.set(val, (freqMap.get(val) ?? 0) + 1);
      });

      invoiceItemsRes.data?.forEach((row: any) => {
        const val = parseFloat(row.discount_amount);
        if (val > 0) freqMap.set(val, (freqMap.get(val) ?? 0) + 1);
      });

      return Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([val]) => val);
    } catch (error) {
      console.error('Error getting frequent discounts:', error);
      return [];
    }
  }

  /**
   * El cliente existe en la organización ACTIVA (enlace del POS
   * `?cliente=<id>`, renovación de membresías). Filtra por organización
   * además del RLS: un id de otra organización del mismo usuario no pasa.
   */
  static async existeClienteEnOrganizacion(customerId: string): Promise<boolean> {
    if (this.usesLocalCatalog()) {
      return !!(await posOfflineReads.getCustomerById(this.organizationId, customerId));
    }
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  static async setCartCustomer(cartId: string, customerId?: string): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.customer_id = customerId;

      if (customerId) {
        // Obtener datos del cliente (fase 4D: del catálogo local sin red)
        if (this.usesLocalCatalog()) {
          cart.customer = (await posOfflineReads.getCustomerById(this.organizationId, customerId)) as unknown as Customer;
        } else {
          const { data: customer, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

          if (error) throw error;
          cart.customer = customer;
        }
      } else {
        cart.customer = undefined;
      }

      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error setting cart customer:', error);
      throw error;
    }
  }

  static async updateCartTaxSettings(
    cartId: string,
    settings: { tax_included?: boolean; applied_tax_ids?: string[] }
  ): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      if (settings.tax_included !== undefined) {
        cart.tax_included = settings.tax_included;
        // Propagar tax_included a cada item
        cart.items.forEach(item => { item.tax_included = settings.tax_included; });
      }
      if (settings.applied_tax_ids !== undefined) cart.applied_tax_ids = settings.applied_tax_ids;
      cart.updated_at = new Date().toISOString();

      // Recalcular totales con la nueva configuracion
      await this.calculateCartTotals(cart);

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error updating cart tax settings:', error);
      throw error;
    }
  }

  static async recalculateCart(cartId: string): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);

      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      await this.calculateCartTotals(cart);
      cart.updated_at = new Date().toISOString();

      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error recalculating cart:', error);
      throw error;
    }
  }

  static async holdCart(cartId: string, reason?: string): Promise<Cart> {
    try {
      const carts = this.readAllCarts();
      const cartIndex = this.indexOfLiveCart(carts, cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = carts[cartIndex];
      cart.status = 'hold';
      cart.hold_reason = reason;
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      carts[cartIndex] = cart;
      this.saveCartsToStorage(carts);

      return cart;
    } catch (error) {
      console.error('Error holding cart:', error);
      throw error;
    }
  }

  static async activateCart(cartId: string): Promise<Cart> {
    try {
      // Buscar en TODOS los carritos (incluyendo hold_with_debt)
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) {
        throw new Error('No se encontraron carritos almacenados');
      }
      const allCarts: Cart[] = JSON.parse(cartsData);
      const cartIndex = allCarts.findIndex(c => c.id === cartId);
      
      if (cartIndex === -1) throw new Error('Carrito no encontrado');

      const cart = allCarts[cartIndex];
      cart.status = 'active';
      cart.hold_reason = undefined;
      cart.updated_at = new Date().toISOString();

      // Guardar carrito actualizado
      allCarts[cartIndex] = cart;
      this.saveCartsToStorage(allCarts);

      return cart;
    } catch (error) {
      console.error('Error activating cart:', error);
      throw error;
    }
  }

  /**
   * Poner el carrito en espera CON DEUDA: venta a crédito con su factura y su
   * cuenta por cobrar. Desde 2026-09-24 es UNA llamada a `pos_checkout_v1` en
   * modo 'debt' (antes: sales, invoice_sales, invoice_items, sale_items y
   * stock en N escrituras desde el navegador, con la sucursal del usuario y sin
   * idempotencia). La cartera la crea el disparador de la factura.
   *
   * - Mismas reglas: exige cliente y carrito activo con total > 0; no exige caja.
   * - La línea se calcula con la regla única (`calcularLineaVenta`) con la
   *   tasa y el modo que ya traía la línea, como antes; el servidor valida
   *   precio, descuento y coherencia (punto 3).
   * - Idempotente: el id de la venta se guarda en el carrito ANTES de llamar;
   *   un reintento tras un corte devuelve la deuda ya creada.
   * - Sucursal: la del carrito.
   */
  static async holdCartWithDebt(data: {
    cartId: string;
    reason: string;
    paymentTerms?: number;
    notes?: string;
  }): Promise<{
    cart: Cart;
    /** Resumen de la factura a crédito (fila fresca de la base: su total sale de las líneas). */
    invoice: { id: string; number: string; total: number; due_date: string | null; status: string };
    accountReceivable: { id: string | null; amount: number; balance: number; due_date: string | null; status: string } | null;
  }> {
    const { cartId, reason, paymentTerms = 30, notes } = data;

    const carts = this.readAllCarts();
    const cartIndex = this.indexOfLiveCart(carts, cartId);
    if (cartIndex === -1) {
      throw new Error('Carrito no encontrado');
    }
    const cart = carts[cartIndex];
    if (!cart.customer_id) {
      throw new Error('El carrito debe tener un cliente asignado para generar deuda');
    }
    if (cart.items.length === 0) {
      throw new Error('El carrito debe tener items para generar deuda');
    }
    if (cart.total <= 0) {
      throw new Error('El total del carrito debe ser mayor a cero');
    }
    if (cart.status !== 'active') {
      throw new Error('Solo se pueden poner en espera carritos activos');
    }
    const branchId = cart.branch_id || getCurrentBranchId();
    if (!branchId) {
      throw new Error('No hay sucursal seleccionada: la deuda no se guardó.');
    }

    // Id de la venta del intento, guardado antes de llamar (reintento = misma deuda).
    const saleId = cart.debt_attempt_id || newSaleId();
    if (!cart.debt_attempt_id) {
      this.mutateStoredCart(cartId, (c) => ({ ...c, debt_attempt_id: saleId }));
    }

    const taxIncluded = cart.tax_included ?? getTaxIncludedSetting(false);
    // Misma regla de siempre para la deuda: la tasa de la línea, sin resolver
    // impuestos por defecto (no cambia ningún cálculo de impuestos).
    const itemCalcs = cart.items.map((item) => calcularLineaVenta({
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount || 0,
      tax_rate: item.tax_rate || 0,
      tax_included: item.tax_included ?? taxIncluded,
    }));
    const totales = totalesDeLineas(itemCalcs);

    const envelope = buildCheckoutEnvelope({
      checkout: {
        cart,
        payments: [],
        change: 0,
        total_paid: 0,
        tax_included: taxIncluded,
      },
      saleId,
      createdAt: new Date().toISOString(),
      organizationId: cart.organization_id || this.organizationId,
      branchId,
      userId: null,
      currency: (await this.getBaseCurrency()).code,
      itemCalcs,
      subtotal: totales.subtotal,
      taxTotal: totales.taxTotal,
      discountTotal: totales.discountTotal,
      total: totales.total,
      promotionIds: [],
      invoiceCommissionAmount: 0,
      mode: 'debt',
      debt: { reason, payment_terms: paymentTerms, notes: notes ?? null },
    });
    const rpcResult = await callCheckoutRpc(supabase, envelope);
    if (!rpcResult || !rpcResult.invoice) {
      throw new Error('No se pudo registrar la deuda: el servicio de cobro no está disponible. Inténtalo de nuevo.');
    }
    const invoice = rpcResult.invoice as { id: string; number: string; total: number | string; due_date: string | null; status: string; balance: number | string };

    // Cartera: la creó el disparador de la factura; se lee para devolverla.
    let accountReceivable: { id: string | null; amount: number; balance: number; due_date: string | null; status: string } | null = null;
    try {
      const { data: ar } = await supabase
        .from('accounts_receivable')
        .select('id, amount, balance, due_date, status')
        .eq('invoice_id', invoice.id)
        .maybeSingle();
      if (ar) {
        accountReceivable = { id: ar.id, amount: Number(ar.amount), balance: Number(ar.balance), due_date: ar.due_date, status: ar.status };
      }
    } catch (error) {
      console.warn('[posService] No se pudo leer la cuenta por cobrar de la deuda (sí se creó):', error);
    }

    const timezone = await getOrganizationTimezone(cart.organization_id || this.organizationId);
    const actualizado = this.mutateStoredCart(cartId, (c) => ({
      ...c,
      status: 'hold_with_debt',
      hold_reason: reason,
      notes: `Factura: ${invoice.number} | Vence: ${formatDateInTz(invoice.due_date, timezone)}`,
      sale_id: rpcResult.sale.id,
      invoice_id: invoice.id,
      debt_attempt_id: null,
    }));

    return {
      cart: actualizado,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: Number(invoice.total),
        due_date: invoice.due_date,
        status: invoice.status,
      },
      accountReceivable,
    };
  }

  // FACTURACIÓN
  // ===============================

  // ===============================
  // CHECKOUT Y VENTAS
  // ===============================
  static async checkout(checkoutData: CheckoutData): Promise<Sale> {
    // ── Desktop sin conexión real (fase 4B): la venta va al outbox ──
    // No se emite ningún fetch: el sobre completo queda en IndexedDB y se
    // reproduce con este mismo método al volver la red (`salesSync.ts`).
    // En navegador `shouldCheckoutOffline()` es siempre false.
    if (!checkoutData.replayFromOutbox && shouldCheckoutOffline()) {
      return this.checkoutOffline(checkoutData);
    }

    try {
      const { cart, payments } = checkoutData;

      // --- Evaluar promociones activas para POS ---
      // Aplica descuentos automáticos a items que no tengan discount_amount manual
      // Promociones que quedaron aplicadas en el carrito: se registran como uso
      // (promotions.usage_count) una vez creada la venta. Normalmente
      // calculateCartTotals ya dejó el descuento en el ítem antes del checkout,
      // así que el criterio es "la promoción coincide y el ítem tiene descuento".
      let promocionesUsadas: string[] = [];
      // En el cobro de una venta que ya existe (deuda, mesa) los descuentos ya
      // quedaron en sus líneas cuando se crearon: no se reevalúan promociones.
      const cobraVentaExistente = !!(checkoutData.settle?.sale_id || (cart.sale_id && cart.invoice_id));
      if (!cobraVentaExistente) {
      try {
        const promoResult = await promotionEngine.evaluate({
          channel: 'pos',
          items: cart.items.map(i => ({
            product_id: i.product_id,
            // Para que una promoción sobre el producto padre alcance a la variante.
            parent_product_id: i.product?.parent_product_id ?? null,
            category_id: i.product?.category_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
          organization_id: cart.organization_id,
          branch_id: cart.branch_id,
          customer_id: cart.customer_id,
        });

        if (promoResult.discountTotal > 0) {
          for (const item of cart.items) {
            if (!item.discount_amount || item.discount_amount === 0) {
              const promoDiscount = promoResult.itemDiscounts[item.product_id] || 0;
              if (promoDiscount > 0) {
                item.discount_amount = promoDiscount;
              }
            }
          }
          const productosConDescuento = new Set(
            cart.items.filter(i => (i.discount_amount || 0) > 0).map(i => i.product_id),
          );
          promocionesUsadas = promoResult.applied
            .filter(p => p.items_affected.some(pid => productosConDescuento.has(pid)))
            .map(p => p.promotion_id);
        }
      } catch (promoErr) {
        console.warn('[posService] No se pudieron evaluar promociones:', promoErr);
      }
      }

      // Calcular totales por item resolviendo tax_rate desde los impuestos del producto
      // cuando el item no lo trae (fallback si calculatedTotals falló en el CheckoutDialog)
      const checkoutTaxIncluded = checkoutData.tax_included || false;
      let calculatedSubtotal = 0;
      let calculatedTaxTotal = 0;
      let calculatedDiscount = 0;
      let calculatedGrandTotal = 0;

      const itemCalcs: Array<{
        lineNet: number;
        taxRate: number;
        taxAmount: number;
        total: number;
        taxIncluded: boolean;
        discount: number;
      }> = [];

      // F-42: tasa de la línea con el resolver único (mismo orden que
      // NuevaFacturaForm y cotizacionesService): item → product_tax_relations
      // → org default → 0.
      const tasaDeLinea = async (item: CartItem, itemTaxIncluded: boolean): Promise<number> => {
        const tasaPropia = Number(item.tax_rate) || 0;
        if (tasaPropia || !item.product_id) return tasaPropia;
        // La tarifa 0 que ya decidió el carrito (CheckoutDialog reparte el
        // impuesto y deja tax_amount en cada línea; la mesa trae el de la BD) es
        // definitiva: un carrito todo exento no se cobra con la tarifa por
        // defecto. Solo una línea sin cálculo previo consulta el resolver.
        const decididaPorElCarrito = typeof item.tax_rate === 'number' && typeof item.tax_amount === 'number';
        try {
          const resolved = await resolveLineTax({
            itemTaxRate: item.tax_rate,
            itemTaxIsFinal: decididaPorElCarrito,
            itemTaxCode: null,
            productId: item.product_id,
            organizationId: this.organizationId,
            taxIncluded: itemTaxIncluded,
            qty: item.quantity || 1,
            unitPrice: item.unit_price || 0,
            discountAmount: item.discount_amount || 0,
          });
          return resolved.tax_rate;
        } catch (taxErr) {
          console.warn('No se pudieron obtener impuestos del producto', item.product_id, taxErr);
          return 0;
        }
      };

      for (const item of cart.items) {
        const itemTaxIncluded = item.tax_included ?? checkoutTaxIncluded;
        // Regla única de la línea (la misma que valida pos_checkout_v1).
        itemCalcs.push(calcularLineaVenta({
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount || 0,
          tax_rate: await tasaDeLinea(item, itemTaxIncluded),
          tax_included: itemTaxIncluded,
        }));
      }

      // Cuenta dividida de una mesa: el resto de líneas sin pagar no se cobra
      // en este intento, pero el servidor necesita su tasa para recalcular y
      // validar la cuenta entera (misma resolución que las líneas cobradas).
      const lineasMesa: LineaMesaSinCobrar[] = [];
      if (checkoutData.settle?.table_session_id) {
        for (const item of checkoutData.settle.lineas_sin_cobrar ?? []) {
          const itemTaxIncluded = item.tax_included ?? checkoutTaxIncluded;
          lineasMesa.push({
            sale_item_id: String(item.id),
            product_id: item.product_id ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price || 0,
            tax_rate: await tasaDeLinea(item, itemTaxIncluded),
            tax_included: itemTaxIncluded,
          });
        }
      }
      ({
        subtotal: calculatedSubtotal,
        taxTotal: calculatedTaxTotal,
        discountTotal: calculatedDiscount,
        total: calculatedGrandTotal,
      } = totalesDeLineas(itemCalcs));

      // Usar los valores del carrito solo si son consistentes; si no, usar los calculados
      const cartSubtotal = Number(cart.subtotal) || 0;
      const cartTaxTotal = Number(cart.tax_total) || 0;
      const cartTotal = Number(cart.total) || 0;
      const cartDiscount = Number(cart.discount_total) || 0;

      // Cuando hay impuestos incluidos, cart.subtotal puede venir con impuesto dentro;
      // el subtotal correcto es la base gravable (sin impuesto)
      const effectiveSubtotal = calculatedSubtotal > 0
        ? calculatedSubtotal
        : cartSubtotal;
      const effectiveTaxTotal = calculatedTaxTotal > 0 ? calculatedTaxTotal : cartTaxTotal;
      const effectiveDiscount = calculatedDiscount > 0 ? calculatedDiscount : cartDiscount;

      // Calcular total final incluyendo flete y propina
      const shippingFee = checkoutData.shipping_fee || 0;
      const tipAmount = checkoutData.tip_amount || 0;
      const baseTotal = calculatedGrandTotal > 0 ? calculatedGrandTotal : cartTotal;
      const finalTotal = baseTotal + shippingFee + tipAmount;

      // Cobro de una venta que YA existe: la deuda (`cart.sale_id` +
      // `cart.invoice_id`) o la cuenta de una mesa (`checkoutData.settle`).
      const ventaExistenteId = checkoutData.settle?.sale_id
        ?? (cart.sale_id && cart.invoice_id ? cart.sale_id : null);

      // commission_amount de la factura (misma fórmula en la RPC y en el respaldo)
      const invoiceCommissionAmount = checkoutData.salesperson_id && checkoutData.commission_rate && checkoutData.commission_rate > 0
        ? (checkoutData.commission_method === 'fixed_amount'
            ? checkoutData.commission_rate
            : Math.round((effectiveSubtotal > 0 ? effectiveSubtotal : finalTotal) * checkoutData.commission_rate / 100 * 100) / 100)
        : 0;

      // ── Checkout atómico por RPC (fase 4E; deuda y mesa desde 2026-09-24) ──
      // Todo lo anterior (promociones, impuestos, totales) se calcula igual;
      // desde aquí un solo sobre a `pos_checkout_v1`: o entra todo o no entra
      // nada. Venta nueva: idempotente por `sale_id`. Cobro de una venta que ya
      // existe (mode 'settle'): idempotente por la llave del intento de cobro
      // (`attemptId`), para que un reintento no duplique pagos ni propina.
      // Si la RPC no está disponible, el cobro falla con un error visible:
      // degradarse a N inserts en transacciones separadas es lo que dejaba el
      // asiento a merced del orden de llegada (F-48, docs/decisiones/ADR-CC-002).
      // La sucursal es la del carrito (la caja donde entra el dinero), no la
      // seleccionada en otra pestaña.
      const rpcBranchId = cart.branch_id || getCurrentBranchId();
      if (!rpcBranchId) {
        throw new Error('No hay sucursal seleccionada: la venta no se guardó.');
      }
      const envelope = buildCheckoutEnvelope({
        checkout: checkoutData,
        saleId: ventaExistenteId || checkoutData.saleId || newSaleId(),
        createdAt: checkoutData.createdAt || new Date().toISOString(),
        organizationId: cart.organization_id || this.organizationId,
        branchId: rpcBranchId,
        userId: checkoutData.userId ?? null,
        currency: (await this.getBaseCurrency()).code,
        itemCalcs,
        subtotal: effectiveSubtotal,
        taxTotal: effectiveTaxTotal,
        discountTotal: effectiveDiscount,
        total: finalTotal,
        promotionIds: ventaExistenteId ? [] : promocionesUsadas,
        invoiceCommissionAmount,
        ...(ventaExistenteId
          ? {
              mode: 'settle' as const,
              paymentKey: checkoutData.attemptId || newSaleId(),
              settle: checkoutData.settle,
              lineasMesa,
            }
          : {}),
      });
      const rpcResult = await callCheckoutRpc(supabase, envelope);
      if (rpcResult) {
        if (rpcResult.warnings.length > 0) {
          console.warn('[posService] pos_checkout_v1 terminó con avisos (la venta sí se guardó):', rpcResult.warnings);
        }
        if (rpcResult.replayed) {
          console.log(`♻️ Venta ${envelope.sale_id} ya existía: la RPC completó ${rpcResult.completed.length > 0 ? rpcResult.completed.join(', ') : 'nada (ya estaba entera)'}`);
        }
        // Mismo cierre de carrito que el camino de siempre (y misma emisión a
        // la pantalla del cliente desde saveCartsToStorage).
        await this.removeCart(cart.id);
        // Membresías creadas/activadas por el cobro (misma transacción): las
        // pinta el post-venta (frame D2). Solo se agregan si las hay.
        return {
          ...rpcResult.sale,
          replayed: rpcResult.replayed,
          ...(rpcResult.membresias.length > 0 ? { membresias: rpcResult.membresias } : {}),
        };
      }
      throw new Error(
        'No se pudo registrar la venta: el servicio de cobro no está disponible. '
        + 'La venta NO se guardó; inténtalo de nuevo en unos segundos.',
      );
    } catch (error) {
      console.error('Error during checkout:', error);
      throw error;
    }
  }

  /**
   * Venta sin conexión (Desktop fase 4B): guarda el sobre en el outbox local
   * y devuelve una venta provisional con el mismo id que tendrá en Supabase.
   * No emite ningún fetch. El carrito se cierra igual que en línea (y la
   * pantalla del cliente recibe el mismo `onCartsSaved`).
   *
   * El cobro de una deuda (`cart.sale_id` + `cart.invoice_id`) actualiza una
   * venta que ya existe en la BD y no es reproducible por id: requiere red.
   */
  private static async checkoutOffline(checkoutData: CheckoutData): Promise<Sale> {
    const { cart } = checkoutData;
    if (cart.sale_id && cart.invoice_id) {
      throw new Error('Sin conexión: el cobro de una deuda pendiente necesita internet. La venta no se guardó.');
    }
    if (checkoutData.settle) {
      throw new Error('Sin conexión: el cobro de una cuenta que ya existe (mesa) necesita internet. La venta no se guardó.');
    }
    const branchId = cart.branch_id || getCurrentBranchId();
    if (!branchId) {
      throw new Error('Sin conexión: no hay sucursal seleccionada. La venta no se guardó.');
    }
    // getSession() lee el almacenamiento local; getUser() iría a la red.
    let userId: string | null = null;
    try {
      userId = (await supabase.auth.getSession()).data.session?.user?.id ?? null;
    } catch {
      userId = null;
    }
    const sale = await enqueueOfflineSale(checkoutData, {
      organizationId: cart.organization_id || this.organizationId,
      branchId,
      userId,
    });
    await this.removeCart(cart.id);
    console.log(`📴 Venta ${sale.id} guardada sin conexión como ${sale.receipt_number_local}`);
    return sale;
  }

  // ===============================
  // MÉTODOS DE PAGO Y MONEDAS
  // ===============================
  /** Fila de `organization_payment_methods` (con el nombre del join) → `PaymentMethod`. */
  private static mapPaymentMethodRow(method: {
    payment_method_code: string;
    is_active: boolean | null;
    settings: Record<string, unknown> | null;
    payment_methods?: { name: string } | null;
  }): PaymentMethod {
    return {
      id: method.payment_method_code,
      // El nombre propio de la organización (settings.display_name) manda sobre
      // el del catálogo global, que la organización ya no puede renombrar.
      name: nombreVisibleMetodo(method.settings, method.payment_methods?.name, method.payment_method_code),
      code: method.payment_method_code,
      type: method.payment_method_code === 'cash' ? 'cash' :
            method.payment_method_code === 'card' ? 'card' : 'digital',
      is_active: method.is_active ?? true,
      settings: method.settings ?? undefined,
      icon: this.getPaymentMethodIcon(method.payment_method_code),
      color: (typeof method.settings?.color === 'string' ? method.settings.color : undefined) || this.getPaymentMethodColor(method.payment_method_code)
    };
  }

  static async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      // Desktop sin red: mismas filas desde el catálogo local, mismo mapeo.
      // El orden es el de la organización (website_display_order, el que
      // arrastra en «Métodos de pago»), en línea y sin red.
      if (this.usesLocalCatalog()) {
        return ordenarMetodosDeLaOrganizacion(await posOfflineReads.getPaymentMethodRows(this.organizationId)).map((m) => this.mapPaymentMethodRow(m));
      }

      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          payment_method_code,
          is_active,
          settings,
          website_display_order,
          payment_methods!inner (
            name
          )
        `)
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('website_display_order', { ascending: true, nullsFirst: false })
        .order('payment_method_code', { ascending: true });

      if (error) throw error;

      const filas = (data || []) as unknown as Array<Parameters<typeof POSService.mapPaymentMethodRow>[0] & { website_display_order?: number | null }>;
      return ordenarMetodosDeLaOrganizacion(filas).map((method) => this.mapPaymentMethodRow(method));
    } catch (error) {
      console.error('Error getting payment methods:', error);
      // Fallback a métodos básicos
      return [
        { id: 'cash', name: 'Efectivo', code: 'cash', type: 'cash', is_active: true, icon: '💵', color: '#10B981' },
        { id: 'card', name: 'Tarjeta', code: 'card', type: 'card', is_active: true, icon: '💳', color: '#3B82F6' }
      ];
    }
  }

  static async getCurrencies(): Promise<Currency[]> {
    try {
      const orgId = this.organizationId;
      console.log('Getting currencies for organization:', orgId);
      
      if (!orgId) {
        throw new Error('Organization ID not found');
      }
      
      // Desktop sin red: mismas filas (forma de la RPC) desde el catálogo local.
      // Usar SQL query manual en lugar de la sintaxis de Supabase join
      const { data, error } = this.usesLocalCatalog()
        ? { data: await posOfflineReads.getCurrencyRows(orgId), error: null }
        : await supabase.rpc('get_organization_currencies', {
            p_organization_id: orgId
          });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }
      
      console.log('Currency data received:', data);
      
      if (!data || data.length === 0) {
        console.warn('No currencies found, using fallback');
        return [await this.monedaRespaldo()];
      }
      
      return (data as Array<{ code: string; name?: string | null; symbol?: string | null; decimals?: number | null; is_base?: boolean | null }>).map((curr) => ({
        code: curr.code,
        name: curr.name || curr.code,
        symbol: curr.symbol || '$',
        decimals: curr.decimals || 0,
        is_base: curr.is_base || false,
        is_active: true
      }));
    } catch (error) {
      console.error('Error getting organization currencies:', error);
      // Respaldo: la moneda base resuelta (cadena de resolveOrgCurrency).
      return [await this.monedaRespaldo()];
    }
  }

  /**
   * Moneda base de la organización. Delega en `resolveOrgCurrency`
   * (`src/lib/services/monedaOrganizacion.ts`, fuente única). Antes tenía su
   * propia lista con respaldo 'COP': una organización mexicana sin monedas
   * configuradas vendía en pesos colombianos.
   *
   * Sin red (escritorio) no se puede consultar la base: se usa la moneda
   * marcada como base en el catálogo local, y si tampoco hay, la que resuelva
   * `monedaRespaldo`.
   */
  static async getBaseCurrency(): Promise<Currency> {
    const orgId = this.organizationId;
    if (orgId && !this.usesLocalCatalog()) {
      const base = await resolveOrgCurrency(supabase, orgId);
      if (base.source !== 'fallback') {
        return { code: base.code, name: base.code, symbol: base.symbol || '$', decimals: base.decimals, is_base: true, is_active: true };
      }
    }
    try {
      const currencies = await this.getCurrencies();
      return currencies.find(c => c.is_base) || currencies[0] || (await this.monedaRespaldo());
    } catch (error) {
      console.error('Error getting base currency:', error);
      return this.monedaRespaldo();
    }
  }

  /** Respaldo cuando no hay monedas que listar: la cadena de `resolveOrgCurrency`, no 'COP'. */
  private static async monedaRespaldo(): Promise<Currency> {
    const orgId = this.organizationId;
    const base = orgId
      ? await resolveOrgCurrency(supabase, orgId)
      : { code: 'USD', symbol: '$', decimals: 2 };
    return { code: base.code, name: base.code, symbol: base.symbol || '$', decimals: base.decimals, is_base: true, is_active: true };
  }

  // ===============================
  // IMPUESTOS Y PRECIOS
  // ===============================

  // ===============================
  // MÉTODOS AUXILIARES
  // ===============================
  static async getProductById(productId: number): Promise<Product | null> {
    if (this.usesLocalCatalog()) {
      return (await posOfflineReads.getProductById(this.organizationId, productId)) as unknown as Product | null;
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(
            id,
            name,
            station,
            requires_preparation
          ),
          product_prices(
            price,
            effective_from,
            effective_to
          )
        `)
        .eq('id', productId)
        .eq('organization_id', this.organizationId)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        organization_id: data.organization_id,
        sku: data.sku,
        name: data.name,
        description: data.description,
        barcode: data.barcode,
        // Vigencia real (antes `.eq('effective_to', null)`, que es `= null` y
        // nunca coincide: con el `!inner` el producto no se encontraba).
        price: importePrecioVigente(data.product_prices) ?? 0,
        cost: 0, // TODO: Implementar desde product_costs
        stock_quantity: 0, // TODO: Implementar desde stock_levels
        min_stock_level: 0,
        category_id: data.category_id,
        category: data.categories,
        unit_code: data.unit_code,
        status: data.status,
        image: undefined, // TODO: Implementar desde product_images
        // tax_id legacy removido: los impuestos se consultan via product_tax_relations
        created_at: data.created_at,
        updated_at: data.updated_at,
        tag_id: data.tag_id,
        parent_product_id: data.parent_product_id,
        // Membresía (P1): el carrito exige cliente titular para esta línea.
        service_type: data.service_type ?? null
      };
    } catch (error) {
      console.error('Error getting product by id:', error);
      return null;
    }
  }

  /**
   * Precio vigente del producto para el carrito. Antes devolvía 0 si la
   * consulta fallaba o no había fila: el producto entraba GRATIS sin aviso.
   * Ahora falla con `ProductoSinPrecioError` (la pantalla lo muestra) y aplica
   * la vigencia real (`effective_from <= ahora < effective_to`); sin red en el
   * escritorio lee el catálogo local con la misma regla.
   */
  /** Precio vigente por unidad de venta (por kg) para mostrarlo en «Pesar»; misma regla que el carrito. */
  static async precioVigenteProducto(productId: number, productName?: string | null): Promise<number> {
    return this.getProductPrice(productId, productName);
  }

  private static async getProductPrice(productId: number, productName?: string | null): Promise<number> {
    let precio: number | null;
    try {
      if (this.usesLocalCatalog()) {
        precio = importePrecioVigente(await posOfflineReads.getProductPriceRows(this.organizationId, productId));
      } else {
        // La vigencia la filtra la consulta; la fila más reciente es la que rige.
        const ahora = new Date().toISOString();
        const { data, error } = await supabase
          .from('product_prices')
          .select('price, effective_from, effective_to')
          .eq('product_id', productId)
          .lte('effective_from', ahora)
          .or(`effective_to.is.null,effective_to.gt.${ahora}`)
          .order('effective_from', { ascending: false })
          .limit(1);
        if (error) throw error;
        const fila = (Array.isArray(data) ? data[0] : data) as { price?: number | string | null } | null | undefined;
        const n = fila ? Number(fila.price) : NaN;
        precio = fila && fila.price !== null && fila.price !== undefined && Number.isFinite(n) ? n : null;
      }
    } catch (error) {
      console.error('Error consultando el precio del producto:', productId, error);
      throw new ProductoSinPrecioError(productId, 'consulta_fallida', productName);
    }
    if (precio === null) {
      throw new ProductoSinPrecioError(productId, 'sin_precio', productName);
    }
    return precio;
  }

  private static getPaymentMethodIcon(code: string): string {
    const iconMap: { [key: string]: string } = {
      'cash': '💵',
      'card': '💳',
      'transfer': '🏦',
      'nequi': '🟣',
      'daviplata': '🟠',
      'pse': '🔗',
      'payu': '💎',
      'mp': '💙',
      'credit': '📋',
      'check': '📝'
    };
    return iconMap[code] || '💰';
  }

  private static getPaymentMethodColor(code: string): string {
    const colorMap: { [key: string]: string } = {
      'cash': '#10B981',
      'card': '#3B82F6',
      'transfer': '#8B5CF6',
      'nequi': '#5d2e8a',
      'daviplata': '#ff6b35',
      'pse': '#059669',
      'payu': '#F59E0B',
      'mp': '#1DA1F2',
      'credit': '#EF4444',
      'check': '#6B7280'
    };
    return colorMap[code] || '#6B7280';
  }

  private static async calculateCartTotals(cart: Cart): Promise<void> {
    // --- Evaluar promociones activas para POS ---
    try {
      const promoResult = await promotionEngine.evaluate({
        channel: 'pos',
        items: cart.items.map(i => ({
          product_id: i.product_id,
          // Para que una promoción sobre el producto padre alcance a la variante.
          parent_product_id: i.product?.parent_product_id ?? null,
          category_id: i.product?.category_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        organization_id: cart.organization_id,
        branch_id: cart.branch_id,
        customer_id: cart.customer_id,
      });

      if (promoResult.discountTotal > 0) {
        for (const item of cart.items) {
          if (!item.discount_amount || item.discount_amount === 0) {
            const promoDiscount = promoResult.itemDiscounts[item.product_id] || 0;
            if (promoDiscount > 0) {
              item.discount_amount = promoDiscount;
            }
          }
        }
      }
    } catch (promoErr) {
      console.warn('[posService] No se pudieron evaluar promociones en calculateCartTotals:', promoErr);
    }

    // Recalcular impuestos para cada ítem
    for (const item of cart.items) {
      await this.calculateItemTaxes(item);
    }
    
    // Calcular totales del carrito
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    cart.tax_total = cart.items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
    cart.discount_total = cart.items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
    // Si el impuesto está incluido en el precio, el subtotal ya contiene el impuesto
    // Por lo tanto, el total es subtotal - descuento (no se suma tax_total)
    const hasAnyTaxIncluded = cart.items.some(item => item.tax_included);
    if (hasAnyTaxIncluded) {
      // Para items con tax_included, el tax_amount ya está dentro del precio
      // Solo sumar tax_amount de items sin tax_included
      const extraTax = cart.items
        .filter(item => !item.tax_included)
        .reduce((sum, item) => sum + (item.tax_amount || 0), 0);
      cart.total = cart.subtotal + extraTax - cart.discount_total;
    } else {
      cart.total = cart.subtotal + cart.tax_total - cart.discount_total;
    }
  }

  private static async calculateItemTaxes(item: CartItem): Promise<void> {
    try {
      // Obtener los impuestos configurados para el producto
      const productTaxes = await this.getProductTaxes(item.product_id);
      
      if (productTaxes.length === 0) {
        // No hay impuestos configurados para el producto
        item.tax_amount = 0;
        item.tax_rate = 0;
        return;
      }

      const baseAmount = item.quantity * item.unit_price;
      const taxableBase = baseAmount - (item.discount_amount || 0);
      let totalTaxAmount = 0;
      let totalTaxRate = 0;

      // Calcular impuestos acumulativos sobre la base gravable (despues del descuento)
      for (const taxRelation of productTaxes) {
        const tax = taxRelation.organization_taxes;
        if (tax && tax.is_active) {
          const taxAmount = (taxableBase * tax.rate) / 100;
          totalTaxAmount += taxAmount;
          totalTaxRate += tax.rate;
        }
      }

      item.tax_amount = Math.round(totalTaxAmount * 100) / 100;
      item.tax_rate = totalTaxRate;

      if (item.tax_included) {
        // Impuesto incluido en el precio: el total NO suma el impuesto encima
        const taxPortion = taxableBase - (taxableBase / (1 + totalTaxRate / 100));
        item.tax_amount = Math.round(taxPortion * 100) / 100;
        item.total = taxableBase;
      } else {
        // Impuesto NO incluido: se suma encima del precio
        item.total = taxableBase + item.tax_amount;
      }
      
      console.log(`Tax calculation for ${item.product?.name}:`, {
        baseAmount,
        taxRate: totalTaxRate + '%',
        taxAmount: item.tax_amount,
        total: item.total
      });
      
    } catch (error) {
      console.error('Error calculating item taxes:', error);
      // En caso de error, no aplicar impuestos
      item.tax_amount = 0;
      item.tax_rate = 0;
      item.total = item.quantity * item.unit_price - (item.discount_amount || 0);
    }
  }

  // ===============================
  // MÉTODOS DE IMPUESTOS
  // ===============================
  static async getOrganizationTaxes(): Promise<any[]> {
    if (this.usesLocalCatalog()) return posOfflineReads.getOrganizationTaxes(this.organizationId);
    try {
      const { data, error } = await supabase
        .from('organization_taxes')
        .select('*')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      // Las retenciones (kind = 'withholding') no son impuestos de la venta:
      // no se ofrecen ni se suman en el POS (taxResolverCore).
      return sinRetenciones(data ?? []);
    } catch (error) {
      console.error('Error getting organization taxes:', error);
      return [];
    }
  }

  static async getProductTaxes(productId: number): Promise<any[]> {
    if (this.usesLocalCatalog()) return posOfflineReads.getProductTaxes(this.organizationId, productId);
    try {
      // Primero obtener las relaciones de impuestos del producto
      const { data: relations, error: relationsError } = await supabase
        .from('product_tax_relations')
        .select('tax_id')
        .eq('product_id', productId);

      if (relationsError) {
        console.warn('Product tax relations error for product', productId, ':', relationsError);
        return [];
      }
      
      console.log('Product tax relations:', relations);
      
      if (!relations || relations.length === 0) {
        return [];
      }

      // Luego obtener los detalles de los impuestos
      const taxIds = relations.map(rel => rel.tax_id);
      const { data: taxes, error: taxesError } = await supabase
        .from('organization_taxes')
        .select('*, tax_templates(code)')
        .in('id', taxIds)
        .eq('organization_id', this.organizationId)
        .eq('is_active', true);

      if (taxesError) {
        console.error('Error getting tax details:', taxesError);
        return [];
      }
      
      console.log('Tax details:', taxes);
      
      // Mapear a la estructura esperada. Una retención relacionada (clase
      // 'withholding') no es impuesto de la venta: no se suma a la línea (taxResolverCore).
      const result = sinRetenciones(taxes ?? []).map(tax => ({
        product_id: productId,
        tax_id: tax.id,
        organization_taxes: tax
      })) || [];
      
      console.log('Final product taxes result:', result);
      return result;
    } catch (error) {
      console.error('Error getting product taxes:', error);
      return [];
    }
  }

  private static saveCartToStorage(cart: Cart): void {
    const carts: Cart[] = JSON.parse(localStorage.getItem(`pos_carts_${this.organizationId}`) || '[]');
    const existingIndex = carts.findIndex((c: Cart) => c.id === cart.id);
    
    if (existingIndex >= 0) {
      carts[existingIndex] = cart;
    } else {
      carts.push(cart);
    }
    
    this.saveCartsToStorage(carts);
  }

  /**
   * ÚNICO punto de escritura de `pos_carts_<org>`: por aquí pasan todas las
   * mutaciones del carrito (agregar, quitar, cantidad, descuento, impuesto,
   * cliente, espera, activar, cobrar). Tras guardar se avisa a la pantalla
   * del cliente (PLAN §12 Fase 0); el aviso nunca lanza ni afecta a la venta.
   */
  private static saveCartsToStorage(carts: Cart[]): void {
    localStorage.setItem(`pos_carts_${this.organizationId}`, JSON.stringify(carts));
    getPosDisplayEmitter().onCartsSaved(carts);
  }

  /**
   * Descarta un carrito de `pos_carts_<org>`: al cobrar y al cerrar la pestaña
   * desde la página del POS. Hasta 2026-09-21 la página solo lo quitaba del
   * estado de React, así que al volver al POS reaparecían todos los carritos
   * cerrados (32 «activos» con productos en una caja real).
   *
   * Se filtra sobre la lista COMPLETA, no sobre `getActiveCarts()`: esa
   * excluye `hold_with_debt` y `cancelled`, y guardar su resultado los
   * borraba de paso (getInvoiceForCart y devoluciones los necesitan).
   */
  static async removeCart(cartId: string): Promise<void> {
    const allCarts: Cart[] = JSON.parse(localStorage.getItem(`pos_carts_${this.organizationId}`) || '[]');
    const filteredCarts = allCarts.filter(cart => cart.id !== cartId);
    this.saveCartsToStorage(filteredCarts);
  }

  /**
   * Obtener los datos completos de una factura para visualización o impresión
   * Usa la misma lógica que la página de facturas que ya funciona
   * @param cartId - ID del carrito que está en hold_with_debt
   * @returns Datos completos de la factura con items y customer
   */
  static async getInvoiceForCart(cartId: string): Promise<{
    invoice: any;
    items: any[];
    customer: any;
  }> {
    try {
      // 1. Obtener el carrito para extraer el número de factura
      const cartsData = localStorage.getItem(`pos_carts_${this.organizationId}`);
      if (!cartsData) {
        throw new Error('No se encontraron carritos almacenados');
      }
      
      const allCarts: Cart[] = JSON.parse(cartsData);
      const cart = allCarts.find(c => c.id === cartId);
        
      if (!cart || cart.status !== 'hold_with_debt') {
        throw new Error('Carrito no encontrado o no está en estado de deuda');
      }
      
      // 2. Extraer número de factura de las notas
      const invoiceNumber = cart.notes?.match(/Factura: ([^|]+)/)?.[1]?.trim();
      if (!invoiceNumber) {
        throw new Error('No se encontró el número de factura');
      }
      
      // 3. Obtener factura con customer info (MISMA LÓGICA que la página que funciona)
      const { data: facturaData, error: facturaError } = await supabase
        .from('invoice_sales')
        .select('*, customers(id, organization_id, full_name, first_name, last_name, email, phone, identification_type, identification_number, address, city, avatar_url, created_at, updated_at)')
        .eq('number', invoiceNumber)
        .eq('organization_id', this.organizationId)
        .single();

      if (facturaError) throw facturaError;
      if (!facturaData) throw new Error('No se encontró la factura');

      // 4. Obtener items (MISMA LÓGICA que la página que funciona)
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*, products(id, name, sku, description)')
        .eq('invoice_sales_id', facturaData.id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;
      
      // 5. Obtener pagos (MISMA LÓGICA que la página que funciona)
      const { data: pagosData, error: pagosError } = await supabase
        .from('payments')
        .select('*')
        .eq('source', 'invoice_sales')
        .eq('source_id', facturaData.id)
        .order('created_at', { ascending: false });

      if (pagosError) throw pagosError;
      
      // 6. Combinar todos los datos (MISMO FORMATO que la página que funciona)
      const facturaCompleta = {
        ...facturaData,
        items: itemsData || [],
        pagos: pagosData || []
      };
      
      return {
        invoice: facturaCompleta,
        items: itemsData || [],
        customer: facturaData.customers
      };
      
    } catch (error) {
      console.error('Error en getInvoiceForCart:', error);
      throw error;
    }
  }

  /**
   * Anular deuda con nota de crédito
   * Crea una nota de crédito que anula la factura original y salda todos los balances
   * @param cartId ID del carrito con deuda
   * @returns Carrito actualizado y datos de la nota de crédito
   */
  static async cancelDebtWithCreditNote(cartId: string, motivo?: string): Promise<{
    cart: Cart;
    creditNote: { id: string | null; number: string | null };
    /** Avisos de la RPC (p. ej. `factura_electronica_sin_nota_credito_dian`). */
    avisos: string[];
  }> {
    const allCarts = this.readAllCarts();
    const cart = allCarts.find((c) => c.id === cartId);
    if (!cart) {
      throw new Error('Carrito no encontrado');
    }
    if (cart.status !== 'hold_with_debt') {
      throw new Error('El carrito no tiene deuda pendiente');
    }
    if (!cart.sale_id || !cart.invoice_id) {
      throw new Error('El carrito no tiene sale_id o invoice_id. Es posible que la deuda se haya creado antes de esta corrección.');
    }

    // Una sola RPC transaccional (antes: nota crédito, factura, venta y
    // cartera escritas a mano desde el navegador, sin permiso). Exige pos.void
    // en el servidor; la cartera la ajustan los disparadores.
    const resultado = await anularVentaEnServidor(cart.sale_id, motivo || 'Deuda anulada desde el POS');

    const actualizado = this.mutateStoredCart(cartId, (c) => ({
      ...c,
      status: 'cancelled',
      hold_reason: 'Deuda anulada con nota de crédito',
    }));
    return {
      cart: actualizado,
      creditNote: { id: resultado.nota_credito_id, number: resultado.nota_credito_numero },
      avisos: resultado.avisos,
    };
  }

  /**
   * Obtener miembros de la organización (para propinas)
   */
  static async getOrganizationMembers(): Promise<any[]> {
    try {
      const orgId = getOrganizationId();
      if (!orgId) {
        console.warn('No organization ID available');
        return [];
      }

      // Obtener miembros activos
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('user_id, role_id, is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      // Obtener perfiles de los usuarios
      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Crear mapa de perfiles
      const profilesMap: Record<string, any> = {};
      (profiles || []).forEach(p => {
        profilesMap[p.id] = p;
      });

      // Combinar datos
      return members.map(m => {
        const profile = profilesMap[m.user_id];
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
        
        return {
          user_id: m.user_id,
          role_id: m.role_id,
          is_active: m.is_active,
          users: profile ? {
            id: profile.id,
            email: profile.email,
            first_name: firstName,
            last_name: lastName,
            raw_user_meta_data: {
              full_name: fullName,
              name: firstName || null
            }
          } : null
        };
      });
    } catch (error) {
      console.error('Error fetching organization members:', error);
      return [];
    }
  }
}
