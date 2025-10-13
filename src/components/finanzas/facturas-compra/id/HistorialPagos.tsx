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
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Historial de Pagos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3 sm:space-y-4">
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getMethodIcon = (method: string) => {
    const iconClasses = "w-3.5 h-3.5 sm:w-4 sm:h-4";
    switch (method.toLowerCase()) {
      case 'cash':
        return <Banknote className={`${iconClasses} text-green-500 dark:text-green-400`} />;
      case 'card':
      case 'credit_card':
      case 'debit_card':
        return <CreditCard className={`${iconClasses} text-blue-500 dark:text-blue-400`} />;
      case 'transfer':
      case 'bank_transfer':
        return <CreditCard className={`${iconClasses} text-purple-500 dark:text-purple-400`} />;
      default:
        return <CreditCard className={`${iconClasses} text-gray-500 dark:text-gray-400`} />;
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
    const baseClasses = "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5";
    switch (status.toLowerCase()) {
      case 'completed':
        return (
          <Badge variant="default" className={`${baseClasses} bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700`}>
            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            <span>Completado</span>
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            <span>Pendiente</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className={`${baseClasses} dark:bg-red-900/30 dark:text-red-400`}>
            <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            <span>Fallido</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className={`${baseClasses} dark:border-gray-600 dark:text-gray-300`}>
            {status}
          </Badge>
        );
    }
  };

  const totalPagos = pagos.reduce((sum, pago) => 
    pago.status === 'completed' ? sum + pago.amount : sum, 0
  );

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Historial de Pagos</span>
          </CardTitle>
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:border-gray-600 dark:text-gray-300">
            {pagos.length} pago{pagos.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {pagos.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            <History className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-gray-600" />
            <h3 className="text-base sm:text-lg font-medium mb-2 text-gray-900 dark:text-white">
              Sin Pagos Registrados
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              No se han registrado pagos para esta factura
            </p>
          </div>
        ) : (
          <>
            {/* Resumen de pagos */}
            {totalPagos > 0 && (
              <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm sm:text-base font-medium text-green-800 dark:text-green-200">
                      Total Pagado
                    </span>
                  </div>
                  <span className="text-base sm:text-lg font-bold text-green-800 dark:text-green-200">
                    {formatCurrency(totalPagos, pagos[0]?.currency || 'COP')}
                  </span>
                </div>
              </div>
            )}

            {/* Tabla de pagos */}
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-800 border-b border-gray-200">
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Fecha</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Método</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Referencia</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right">Monto</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagos.map((pago) => (
                    <TableRow key={pago.id} className="dark:border-gray-800 border-b border-gray-100">
                      <TableCell className="text-gray-900 dark:text-gray-300 py-2 sm:py-3">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 hidden sm:block" />
                          <div>
                            <div className="text-xs sm:text-sm font-medium">
                              {formatDate(new Date(pago.created_at))}
                            </div>
                            <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                              {new Date(pago.created_at).toLocaleTimeString('es-CO', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-300 py-2 sm:py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          {getMethodIcon(pago.method)}
                          <span className="text-xs sm:text-sm">{getMethodName(pago.method)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-300 py-2 sm:py-3 hidden md:table-cell">
                        <code className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                          {pago.reference || 'Sin ref.'}
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900 dark:text-white py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">
                        {formatCurrency(pago.amount, pago.currency)}
                      </TableCell>
                      <TableCell className="text-center py-2 sm:py-3">
                        {getStatusBadge(pago.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
