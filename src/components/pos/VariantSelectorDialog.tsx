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
import { Loader2, Package, Check, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/utils/Utils';
import { POSService } from '@/lib/services/posService';
import { cn } from '@/lib/utils';
import { ProductModifiersService, type ProductModifierGroup } from '@/lib/services/productModifiersService';

interface Variant {
  id: number;
  sku: string;
  name: string;
  price: number | null;
  variant_data: Record<string, string>;
  image?: string | null;
}

export interface SelectedModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

interface VariantSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: number;
    name: string;
    sku: string;
    price?: number | null;
    image?: string | null;
  };
  onSelectVariant: (variant: Variant, modifiers: SelectedModifier[]) => void;
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

  // Modificadores (ej. salsas, extras) - no cambian el SKU, se suman al pedido
  const [modifierGroups, setModifierGroups] = useState<ProductModifierGroup[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<Record<number, Set<number>>>({});
  const [modifierError, setModifierError] = useState<string | null>(null);

  useEffect(() => {
    if (open && product?.id) {
      loadVariants();
      loadModifiers();
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
      } else {
        // Producto simple sin variantes: se usa a sí mismo como "variante" para
        // permitir elegir únicamente sus modificadores (ej. salsas, extras).
        // Se preservan todos los campos originales del producto (station, categories, etc.)
        setSelectedVariant({ ...(product as any), variant_data: {} });
      }
    } catch (error) {
      console.error('Error cargando variantes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModifiers = async () => {
    try {
      const groups = await ProductModifiersService.getGroupsByProduct(product.id);
      setModifierGroups(groups);
      setSelectedModifierIds({});
      setModifierError(null);
    } catch (error) {
      console.error('Error cargando modificadores:', error);
      setModifierGroups([]);
    }
  };

  const toggleModifier = (group: ProductModifierGroup, modifierId: number) => {
    setModifierError(null);
    setSelectedModifierIds((prev) => {
      const current = new Set(prev[group.id] || []);
      if (group.selection_mode === 'single') {
        // Selección única: si ya estaba marcada, se puede desmarcar (a menos que sea obligatoria)
        if (current.has(modifierId)) {
          if (!group.required) current.clear();
        } else {
          current.clear();
          current.add(modifierId);
        }
      } else {
        if (current.has(modifierId)) {
          current.delete(modifierId);
        } else {
          if (group.max_selections && current.size >= group.max_selections) {
            return prev;
          }
          current.add(modifierId);
        }
      }
      return { ...prev, [group.id]: current };
    });
  };

  const selectedModifiers: SelectedModifier[] = modifierGroups.flatMap((group) => {
    const ids = selectedModifierIds[group.id] || new Set();
    return (group.product_modifiers || [])
      .filter((m) => ids.has(m.id))
      .map((m) => ({
        groupId: group.id,
        groupName: group.name,
        modifierId: m.id,
        name: m.name,
        extraPrice: m.extra_price,
      }));
  });

  const modifiersExtraTotal = selectedModifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0);

  const validateModifiers = (): boolean => {
    for (const group of modifierGroups) {
      const count = (selectedModifierIds[group.id] || new Set()).size;
      const minRequired = group.required ? Math.max(group.min_selections, 1) : group.min_selections;
      if (count < minRequired) {
        setModifierError(`Selecciona ${minRequired > 1 ? `al menos ${minRequired} opciones` : 'una opción'} en "${group.name}"`);
        return false;
      }
    }
    return true;
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
    if (!selectedVariant) return;
    if (!validateModifiers()) return;
    onSelectVariant(selectedVariant, selectedModifiers);
    onOpenChange(false);
  };

  const resetAndClose = () => {
    setSelectedVariant(null);
    setSelectedAttributes({});
    setSelectedModifierIds({});
    setModifierError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            {variants.length > 0 ? 'Seleccionar Variante' : 'Personalizar Producto'}
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
              {variants.length === 0 && (
                <p className="text-lg font-bold text-blue-600 mt-1">
                  {formatCurrency((selectedVariant?.price || 0) + modifiersExtraTotal)}
                  {modifiersExtraTotal > 0 && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      ({formatCurrency(selectedVariant?.price || 0)} + {formatCurrency(modifiersExtraTotal)})
                    </span>
                  )}
                </p>
              )}
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
            {selectedVariant && variants.length > 0 && (
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
                      <>
                        <p className="text-lg font-bold text-blue-600">
                          {formatCurrency(selectedVariant.price + modifiersExtraTotal)}
                        </p>
                        {modifiersExtraTotal > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(selectedVariant.price)} + {formatCurrency(modifiersExtraTotal)} extras
                          </p>
                        )}
                      </>
                    ) : (
                      <Badge variant="destructive">Sin precio</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Grupos de modificadores (ej. Salsas, Extras) */}
            {modifierGroups.length > 0 && (
              <div className="space-y-4 pt-2 border-t">
                {modifierGroups.map((group) => {
                  const selectedIds = selectedModifierIds[group.id] || new Set();
                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          {group.name}
                          {group.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {group.selection_mode === 'single' ? 'Elige 1' : group.max_selections ? `Hasta ${group.max_selections}` : 'Elige varias'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {(group.product_modifiers || []).map((modifier) => {
                          const isChecked = selectedIds.has(modifier.id);
                          return (
                            <label
                              key={modifier.id}
                              className={cn(
                                "flex items-center justify-between gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                                isChecked
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                              )}
                              onClick={() => toggleModifier(group, modifier.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox checked={isChecked} className="pointer-events-none" />
                                <span className="text-sm">{modifier.name}</span>
                              </div>
                              {modifier.extra_price > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  +{formatCurrency(modifier.extra_price)}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {modifierError && (
                  <div className="flex items-center gap-1.5 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {modifierError}
                  </div>
                )}
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
