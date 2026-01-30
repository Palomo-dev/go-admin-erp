'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Check } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { POSService } from '@/lib/services/posService';
import { cn } from '@/lib/utils';

interface Variant {
  id: number;
  sku: string;
  name: string;
  price: number | null;
  variant_data: Record<string, string>;
  image?: string | null;
}

interface VariantSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: number;
    name: string;
    sku: string;
    image?: string | null;
  };
  onSelectVariant: (variant: Variant) => void;
}

export function VariantSelectorDialog({
  open,
  onOpenChange,
  product,
  onSelectVariant,
}: VariantSelectorDialogProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  
  // Agrupar variantes por atributos para mejor visualización
  const [attributeGroups, setAttributeGroups] = useState<Record<string, string[]>>({});
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && product?.id) {
      loadVariants();
    }
  }, [open, product?.id]);

  const loadVariants = async () => {
    setIsLoading(true);
    try {
      const data = await POSService.getProductVariants(product.id);
      setVariants(data);
      
      // Extraer atributos únicos de todas las variantes
      const groups: Record<string, Set<string>> = {};
      data.forEach((variant: Variant) => {
        if (variant.variant_data) {
          Object.entries(variant.variant_data).forEach(([key, value]) => {
            if (!groups[key]) groups[key] = new Set();
            groups[key].add(value);
          });
        }
      });
      
      // Convertir Sets a Arrays
      const groupsArray: Record<string, string[]> = {};
      Object.entries(groups).forEach(([key, values]) => {
        groupsArray[key] = Array.from(values).sort();
      });
      setAttributeGroups(groupsArray);
      
      // Pre-seleccionar primera variante si existe
      if (data.length > 0) {
        setSelectedVariant(data[0]);
        setSelectedAttributes(data[0].variant_data || {});
      }
    } catch (error) {
      console.error('Error cargando variantes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Encontrar variante que coincida con los atributos seleccionados
  const findMatchingVariant = (attrs: Record<string, string>) => {
    return variants.find(v => {
      if (!v.variant_data) return false;
      return Object.entries(attrs).every(([key, value]) => 
        v.variant_data[key] === value
      );
    });
  };

  const handleAttributeSelect = (attrName: string, value: string) => {
    const newAttrs = { ...selectedAttributes, [attrName]: value };
    setSelectedAttributes(newAttrs);
    
    const matching = findMatchingVariant(newAttrs);
    if (matching) {
      setSelectedVariant(matching);
    }
  };

  const handleConfirm = () => {
    if (selectedVariant) {
      onSelectVariant(selectedVariant);
      onOpenChange(false);
    }
  };

  const resetAndClose = () => {
    setSelectedVariant(null);
    setSelectedAttributes({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Seleccionar Variante
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Nombre del producto */}
            <div className="text-center pb-2 border-b">
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
            </div>

            {/* Selectores de atributos */}
            {Object.entries(attributeGroups).map(([attrName, values]) => (
              <div key={attrName} className="space-y-2">
                <label className="text-sm font-medium capitalize">
                  {attrName}:
                </label>
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const isSelected = selectedAttributes[attrName] === value;
                    // Verificar si esta combinación tiene variante disponible
                    const testAttrs = { ...selectedAttributes, [attrName]: value };
                    const hasMatch = findMatchingVariant(testAttrs);
                    
                    return (
                      <Button
                        key={value}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        disabled={!hasMatch && !isSelected}
                        className={cn(
                          "min-w-[60px]",
                          isSelected && "bg-blue-600 hover:bg-blue-700",
                          !hasMatch && !isSelected && "opacity-50"
                        )}
                        onClick={() => handleAttributeSelect(attrName, value)}
                      >
                        {value}
                        {isSelected && <Check className="ml-1 h-3 w-3" />}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Variante seleccionada */}
            {selectedVariant && (
              <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{selectedVariant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      SKU: {selectedVariant.sku}
                    </p>
                  </div>
                  <div className="text-right">
                    {selectedVariant.price ? (
                      <p className="text-lg font-bold text-blue-600">
                        {formatCurrency(selectedVariant.price)}
                      </p>
                    ) : (
                      <Badge variant="destructive">Sin precio</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Lista alternativa si no hay atributos agrupables */}
            {Object.keys(attributeGroups).length === 0 && variants.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedVariant?.id === variant.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    )}
                    onClick={() => setSelectedVariant(variant)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{variant.name}</p>
                        <p className="text-sm text-muted-foreground">
                          SKU: {variant.sku}
                        </p>
                      </div>
                      <p className="font-bold">
                        {variant.price ? formatCurrency(variant.price) : '-'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetAndClose}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!selectedVariant || !selectedVariant.price}
                onClick={handleConfirm}
              >
                Agregar al Carrito
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
