'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Info } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { InvoicePurchase } from '../types';

interface TaxBreakdown {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

interface ResumenTotalesFacturaProps {
  factura: InvoicePurchase;
  className?: string;
}

interface OrganizationTax {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

export function ResumenTotalesFactura({ 
  factura, 
  className = '' 
}: ResumenTotalesFacturaProps) {
  const [taxBreakdown, setTaxBreakdown] = useState<TaxBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (factura && factura.items && factura.items.length > 0) {
      calcularDesgloseImpuestos();
    } else {
      setLoading(false);
    }
  }, [factura]);

  const calcularDesgloseImpuestos = async () => {
    try {
      setLoading(true);
      const organizationId = getOrganizationId();

      if (!organizationId || factura.tax_total === 0) {
        setTaxBreakdown([]);
        return;
      }

      // Obtener impuestos de la organización
      const { data: taxes, error } = await supabase
        .from('organization_taxes')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .eq('is_default', true) // Solo los que están aplicados por defecto
        .order('name');

      if (error) {
        console.error('Error cargando impuestos:', error);
        setTaxBreakdown([]);
        return;
      }

      if (taxes && taxes.length > 0) {
        // Calcular el desglose basado en los impuestos aplicados
        const breakdown: TaxBreakdown[] = taxes.map(tax => {
          const rate = parseFloat(tax.rate.toString());
          
          let baseAmount: number;
          let taxAmount: number;

          if (factura.tax_included) {
            // Si los impuestos están incluidos
            baseAmount = factura.subtotal;
            taxAmount = (baseAmount * rate) / (100 + rate);
          } else {
            // Si los impuestos no están incluidos
            baseAmount = factura.subtotal;
            taxAmount = (baseAmount * rate) / 100;
          }

          return {
            taxId: tax.id,
            name: tax.name,
            rate: rate,
            baseAmount: baseAmount,
            taxAmount: taxAmount
          };
        });

        setTaxBreakdown(breakdown);
      }
    } catch (error) {
      console.error('Error calculando desglose de impuestos:', error);
      setTaxBreakdown([]);
    } finally {
      setLoading(false);
    }
  };

  const hasActiveTaxes = taxBreakdown.length > 0 && factura.tax_total > 0;

  return (
    <Card className={`dark:bg-gray-800/50 dark:border-gray-700 border-gray-200 ${className}`}>
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span>Totales</span>
          </CardTitle>
          {hasActiveTaxes && !loading && (
            <Badge variant={factura.tax_included ? "secondary" : "outline"} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 whitespace-nowrap">
              {factura.tax_included ? 'Imp. incluidos' : 'Imp. agregados'}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-2 sm:space-y-3">
          {/* Subtotal */}
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-400">Subtotal:</span>
            <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
              {formatCurrency(factura.subtotal, factura.currency)}
            </span>
          </div>

          {/* Desglose de impuestos - solo si hay impuestos activos */}
          {hasActiveTaxes && !loading && (
            <>
              {taxBreakdown.map((tax) => (
                <div key={tax.taxId} className="flex justify-between items-center text-[10px] sm:text-xs pl-2 sm:pl-3">
                  <span className="text-gray-600 dark:text-gray-400">
                    {tax.name} ({tax.rate}%):
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(tax.taxAmount, factura.currency)}
                  </span>
                </div>
              ))}
              
              {/* Total de impuestos */}
              <div className="flex justify-between items-center text-xs sm:text-sm pt-1 sm:pt-1.5 border-t border-gray-200 dark:border-gray-600">
                <span className="text-gray-700 dark:text-gray-400">Total impuestos:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(factura.tax_total, factura.currency)}
                </span>
              </div>
            </>
          )}

          {/* Si no hay desglose pero sí hay impuestos totales */}
          {!hasActiveTaxes && factura.tax_total > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-400">Impuestos:</span>
              <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                {formatCurrency(factura.tax_total, factura.currency)}
              </span>
            </div>
          )}

          <Separator className="my-2 dark:bg-gray-600" />

          {/* Total final */}
          <div className="flex justify-between items-center text-base sm:text-lg">
            <span className="font-semibold text-gray-900 dark:text-white">Total:</span>
            <span className="font-bold text-gray-900 dark:text-white">
              {formatCurrency(factura.total, factura.currency)}
            </span>
          </div>

          {/* Balance pendiente */}
          {factura.balance > 0 && (
            <>
              <Separator className="my-2 dark:bg-gray-600" />
              <div className="flex justify-between items-center text-base sm:text-lg">
                <span className="font-semibold text-red-600 dark:text-red-400">Balance:</span>
                <span className="font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(factura.balance, factura.currency)}
                </span>
              </div>
            </>
          )}

          {/* Mensaje informativo cuando no hay impuestos */}
          {!hasActiveTaxes && factura.tax_total === 0 && !loading && (
            <div className="flex items-center justify-center py-2">
              <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 text-gray-400 dark:text-gray-500" />
              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                Sin impuestos aplicados
              </p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <span className="ml-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                Calculando desglose...
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
