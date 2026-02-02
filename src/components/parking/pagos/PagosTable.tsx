'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, RotateCcw, Car, CreditCard, Banknote, Receipt } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ParkingPayment } from '@/lib/services/parkingPaymentService';

interface PagosTableProps {
  payments: ParkingPayment[];
  onViewDetails: (payment: ParkingPayment) => void;
  onReverse: (payment: ParkingPayment) => void;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  completed: {
    label: 'Completado',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  pending: {
    label: 'Pendiente',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  reversed: {
    label: 'Reversado',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  failed: {
    label: 'Fallido',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  transfer: <Receipt className="h-4 w-4" />,
  nequi: <CreditCard className="h-4 w-4" />,
  daviplata: <CreditCard className="h-4 w-4" />,
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  credit_card: 'Tarjeta Crédito',
  debit_card: 'Tarjeta Débito',
};

export function PagosTable({ payments, onViewDetails, onReverse }: PagosTableProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50">
            <TableHead className="font-semibold">Fecha</TableHead>
            <TableHead className="font-semibold">Origen</TableHead>
            <TableHead className="font-semibold">Detalle</TableHead>
            <TableHead className="font-semibold">Método</TableHead>
            <TableHead className="font-semibold">Referencia</TableHead>
            <TableHead className="font-semibold text-right">Monto</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const status = STATUS_BADGES[payment.status] || STATUS_BADGES.pending;
            const methodIcon = METHOD_ICONS[payment.method] || <CreditCard className="h-4 w-4" />;
            const methodLabel = METHOD_LABELS[payment.method] || payment.method;

            return (
              <TableRow
                key={payment.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {/* Fecha */}
                <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                  {formatDate(payment.created_at)}
                </TableCell>

                {/* Origen */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      payment.source === 'parking_session'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-purple-500 text-purple-600 dark:text-purple-400'
                    }
                  >
                    {payment.source === 'parking_session' ? (
                      <>
                        <Car className="h-3 w-3 mr-1" />
                        Sesión
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-3 w-3 mr-1" />
                        Abonado
                      </>
                    )}
                  </Badge>
                </TableCell>

                {/* Detalle */}
                <TableCell>
                  {payment.source === 'parking_session' && payment.session ? (
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {payment.session.vehicle_plate}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.session.vehicle_type}
                      </p>
                    </div>
                  ) : payment.pass ? (
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {payment.pass.plan_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.pass.customer?.full_name || 'Cliente'}
                      </p>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>

                {/* Método */}
                <TableCell>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    {methodIcon}
                    <span className="text-sm">{methodLabel}</span>
                  </div>
                </TableCell>

                {/* Referencia */}
                <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                  {payment.reference || '-'}
                </TableCell>

                {/* Monto */}
                <TableCell className="text-right">
                  <span
                    className={`font-semibold ${
                      payment.status === 'reversed'
                        ? 'text-red-500 line-through'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {formatCurrency(payment.amount)}
                  </span>
                </TableCell>

                {/* Estado */}
                <TableCell>
                  <Badge className={status.className}>{status.label}</Badge>
                </TableCell>

                {/* Acciones */}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem onClick={() => onViewDetails(payment)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalles
                      </DropdownMenuItem>
                      {payment.status === 'completed' && (
                        <DropdownMenuItem
                          onClick={() => onReverse(payment)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reversar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default PagosTable;
