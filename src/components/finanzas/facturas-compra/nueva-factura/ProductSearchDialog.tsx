'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Search, Package, Plus, ShoppingCart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/utils/Utils';

// Tipo para productos con información de costos (para compras)
export type Product = {
  id: number;
  name: string;
  sku: string;
  description?: string;
  cost: number; // Costo de compra al proveedor
  price: number; // Precio de venta (referencia)
  tax_id?: number;
  tax_code?: string;
  tax_name?: string;
  tax_rate?: number;
};

interface ProductSearchDialogProps {
  currency: string;
  onProductSelect: (product: Product) => void;
  selectedProductIds?: number[];
}

export function ProductSearchDialog({ 
  currency, 
  onProductSelect,
  selectedProductIds = []
}: ProductSearchDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const organizationId = getOrganizationId();

  // Cargar productos al abrir el diálogo
  useEffect(() => {
    if (isDialogOpen && organizationId) {
      cargarProductos();
    }
  }, [isDialogOpen, organizationId]);

  // Filtrar productos en tiempo real
  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  // Función para cargar productos con costos
  const cargarProductos = async () => {
    try {
      setIsLoading(true);
      
      // Usar la función RPC especializada para facturas de compra
      const { data, error } = await supabase
        .rpc('get_products_with_latest_costs', { org_id: organizationId });
      
      if (error) {
        // Fallback con consulta manual si falla RPC
        console.warn('Fallback a consulta manual:', error);
        
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select(`
            id, name, sku, description,
            product_costs!left(cost),
            product_prices!left(price)
          `)
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('name', { ascending: true });
          
        if (productsError) throw productsError;
        
        // Formatear los datos
        const formattedProducts = productsData?.map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          cost: product.product_costs?.[0]?.cost || 0,
          price: product.product_prices?.[0]?.price || 0,
          tax_id: undefined,
          tax_code: undefined,
          tax_name: undefined,
          tax_rate: undefined
        })) || [];
        
        setProducts(formattedProducts);
        setFilteredProducts(formattedProducts);
      } else {
        setProducts(data || []);
        setFilteredProducts(data || []);
      }
      
    } catch (error) {
      console.error('Error al cargar productos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los productos. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Seleccionar producto
  const handleSelectProduct = (product: Product) => {
    onProductSelect(product);
    setIsDialogOpen(false);
    setSearchTerm('');
    
    toast({
      title: "Producto seleccionado",
      description: `${product.name} agregado a la factura de compra.`,
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          type="button"
          size="sm"
          className="h-8 sm:h-9 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Buscar Productos</span>
          <span className="sm:hidden">Productos</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl w-[95vw] sm:w-[90vw] max-h-[90vh] h-[80vh] sm:h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-900 dark:text-white">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="truncate">Catálogo de Productos</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col space-y-3 sm:space-y-4 flex-1 min-h-0 overflow-hidden">
          {/* Barra de búsqueda */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500" />
              <Input
                placeholder="Buscar por nombre, SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                autoFocus
              />
            </div>

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
          
          {/* Estadísticas */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <span className="truncate">
              <span className="font-medium text-gray-900 dark:text-gray-100">{filteredProducts.length}</span> de {products.length} productos
              <span className="hidden md:inline">{searchTerm && ` - Filtrando por "${searchTerm}"`}</span>
            </span>
            {selectedProductIds.length > 0 && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
                {selectedProductIds.length} seleccionados
              </Badge>
            )}
          </div>
          
          {/* Lista de productos */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 sm:py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-3"></div>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">Cargando productos...</p>
                </div>
              </div>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const isSelected = selectedProductIds.includes(product.id);
                
                return (
                  <Card 
                    key={product.id} 
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected 
                        ? 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700' 
                        : 'hover:border-blue-300 dark:hover:border-blue-600 dark:bg-gray-800/50 dark:border-gray-700'
                    }`}
                    onClick={() => !isSelected && handleSelectProduct(product)}
                  >
                    <CardContent className="p-2 sm:p-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                        {/* Información del producto */}
                        <div className="flex-1 min-w-0 w-full sm:w-auto">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                              {product.name}
                            </h4>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 dark:border-gray-600 dark:text-gray-300">
                                {product.sku}
                              </Badge>
                              {product.tax_rate && (
                                <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 dark:bg-gray-700 dark:text-gray-300">
                                  {product.tax_rate}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {product.description && (
                            <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
                              {product.description}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 sm:gap-4">
                              <div>
                                <div className="text-base sm:text-lg font-bold text-green-600 dark:text-green-500">
                                  {formatCurrency(product.cost, currency)}
                                </div>
                                <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                  Costo compra
                                </div>
                              </div>
                              {product.price > 0 && (
                                <div>
                                  <div className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {formatCurrency(product.price, currency)}
                                  </div>
                                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                    P.V. ref.
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
                              className="w-full sm:w-auto h-8 text-xs sm:text-sm bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            >
                              ✓ Seleccionado
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProduct(product);
                              }}
                              className="w-full sm:w-auto h-8 text-xs sm:text-sm bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white"
                            >
                              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                              Agregar
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
                    {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
                  </p>
                  {searchTerm && (
                    <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-1">
                      Intenta con otros términos de búsqueda
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
