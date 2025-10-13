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
  taxes?: {
    name: string;
    rate: number;
    code: string;
  };
}

interface ItemsDetalleProps {
  items: Item[];
  taxIncluded?: boolean;
}

export function ItemsDetalle({ items, taxIncluded = false }: ItemsDetalleProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-gray-500 dark:text-gray-400">
        No hay ítems registrados en esta factura.
      </div>
    );
  }

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
                    {item.description}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">{item.qty.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3 hidden sm:table-cell">{formatCurrency(item.unit_price)}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm py-2 sm:py-3 hidden md:table-cell">
                  {item.tax_rate ? (
                    <div className="flex flex-col items-end">
                      <span className="text-gray-900 dark:text-gray-100">{item.taxes?.name || `${item.tax_code}`}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({item.tax_rate.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">
                  {formatCurrency(item.total_line)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {taxIncluded && (
        <div className="mt-2 sm:mt-3 text-right text-xs sm:text-sm text-gray-500 dark:text-gray-400 italic px-2 sm:px-0">
          * Los precios incluyen impuestos
        </div>
      )}
    </div>
  );
}
