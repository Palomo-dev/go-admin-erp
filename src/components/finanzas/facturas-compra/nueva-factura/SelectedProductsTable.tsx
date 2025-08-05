'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit3, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { Product } from './ProductSearchDialog';

// Tipo para productos seleccionados con cantidades y descuentos
export interface SelectedProduct extends Product {
  quantity: number;
  unit_cost: number; // Costo unitario (puede ser editado)
  discount_amount: number;
  tax_rate: number;
  description_override?: string; // Descripción personalizada
}

interface SelectedProductsTableProps {
  selectedProducts: SelectedProduct[];
  currency: string;
  errors: Record<string, string>;
  onProductUpdate: (index: number, field: keyof SelectedProduct, value: any) => void;
  onProductRemove: (index: number) => void;
  onProductDescriptionEdit: (index: number, description: string) => void;
}

export function SelectedProductsTable({
  selectedProducts,
  currency,
  errors,
  onProductUpdate,
  onProductRemove,
  onProductDescriptionEdit
}: SelectedProductsTableProps) {
  
  const calculateLineTotal = (product: SelectedProduct): number => {
    return (product.quantity * product.unit_cost) - product.discount_amount;
  };
  
  const isManualItem = (product: SelectedProduct): boolean => {
    return product.sku.startsWith('MANUAL-');
  };

  if (selectedProducts.length === 0) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardContent className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h3 className="text-lg font-medium mb-2 dark:text-white">
            No hay productos seleccionados
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Use el buscador para agregar productos del catálogo
          </p>
          <p className="text-sm text-gray-400">
            Los productos agregados aparecerán aquí con sus costos y cantidades
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold dark:text-white">
          Productos Seleccionados ({selectedProducts.length})
        </h3>
        <Badge variant="secondary" className="text-sm">
          Total: {formatCurrency(
            selectedProducts.reduce((sum, p) => sum + calculateLineTotal(p), 0), 
            currency
          )}
        </Badge>
      </div>

      <div className="space-y-4">
        {selectedProducts.map((product, index) => (
          <Card 
            key={`${product.id}-${index}`}
            className={`dark:bg-gray-800/50 dark:border-gray-600 ${
              isManualItem(product) ? 'border-l-4 border-l-blue-500' : ''
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="font-medium dark:text-white">
                      {product.name}
                    </span>
                    {isManualItem(product) ? (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-600">
                        📄 Manual
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {product.sku}
                      </Badge>
                    )}
                    {product.tax_rate > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {product.tax_rate}%
                      </Badge>
                    )}
                  </CardTitle>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onProductRemove(index)}
                  className="flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Descripción personalizable */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="dark:text-gray-300 text-sm font-medium">
                    Descripción
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newDescription = product.description_override || product.description || '';
                      onProductDescriptionEdit(index, newDescription);
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    <Edit3 className="w-3 h-3" />
                  </Button>
                </div>
                <Input
                  value={product.description_override || product.description || ''}
                  onChange={(e) => onProductDescriptionEdit(index, e.target.value)}
                  placeholder="Descripción del producto en la factura"
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
                {errors[`product_${index}_description`] && (
                  <p className="text-sm text-red-600">
                    {errors[`product_${index}_description`]}
                  </p>
                )}
              </div>

              {/* Cantidad, Costo Unitario y Total */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-300 text-sm">Cantidad</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={product.quantity}
                    onChange={(e) => onProductUpdate(index, 'quantity', parseFloat(e.target.value) || 0.01)}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  {errors[`product_${index}_quantity`] && (
                    <p className="text-sm text-red-600">
                      {errors[`product_${index}_quantity`]}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-gray-300 text-sm">
                    Costo Unitario
                    {product.unit_cost !== product.cost && (
                      <span className="text-xs text-blue-500 ml-1">(Editado)</span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.unit_cost}
                    onChange={(e) => onProductUpdate(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  {product.unit_cost !== product.cost && (
                    <p className="text-xs text-gray-500">
                      Original: {formatCurrency(product.cost, currency)}
                    </p>
                  )}
                  {errors[`product_${index}_unit_cost`] && (
                    <p className="text-sm text-red-600">
                      {errors[`product_${index}_unit_cost`]}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-gray-300 text-sm">Descuento</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.discount_amount}
                    onChange={(e) => onProductUpdate(index, 'discount_amount', parseFloat(e.target.value) || 0)}
                    className="dark:bg-gray-700 dark:border-gray-600"
                    placeholder="0"
                  />
                  {errors[`product_${index}_discount`] && (
                    <p className="text-sm text-red-600">
                      {errors[`product_${index}_discount`]}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="dark:text-gray-300 text-sm">Total Línea</Label>
                  <div className="px-3 py-2 bg-gray-100 dark:bg-gray-600 rounded border text-sm font-bold dark:text-white">
                    {formatCurrency(calculateLineTotal(product), currency)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {product.quantity} × {formatCurrency(product.unit_cost, currency)}
                    {product.discount_amount > 0 && ` - ${formatCurrency(product.discount_amount, currency)}`}
                  </div>
                </div>
              </div>

              {/* Información adicional */}
              <div className="flex items-center justify-between pt-2 border-t dark:border-gray-600">
                <div className="flex gap-4 text-sm text-gray-500">
                  {isManualItem(product) ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      📄 Item Manual
                    </span>
                  ) : (
                    <span>ID: #{product.id}</span>
                  )}
                  {!isManualItem(product) && product.price > 0 && (
                    <span>
                      P.V: {formatCurrency(product.price, currency)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {isManualItem(product) ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      Personalizado
                    </span>
                  ) : (
                    `Margen: ${product.price > product.unit_cost 
                      ? `+${(((product.price - product.unit_cost) / product.unit_cost) * 100).toFixed(1)}%`
                      : 'N/A'
                    }`
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
