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
  Scan
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatCurrency } from '@/utils/Utils';
import Image from 'next/image';
import { BarcodeScanner } from '@/components/ui/barcode-scanner';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
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

  const hasFilters = searchTerm || selectedCategory;

  return (
    <div className="space-y-6">
      {/* Header con filtros mejorado */}
      <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Catálogo de Productos
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {productsData.total} productos disponibles
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Control de límites para grid actual - Mejorado */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Mostrar:</span>
                  <span className="px-2 py-1 bg-white dark:bg-gray-800 text-sm font-bold text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-600 min-w-[32px] text-center">
                    {getCurrentLimit()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-5 p-0 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
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
                    <ChevronUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-5 p-0 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
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
                    <ChevronDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </Button>
                </div>
              </div>
              
              <Button
                variant={gridSize === 'small' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGridSize('small')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={gridSize === 'large' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGridSize('large')}
              >
                <Package className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar productos por nombre, SKU, descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-20 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
              <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowScanner(true)}
                  className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                  title="Escanear código de barras"
                >
                  <Scan className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </Button>
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    className="h-8 w-8 p-0"
                    title="Limpiar búsqueda"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="flex gap-3">
              <Select 
                value={selectedCategory?.toString() || 'all'} 
                onValueChange={(value) => setSelectedCategory(value === 'all' ? null : parseInt(value))}
              >
                <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {hasFilters && (
                <Button variant="outline" onClick={clearFilters} size="sm">
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Grid de productos mejorado */}
      <Card className="shadow-lg">
        <CardContent className="p-6">
          {loading ? (
            <div className={cn(
              "grid gap-4",
              gridSize === 'large' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
            )}>
              {[...Array(12)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <div className={cn(
                    "bg-gray-100 dark:bg-gray-800 flex items-center justify-center",
                    gridSize === 'large' ? "h-48" : "h-32"
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
            <div className="text-center py-16">
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
                "grid gap-4 mb-6",
                gridSize === 'large' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
              )}>
                {productsData.data.map((product) => (
                  <Card 
                    key={product.id}
                    className="group overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer border-gray-200 dark:border-gray-700"
                    onClick={() => onProductSelect(product)}
                  >
                    {/* Imagen del producto */}
                    <div className={cn(
                      "relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden",
                      gridSize === 'large' ? "h-48" : "h-32"
                    )}>
                      {product.image ? (
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
                          className="absolute top-2 left-2 bg-white/90 text-gray-700 hover:bg-white text-xs"
                          variant="secondary"
                        >
                          {product.category.name}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Información del producto */}
                    <div className="p-3 space-y-2">
                      <h3 className={cn(
                        "font-semibold text-gray-900 dark:text-gray-100 line-clamp-2",
                        gridSize === 'large' ? "text-sm" : "text-xs"
                      )}>
                        {product.name}
                      </h3>
                      
                      {gridSize === 'large' && product.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                          {product.description}
                        </p>
                      )}
                      
                      {/* Precio de venta */}
                      {product.price && (
                        <div className="flex items-center justify-center my-2">
                          <span className={cn(
                            "font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md",
                            gridSize === 'large' ? "text-sm" : "text-xs"
                          )}>
                            {formatCurrency(Number(product.price))}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {product.sku}
                        </span>
                        {product.barcode && gridSize === 'large' && (
                          <span className="truncate ml-2">
                            {product.barcode}
                          </span>
                        )}
                      </div>
                      
                      <Button 
                        size="sm" 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProductSelect(product);
                        }}
                      >
                        <ShoppingCart className={cn(
                          "mr-1",
                          gridSize === 'large' ? "h-4 w-4" : "h-3 w-3"
                        )} />
                        Agregar
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Paginación */}
              {productsData.totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Mostrando {((productsData.page - 1) * getCurrentLimit()) + 1} a{' '}
                    {Math.min(productsData.page * getCurrentLimit(), productsData.total)} de{' '}
                    {productsData.total} productos
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(productsData.page - 1)}
                      disabled={productsData.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    
                    {/* Páginas numeradas */}
                    <div className="flex space-x-1">
                      {Array.from({ length: Math.min(5, productsData.totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <Button
                            key={page}
                            variant={page === productsData.page ? 'default' : 'outline'}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => handlePageChange(page)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                      
                      {productsData.totalPages > 5 && (
                        <>
                          <span className="px-2 text-gray-500">...</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-8 h-8 p-0"
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
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
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
    </div>
  );
}