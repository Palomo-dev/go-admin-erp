'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Trash2 } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  sku?: string;
  quantity: number;
  lot_id?: number | null;
}

interface ListaProductosTraslodoProps {
  products: Product[];
  onUpdateQuantity: (index: number, newQuantity: number) => void;
  onRemoveProduct: (index: number) => void;
  disabled?: boolean;
}

export default function ListaProductosTraslado({ 
  products, 
  onUpdateQuantity, 
  onRemoveProduct, 
  disabled = false 
}: ListaProductosTraslodoProps) {
  
  const handleQuantityChange = (index: number, value: string) => {
    const newValue = Number(value);
    if (!isNaN(newValue) && newValue >= 0) {
      onUpdateQuantity(index, newValue);
    }
  };

  const handleQuantityFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (Number(e.target.value) === 0) {
      e.target.value = '';
    }
  };
  
  const handleQuantityBlur = (e: React.FocusEvent<HTMLInputElement>, index: number) => {
    if (e.target.value === '') {
      onUpdateQuantity(index, 0);
    }
  };
  
  if (products.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No hay productos seleccionados para el traslado
      </div>
    );
  }
  
  return (
    <div className="mt-6">
      <h3 className="text-lg font-medium mb-4">Productos para Traslado</h3>
      
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={`${product.id}-${product.lot_id || 'default'}-${index}`}>
                <TableCell>{product.name}</TableCell>
                <TableCell>{product.sku || 'N/A'}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min="1"
                    className="w-20 text-right ml-auto"
                    value={product.quantity === 0 ? '' : product.quantity}
                    onChange={(e) => handleQuantityChange(index, e.target.value)}
                    onFocus={handleQuantityFocus}
                    onBlur={(e) => handleQuantityBlur(e, index)}
                    disabled={disabled}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveProduct(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
