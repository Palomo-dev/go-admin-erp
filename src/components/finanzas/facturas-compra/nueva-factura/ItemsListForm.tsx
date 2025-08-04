'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListChecks } from 'lucide-react';
import { InvoiceItemForm } from '../types';
import { ProductSearchDialog, type Product } from './ProductSearchDialog';
import { SelectedProductsTable, type SelectedProduct } from './SelectedProductsTable';
import { ManualItemDialog } from './ManualItemDialog';

interface ItemsListFormProps {
  items: InvoiceItemForm[];
  currency: string;
  errors: Record<string, string>;
  onItemChange: (index: number, field: keyof InvoiceItemForm, value: any) => void;
  onAgregarItem: () => void;
  onEliminarItem: (index: number) => void;
  onDirectAddItem?: (item: InvoiceItemForm) => void;
}

export function ItemsListForm({
  items,
  currency,
  errors,
  onItemChange,
  onAgregarItem,
  onEliminarItem,
  onDirectAddItem
}: ItemsListFormProps) {
  // Estado para productos seleccionados
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  
  // Sincronizar productos seleccionados con items del formulario
  useEffect(() => {
    // Convertir items existentes a productos seleccionados si es necesario
    if (items.length > 0 && selectedProducts.length === 0) {
      const convertedProducts: SelectedProduct[] = items.map((item, index) => ({
        id: Date.now() + index, // ID temporal
        name: item.description.split(' (')[0] || item.description,
        sku: item.description.match(/\(([^)]+)\)$/)?.[1] || `ITEM-${index + 1}`,
        description: item.description,
        cost: item.unit_price,
        price: 0, // No tenemos precio de referencia
        tax_rate: item.tax_rate,
        quantity: item.qty,
        unit_cost: item.unit_price,
        discount_amount: item.discount_amount || 0,
        description_override: item.description
      }));
      setSelectedProducts(convertedProducts);
    }
  }, [items, selectedProducts.length]);
  
  // Manejar agregar item manual
  const handleManualItemAdd = useCallback((item: { description: string; cost: number; tax_rate: number; }) => {
    console.log('=== DEBUG handleManualItemAdd ===');
    console.log('Item manual agregado:', item);
    
    // Crear un producto virtual para mantener consistencia en la estructura
    const manualProduct: SelectedProduct = {
      id: Date.now(), // ID temporal único
      name: item.description.split(' ')[0] || 'Item Manual',
      sku: `MANUAL-${Date.now()}`,
      description: item.description,
      cost: item.cost,
      price: 0, // No tiene precio de referencia
      tax_rate: item.tax_rate,
      quantity: 1,
      unit_cost: item.cost,
      discount_amount: 0,
      description_override: item.description
    };
    
    // Agregar a productos seleccionados
    setSelectedProducts(prev => [...prev, manualProduct]);
    
    if (onDirectAddItem) {
      const newItem: InvoiceItemForm = {
        description: item.description,
        qty: 1,
        unit_price: item.cost,
        tax_rate: item.tax_rate,
        discount_amount: 0
      };
      
      console.log('Agregando item manual directamente:', newItem);
      onDirectAddItem(newItem);
    } else {
      // Fallback al método original si onDirectAddItem no está disponible
      onAgregarItem();
      
      // Usar setTimeout para actualizar el último item agregado
      setTimeout(() => {
        const lastIndex = items.length; // Debería ser el nuevo índice
        console.log('Actualizando item manual en índice:', lastIndex);
        
        onItemChange(lastIndex, 'description', item.description);
        onItemChange(lastIndex, 'qty', 1);
        onItemChange(lastIndex, 'unit_price', item.cost);
        onItemChange(lastIndex, 'tax_rate', item.tax_rate);
        onItemChange(lastIndex, 'discount_amount', 0);
      }, 100);
    }
    
    console.log('=== FIN DEBUG handleManualItemAdd ===');
  }, [onAgregarItem, onItemChange, onDirectAddItem, items.length]);

  // Manejar selección de producto desde el catálogo
  const handleProductSelect = useCallback((product: Product) => {
    console.log('=== DEBUG handleProductSelect SIMPLIFICADO ===');
    console.log('Producto seleccionado:', product);
    
    const selectedProduct: SelectedProduct = {
      ...product,
      quantity: 1,
      unit_cost: product.cost,
      discount_amount: 0,
      tax_rate: product.tax_rate || 0
    };
    
    setSelectedProducts(prev => [...prev, selectedProduct]);
    
    // En lugar de usar onAgregarItem + onItemChange, usar directamente onDirectAddItem
    // que agregará el producto completo de una vez
    if (onDirectAddItem) {
      const newItem = {
        description: `${product.name} (${product.sku})`,
        qty: 1,
        unit_price: product.cost,
        tax_rate: product.tax_rate || 0,
        discount_amount: 0
      };
      
      console.log('Agregando item directamente:', newItem);
      onDirectAddItem(newItem);
    } else {
      // Fallback al método original si onDirectAddItem no está disponible
      onAgregarItem();
      
      // Usar setTimeout para actualizar el último item agregado
      setTimeout(() => {
        const lastIndex = items.length; // Debería ser el nuevo índice
        console.log('Actualizando item en índice:', lastIndex);
        
        onItemChange(lastIndex, 'description', `${product.name} (${product.sku})`);
        onItemChange(lastIndex, 'qty', 1);
        onItemChange(lastIndex, 'unit_price', product.cost);
        onItemChange(lastIndex, 'tax_rate', product.tax_rate || 19);
        onItemChange(lastIndex, 'discount_amount', 0);
      }, 100);
    }
    
    console.log('=== FIN DEBUG handleProductSelect ===');
  }, [onAgregarItem, onItemChange, onDirectAddItem, items.length]);
  
  // Manejar actualización de producto seleccionado
  const handleProductUpdate = useCallback((index: number, field: keyof SelectedProduct, value: any) => {
    setSelectedProducts(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    
    // Sincronizar con el formulario original
    if (index < items.length) {
      switch (field) {
        case 'quantity':
          onItemChange(index, 'qty', value);
          break;
        case 'unit_cost':
          onItemChange(index, 'unit_price', value);
          break;
        case 'discount_amount':
          onItemChange(index, 'discount_amount', value);
          break;
        case 'tax_rate':
          onItemChange(index, 'tax_rate', value);
          break;
      }
    }
  }, [items.length, onItemChange]);
  
  // Manejar eliminación de producto
  const handleProductRemove = useCallback((index: number) => {
    setSelectedProducts(prev => prev.filter((_, i) => i !== index));
    onEliminarItem(index);
  }, [onEliminarItem]);
  
  // Manejar edición de descripción
  const handleDescriptionEdit = useCallback((index: number, description: string) => {
    setSelectedProducts(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], description_override: description };
      return updated;
    });
    
    // Sincronizar con el formulario original
    if (index < items.length) {
      onItemChange(index, 'description', description);
    }
  }, [items.length, onItemChange]);
  
  // Obtener IDs de productos ya seleccionados
  const selectedProductIds = selectedProducts.map(p => p.id);

  return (
    <div className="space-y-6">
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <ListChecks className="w-5 h-5" />
              Productos para Factura de Compra
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedProducts.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {selectedProducts.length} producto{selectedProducts.length !== 1 ? 's' : ''}
                </Badge>
              )}
              <ManualItemDialog 
                currency={currency}
                onItemAdd={handleManualItemAdd}
              />
              <ProductSearchDialog 
                currency={currency}
                onProductSelect={handleProductSelect}
                selectedProductIds={selectedProductIds}
              />
            </div>
          </div>
        </CardHeader>
      </Card>
      
      {/* Tabla de productos seleccionados */}
      <SelectedProductsTable
        selectedProducts={selectedProducts}
        currency={currency}
        errors={errors}
        onProductUpdate={handleProductUpdate}
        onProductRemove={handleProductRemove}
        onProductDescriptionEdit={handleDescriptionEdit}
      />

    </div>
  );
}
