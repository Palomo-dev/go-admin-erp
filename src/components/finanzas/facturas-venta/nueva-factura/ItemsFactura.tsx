'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { ProductSearchDialog, type UnifiedProduct, type SelectedModifier } from '@/components/shared/product-search';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceItem } from './NuevaFacturaForm';
import { formatCurrency } from '@/utils/Utils';

type ItemsFacturaProps = {
  items: InvoiceItem[];
  onItemsChange: (items: InvoiceItem[]) => void;
  taxIncluded?: boolean;
  branchId?: number;
};

export function ItemsFactura({ items, onItemsChange, taxIncluded = false, branchId }: ItemsFacturaProps) {

  // Agregar ítem directamente a la factura (producto simple o variante seleccionada)
  const agregarItemDirecto = (product: UnifiedProduct, modifiers: SelectedModifier[] = []) => {
    const includeTax = taxIncluded;
    
    // Precio base + extra de modificadores
    const modifiersExtra = modifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0);
    const basePrice = (product.price || 0) + modifiersExtra;
    
    // Calcular el total_line según si el impuesto está incluido o no
    let total_line = basePrice;
    
    if (product.tax_rate) {
      if (includeTax) {
        total_line = basePrice;
      } else {
        const taxAmount = basePrice * (product.tax_rate / 100);
        total_line = basePrice + taxAmount;
      }
    }

    // Construir descripción con modificadores si los hay
    let description = product.name;
    if (modifiers.length > 0) {
      const modNames = modifiers.map(m => m.name).join(', ');
      description += ` (${modNames})`;
    }
    
    const newItem: InvoiceItem = {
      invoice_type: 'sale',
      product_id: product.id,
      description,
      qty: 1,
      unit_price: basePrice,
      tax_code: product.tax_code || null,
      tax_rate: product.tax_rate || null,
      tax_included: includeTax,
      total_line: total_line,
      product_name: description,
      stock_qty: product.stock_qty ?? null,
      track_stock: product.track_stock ?? false,
    };
    
    onItemsChange([...items, newItem]);
  };

  // Manejar selección desde el ProductSearchDialog unificado
  const handleProductSelect = (product: UnifiedProduct, modifiers: SelectedModifier[] = []) => {
    agregarItemDirecto(product, modifiers);
  };

  // Agregar ítem manual
  const agregarItemManual = () => {
    const includeTax = taxIncluded;
    const newItem: InvoiceItem = {
      invoice_type: 'sale',
      description: '',
      qty: 1,
      unit_price: 0,
      discount_amount: 0,
      tax_included: includeTax,
      total_line: 0,
    };
    onItemsChange([...items, newItem]);
  };

  // Actualizar un ítem
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    // Si estamos cambiando el tax_code o tax_rate, actualizar tax_included según el estado actual
    if (field === 'tax_code' || field === 'tax_rate') {
      updatedItems[index].tax_included = taxIncluded;
    }

    // Recalcular total_line considerando impuesto incluido/no incluido y descuento
    const item = updatedItems[index];
    const quantity = item.qty;
    const unitPrice = item.unit_price;
    const taxRate = item.tax_rate || 0;
    const discount = item.discount_amount || 0;
    
    const lineBase = quantity * unitPrice - discount;
    
    if (item.tax_included) {
      item.total_line = lineBase;
    } else {
      if (taxRate > 0) {
        const taxAmount = lineBase * (taxRate / 100);
        item.total_line = lineBase + taxAmount;
      } else {
        item.total_line = lineBase;
      }
    }
    
    onItemsChange(updatedItems);
  };

  // Eliminar un ítem
  const eliminarItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    onItemsChange(updatedItems);
  };

  // IDs de productos ya seleccionados (para mostrar "✓ Seleccionado" en el diálogo)
  const selectedProductIds = items
    .filter(item => item.product_id != null)
    .map(item => item.product_id as number);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <ProductSearchDialog
          mode="sale"
          currency="COP"
          branchId={branchId}
          onProductSelect={handleProductSelect}
          selectedProductIds={selectedProductIds}
          showCreateButton
        />

        <Button 
          variant="outline"
          size="sm"
          onClick={agregarItemManual}
          className="
            w-full sm:w-auto
            bg-white dark:bg-gray-800
            border-gray-300 dark:border-gray-600
            hover:bg-gray-50 dark:hover:bg-gray-700
            text-gray-700 dark:text-gray-200
          "
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="text-sm">Agregar Ítem Manual</span>
        </Button>
      </div>
      
      {/* Tabla de ítems */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto -mx-3 sm:mx-0">
        <div className="min-w-[800px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900/50">
                <TableHead className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Descripción</TableHead>
                <TableHead className="text-center text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Cantidad</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Precio Unit.</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Descuento</TableHead>
                <TableHead className="text-center text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Impuesto</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Total</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No hay ítems en la factura
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow key={index} className="border-b border-gray-200 dark:border-gray-700">
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="
                        text-sm
                        bg-white dark:bg-gray-900
                        border-gray-300 dark:border-gray-600
                        text-gray-900 dark:text-gray-100
                      "
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        className={`text-center text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${
                          item.track_stock && item.stock_qty != null && item.qty > item.stock_qty
                            ? 'border-red-500 dark:border-red-500 text-red-600 dark:text-red-400'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        value={item.qty}
                        onChange={(e) => updateItem(index, 'qty', parseFloat(e.target.value) || 0)}
                      />
                      {item.track_stock && item.stock_qty != null && item.qty > item.stock_qty && (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400 pointer-events-none">
                          <AlertCircle className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    {item.track_stock && item.stock_qty != null && item.qty > item.stock_qty && (
                      <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 text-center">
                        Stock: {item.stock_qty}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="
                        text-right text-sm
                        bg-white dark:bg-gray-900
                        border-gray-300 dark:border-gray-600
                        text-gray-900 dark:text-gray-100
                      "
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="
                        text-right text-sm
                        bg-white dark:bg-gray-900
                        border-gray-300 dark:border-gray-600
                        text-gray-900 dark:text-gray-100
                      "
                      value={item.discount_amount || 0}
                      onChange={(e) => updateItem(index, 'discount_amount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      {item.tax_code ? (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.tax_rate}%</span>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">N/A</span>
                      )}
                      {item.tax_code && (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="checkbox"
                            id={`tax-included-${index}`}
                            checked={item.tax_included || false}
                            onChange={(e) => updateItem(index, 'tax_included', e.target.checked)}
                            className="
                              h-3 w-3
                              rounded border-gray-300 dark:border-gray-600
                              text-blue-600 dark:text-blue-500
                              bg-white dark:bg-gray-900
                            "
                          />
                          <label htmlFor={`tax-included-${index}`} className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                            Incluido
                          </label>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(item.total_line || 0, 'COP')}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => eliminarItem(index)}
                      className="
                        h-8 w-8
                        hover:bg-red-50 dark:hover:bg-red-900/20
                        text-gray-600 dark:text-gray-400
                        hover:text-red-600 dark:hover:text-red-400
                      "
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

    </div>
  );
}
