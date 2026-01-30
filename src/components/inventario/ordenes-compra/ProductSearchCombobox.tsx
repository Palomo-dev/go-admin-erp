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
    return (
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      product.category?.toLowerCase().includes(search)
    );
  });

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
          {/* Icono/Imagen del producto */}
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Info del producto */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {selectedProduct.name}
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
              {filteredProducts.slice(0, 50).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelect(product)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors",
                    value === product.id.toString() && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  {/* Icono/Imagen */}
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="h-5 w-5 text-gray-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {product.name}
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
              ))}
              {filteredProducts.length > 50 && (
                <p className="p-2 text-center text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700">
                  Mostrando 50 de {filteredProducts.length} resultados. Refina tu búsqueda.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductSearchCombobox;
