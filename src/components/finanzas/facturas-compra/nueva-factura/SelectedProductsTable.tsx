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
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
        <CardContent className="text-center py-8 sm:py-12">
          <Package className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 opacity-30 text-gray-400 dark:text-gray-600" />
          <h3 className="text-base sm:text-lg font-medium mb-2 text-gray-900 dark:text-white">
            No hay productos seleccionados
          </h3>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            Use el buscador para agregar productos del catálogo
          </p>
          <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
            Los productos agregados aparecerán aquí con sus costos y cantidades
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Productos Seleccionados ({selectedProducts.length})
        </h3>
        <Badge variant="secondary" className="text-xs sm:text-sm px-2 sm:px-3 py-1 dark:bg-gray-700 dark:text-gray-300">
          Total: {formatCurrency(
            selectedProducts.reduce((sum, p) => sum + calculateLineTotal(p), 0), 
            currency
          )}
        </Badge>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {selectedProducts.map((product, index) => (
          <Card 
            key={`${product.id}-${index}`}
            className={`dark:bg-gray-800/50 dark:border-gray-700 border-gray-200 ${
              isManualItem(product) ? 'border-l-4 border-l-blue-500 dark:border-l-blue-400' : ''
            }`}
          >
            <CardHeader className="pb-2 sm:pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm sm:text-base flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {product.name}
                    </span>
                    {isManualItem(product) ? (
                      <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-600 whitespace-nowrap">
                        📄 Manual
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:border-gray-600 dark:text-gray-300">
                        {product.sku}
                      </Badge>
                    )}
                    {product.tax_rate > 0 && (
                      <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
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
                  className="flex-shrink-0 h-7 w-7 sm:h-8 sm:w-8 p-0"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 sm:space-y-4 pt-2 sm:pt-3">
              {/* Descripción personalizable */}
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    className="h-5 sm:h-6 px-1.5 sm:px-2 text-[10px] sm:text-xs dark:hover:bg-gray-700 dark:text-gray-300"
                    title="Editar descripción"
                  >
                    <Edit3 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </Button>
                </div>
                <Input
                  value={product.description_override || product.description || ''}
                  onChange={(e) => onProductDescriptionEdit(index, e.target.value)}
                  placeholder="Descripción del producto en la factura"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                {errors[`product_${index}_description`] && (
                  <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                    {errors[`product_${index}_description`]}
                  </p>
                )}
              </div>

              {/* Cantidad, Costo Unitario y Total */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Cantidad</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={product.quantity}
                    onChange={(e) => onProductUpdate(index, 'quantity', parseFloat(e.target.value) || 0.01)}
                    className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  {errors[`product_${index}_quantity`] && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                      {errors[`product_${index}_quantity`]}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    Costo Unit.
                    {product.unit_cost !== product.cost && (
                      <span className="text-[10px] sm:text-xs text-blue-500 dark:text-blue-400 ml-1">(Edit.)</span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.unit_cost}
                    onChange={(e) => onProductUpdate(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                    className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  {product.unit_cost !== product.cost && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                      Orig: {formatCurrency(product.cost, currency)}
                    </p>
                  )}
                  {errors[`product_${index}_unit_cost`] && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                      {errors[`product_${index}_unit_cost`]}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 sm:space-y-2 col-span-2 sm:col-span-1">
                  <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Descuento</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.discount_amount}
                    onChange={(e) => onProductUpdate(index, 'discount_amount', parseFloat(e.target.value) || 0)}
                    className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    placeholder="0"
                  />
                  {errors[`product_${index}_discount`] && (
                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                      {errors[`product_${index}_discount`]}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 sm:space-y-2 col-span-2 sm:col-span-1">
                  <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Total Línea</Label>
                  <div className="px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(calculateLineTotal(product), currency)}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                    {product.quantity} × {formatCurrency(product.unit_cost, currency)}
                    {product.discount_amount > 0 && ` - ${formatCurrency(product.discount_amount, currency)}`}
                  </div>
                </div>
              </div>

              {/* Información adicional */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {isManualItem(product) ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      📄 Item Manual
                    </span>
                  ) : (
                    <span>ID: #{product.id}</span>
                  )}
                  {!isManualItem(product) && product.price > 0 && (
                    <span className="whitespace-nowrap">
                      P.V: {formatCurrency(product.price, currency)}
                    </span>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
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
