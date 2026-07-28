'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Package, X, Check } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface ProductOption {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  unit_code?: string;
  category?: string;
  status?: string;
  cost?: number;
  image?: string | null;
  track_stock?: boolean;
  is_parent?: boolean;
  parent_product_id?: number | null;
  variant_data?: Record<string, string> | null;
  parent_name?: string | null;
  parent_image?: string | null;
}

interface ProductSearchComboboxProps {
  products: ProductOption[];
  value: string;
  onSelect: (product: ProductOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ProductSearchCombobox({
  products,
  value,
  onSelect,
  placeholder = 'Buscar producto por nombre o SKU...',
  disabled = false
}: ProductSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincronizar valor externo
  useEffect(() => {
    if (value) {
      const product = products.find(p => p.id.toString() === value);
      setSelectedProduct(product || null);
    } else {
      setSelectedProduct(null);
    }
  }, [value, products]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar productos
  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const parentName = product.parent_name?.toLowerCase() || '';
    const variantAttrs = product.variant_data
      ? Object.values(product.variant_data).join(' ').toLowerCase()
      : '';
    return (
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search) ||
      parentName.includes(search) ||
      variantAttrs.includes(search)
    );
  });

  // Agrupar productos por padre
  const grouped = filteredProducts.reduce((acc, product) => {
    const groupKey = product.parent_name || product.name;
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(product);
    return acc;
  }, {} as Record<string, ProductOption[]>);

  // Helper: obtener texto de variantes
  const getVariantLabel = (product: ProductOption): string | null => {
    if (!product.variant_data) return null;
    const entries = Object.entries(product.variant_data).filter(([, v]) => v && v.trim() !== '');
    if (entries.length === 0) return null;
    return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
  };

  // Helper: imagen efectiva (propia o del padre)
  const getEffectiveImage = (product: ProductOption): string | null => {
    return product.image || product.parent_image || null;
  };

  const handleSelect = (product: ProductOption) => {
    setSelectedProduct(product);
    onSelect(product);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    setSelectedProduct(null);
    onSelect(null);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input de búsqueda o producto seleccionado */}
      {selectedProduct ? (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700">
          {/* Imagen del producto */}
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            {getEffectiveImage(selectedProduct) ? (
              <img
                src={getEffectiveImage(selectedProduct)!}
                alt={selectedProduct.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                }}
              />
            ) : (
              <Package className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {/* Info del producto */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {selectedProduct.parent_name && getVariantLabel(selectedProduct)
                ? `${selectedProduct.parent_name} · ${getVariantLabel(selectedProduct)}`
                : selectedProduct.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                {selectedProduct.sku}
              </span>
              {selectedProduct.category && (
                <Badge variant="secondary" className="text-xs">
                  {selectedProduct.category}
                </Badge>
              )}
            </div>
          </div>

          {/* Botón limpiar */}
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-10 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>
      )}

      {/* Lista de productos */}
      {isOpen && !selectedProduct && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-auto">
          {filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No se encontraron productos</p>
              {searchTerm && (
                <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
              )}
            </div>
          ) : (
            <div className="py-1">
              {Object.entries(grouped).map(([groupName, groupProducts]) => {
                const hasVariants = groupProducts.length > 1 || (groupProducts[0].variant_data && getVariantLabel(groupProducts[0]));
                const groupImage = getEffectiveImage(groupProducts[0]);
                return (
                  <div key={groupName}>
                    {hasVariants && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-750 border-b dark:border-gray-700">
                        <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          {groupImage ? (
                            <img src={groupImage} alt={groupName} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-3.5 w-3.5 text-gray-400" />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                          {groupName}
                        </span>
                      </div>
                    )}
                    {groupProducts.map((product) => {
                      const variantLabel = getVariantLabel(product);
                      const effectiveImage = getEffectiveImage(product);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleSelect(product)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors",
                            value === product.id.toString() && "bg-blue-50 dark:bg-blue-900/20"
                          )}
                        >
                          {/* Imagen del producto */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            {effectiveImage ? (
                              <img
                                src={effectiveImage}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                }}
                              />
                            ) : (
                              <Package className="h-5 w-5 text-gray-400" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {hasVariants && variantLabel ? variantLabel : product.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">
                                {product.sku}
                              </span>
                              {product.unit_code && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  · {product.unit_code}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Check si está seleccionado */}
                          {value === product.id.toString() && (
                            <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductSearchCombobox;
