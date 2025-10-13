'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';

interface Pago {
  id: string;
  source: string;
  source_id: string;
  method: string;
  amount: number;
  currency: string;
  reference: string;
  processor_response?: any;
  status: string;
  created_at: string;
  created_by?: string;
}

interface PagosDetalleProps {
  pagos: Pago[];
}

export function PagosDetalle({ pagos }: PagosDetalleProps) {
  if (!pagos || pagos.length === 0) {
    return (
      <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-gray-500 dark:text-gray-400">
        No hay pagos registrados para esta factura.
      </div>
    );
  }

  // Mapeo de estados a colores de badge
  const estadoColors: Record<string, string> = {
    'completed': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
    'pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    'failed': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    'refunded': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  };

  // Función para obtener el texto del estado en español
  const getEstadoText = (estado: string) => {
    const estadoMap: Record<string, string> = {
      'completed': 'Completado',
      'pending': 'Pendiente',
      'failed': 'Fallido',
      'refunded': 'Reembolsado'
    };
    return estadoMap[estado] || estado;
  };

  // Función para obtener el nombre amigable del método de pago
  const getPaymentMethodName = (method: string) => {
    const methodMap: Record<string, string> = {
      'cash': 'Efectivo',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'check': 'Cheque',
      'credit': 'Crédito',
      'paypal': 'PayPal',
      'mp': 'Mercado Pago',
      'stripe': 'Stripe'
    };
    return methodMap[method] || method;
  };

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-700">
              <TableHead className="w-[90px] sm:w-[120px] text-xs sm:text-sm text-gray-700 dark:text-gray-300">Fecha</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Método</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Referencia</TableHead>
              <TableHead className="text-right text-xs sm:text-sm text-gray-700 dark:text-gray-300">Monto</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagos.map((pago) => (
              <TableRow key={pago.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">
                  <div className="flex flex-col">
                    <span>{format(new Date(pago.created_at), 'dd/MM/yyyy', { locale: es })}</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 sm:hidden">
                      {format(new Date(pago.created_at), 'HH:mm', { locale: es })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">{getPaymentMethodName(pago.method)}</TableCell>
                <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3 hidden md:table-cell">
                  <span className="max-w-[150px] truncate block">{pago.reference || 'N/A'}</span>
                </TableCell>
                <TableCell className="text-right font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 py-2 sm:py-3">
                  <div className="flex flex-col items-end">
                    {formatCurrency(pago.amount)}
                    <Badge className={`${estadoColors[pago.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'} sm:hidden text-[10px] px-1.5 py-0.5 mt-1 border`}>
                      {getEstadoText(pago.status)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                  <Badge className={`${estadoColors[pago.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'} text-xs border`}>
                    {getEstadoText(pago.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
