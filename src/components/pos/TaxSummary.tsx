'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calculator, Settings, ChevronDown, Check } from 'lucide-react';
import { POSService } from '@/lib/services/posService';
import { Cart, CartItem } from './types';
import { formatCurrency } from '@/utils/Utils';
import { 
  calculateCartTaxes, 
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem 
} from '@/lib/utils/taxCalculations';

interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id?: number;
  name: string;
  rate: number;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TaxBreakdown {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

interface TaxSummaryProps {
  cart: Cart;
  taxIncluded: boolean;
  onTaxIncludedChange: (included: boolean) => void;
  className?: string;
}

export function TaxSummary({ 
  cart, 
  taxIncluded, 
  onTaxIncludedChange, 
  className 
}: TaxSummaryProps) {
  const [organizationTaxes, setOrganizationTaxes] = useState<OrganizationTax[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<TaxBreakdown[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [loading, setLoading] = useState(true);
  const [hasProductSpecificTaxes, setHasProductSpecificTaxes] = useState(false);
  const [taxSelectorOpen, setTaxSelectorOpen] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0
  });

  // Cargar impuestos de la organización
  useEffect(() => {
    const loadOrganizationTaxes = async () => {
      try {
        setLoading(true);
        const taxes = await POSService.getOrganizationTaxes();
        setOrganizationTaxes(taxes);
        
        // Inicializar impuestos aplicados con los predeterminados
        const initialAppliedTaxes: {[key: string]: boolean} = {};
        taxes.forEach((tax: OrganizationTax) => {
          initialAppliedTaxes[tax.id] = tax.is_default;
        });
        setAppliedTaxes(initialAppliedTaxes);
        
      } catch (error) {
        console.error('Error loading organization taxes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrganizationTaxes();
  }, []);

  // Calcular desglose de impuestos usando la utilidad
  useEffect(() => {
    const calculateTaxBreakdown = async () => {
      if (cart.items.length === 0 || organizationTaxes.length === 0) {
        setTaxBreakdown([]);
        setCalculatedTotals({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0 });
        return;
      }

      let hasProductTaxes = false;
      let combinedSubtotal = 0;
      let combinedTaxAmount = 0;
      let combinedFinalTotal = 0;
      const combinedBreakdown: {[taxId: string]: TaxBreakdown} = {};
      
      // Procesar cada ítem del carrito
      for (const item of cart.items) {
        try {
          const productTaxes = await POSService.getProductTaxes(item.product_id);
          
          const taxItem: TaxCalculationItem = {
            quantity: item.quantity,
            unit_price: item.unit_price,
            product_id: item.product_id
          };
          
          let result;
          
          if (productTaxes.length > 0) {
            hasProductTaxes = true;
            // Usar impuestos específicos del producto
            const productAppliedTaxes: {[key: string]: boolean} = {};
            const productOrgTaxes: TaxUtilOrganizationTax[] = [];
            
            productTaxes.forEach(relation => {
              if (relation.organization_taxes && relation.organization_taxes.is_active) {
                productAppliedTaxes[relation.organization_taxes.id] = true;
                productOrgTaxes.push({
                  id: relation.organization_taxes.id,
                  name: relation.organization_taxes.name,
                  rate: parseFloat(relation.organization_taxes.rate.toString()),
                  is_default: relation.organization_taxes.is_default,
                  is_active: relation.organization_taxes.is_active
                });
              }
            });
            
            result = calculateCartTaxes(
              [taxItem],
              productAppliedTaxes,
              productOrgTaxes,
              taxIncluded
            );
          } else {
            // Usar impuestos de organización
            const orgTaxesForCalculation: TaxUtilOrganizationTax[] = organizationTaxes.map(tax => ({
              id: tax.id,
              name: tax.name,
              rate: parseFloat(tax.rate.toString()),
              is_default: tax.is_default,
              is_active: tax.is_active
            }));
            
            result = calculateCartTaxes(
              [taxItem],
              appliedTaxes,
              orgTaxesForCalculation,
              taxIncluded
            );
          }
          
          // Acumular totales
          combinedSubtotal += result.subtotal;
          combinedTaxAmount += result.totalTaxAmount;
          combinedFinalTotal += result.finalTotal;
          
          // Combinar breakdown
          result.taxBreakdown.forEach(tax => {
            if (combinedBreakdown[tax.taxId]) {
              combinedBreakdown[tax.taxId].baseAmount += tax.baseAmount;
              combinedBreakdown[tax.taxId].taxAmount += tax.taxAmount;
            } else {
              combinedBreakdown[tax.taxId] = { ...tax };
            }
          });
          
        } catch (error) {
          console.error('Error processing item taxes:', error);
          // En caso de error, agregar el ítem sin impuestos
          const lineTotal = item.quantity * item.unit_price;
          combinedSubtotal += lineTotal;
          combinedFinalTotal += lineTotal;
        }
      }
      
      // Actualizar estados
      setHasProductSpecificTaxes(hasProductTaxes);
      setTaxBreakdown(Object.values(combinedBreakdown));
      setCalculatedTotals({
        subtotal: Math.round(combinedSubtotal * 100) / 100,
        totalTaxAmount: Math.round(combinedTaxAmount * 100) / 100,
        finalTotal: Math.round(combinedFinalTotal * 100) / 100
      });
    };

    calculateTaxBreakdown();
  }, [cart.items, organizationTaxes, appliedTaxes, taxIncluded]);

  // Usar los totales calculados correctamente
  const { subtotal, totalTaxAmount, finalTotal } = calculatedTotals;
  const total = finalTotal - (cart.discount_total || 0);

  if (loading) {
    return (
      <Card className={`dark:bg-gray-800 light:bg-white dark:border-gray-700 light:border-gray-200 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-sm dark:text-white light:text-gray-900">
            <Calculator className="h-4 w-4" />
            <span>Resumen de Impuestos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm dark:text-gray-400 light:text-gray-600">Cargando...</div>
        </CardContent>
      </Card>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Card className={`dark:bg-gray-800 light:bg-white dark:border-gray-700 light:border-gray-200 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-sm dark:text-white light:text-gray-900">
            <Calculator className="h-4 w-4" />
            <span>Resumen de Impuestos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm dark:text-gray-400 light:text-gray-600">Agregue productos para ver los impuestos</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`dark:bg-gray-800 light:bg-white dark:border-gray-700 light:border-gray-200 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-sm sm:text-base dark:text-white light:text-gray-900">
            <Calculator className="h-4 w-4 shrink-0" />
            <span className="truncate">Resumen de Impuestos</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 dark:hover:bg-gray-700 light:hover:bg-gray-100 shrink-0"
          >
            <Settings className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Toggle para impuestos incluidos */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mt-2">
          <span className="text-xs dark:text-gray-400 light:text-gray-600 leading-tight">
            Impuestos incluidos en precios
          </span>
          <label className="relative inline-flex items-center cursor-pointer self-start sm:self-auto">
            <input
              type="checkbox"
              checked={taxIncluded}
              onChange={(e) => onTaxIncludedChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 sm:w-9 sm:h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] sm:after:top-[2px] after:left-[1px] sm:after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 sm:after:h-4 sm:after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Subtotal */}
          <div className="flex justify-between items-start gap-3 text-xs sm:text-sm">
            <span className="dark:text-gray-400 light:text-gray-600 shrink-0">Subtotal:</span>
            <div className="text-right">
              <span className="dark:text-white light:text-gray-900 font-medium">
                {formatCurrency(subtotal)}
              </span>
              {taxIncluded && (
                <div className="text-xs dark:text-gray-500 light:text-gray-500">
                  (inc. impuestos)
                </div>
              )}
            </div>
          </div>

          {/* Multi-selector de impuestos de organización (cuando no hay impuestos específicos del producto) */}
          {!hasProductSpecificTaxes && organizationTaxes.length > 0 && (
            <>
              <Separator className="dark:bg-gray-700 light:bg-gray-200" />
              <div className="space-y-2">
                <div className="text-xs font-medium dark:text-gray-300 light:text-gray-700">
                  Impuestos disponibles:
                </div>
                <Popover open={taxSelectorOpen} onOpenChange={setTaxSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={taxSelectorOpen}
                      className="w-full justify-between h-8 text-xs dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 light:bg-white"
                    >
                      {(() => {
                        const selectedCount = Object.values(appliedTaxes).filter(Boolean).length;
                        const selectedTaxes = organizationTaxes.filter(tax => appliedTaxes[tax.id]);
                        
                        if (selectedCount === 0) {
                          return "Ningún impuesto seleccionado";
                        } else if (selectedCount === 1) {
                          return `${selectedTaxes[0].name} (${selectedTaxes[0].rate}%)`;
                        } else {
                          return `${selectedCount} impuestos seleccionados`;
                        }
                      })()} 
                      <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2 dark:bg-gray-800 dark:border-gray-600" align="start">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1">
                        Selecciona los impuestos a aplicar:
                      </div>
                      {organizationTaxes.map((tax) => (
                        <div
                          key={tax.id}
                          onClick={() => {
                            setAppliedTaxes(prev => ({
                              ...prev,
                              [tax.id]: !prev[tax.id]
                            }));
                          }}
                          className="flex items-center space-x-2 px-2 py-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Checkbox
                            checked={appliedTaxes[tax.id] || false}
                            onChange={() => {}} // Manejado por el onClick del contenedor
                            className="h-3 w-3"
                          />
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-xs dark:text-gray-300 light:text-gray-700">
                              {tax.name} ({tax.rate}%)
                            </span>
                            {tax.is_default && (
                              <Badge variant="outline" className="text-xs py-0 px-1 h-4">
                                predeterminado
                              </Badge>
                            )}
                          </div>
                          {appliedTaxes[tax.id] && (
                            <Check className="h-3 w-3 dark:text-green-400 light:text-green-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}

          {/* Desglose de impuestos */}
          {taxBreakdown.length > 0 && (
            <>
              <Separator className="dark:bg-gray-700 light:bg-gray-200" />
              <div className="space-y-2">
                <div className="text-xs font-medium dark:text-gray-300 light:text-gray-700">
                  Impuestos aplicados:
                </div>
                <div className="space-y-1">
                  {taxBreakdown.map((tax) => (
                    <div key={tax.taxId} className="flex justify-between items-start gap-2 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0 flex-1">
                        <span className="dark:text-gray-400 light:text-gray-600 truncate" title={`${tax.name} (${tax.rate}%)`}>
                          {tax.name} ({tax.rate}%)
                        </span>
                        {taxIncluded && (
                          <Badge variant="outline" className="text-xs py-0 px-1 w-fit shrink-0">
                            incluido
                          </Badge>
                        )}
                      </div>
                      <span className="dark:text-white light:text-gray-900 font-medium shrink-0">
                        {formatCurrency(tax.taxAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Total de impuestos */}
          {totalTaxAmount > 0 && (
            <>
              <Separator className="dark:bg-gray-700 light:bg-gray-200" />
              <div className="flex justify-between items-center gap-3 text-sm font-medium">
                <span className="dark:text-gray-300 light:text-gray-700 shrink-0">Total Impuestos:</span>
                <span className="dark:text-blue-400 light:text-blue-600">
                  {formatCurrency(totalTaxAmount)}
                </span>
              </div>
            </>
          )}

          {/* Total final */}
          <Separator className="dark:bg-gray-700 light:bg-gray-200" />
          <div className="flex justify-between items-center gap-3 text-sm sm:text-base font-semibold">
            <span className="dark:text-white light:text-gray-900 shrink-0">Total Final:</span>
            <span className="dark:text-green-400 light:text-green-600">
              {formatCurrency(total)}
            </span>
          </div>

          {/* Información adicional */}
          {taxBreakdown.length === 0 && (
            <div className="text-xs dark:text-gray-500 light:text-gray-500 text-center mt-2 px-2">
              No hay impuestos configurados para estos productos
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
