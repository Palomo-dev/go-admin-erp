'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Plus, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

interface Product {
  id: number;
  name: string;
  sku?: string;
  quantity: number;
  lot_id?: number | null;
  stock?: number;
}

interface SelectorProductosProps {
  organizationId?: number;
  branchId: number;
  onAddProduct: (product: Product) => void;
  disabled?: boolean;
}

export default function SelectorProductos({ 
  organizationId, 
  branchId, 
  onAddProduct, 
  disabled = false 
}: SelectorProductosProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [quantity, setQuantity] = useState<number>(0);

  const handleSearch = async () => {
    if (!organizationId || !branchId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Buscar productos con existencias en la sucursal de origen
      const { data, error } = await supabase
        .from('stock_levels')
        .select(`
          id,
          product_id,
          qty_on_hand,
          products:product_id (id, name, sku, description, barcode)
        `)
        .eq('branch_id', branchId)
        .gt('qty_on_hand', 0)
        .order('qty_on_hand', { ascending: false });
        
      if (error) throw error;
      
      const formattedProducts = data
        .filter(item => item.products) // Filtrar productos inexistentes
        .map(item => ({
          id: item.product_id,
          name: item.products.name,
          sku: item.products.sku,
          description: item.products.description,
          barcode: item.products.barcode,
          stock: parseFloat(item.qty_on_hand)
        }));
        
      setProducts(formattedProducts);
    } catch (err: any) {
      console.error('Error al buscar productos:', err);
      setError(err.message || 'Error al buscar productos');
    } finally {
      setLoading(false);
    }
  };

  // Cargar productos al montar el componente o cambiar la sucursal
  useEffect(() => {
    if (branchId) {
      handleSearch();
    }
  }, [branchId]);

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setOpen(false);
  };

  const handleAddToList = () => {
    if (!selectedProduct) return;
    
    // Verificar que la cantidad sea válida
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }
    
    // Verificar que haya suficiente stock
    if (qty > selectedProduct.stock) {
      setError(`Solo hay ${selectedProduct.stock} unidades disponibles`);
      return;
    }
    
    onAddProduct({
      id: selectedProduct.id,
      name: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty
    });
    
    // Reiniciar el formulario
    setSelectedProduct(null);
    setQuantity(0);
    setError(null);
  };

  const handleQuantityFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (Number(e.target.value) === 0) {
      e.target.value = '';
    }
  };
  
  const handleQuantityBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '') {
      setQuantity(0);
    }
  };

  const filteredProducts = search === '' 
    ? products 
    : products.filter(product => {
        const searchLower = search.toLowerCase();
        return (
          product.name.toLowerCase().includes(searchLower) ||
          (product.sku && product.sku.toLowerCase().includes(searchLower)) ||
          (product.description && product.description.toLowerCase().includes(searchLower))
        );
      });

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Selección de Productos</h3>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 space-y-2">
          <Label htmlFor="product">Producto</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                role="combobox" 
                aria-expanded={open} 
                disabled={disabled || !branchId} 
                className="w-full justify-between"
              >
                {selectedProduct ? selectedProduct.name : "Seleccionar producto..."}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[400px]">
              <Command>
                <CommandInput 
                  placeholder="Buscar producto..." 
                  onValueChange={setSearch} 
                />
                <CommandList>
                  <CommandEmpty>No se encontraron productos.</CommandEmpty>
                  <CommandGroup>
                    <div className="max-h-[300px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Stock</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product) => (
                            <TableRow 
                              key={product.id} 
                              onClick={() => handleSelectProduct(product)}
                              className="cursor-pointer hover:bg-accent"
                            >
                              <TableCell>
                                <div className="font-medium">{product.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {product.sku}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {product.stock}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="md:col-span-1 space-y-2">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input
            id="quantity"
            type="number"
            min="1"
            step="1"
            disabled={disabled || !selectedProduct}
            value={quantity === 0 ? '' : quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            onFocus={handleQuantityFocus}
            onBlur={handleQuantityBlur}
          />
        </div>
        
        <div className="md:col-span-1 pt-8">
          <Button
            type="button"
            onClick={handleAddToList}
            disabled={disabled || !selectedProduct || quantity <= 0}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar
          </Button>
        </div>
      </div>
      
      {selectedProduct && (
        <div className="text-sm text-muted-foreground">
          Stock disponible: <span className="font-medium">{selectedProduct.stock}</span> unidades
        </div>
      )}
    </div>
  );
}
