'use client';

import { useState } from 'react';
import { Search, Package, X, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/utils/Utils';
import Image from 'next/image';

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  image?: string;
}

interface ProductSearchSelectProps {
  products: Product[];
  selectedProductId: number;
  onSelect: (productId: number, product?: Product) => void;
  placeholder?: string;
}

export function ProductSearchSelect({
  products,
  selectedProductId,
  onSelect,
  placeholder = 'Seleccionar producto'
}: ProductSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      product.name?.toLowerCase().includes(term) ||
      product.sku?.toLowerCase().includes(term)
    );
  });

  const handleSelect = (product: Product) => {
    onSelect(product.id, product);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-[44px] px-3 py-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {selectedProduct ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Imagen del producto */}
              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                {selectedProduct.image ? (
                  <Image
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    width={32}
                    height={32}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <Package className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {selectedProduct.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedProduct.sku}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Package className="h-4 w-4" />
              <span>{placeholder}</span>
            </div>
          )}
          <Search className="h-4 w-4 shrink-0 text-gray-400 ml-2" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[420px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-xl" align="start" sideOffset={8}>
        {/* Header con búsqueda */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Seleccionar producto</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              autoFocus
            />
          </div>
        </div>
        
        {/* Lista de productos */}
        <ScrollArea className="h-[320px]">
          <div className="p-3 space-y-2">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-150 text-left ${
                    product.id === selectedProductId 
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600 shadow-sm' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(product);
                  }}
                >
                  {/* Imagen del producto */}
                  <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        width={56}
                        height={56}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-gray-400" />
                    )}
                  </div>
                  
                  {/* Info del producto */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">
                      {product.name}
                    </p>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                      SKU: {product.sku}
                    </p>
                  </div>
                  
                  {/* Precio */}
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                </button>
              ))
            ) : searchTerm ? (
              <div className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  No se encontraron productos
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Intenta con otro término de búsqueda
                </p>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {products.length} productos disponibles
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Escribe para filtrar o selecciona uno
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
