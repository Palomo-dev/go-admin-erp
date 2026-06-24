'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/Utils';

interface Item {
  id: string;
  product_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_included?: boolean;
  total_line: number;
  discount_amount?: number | null;
  code_reference?: string | null;
  products?: {
    id: number;
    name: string;
    sku?: string;
  };
  taxes?: {
    name: string;
    rate: number;
    code: string;
  };
}

interface OrganizationTax {
  id: string;
  name: string;
  rate: number;
  is_default?: boolean;
}

interface ItemsDetalleProps {
  items: Item[];
  taxIncluded?: boolean;
  organizationTaxes?: OrganizationTax[];
}

export function ItemsDetalle({ items, taxIncluded = false, organizationTaxes = [] }: ItemsDetalleProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-gray-500 dark:text-gray-400">
        No hay ítems registrados en esta factura.
      </div>
    );
  }

  const resolveTaxName = (item: Item): string => {
    if (item.taxes?.name) return item.taxes.name;
    if (item.tax_code) {
      const found = organizationTaxes.find(t => t.id === item.tax_code || t.name === item.tax_code);
      if (found) return found.name;
    }
    const rate = Number(item.tax_rate);
    if (!isNaN(rate) && rate > 0) {
      const found = organizationTaxes.find(t => Number(t.rate) === rate);
      if (found) return found.name;
    }
    return 'Impuesto';
  };

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-700">
              <TableHead className="w-[40px] sm:w-[50px] text-xs sm:text-sm text-gray-700 dark:text-gray-300">#</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Descripción</TableHead>
              <TableHead className="text-right text-xs sm:text-sm text-gray-700 dark:text-gray-300">Cant.</TableHead>
              <TableHead className="text-right text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Precio Unit.</TableHead>
              <TableHead className="text-right text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Impuesto</TableHead>
              <TableHead className="text-right text-xs sm:text-sm text-gray-700 dark:text-gray-300">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">{index + 1}</TableCell>
                <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">
                  <div className="max-w-[200px] sm:max-w-none">
                    {(() => {
                      const sku = item.products?.sku || item.code_reference;
                      if (sku) {
                        return (
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-500 dark:text-gray-400">SKU: {sku}</span>
                            <span className="line-clamp-2">{item.description}</span>
                          </div>
                        );
                      }
                      return <span className="line-clamp-2">{item.description}</span>;
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">{Number(item.qty).toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3 hidden sm:table-cell">{formatCurrency(item.unit_price)}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm py-2 sm:py-3 hidden md:table-cell">
                  {(() => {
                    const rate = Number(item.tax_rate);
                    const hasTaxCode = item.tax_code != null && item.tax_code !== '';
                    if (hasTaxCode && !isNaN(rate) && rate > 0) {
                      const taxName = resolveTaxName(item);
                      const isIncluded = item.tax_included ?? taxIncluded;
                      const nameHasRate = /\d+/.test(taxName);
                      return (
                        <div className="flex flex-col items-end">
                          <span className="text-gray-700 dark:text-gray-200">{taxName}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {nameHasRate ? (isIncluded ? 'Incluido' : 'Adicional') : `${rate.toFixed(2)}% ${isIncluded ? '(incl.)' : '(+imp.)'}`}
                          </span>
                        </div>
                      );
                    }
                    return <span className="text-gray-400 dark:text-gray-500">N/A</span>;
                  })()}
                </TableCell>
                <TableCell className="text-right font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">
                  {formatCurrency(item.total_line)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {taxIncluded ? (
        <div className="mt-2 sm:mt-3 text-right text-xs sm:text-sm text-gray-500 dark:text-gray-400 italic px-2 sm:px-0">
          * Los precios incluyen impuestos
        </div>
      ) : (
        <div className="mt-2 sm:mt-3 text-right text-xs sm:text-sm text-gray-500 dark:text-gray-400 italic px-2 sm:px-0">
          * Los impuestos se calculan sobre el subtotal
        </div>
      )}
    </div>
  );
}
