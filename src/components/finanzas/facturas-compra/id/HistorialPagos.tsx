'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  History, 
  CreditCard, 
  Banknote, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface Payment {
  id: string;
  method: string;
  amount: number;
  currency: string;
  reference: string | null;
  status: string;
  created_at: string;
}

interface HistorialPagosProps {
  pagos: Payment[];
  loading?: boolean;
}

export function HistorialPagos({ 
  pagos, 
  loading = false 
}: HistorialPagosProps) {
  if (loading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white flex items-center space-x-2">
            <History className="w-5 h-5" />
            <span>Historial de Pagos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'cash':
        return <Banknote className="w-4 h-4 text-green-500" />;
      case 'card':
      case 'credit_card':
      case 'debit_card':
        return <CreditCard className="w-4 h-4 text-blue-500" />;
      case 'transfer':
      case 'bank_transfer':
        return <CreditCard className="w-4 h-4 text-purple-500" />;
      default:
        return <CreditCard className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMethodName = (method: string) => {
    switch (method.toLowerCase()) {
      case 'cash':
        return 'Efectivo';
      case 'card':
        return 'Tarjeta';
      case 'credit_card':
        return 'Tarjeta de Crédito';
      case 'debit_card':
        return 'Tarjeta de Débito';
      case 'transfer':
      case 'bank_transfer':
        return 'Transferencia';
      case 'check':
        return 'Cheque';
      default:
        return method || 'Desconocido';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completado
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="dark:bg-gray-700">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Fallido
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const totalPagos = pagos.reduce((sum, pago) => 
    pago.status === 'completed' ? sum + pago.amount : sum, 0
  );

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-white flex items-center space-x-2">
            <History className="w-5 h-5" />
            <span>Historial de Pagos</span>
          </CardTitle>
          <Badge variant="outline" className="dark:border-gray-600">
            {pagos.length} pago{pagos.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {pagos.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2 dark:text-white">
              Sin Pagos Registrados
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              No se han registrado pagos para esta factura
            </p>
          </div>
        ) : (
          <>
            {/* Resumen de pagos */}
            {totalPagos > 0 && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Total Pagado
                    </span>
                  </div>
                  <span className="text-lg font-bold text-green-800 dark:text-green-200">
                    {formatCurrency(totalPagos, pagos[0]?.currency || 'COP')}
                  </span>
                </div>
              </div>
            )}

            {/* Tabla de pagos */}
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Fecha</TableHead>
                  <TableHead className="dark:text-gray-300">Método</TableHead>
                  <TableHead className="dark:text-gray-300">Referencia</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Monto</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((pago) => (
                  <TableRow key={pago.id} className="dark:border-gray-700">
                    <TableCell className="dark:text-gray-300">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <div className="font-medium">
                            {formatDate(new Date(pago.created_at))}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {new Date(pago.created_at).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <div className="flex items-center space-x-2">
                        {getMethodIcon(pago.method)}
                        <span>{getMethodName(pago.method)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {pago.reference || 'Sin referencia'}
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-medium dark:text-white">
                      {formatCurrency(pago.amount, pago.currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(pago.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
