'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Search, Package, Plus, ShoppingCart, PackagePlus, Layers, SlidersHorizontal, Star, Flame, ChefHat } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ProductoFormDialog } from '@/components/shared/form-dialogs';
import { VariantSelectorDialog, type SelectedModifier } from '@/components/pos/VariantSelectorDialog';
import { formatCurrency } from '@/utils/Utils';
import { recipeService, type ProductRecipe } from '@/lib/services/recipeService';
import type { UnifiedProduct, ProductSearchMode } from './types';

export type { UnifiedProduct, ProductSearchMode, SelectedModifier } from './types';

interface ProductSearchDialogProps {
  mode: ProductSearchMode;
  currency: string;
  onProductSelect: (product: UnifiedProduct, modifiers?: SelectedModifier[]) => void;
  selectedProductIds?: number[];
  branchId?: number;
  /** Mostrar botón "Crear Producto" fuera del diálogo */
  showCreateButton?: boolean;
  /** Filtrar productos por proveedor */
  supplierId?: number | null;
}

export function ProductSearchDialog({
  mode,
  currency,
  onProductSelect,
  selectedProductIds = [],
  branchId,
  showCreateButton = false,
  supplierId = null,
}: ProductSearchDialogProps) {
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<UnifiedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParent, setSelectedParent] = useState<UnifiedProduct | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [supplierProductIds, setSupplierProductIds] = useState<Set<number>>(new Set());
  const [supplierCosts, setSupplierCosts] = useState<Map<number, number>>(new Map());
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [togglingFavorites, setTogglingFavorites] = useState<Set<number>>(new Set());
  const organizationId = getOrganizationId();
  // Diálogo de detalle de receta vinculada a un producto
  const [recipeView, setRecipeView] = useState<ProductRecipe | null>(null);
  const [recipeViewLoading, setRecipeViewLoading] = useState(false);

  // Cargar IDs de productos del proveedor cuando cambia supplierId
  useEffect(() => {
    if (!supplierId) {
      setSupplierProductIds(new Set());
      setSupplierCosts(new Map());
      return;
    }
    const loadSupplierProducts = async () => {
      const supplierProducts = await supplierService.getProductsBySupplier(supplierId);
      setSupplierProductIds(new Set(supplierProducts.map(p => p.product_id)));
      setSupplierCosts(new Map(supplierProducts.map(p => [p.product_id, p.cost])));
      setShowAllProducts(false);
    };
    loadSupplierProducts();
  }, [supplierId]);

  // Debounce para la búsqueda
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Cargar productos al abrir el diálogo
  useEffect(() => {
    if (isDialogOpen && organizationId) {
      setCurrentPage(1);
      setSearchTerm('');
      cargarProductos();
    }
  }, [isDialogOpen, organizationId]);

  // Filtrar productos con debounce
  useEffect(() => {
    // Base: todos los productos o solo los del proveedor
    const baseProducts = showAllProducts || supplierProductIds.size === 0
      ? products
      : products.filter(p => supplierProductIds.has(p.id));

    if (debouncedSearch.trim()) {
      const search = debouncedSearch.toLowerCase();
      const filtered = baseProducts.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search) ||
        p.description?.toLowerCase().includes(search) ||
        p.search_terms?.toLowerCase().includes(search)
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(baseProducts);
    }
    setCurrentPage(1);
  }, [debouncedSearch, products, showAllProducts, supplierProductIds]);

  // Función para cargar productos (RPC trae todo en 1 query server-side)
  const cargarProductos = async () => {
    try {
      setIsLoading(true);

      const rpcName = mode === 'sale'
        ? 'get_products_with_latest_prices'
        : 'get_products_with_latest_costs';

      // 1 sola query RPC: trae productos + precios + costos + impuestos + track_stock
      const { data: rpcData, error: rpcError } = await supabase
        .rpc(rpcName, { org_id: organizationId });

      if (rpcError || !rpcData) {
        console.error('RPC error:', rpcError);
        throw rpcError || new Error('RPC sin datos');
      }

      // Filtrar variantes hijas
      const products = (rpcData as any[]).filter((p: any) => !p.parent_product_id);
      if (products.length === 0) {
        setProducts([]);
        setFilteredProducts([]);
        return;
      }

      const productIds = products.map(p => p.id);
      const parentIds = products.filter((p: any) => p.is_parent).map((p: any) => p.id);

      // 2. Queries auxiliares en paralelo (variantes, modificadores, stock, favoritos, ventas)
      const [variantsResult, modifiersResult, stockResult, favoritesResult, salesResult] = await Promise.all([
        // Variantes hijas (con sku/name para enriquecer search_terms del padre)
        parentIds.length > 0
          ? supabase
              .from('products')
              .select('id, parent_product_id, sku, name')
              .in('parent_product_id', parentIds)
              .eq('status', 'active')
          : Promise.resolve({ data: [] as any[], error: null }),

        // Modificadores (grupos - para detectar qué productos tienen modificadores)
        supabase
          .from('product_modifier_groups')
          .select('id, product_id, name')
          .in('product_id', productIds),

        // Stock de productos padre (solo sale con branchId)
        // Ordenar por id DESC para que el más reciente quede primero
        // (stock_levels puede tener duplicados por bug en stock movements)
        mode === 'sale' && branchId
          ? supabase
              .from('stock_levels')
              .select('id, product_id, qty_on_hand')
              .eq('branch_id', branchId)
              .in('product_id', productIds)
              .order('id', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),

        // Favoritos de la organización
        supabase
          .from('product_favorites')
          .select('product_id')
          .eq('organization_id', organizationId),

        // Ventas de los últimos 90 días (agrupadas por product_id)
        // Usa la misma ventana que la RPC pos_product_ranking del POS
        supabase
          .from('sale_items')
          .select('product_id, quantity')
          .in('product_id', productIds)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      // Queries dependientes de modifiersResult (nombres de opciones) y recetas,
      // ejecutadas en paralelo después del Promise.all principal.
      const groupIds = (modifiersResult.data || []).map((g: any) => g.id);
      const [modifierNamesResult, recipesResult] = await Promise.all([
        // Opciones de modificadores (nombres) para enriquecer search_terms
        groupIds.length > 0
          ? supabase
              .from('product_modifiers')
              .select('group_id, name')
              .eq('is_active', true)
              .in('group_id', groupIds)
          : Promise.resolve({ data: [] as any[], error: null as any }),
        // Recetas activas vinculadas (para mostrar badge/botón de "ver receta")
        productIds.length > 0
          ? supabase
              .from('product_recipes')
              .select('id, product_id, name')
              .in('product_id', productIds)
              .eq('is_active', true)
          : Promise.resolve({ data: [] as any[], error: null as any }),
      ]);

      // Variant count map
      const variantCountMap: Record<number, number> = {};
      const variantIds: number[] = [];
      (variantsResult.data || []).forEach((v: any) => {
        variantCountMap[v.parent_product_id] = (variantCountMap[v.parent_product_id] || 0) + 1;
        variantIds.push(v.id);
      });

      // Modifiers set
      const productsWithModifiers = new Set<number>();
      (modifiersResult.data || []).forEach((g: any) => productsWithModifiers.add(g.product_id));

      // Stock map (productos padre)
      // Tomar solo el registro mas reciente por producto (id mas alto)
      // para evitar sumar duplicados de stock_levels
      const stockMap = new Map<number, number>();
      for (const row of (stockResult.data || [])) {
        if (!stockMap.has(row.product_id)) {
          stockMap.set(row.product_id, Number(row.qty_on_hand) || 0);
        }
      }

      // Stock de variantes (1 query extra, solo si hay variantes)
      const stockDeVariantes = new Map<number, number>();
      if (mode === 'sale' && branchId && variantIds.length > 0) {
        const { data: variantStock } = await supabase
          .from('stock_levels')
          .select('id, product_id, qty_on_hand')
          .eq('branch_id', branchId)
          .in('product_id', variantIds)
          .order('id', { ascending: false });

        const variantStockMap = new Map<number, number>();
        for (const row of (variantStock || [])) {
          if (!variantStockMap.has(row.product_id)) {
            variantStockMap.set(row.product_id, Number(row.qty_on_hand) || 0);
          }
        }
        for (const variant of (variantsResult.data || [])) {
          stockDeVariantes.set(
            variant.parent_product_id,
            (stockDeVariantes.get(variant.parent_product_id) || 0) + (variantStockMap.get(variant.id) || 0)
          );
        }
      }

      // Mapa de favoritos: product_id -> true
      const favoriteSet = new Set<number>();
      (favoritesResult.data || []).forEach((f: any) => favoriteSet.add(f.product_id));

      // Mapa de ventas de los últimos 90 días: product_id -> total_quantity
      const salesCountMap = new Map<number, number>();
      for (const row of (salesResult.data || [])) {
        const pid = row.product_id as number;
        salesCountMap.set(pid, (salesCountMap.get(pid) || 0) + (Number(row.quantity) || 0));
      }

      // search_terms por producto: concatena SKUs/nombres de variantes hijas,
      // nombres de grupos de modificadores y nombres de opciones de modificadores.
      // Permite que el filtro client-side encuentre el padre al buscar una variante
      // o un modificador por nombre/SKU.
      const searchTermsMap = new Map<number, string[]>();
      const groupIdToProductId = new Map<number, number>();
      (modifiersResult.data || []).forEach((g: any) => {
        groupIdToProductId.set(g.id, g.product_id);
        if (g.name) {
          const arr = searchTermsMap.get(g.product_id) || [];
          arr.push(String(g.name).toLowerCase());
          searchTermsMap.set(g.product_id, arr);
        }
      });
      (modifierNamesResult.data || []).forEach((m: any) => {
        const pid = groupIdToProductId.get(m.group_id);
        if (pid && m.name) {
          const arr = searchTermsMap.get(pid) || [];
          arr.push(String(m.name).toLowerCase());
          searchTermsMap.set(pid, arr);
        }
      });
      (variantsResult.data || []).forEach((v: any) => {
        const arr = searchTermsMap.get(v.parent_product_id) || [];
        if (v.sku) arr.push(String(v.sku).toLowerCase());
        if (v.name) arr.push(String(v.name).toLowerCase());
        searchTermsMap.set(v.parent_product_id, arr);
      });

      // Recetas activas: product_id -> { id, name }
      const recipeMap = new Map<number, { id: number; name: string | null }>();
      (recipesResult.data || []).forEach((r: any) => {
        if (!recipeMap.has(r.product_id)) {
          recipeMap.set(r.product_id, { id: r.id, name: r.name ?? null });
        }
      });

      // Construir productos finales
      const formattedProducts: UnifiedProduct[] = products.map((product: any) => {
        const variantCount = variantCountMap[product.id] || 0;
        const track = product.track_stock === true;
        const qty = (stockMap.get(product.id) || 0) + (stockDeVariantes.get(product.id) || 0);
        const recipe = recipeMap.get(product.id);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          price: Number(product.price) || 0,
          cost: Number(product.cost) || 0,
          tax_code: product.tax_code || undefined,
          tax_name: product.tax_name || undefined,
          tax_rate: product.tax_rate ? Number(product.tax_rate) : undefined,
          is_parent: product.is_parent,
          has_variants: product.is_parent === true && variantCount > 0,
          variant_count: variantCount,
          has_modifiers: productsWithModifiers.has(product.id),
          track_stock: track,
          stock_qty: qty,
          is_out_of_stock: mode === 'sale' && Boolean(branchId) && track && qty <= 0,
          track_serial: product.track_serial === true,
          is_favorite: favoriteSet.has(product.id),
          sales_count_90d: salesCountMap.get(product.id) || 0,
          search_terms: (searchTermsMap.get(product.id) || []).join(' '),
          has_recipe: !!recipe,
          recipe_id: recipe?.id ?? null,
          recipe_name: recipe?.name ?? null,
        };
      });

      // Ordenar: favoritos primero, luego más vendidos, luego por nombre
      formattedProducts.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        const sa = a.sales_count_90d || 0;
        const sb = b.sales_count_90d || 0;
        if (sb !== sa) return sb - sa;
        return a.name.localeCompare(b.name);
      });

      setProducts(formattedProducts);
      setFilteredProducts(formattedProducts);
    } catch (err) {
      console.error('Error al cargar productos:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los productos. Intente nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar selección de producto
  const handleSelectProduct = useCallback((product: UnifiedProduct, modifiers: SelectedModifier[] = []) => {
    // Bloquear productos agotados (solo modo sale con control de inventario)
    if (mode === 'sale' && product.is_out_of_stock) {
      toast({
        title: 'Producto agotado',
        description: `"${product.name}" no tiene existencias disponibles.`,
        variant: 'destructive',
      });
      return;
    }

    // Si tiene variantes o modificadores, abrir selector
    if ((product.has_variants && product.variant_count && product.variant_count > 0) || product.has_modifiers) {
      setSelectedParent(product);
      setShowVariantDialog(true);
      return;
    }

    // Aplicar costo del proveedor si está disponible (modo compra)
    const supplierCost = supplierCosts.get(product.id);
    const productWithSupplierCost = (mode === 'purchase' && supplierCost && supplierCost > 0)
      ? { ...product, cost: supplierCost }
      : product;

    // Producto simple: seleccionar directamente
    onProductSelect(productWithSupplierCost, modifiers);
    setIsDialogOpen(false);
    setSearchTerm('');

    toast({
      title: 'Producto seleccionado',
      description: `${product.name} agregado.`,
    });
  }, [onProductSelect, mode]);

  // Manejar selección de variante desde el diálogo
  const handleVariantSelect = (variant: any, modifiers: SelectedModifier[] = []) => {
    const parent = selectedParent as any;
    const enrichedVariant: UnifiedProduct = {
      ...variant,
      tax_code: variant.tax_code || parent?.tax_code,
      tax_rate: variant.tax_rate || parent?.tax_rate,
      tax_name: variant.tax_name || parent?.tax_name,
      cost: variant.cost ?? parent?.cost ?? 0,
      price: variant.price ?? parent?.price ?? 0,
    };

    onProductSelect(enrichedVariant, modifiers);
    setShowVariantDialog(false);
    setSelectedParent(null);
    setIsDialogOpen(false);
    setSearchTerm('');
  };

  // Ver la receta vinculada a un producto (abre un diálogo con ingredientes y rendimiento).
  // No selecciona el producto: es solo consulta desde el catálogo.
  const handleViewRecipe = async (product: UnifiedProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.recipe_id) return;
    try {
      setRecipeViewLoading(true);
      setRecipeView(null);
      const recipe = await recipeService.getRecipeById(product.recipe_id);
      setRecipeView(recipe);
    } catch (error) {
      console.error('Error cargando receta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la receta del producto',
        variant: 'destructive',
      });
    } finally {
      setRecipeViewLoading(false);
    }
  };

  // Toggle de favorito: marca/desmarca el producto como favorito de la organización.
  // Optimistic update en el estado local; si falla, revierte. No selecciona el producto.
  const handleToggleFavorite = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingFavorites.has(productId)) return;

    const wasFavorite = products.find(p => p.id === productId)?.is_favorite ?? false;
    const updateProduct = (prev: UnifiedProduct[], fav: boolean) =>
      prev.map(p => p.id === productId ? { ...p, is_favorite: fav } : p);

    setProducts(prev => updateProduct(prev, !wasFavorite));
    setFilteredProducts(prev => updateProduct(prev, !wasFavorite));
    setTogglingFavorites(prev => new Set(prev).add(productId));

    try {
      const { POSService } = await import('@/lib/services/posService');
      const isNowFavorite = await POSService.toggleProductFavorite(productId);
      setProducts(prev => updateProduct(prev, isNowFavorite));
      setFilteredProducts(prev => updateProduct(prev, isNowFavorite));
      toast({
        title: isNowFavorite ? 'Agregado a favoritos' : 'Quitado de favoritos',
        description: isNowFavorite
          ? 'El producto aparecerá primero.'
          : 'El producto ya no se priorizará.',
        duration: 1800,
      });
    } catch (error) {
      setProducts(prev => updateProduct(prev, wasFavorite));
      setFilteredProducts(prev => updateProduct(prev, wasFavorite));
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el favorito.',
        variant: 'destructive',
      });
    } finally {
      setTogglingFavorites(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  // Cuando el diálogo compartido crea un producto
  const handleProductoCreado = async (product: { id: number; name: string; sku: string; price: number; cost: number }) => {
    await cargarProductos();
    handleSelectProduct({
      id: product.id,
      name: product.name,
      sku: product.sku,
      cost: product.cost || 0,
      price: product.price || 0,
    });
  };

  // Etiqueta del precio principal según el modo
  const priceLabel = mode === 'sale' ? 'Precio' : 'Costo';
  const priceValue = (p: UnifiedProduct) => mode === 'sale' ? p.price : p.cost;
  const refValue = (p: UnifiedProduct) => mode === 'sale' ? null : p.price;
  const refLabel = mode === 'sale' ? null : 'P.V. ref.';

  // Paginación con useMemo
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(startIndex, startIndex + pageSize),
    [filteredProducts, startIndex, pageSize]
  );
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  return (
    <>
      <div className="flex gap-2">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Buscar Productos</span>
              <span className="sm:hidden">Productos</span>
            </Button>
          </DialogTrigger>

        <DialogContent className="w-full max-w-[95vw] lg:max-w-6xl max-h-[90dvh] h-[80dvh] sm:h-[90dvh] overflow-hidden flex flex-col dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg sm:text-xl text-gray-900 dark:text-white">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="truncate">Catálogo de Productos</span>
              <Badge variant="outline" className="ml-2 text-xs dark:border-gray-600 dark:text-gray-300">
                {mode === 'sale' ? 'Venta' : 'Compra'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col space-y-3 sm:space-y-4 flex-1 min-h-0 overflow-hidden">
            {/* Barra de búsqueda */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Buscar por nombre, SKU, variantes o modificadores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                  autoFocus
                />
              </div>

              <Button
                type="button"
                onClick={() => setIsNewProductOpen(true)}
                variant="outline"
                size="sm"
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 whitespace-nowrap"
              >
                <PackagePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
                <span className="hidden sm:inline">Crear Producto</span>
                <span className="sm:hidden">Crear</span>
              </Button>

              <Button
                onClick={cargarProductos}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 whitespace-nowrap"
              >
                {isLoading ? 'Cargando...' : 'Actualizar'}
              </Button>
            </div>

            {/* Estadísticas y toggle de filtro por proveedor */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-3">
                <span className="truncate">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{filteredProducts.length}</span> de {products.length} productos
                  <span className="hidden md:inline">{debouncedSearch && ` - Filtrando por "${debouncedSearch}"`}</span>
                </span>
                {supplierProductIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllProducts(!showAllProducts)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    {showAllProducts
                      ? `Solo del proveedor (${supplierProductIds.size})`
                      : `Ver todos (${products.length})`}
                  </button>
                )}
              </div>
              {selectedProductIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
                  {selectedProductIds.length} seleccionados
                </Badge>
              )}
            </div>

            {/* Lista de productos */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 pb-2">
              {isLoading ? (
                <>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                        <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </>
              ) : paginatedProducts.length > 0 ? (
                paginatedProducts.map((product) => {
                  const isSelected = selectedProductIds.includes(product.id);
                  const isOutOfStock = mode === 'sale' && product.is_out_of_stock;

                  return (
                    <Card
                      key={product.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700'
                          : isOutOfStock
                            ? 'opacity-60 dark:bg-gray-800/50 dark:border-gray-700'
                            : 'hover:border-blue-300 dark:hover:border-blue-600 dark:bg-gray-800/50 dark:border-gray-700'
                      }`}
                      onClick={() => !isSelected && !isOutOfStock && handleSelectProduct(product)}
                    >
                      <CardContent className="p-2 sm:p-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                          {/* Información del producto */}
                          <div className="flex-1 min-w-0 w-full sm:w-auto">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                                  {product.name}
                                </h4>
                                {isOutOfStock && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                    Agotado
                                  </span>
                                )}
                                {product.has_variants && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex items-center gap-0.5">
                                    <Layers className="w-2.5 h-2.5" />
                                    {product.variant_count} variantes
                                  </span>
                                )}
                                {product.has_modifiers && !product.has_variants && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 flex items-center gap-0.5">
                                    <SlidersHorizontal className="w-2.5 h-2.5" />
                                    Modificable
                                  </span>
                                )}
                                {Number(product.sales_count_90d) > 0 && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 flex items-center gap-0.5"
                                    title={`${Math.round(Number(product.sales_count_90d))} unidades vendidas en los últimos 90 días`}
                                  >
                                    <Flame className="w-2.5 h-2.5" />
                                    Top
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 dark:border-gray-600 dark:text-gray-300">
                                  {product.sku}
                                </Badge>
                                {product.tax_rate != null && (
                                  <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 dark:bg-gray-700 dark:text-gray-300">
                                    {product.tax_rate}%
                                  </Badge>
                                )}
                                {product.has_recipe && product.recipe_id && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleViewRecipe(product, e)}
                                    aria-label="Ver receta de producción"
                                    title="Ver receta de producción"
                                    className="rounded-full p-1 text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/40 transition-colors"
                                  >
                                    <ChefHat className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleFavorite(product.id, e)}
                                  disabled={togglingFavorites.has(product.id)}
                                  aria-label={product.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                  title={product.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                  className={`rounded-full p-1 transition-all duration-150 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                                    product.is_favorite
                                      ? 'bg-amber-400 text-white hover:bg-amber-500'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  <Star className={`w-3 h-3 ${product.is_favorite ? 'fill-current' : ''}`} />
                                </button>
                              </div>
                            </div>

                            {product.description && (
                              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
                                {product.description}
                              </p>
                            )}

                            <div className="flex items-center justify-between">
                              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                                {/* Precio/Costo principal */}
                                <div>
                                  <div className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-500">
                                    {formatCurrency(priceValue(product), currency)}
                                  </div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                    {priceLabel}
                                  </div>
                                </div>
                                {/* Precio de referencia (solo compra) */}
                                {(() => {
                                  const ref = refValue(product);
                                  return ref != null && ref > 0 && (
                                    <div>
                                      <div className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {formatCurrency(ref, currency)}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                        {refLabel}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {/* Stock disponible (solo venta) */}
                                {mode === 'sale' && product.track_stock && (
                                  <div>
                                    <div className={`text-xs sm:text-sm font-medium ${isOutOfStock ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {product.stock_qty ?? 0}
                                    </div>
                                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                      Disponible
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Botón de acción */}
                          <div className="flex-shrink-0 w-full sm:w-auto">
                            {isSelected ? (
                              <Button
                                size="sm"
                                disabled
                                variant="secondary"
                                className="w-full sm:w-auto h-8 text-xs sm:text-sm bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                              >
                                ✓ Seleccionado
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={isOutOfStock}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectProduct(product);
                                }}
                                className="w-full sm:w-auto h-8 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                              >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                                {product.has_variants ? 'Elegir' : 'Agregar'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <div className="text-center">
                    <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50 text-gray-400 dark:text-gray-600" />
                    <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                      {debouncedSearch ? 'No se encontraron productos' : 'No hay productos disponibles'}
                    </p>
                    {debouncedSearch && (
                      <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Intenta con otros términos de búsqueda
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  <span>Página {currentPage} de {totalPages}</span>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline">{filteredProducts.length} productos</span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    «
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ‹
                  </Button>
                  {pageNumbers.map(num => (
                    <Button
                      key={num}
                      type="button"
                      variant={num === currentPage ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setCurrentPage(num)}
                    >
                      {num}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    ›
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    »
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
        </Dialog>

        {showCreateButton && (
          <Button
            type="button"
            onClick={() => setIsNewProductOpen(true)}
            variant="outline"
            size="sm"
            className="h-8 sm:h-9 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 whitespace-nowrap"
          >
            <PackagePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Crear Producto</span>
            <span className="sm:hidden">Crear</span>
          </Button>
        )}
      </div>

      {/* Selector de variantes y modificadores */}
      {selectedParent && (
        <VariantSelectorDialog
          open={showVariantDialog}
          onOpenChange={setShowVariantDialog}
          product={{
            id: selectedParent.id,
            name: selectedParent.name,
            sku: selectedParent.sku,
            price: mode === 'sale' ? selectedParent.price : selectedParent.cost,
          }}
          onSelectVariant={handleVariantSelect}
        />
      )}

      {/* Diálogo compartido: crear nuevo producto */}
      <ProductoFormDialog
        open={isNewProductOpen}
        onOpenChange={setIsNewProductOpen}
        onCreated={handleProductoCreado}
      />

      {/* Diálogo de detalle de receta vinculada */}
      <Dialog open={!!recipeView || recipeViewLoading} onOpenChange={(open) => { if (!open) { setRecipeView(null); setRecipeViewLoading(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-orange-600" />
              Receta de producción
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {recipeView?.product?.name ?? recipeView?.name ?? ''}
            </DialogDescription>
          </DialogHeader>

          {recipeViewLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ) : recipeView ? (
            <div className="space-y-4">
              {/* Info general */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Producto</p>
                  <p className="font-medium dark:text-white">
                    {recipeView.product?.name ?? `#${recipeView.product_id}`}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    SKU: {recipeView.product?.sku ?? 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Rendimiento</p>
                  <p className="font-medium dark:text-white font-mono">
                    {recipeView.yield_qty} {recipeView.yield_unit_code ?? ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                  <Badge
                    className={
                      recipeView.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : ''
                    }
                    variant={recipeView.is_active ? 'default' : 'secondary'}
                  >
                    {recipeView.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Versión</p>
                  <p className="font-medium dark:text-white font-mono">v{recipeView.version}</p>
                </div>
              </div>

              {/* Notas */}
              {recipeView.notes && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                  <p className="text-sm dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg whitespace-pre-wrap">
                    {recipeView.notes}
                  </p>
                </div>
              )}

              {/* Ingredientes */}
              <div>
                <p className="text-sm font-medium dark:text-gray-300 mb-2">
                  Ingredientes ({recipeView.ingredients?.length ?? 0})
                </p>
                <div className="space-y-2">
                  {recipeView.ingredients?.length ? (
                    recipeView.ingredients.map((ing, i) => (
                      <div
                        key={ing.id}
                        className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-mono w-6">#{i + 1}</span>
                          <div>
                            <p className="font-medium text-sm dark:text-white">
                              {ing.ingredient_product?.name ?? `#${ing.ingredient_product_id}`}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {ing.ingredient_product?.sku ?? 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm dark:text-gray-200">
                            {ing.quantity} {ing.unit_code}
                          </span>
                          {ing.is_optional && (
                            <Badge variant="secondary" className="text-[0.6rem]">Opcional</Badge>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Esta receta no tiene ingredientes definidos.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
