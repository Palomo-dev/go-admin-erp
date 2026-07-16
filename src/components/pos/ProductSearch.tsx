'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Product, Category, PaginatedResponse } from './types';
import { POSService } from '@/lib/services/posService';
import { 
  Search, 
  Package, 
  ShoppingCart, 
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Grid3X3,
  ChevronUp,
  ChevronDown,
  Scan,
  Tag,
  Percent
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { SearchSelect } from '@/components/ui/search-select';
import { cn, formatCurrency } from '@/utils/Utils';
import Image from 'next/image';
import { BarcodeScanner } from '@/components/ui/barcode-scanner';
import { VariantSelectorDialog } from './VariantSelectorDialog';
import { CategoryFilterBar } from './CategoryFilterBar';
import { ConfiguracionService, PosCategoriesDisplayConfig, defaultCategoriesDisplayConfig } from './configuracion/configuracionService';

interface ProductSearchProps {
  onProductSelect: (product: Product) => void;
  selectedProducts?: Product[];
}

export function ProductSearch({ onProductSelect }: ProductSearchProps) {
  const [productsData, setProductsData] = useState<PaginatedResponse<Product>>({
    data: [],
    total: 0,
    page: 1,
    limit: 16,
    totalPages: 0
  });
  const [loading, setLoading] = useState(true);
  
  // Estado para selector de variantes
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesDisplay, setCategoriesDisplay] = useState<PosCategoriesDisplayConfig>(defaultCategoriesDisplayConfig);
  const [error, setError] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState<'small' | 'large'>('large');
  const [showScanner, setShowScanner] = useState(false);
  
  // Límites dinámicos por tipo de grid
  const smallGridLimits = [12, 18, 24];
  const largeGridLimits = [8, 12, 16];
  const [smallGridLimitIndex, setSmallGridLimitIndex] = useState(1); // Inicia con 12
  const [largeGridLimitIndex, setLargeGridLimitIndex] = useState(0); // Inicia con 12
  
  // Función para obtener el límite actual según el gridSize
  const getCurrentLimit = () => {
    if (gridSize === 'small') {
      return smallGridLimits[smallGridLimitIndex];
    } else {
      return largeGridLimits[largeGridLimitIndex];
    }
  };

  const loadProducts = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentLimit = getCurrentLimit();
      const result = await POSService.getProductsPaginated({
        page,
        limit: currentLimit,
        search: searchTerm,
        category_id: selectedCategory,
        status: 'active'
      });
      
      setProductsData(result);
    } catch (error) {
      console.error('Error loading products:', error);
      setError('Error al cargar productos');
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los productos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, gridSize, smallGridLimitIndex, largeGridLimitIndex]);

  const loadCategories = useCallback(async () => {
    try {
      const result = await POSService.getCategories();
      setCategories(result);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    ConfiguracionService.getCategoriesDisplayConfig()
      .then(setCategoriesDisplay)
      .catch((error) => console.error('Error loading categories display config:', error));
  }, [loadCategories]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    // Reset page to 1 when search or filter changes
    if (productsData.page !== 1) {
      setProductsData(prev => ({ ...prev, page: 1 }));
    }
    
    timeoutId = setTimeout(() => {
      loadProducts(1);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedCategory]);

  useEffect(() => {
    loadProducts();
  }, []);

  // Recargar productos cuando cambien los límites de paginación
  useEffect(() => {
    setProductsData(prev => ({ ...prev, page: 1 }));
    loadProducts(1);
  }, [gridSize, smallGridLimitIndex, largeGridLimitIndex]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= productsData.totalPages) {
      setProductsData(prev => ({ ...prev, page }));
      loadProducts(page);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory(null);
  };

  // Función para manejar el escaneo de código de barras
  const handleBarcodeScan = (barcode: string) => {
    setSearchTerm(barcode);
    setShowScanner(false);
    toast({
      title: 'Código escaneado',
      description: `Buscando producto con código: ${barcode}`,
      duration: 2000
    });
  };

  // Función para cerrar el scanner
  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  // Manejar selección de producto (con o sin variantes)
  const handleProductClick = (product: any) => {
    // Si el producto tiene variantes, abrir el selector
    if (product.has_variants && product.variant_count > 0) {
      setSelectedParentProduct(product);
      setShowVariantDialog(true);
    } else {
      // Producto simple, agregar directamente
      onProductSelect(product);
    }
  };

  // Manejar selección de variante desde el diálogo
  const handleVariantSelect = (variant: any) => {
    onProductSelect(variant);
    setShowVariantDialog(false);
    setSelectedParentProduct(null);
  };

  const hasFilters = searchTerm || selectedCategory;

  return (
    <div className="h-full flex flex-col space-y-2 sm:space-y-3">
      {/* Header con filtros mejorado - RESPONSIVE */}
      <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-950 dark:to-gray-900 shrink-0">
        <CardHeader className="p-3 sm:p-4 pb-3">
          {/* Buscador prominente - siempre primero en móvil */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500 dark:text-blue-400 h-4 w-4 sm:h-5 sm:w-5" />
            <Input
              type="text"
              placeholder="Buscar productos, SKU o código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 sm:pl-11 pr-20 sm:pr-24 h-11 sm:h-10 bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm sm:text-sm ring-1 ring-blue-100 dark:ring-blue-900/50 focus:ring-2 focus:ring-blue-400 rounded-xl"
            />
            <div className="absolute right-1.5 top-1/2 transform -translate-y-1/2 flex gap-0.5 sm:gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowScanner(true)}
                className="h-8 w-8 sm:h-8 sm:w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                title="Escanear código de barras"
              >
                <Scan className="h-4 w-4 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
              </Button>
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="h-8 w-8 sm:h-8 sm:w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/50"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </Button>
              )}
            </div>
          </div>

          {/* Categorías + Vista + Controles - segunda fila */}
          <div className="flex items-center gap-2 mt-2 sm:mt-3">
            <CategoryFilterBar
              categories={categories}
              selectedCategory={selectedCategory?.toString() || 'all'}
              onSelectCategory={(value) => setSelectedCategory(value === 'all' ? null : parseInt(value))}
              mode={categoriesDisplay.mode}
              orderBy={categoriesDisplay.orderBy}
              className={categoriesDisplay.mode === 'searchselect' ? 'flex-1 sm:w-[180px] sm:flex-none h-9 sm:h-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 text-sm shrink-0' : 'flex-1'}
            />

            {hasFilters && (
              <Button 
                variant="outline" 
                onClick={clearFilters} 
                size="sm" 
                className="shrink-0 h-9 sm:h-10 px-2 sm:px-3 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Limpiar</span>
              </Button>
            )}

            {/* Control de límites - Oculto en móvil */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 ml-auto bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg shadow-sm">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 hidden md:inline">Mostrar:</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white dark:bg-gray-800 text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-600 min-w-[28px] sm:min-w-[32px] text-center">
                  {getCurrentLimit()}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3.5 sm:h-4 w-4 sm:w-5 p-0 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title="Aumentar productos por página"
                  onClick={() => {
                    if (gridSize === 'small') {
                      setSmallGridLimitIndex((prev) => 
                        prev < smallGridLimits.length - 1 ? prev + 1 : 0
                      );
                    } else {
                      setLargeGridLimitIndex((prev) => 
                        prev < largeGridLimits.length - 1 ? prev + 1 : 0
                      );
                    }
                  }}
                >
                  <ChevronUp className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-blue-600 dark:text-blue-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3.5 sm:h-4 w-4 sm:w-5 p-0 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title="Disminuir productos por página"
                  onClick={() => {
                    if (gridSize === 'small') {
                      setSmallGridLimitIndex((prev) => 
                        prev > 0 ? prev - 1 : smallGridLimits.length - 1
                      );
                    } else {
                      setLargeGridLimitIndex((prev) => 
                        prev > 0 ? prev - 1 : largeGridLimits.length - 1
                      );
                    }
                  }}
                >
                  <ChevronDown className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-blue-600 dark:text-blue-400" />
                </Button>
              </div>
            </div>

            {/* Botones de vista */}
            <Button
              variant={gridSize === 'small' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGridSize('small')}
              className="h-8 w-8 sm:h-9 sm:w-9 p-0 dark:border-gray-700 dark:text-gray-300 dark:hover:text-white border-gray-300 text-gray-600 hover:text-gray-900"
              title="Vista compacta"
            >
              <Grid3X3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant={gridSize === 'large' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGridSize('large')}
              className="h-8 w-8 sm:h-9 sm:w-9 p-0 dark:border-gray-700 dark:text-gray-300 dark:hover:text-white border-gray-300 text-gray-600 hover:text-gray-900"
              title="Vista amplia"
            >
              <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>

            {/* Contador de productos - solo desktop */}
            <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400 ml-1">
              {productsData.total} prod.
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Grid de productos mejorado - RESPONSIVE */}
      <Card className="flex-1 shadow-lg dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200 overflow-hidden flex flex-col">
        <CardContent className="p-2 sm:p-3 md:p-4 flex-1 overflow-y-auto lg:overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className={cn(
              "grid gap-2 sm:gap-4 lg:flex-1 lg:min-h-0 lg:[grid-auto-rows:1fr]",
              gridSize === 'large' ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
            )}>
              {[...Array(12)].map((_, i) => (
                <Card key={i} className="overflow-hidden lg:h-full lg:flex lg:flex-col">
                  <div className={cn(
                    "bg-gray-100 dark:bg-gray-800 flex items-center justify-center",
                    gridSize === 'large' ? "h-28 sm:h-36 md:h-48 lg:flex-1 lg:min-h-0 lg:h-auto" : "h-24 sm:h-32 lg:flex-1 lg:min-h-0 lg:h-auto"
                  )}>
                    <Skeleton className={cn(
                      "rounded",
                      gridSize === 'large' ? "w-24 h-24" : "w-16 h-16"
                    )} />
                  </div>
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </Card>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-16 w-16 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-red-600 mb-2">Error al cargar productos</h3>
              <p className="text-red-500">{error}</p>
              <Button 
                variant="outline" 
                onClick={() => loadProducts()} 
                className="mt-4"
              >
                Reintentar
              </Button>
            </div>
          ) : productsData.data.length === 0 ? (
            <div className="text-center py-16 lg:flex-1 lg:flex lg:flex-col lg:items-center lg:justify-center">
              <Package className="mx-auto h-20 w-20 text-gray-400 mb-6" />
              <h3 className="text-xl font-medium text-gray-600 dark:text-gray-400 mb-2">
                No se encontraron productos
              </h3>
              <p className="text-gray-500 mb-4">
                {hasFilters 
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'No hay productos disponibles en este momento'
                }
              </p>
              {hasFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className={cn(
                "grid gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 lg:flex-1 lg:min-h-0 lg:mb-0 lg:[grid-auto-rows:1fr]",
                gridSize === 'large' ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              )}>
                {productsData.data.map((product: any) => (
                  <Card 
                    key={product.id}
                    className="group overflow-hidden hover:shadow-xl transition-all duration-200 cursor-pointer border-gray-200 dark:border-gray-700 dark:bg-gray-800/50 bg-white hover:scale-[1.02] active:scale-[0.98] lg:h-full lg:flex lg:flex-col"
                    onClick={() => handleProductClick(product)}
                  >
                    {/* Imagen del producto */}
                    <div className={cn(
                      "relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden",
                      gridSize === 'large' ? "h-28 sm:h-36 md:h-48 lg:flex-1 lg:min-h-0 lg:h-auto" : "h-24 sm:h-32 lg:flex-1 lg:min-h-0 lg:h-auto"
                    )}>
                      {product.image && product.image.startsWith('http') ? (
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                          <ImageIcon className={cn(
                            "mb-2",
                            gridSize === 'large' ? "h-12 w-12" : "h-8 w-8"
                          )} />
                          {gridSize === 'large' && (
                            <span className="text-xs text-center px-2">
                              Sin imagen
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Badge de categoría */}
                      {product.category && (
                        <Badge 
                          className="absolute top-2 left-2 bg-white/90 text-gray-700 hover:bg-white text-[0.6rem] sm:text-xs z-10"
                          variant="secondary"
                        >
                          {product.category.name}
                        </Badge>
                      )}

                      {/* Badge de descuento % sobre la imagen (esquina derecha) */}
                      {product.compare_price && Number(product.compare_price) > Number(product.price) && (
                        <Badge className="absolute top-2 right-2 bg-red-500 text-white hover:bg-red-600 text-[0.65rem] sm:text-xs px-1.5 py-0.5 rounded-full z-10">
                          -{Math.round((1 - Number(product.price) / Number(product.compare_price)) * 100)}%
                        </Badge>
                      )}
                      
                      {/* Badge de variantes (debajo del descuento si existe) */}
                      {product.has_variants && product.variant_count > 0 && (
                        <Badge 
                          className={cn(
                            "absolute right-2 bg-purple-600 text-white hover:bg-purple-700 text-[0.6rem] sm:text-xs z-10",
                            product.compare_price && Number(product.compare_price) > Number(product.price) ? "top-8 sm:top-9" : "top-2"
                          )}
                        >
                          {product.variant_count} var.
                        </Badge>
                      )}
                    </div>
                    
                    {/* Información del producto - RESPONSIVE */}
                    <div className="p-2 sm:p-2.5 md:p-3 space-y-1 sm:space-y-1.5">
                      <h3 className={cn(
                        "font-semibold text-gray-900 dark:text-gray-100 line-clamp-1 leading-tight",
                        gridSize === 'large' ? "text-xs sm:text-sm" : "text-[0.7rem] sm:text-xs"
                      )}>
                        {product.name}
                      </h3>
                      
                      {gridSize === 'large' && product.description && (
                        <p className="text-[0.6rem] sm:text-[0.65rem] text-gray-500 dark:text-gray-400 line-clamp-1 leading-tight">
                          {product.description}
                        </p>
                      )}

                      {/* Precios: compare_price tachado al lado del precio actual */}
                      {product.price && (
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {product.compare_price && Number(product.compare_price) > Number(product.price) && (
                            <span className={cn(
                              "line-through text-gray-400 dark:text-gray-500",
                              gridSize === 'large' ? "text-[0.65rem] sm:text-xs" : "text-[0.6rem]"
                            )}>
                              {formatCurrency(Number(product.compare_price))}
                            </span>
                          )}
                          <span className={cn(
                            "font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 sm:px-2 py-0.5 rounded",
                            gridSize === 'large' ? "text-xs sm:text-sm" : "text-[0.7rem] sm:text-xs"
                          )}>
                            {formatCurrency(Number(product.price))}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[0.6rem] sm:text-[0.65rem] text-gray-500 dark:text-gray-400 gap-1">
                        <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded truncate">
                          {product.sku}
                        </span>
                      </div>
                      
                      <Button 
                        size="sm" 
                        className={cn(
                          "w-full text-white h-7 sm:h-8 text-xs sm:text-sm",
                          product.has_variants && product.variant_count > 0
                            ? "bg-purple-600 hover:bg-purple-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProductClick(product);
                        }}
                      >
                        <ShoppingCart className={cn(
                          "sm:mr-1",
                          gridSize === 'large' ? "h-3 w-3 sm:h-4 sm:w-4" : "h-3 w-3"
                        )} />
                        <span className="hidden xs:inline">
                          {product.has_variants && product.variant_count > 0 ? 'Elegir' : 'Agregar'}
                        </span>
                        <span className="inline xs:hidden">+</span>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Paginación - RESPONSIVE */}
              {productsData.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 border-t dark:border-gray-800 border-gray-200 pt-3 sm:pt-4 mt-4 lg:shrink-0">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                    <span className="hidden sm:inline">
                      Mostrando {((productsData.page - 1) * getCurrentLimit()) + 1} a{' '}
                      {Math.min(productsData.page * getCurrentLimit(), productsData.total)} de{' '}
                      {productsData.total} productos
                    </span>
                    <span className="inline sm:hidden">
                      {((productsData.page - 1) * getCurrentLimit()) + 1}-
                      {Math.min(productsData.page * getCurrentLimit(), productsData.total)} de {productsData.total}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(productsData.page - 1)}
                      disabled={productsData.page === 1}
                      className="h-8 px-2 sm:px-3 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline ml-1">Anterior</span>
                    </Button>
                    
                    {/* Páginas numeradas - Responsivo */}
                    <div className="flex gap-0.5 sm:gap-1">
                      {Array.from({ length: Math.min(5, productsData.totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <Button
                            key={page}
                            variant={page === productsData.page ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                              "w-7 h-7 sm:w-8 sm:h-8 p-0 text-xs sm:text-sm",
                              page === productsData.page 
                                ? "dark:bg-blue-600 dark:text-white bg-blue-600 text-white" 
                                : "dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-300 text-gray-700 hover:bg-gray-100"
                            )}
                            onClick={() => handlePageChange(page)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                      
                      {productsData.totalPages > 5 && (
                        <>
                          <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-500 dark:text-gray-500 flex items-center">...</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-7 h-7 sm:w-8 sm:h-8 p-0 text-xs sm:text-sm dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-300 text-gray-700 hover:bg-gray-100"
                            onClick={() => handlePageChange(productsData.totalPages)}
                          >
                            {productsData.totalPages}
                          </Button>
                        </>
                      )}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(productsData.page + 1)}
                      disabled={productsData.page === productsData.totalPages}
                      className="h-8 px-2 sm:px-3 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                      <span className="hidden sm:inline mr-1">Siguiente</span>
                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Scanner de código de barras */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={handleCloseScanner}
        />
      )}
      
      {/* Selector de variantes */}
      {selectedParentProduct && (
        <VariantSelectorDialog
          open={showVariantDialog}
          onOpenChange={setShowVariantDialog}
          product={selectedParentProduct}
          onSelectVariant={handleVariantSelect}
        />
      )}
    </div>
  );
}
