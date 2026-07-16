'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, cn } from '@/utils/Utils';
import { useMesaTaxes, type MesaTaxItem } from '@/hooks/useMesaTaxes';

interface MesaTaxBreakdownProps {
  items: MesaTaxItem[];
  onTotalsChange?: (totals: { subtotal: number; taxTotal: number; total: number; taxIncluded: boolean }) => void;
  className?: string;
}

export function MesaTaxBreakdown({ items, onTotalsChange, className }: MesaTaxBreakdownProps) {
  const {
    organizationTaxes,
    appliedTaxes,
    taxIncluded,
    taxBreakdown,
    hasProductSpecificTaxes,
    loading,
    subtotal,
    taxTotal,
    total,
    setTaxIncluded,
    toggleTax,
  } = useMesaTaxes(items);

  const [expanded, setExpanded] = useState(false);

  // Notificar totales al padre cuando cambien
  React.useEffect(() => {
    if (onTotalsChange) {
      onTotalsChange({ subtotal, taxTotal, total, taxIncluded });
    }
  }, [subtotal, taxTotal, total, taxIncluded, onTotalsChange]);

  if (loading) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>Impuestos:</span>
          <span>Calculando...</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  // Si no hay impuestos configurados ni calculados, mostrar solo el toggle
  const hasTaxContent = taxBreakdown.length > 0 || taxTotal > 0;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toggle impuestos incluidos */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Impuestos incluidos
        </span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={taxIncluded}
            onChange={(e) => setTaxIncluded(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-7 h-3.5 bg-gray-200 peer-focus:outline-none peer-focus:ring-1 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Selector de impuestos (solo si no hay impuestos específicos por producto) */}
      {!hasProductSpecificTaxes && organizationTaxes.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Impuestos aplicables:
          </div>
          <div className="flex flex-col gap-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800">
            {organizationTaxes.map((tax) => (
              <div
                key={tax.id}
                onClick={() => toggleTax(tax.id)}
                className="flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-1 py-0.5 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="checkbox"
                    checked={appliedTaxes[tax.id] || false}
                    onChange={() => {}}
                    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-900"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {tax.name} ({tax.rate}%)
                  </span>
                </div>
                {tax.is_default && (
                  <Badge variant="outline" className="text-[0.6rem] py-0 px-1 shrink-0">
                    Predeterminado
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desglose de impuestos */}
      {hasTaxContent && taxBreakdown.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <span className="flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5" />
              Impuestos:
            </span>
            <span className="flex items-center gap-1 font-medium">
              {formatCurrency(taxTotal)}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>

          {expanded && (
            <div className="space-y-1.5 pl-4 pt-1">
              {taxBreakdown.map((tax) => (
                <div key={tax.taxId} className="space-y-0.5">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[0.6rem] py-0 px-1">
                        {tax.rate}%
                      </Badge>
                      {tax.name}
                      {taxIncluded && (
                        <Badge variant="outline" className="text-[0.55rem] py-0 px-1 text-blue-600 dark:text-blue-400">
                          incluido
                        </Badge>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(tax.taxAmount)}</span>
                  </div>
                  <div className="text-[0.65rem] text-gray-400 dark:text-gray-500 pl-1">
                    Base: {formatCurrency(tax.baseAmount)}
                  </div>
                </div>
              ))}
              <Separator className="my-1" />
              <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                <span>Total impuestos:</span>
                <span>{formatCurrency(taxTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtotal con indicador de incluido */}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Subtotal base:</span>
        <span>
          {formatCurrency(subtotal)}
          {taxIncluded && (
            <span className="text-[0.6rem] ml-1">(imp. incluidos)</span>
          )}
        </span>
      </div>
    </div>
  );
}
