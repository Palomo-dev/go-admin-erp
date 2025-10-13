'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calculator, Settings, ChevronDown, Check } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { 
  calculateCartTaxes,
  type OrganizationTax,
  type TaxCalculationItem,
  type TaxCalculationResult
} from '@/lib/utils/taxCalculations';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface TaxBreakdown {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

interface ImpuestosFacturaCompraProps {
  items: TaxCalculationItem[];
  currency: string;
  taxIncluded: boolean;
  onTaxIncludedChange: (included: boolean) => void;
  onTaxCalculationChange: (calculation: TaxCalculationResult & { appliedTaxes: {[key: string]: boolean} }) => void;
  className?: string;
}

export function ImpuestosFacturaCompra({ 
  items, 
  currency = 'COP',
  taxIncluded, 
  onTaxIncludedChange,
  onTaxCalculationChange,
  className = ''
}: ImpuestosFacturaCompraProps) {
  const [organizationTaxes, setOrganizationTaxes] = useState<OrganizationTax[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculationResult>({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0,
    taxBreakdown: []
  });
  const [isLoading, setIsLoading] = useState(true);

  // Cargar impuestos de la organización
  useEffect(() => {
    const loadOrganizationTaxes = async () => {
      try {
        setIsLoading(true);
        const organizationId = getOrganizationId();
        
        if (!organizationId) {
          console.warn('No se encontró organizationId');
          return;
        }

        const { data: taxes, error } = await supabase
          .from('organization_taxes')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('name');

        if (error) {
          console.error('Error cargando impuestos:', error);
          return;
        }

        if (taxes) {
          // Convertir al formato esperado por taxCalculations
          const formattedTaxes: OrganizationTax[] = taxes.map(tax => ({
            id: tax.id,
            name: tax.name,
            rate: parseFloat(tax.rate.toString()),
            is_default: tax.is_default,
            is_active: tax.is_active
          }));

          setOrganizationTaxes(formattedTaxes);

          // Inicializar impuestos aplicados con los predeterminados
          const initialAppliedTaxes: {[key: string]: boolean} = {};
          formattedTaxes.forEach(tax => {
            initialAppliedTaxes[tax.id] = tax.is_default;
          });
          setAppliedTaxes(initialAppliedTaxes);
        }
      } catch (error) {
        console.error('Error al cargar impuestos:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrganizationTaxes();
  }, []);

  // Recalcular impuestos cuando cambien los items, impuestos aplicados o configuración
  useEffect(() => {
    if (organizationTaxes.length > 0 && items.length > 0) {
      const calculation = calculateCartTaxes(
        items,
        appliedTaxes,
        organizationTaxes,
        taxIncluded
      );
      
      setTaxCalculation(calculation);
      
      console.log('=== NOTIFICANDO CAMBIOS DE IMPUESTOS AL PADRE ===');
      console.log('Cálculo de impuestos:', calculation);
      console.log('Impuestos aplicados:', appliedTaxes);
      console.log('Tax included:', taxIncluded);
      
      // Notificar cambios al componente padre
      onTaxCalculationChange({
        ...calculation,
        appliedTaxes
      });
    } else {
      // Si no hay items o impuestos, resetear cálculos
      const emptyCalculation = {
        subtotal: 0,
        totalTaxAmount: 0,
        finalTotal: 0,
        taxBreakdown: []
      };
      setTaxCalculation(emptyCalculation);
      onTaxCalculationChange({
        ...emptyCalculation,
        appliedTaxes: {}
      });
    }
  }, [items, appliedTaxes, organizationTaxes, taxIncluded, onTaxCalculationChange]);

  const handleTaxToggle = (taxId: string) => {
    setAppliedTaxes(prev => ({
      ...prev,
      [taxId]: !prev[taxId]
    }));
  };

  const handleTaxIncludedToggle = () => {
    onTaxIncludedChange(!taxIncluded);
  };

  // Mostrar loading durante carga inicial
  if (isLoading) {
    return (
      <Card className={`dark:bg-gray-800/50 dark:border-gray-700 border-gray-200 ${className}`}>
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Impuestos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-3 sm:py-4">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600 dark:text-gray-300">Cargando impuestos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`dark:bg-gray-800/50 dark:border-gray-700 border-gray-200 ${className}`}>
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Impuestos</span>
          </CardTitle>
          
          {organizationTaxes.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 sm:h-8 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                  <Settings className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">Configurar</span>
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 sm:w-72 dark:bg-gray-800 dark:border-gray-700">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">Configuración de Impuestos</h4>
                  
                  {/* Toggle para impuestos incluidos */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="tax-included"
                      checked={taxIncluded}
                      onCheckedChange={handleTaxIncludedToggle}
                      className="dark:border-gray-600"
                    />
                    <label htmlFor="tax-included" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      Impuestos incluidos en el precio
                    </label>
                  </div>
                  
                  <Separator className="dark:bg-gray-700" />
                  
                  {/* Lista de impuestos disponibles */}
                  <div className="space-y-2">
                    <h5 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Impuestos Aplicables:</h5>
                    {organizationTaxes.map(tax => (
                      <div key={tax.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Checkbox
                            id={`tax-${tax.id}`}
                            checked={appliedTaxes[tax.id] || false}
                            onCheckedChange={() => handleTaxToggle(tax.id)}
                            className="dark:border-gray-600"
                          />
                          <label 
                            htmlFor={`tax-${tax.id}`} 
                            className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 cursor-pointer truncate"
                          >
                            {tax.name}
                          </label>
                        </div>
                        <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {tax.rate}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-2 sm:pt-3">
        {/* Estado de impuestos incluidos */}
        <div className="mb-2 sm:mb-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-gray-700 dark:text-gray-300">Estado:</span>
            <Badge variant={taxIncluded ? "secondary" : "outline"} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
              {taxIncluded ? 'Incluidos' : 'No incluidos'}
            </Badge>
          </div>
        </div>
        
        {/* Información de impuestos aplicados */}
        <div className="space-y-2">
          {taxCalculation.taxBreakdown.length > 0 ? (
            <div className="text-xs sm:text-sm text-gray-900 dark:text-gray-300">
              <span className="font-medium">
                {taxCalculation.taxBreakdown.length} impuesto(s) aplicado(s):
              </span>
              <div className="mt-1 space-y-1">
                {taxCalculation.taxBreakdown.map((tax) => (
                  <div key={tax.taxId} className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 pl-2">
                    • {tax.name} ({tax.rate}%)
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {organizationTaxes.length === 0 
                ? 'No hay impuestos configurados para esta organización'
                : 'No hay impuestos seleccionados'
              }
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
