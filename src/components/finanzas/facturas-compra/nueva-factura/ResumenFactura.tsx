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
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="dark:text-white">Resumen</CardTitle>
          {hasActiveTaxes && (
            <Badge variant={taxIncluded ? "secondary" : "outline"} className="text-xs">
              {taxIncluded ? 'Impuestos incluidos' : 'Impuestos agregados'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Subtotal */}
          <div className="flex justify-between text-sm">
            <span className="dark:text-gray-300">Subtotal:</span>
            <span className="dark:text-gray-300">
              {formatCurrency(subtotal, currency)}
            </span>
          </div>
          
          {/* Desglose de impuestos - solo si hay impuestos activos */}
          {hasActiveTaxes && (
            <>
              {taxBreakdown.map((tax) => (
                <div key={tax.taxId} className="flex justify-between text-xs pl-2">
                  <span className="dark:text-gray-400">
                    {tax.name} ({tax.rate}%):
                  </span>
                  <span className="dark:text-gray-400">
                    {formatCurrency(tax.taxAmount, currency)}
                  </span>
                </div>
              ))}
              
              {/* Separador solo si hay impuestos */}
              <div className="flex justify-between text-sm pt-1 border-t dark:border-gray-600">
                <span className="dark:text-gray-300">Total impuestos:</span>
                <span className="dark:text-gray-300">
                  {formatCurrency(taxTotal, currency)}
                </span>
              </div>
            </>
          )}
          
          {/* Total final */}
          <Separator className="my-2" />
          <div className="flex justify-between text-lg font-semibold pt-1">
            <span className="dark:text-white">Total final:</span>
            <span className="dark:text-white">
              {formatCurrency(total, currency)}
            </span>
          </div>
          
          {/* Mensaje informativo cuando no hay impuestos */}
          {!hasActiveTaxes && taxTotal === 0 && (
            <div className="text-center py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sin impuestos aplicados
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
