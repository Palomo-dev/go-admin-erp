'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';

interface TaxBreakdown {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

interface ResumenFacturaProps {
  subtotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  taxIncluded: boolean;
  taxBreakdown?: TaxBreakdown[];
}

export function ResumenFactura({
  subtotal,
  taxTotal,
  total,
  currency,
  taxIncluded,
  taxBreakdown = []
}: ResumenFacturaProps) {
  // Debug: verificar props recibidas (temporalmente comentado)
  // console.log('=== DEBUG ResumenFactura ===');
  // console.log('Props recibidas:', { subtotal, taxTotal, total, currency, taxIncluded, taxBreakdown });
  
  const hasActiveTaxes = taxBreakdown.length > 0 && taxTotal > 0;

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">Resumen</CardTitle>
          {hasActiveTaxes && (
            <Badge 
              variant={taxIncluded ? "secondary" : "outline"} 
              className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 whitespace-nowrap"
            >
              {taxIncluded ? 'Imp. incluidos' : 'Imp. agregados'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 sm:space-y-2.5">
          {/* Subtotal */}
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
            <span className="font-medium text-gray-900 dark:text-gray-300">
              {formatCurrency(subtotal, currency)}
            </span>
          </div>
          
          {/* Desglose de impuestos - solo si hay impuestos activos */}
          {hasActiveTaxes && (
            <>
              {taxBreakdown.map((tax) => (
                <div key={tax.taxId} className="flex justify-between items-center text-[10px] sm:text-xs pl-2 sm:pl-3">
                  <span className="text-gray-600 dark:text-gray-400">
                    {tax.name} ({tax.rate}%):
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(tax.taxAmount, currency)}
                  </span>
                </div>
              ))}
              
              {/* Separador solo si hay impuestos */}
              <div className="flex justify-between items-center text-xs sm:text-sm pt-1 sm:pt-1.5 border-t border-gray-200 dark:border-gray-600">
                <span className="text-gray-700 dark:text-gray-300">Total impuestos:</span>
                <span className="font-medium text-gray-900 dark:text-gray-300">
                  {formatCurrency(taxTotal, currency)}
                </span>
              </div>
            </>
          )}
          
          {/* Total final */}
          <Separator className="my-2 dark:bg-gray-600" />
          <div className="flex justify-between items-center text-base sm:text-lg font-semibold pt-1">
            <span className="text-gray-900 dark:text-white">Total final:</span>
            <span className="text-gray-900 dark:text-white">
              {formatCurrency(total, currency)}
            </span>
          </div>
          
          {/* Mensaje informativo cuando no hay impuestos */}
          {!hasActiveTaxes && taxTotal === 0 && (
            <div className="text-center py-2">
              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                Sin impuestos aplicados
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
