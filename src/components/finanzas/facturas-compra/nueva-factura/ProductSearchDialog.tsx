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
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Search className="w-4 h-4 mr-2" />
          Buscar Productos
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl w-[95vw] sm:w-[90vw] max-h-[90vh] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Catálogo de Productos para Compra
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4 flex-1 min-h-0 overflow-hidden">
          {/* Barra de búsqueda */}
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              placeholder="Buscar por nombre, SKU o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
              autoFocus
            />

            <Button 
              onClick={cargarProductos} 
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              {isLoading ? 'Cargando...' : 'Actualizar'}
            </Button>
          </div>
          
          {/* Estadísticas */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {filteredProducts.length} de {products.length} productos
              {searchTerm && ` - Filtrando por "${searchTerm}"`}
            </span>
            {selectedProductIds.length > 0 && (
              <Badge variant="secondary">
                {selectedProductIds.length} ya seleccionados
              </Badge>
            )}
          </div>
          
          {/* Lista de productos */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-500">Cargando productos...</p>
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
                        ? 'border-green-300 bg-green-50 dark:bg-green-900/20' 
                        : 'hover:border-blue-300'
                    }`}
                    onClick={() => !isSelected && handleSelectProduct(product)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-4">
                        {/* Información del producto */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                              {product.name}
                            </h4>
                            <div className="flex items-center gap-2 ml-2">
                              <Badge variant="outline" className="text-xs px-2 py-0">
                                {product.sku}
                              </Badge>
                              {product.tax_rate && (
                                <Badge variant="secondary" className="text-xs px-2 py-0">
                                  {product.tax_rate}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {product.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
                              {product.description}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="text-lg font-bold text-green-600">
                                  {formatCurrency(product.cost, currency)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Costo compra
                                </div>
                              </div>
                              {product.price > 0 && (
                                <div>
                                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {formatCurrency(product.price, currency)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    P.V. referencia
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Botón de acción */}
                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <Button
                              size="sm"
                              disabled
                              variant="secondary"
                              className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
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
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Plus className="w-3 h-3 mr-1" />
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
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-500">
                    {searchTerm ? 'No se encontraron productos' : 'No hay productos disponibles'}
                  </p>
                  {searchTerm && (
                    <p className="text-sm text-gray-400 mt-1">
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
