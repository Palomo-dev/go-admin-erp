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
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        No hay pagos registrados para esta factura.
      </div>
    );
  }

  // Mapeo de estados a colores de badge
  const estadoColors: Record<string, string> = {
    'completed': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'failed': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'refunded': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
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
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Fecha</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagos.map((pago) => (
            <TableRow key={pago.id}>
              <TableCell className="font-medium">
                {format(new Date(pago.created_at), 'dd/MM/yyyy', { locale: es })}
              </TableCell>
              <TableCell>{getPaymentMethodName(pago.method)}</TableCell>
              <TableCell>{pago.reference || 'N/A'}</TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(pago.amount)}</TableCell>
              <TableCell>
                <Badge className={estadoColors[pago.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}>
                  {getEstadoText(pago.status)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
