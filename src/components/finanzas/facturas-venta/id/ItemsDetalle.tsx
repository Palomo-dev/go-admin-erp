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
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        No hay ítems registrados en esta factura.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Precio Unit.</TableHead>
            <TableHead className="text-right">Impuesto</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell className="text-right">{item.qty.toLocaleString()}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
              <TableCell className="text-right">
                {item.tax_rate ? (
                  <div className="flex flex-col items-end">
                    <span>{item.taxes?.name || `${item.tax_code}`}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({item.tax_rate.toFixed(2)}%)
                    </span>
                  </div>
                ) : (
                  'N/A'
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(item.total_line)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {taxIncluded && (
        <div className="mt-2 text-right text-sm text-gray-500 dark:text-gray-400 italic">
          * Los precios incluyen impuestos
        </div>
      )}
    </div>
  );
}
