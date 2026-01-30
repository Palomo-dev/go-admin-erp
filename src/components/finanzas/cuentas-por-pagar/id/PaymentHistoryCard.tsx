'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Clock, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CuentaPorPagarDetailService } from './service';
import { PaymentRecord } from './types';
import { formatCurrency } from '@/utils/Utils';

interface PaymentHistoryCardProps {
  accountId: string;
  onUpdate?: () => void;
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', label: 'Completado' },
  pending: { icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', label: 'Pendiente' },
  failed: { icon: XCircle, color: 'text-red-600 dark:text-red-400', label: 'Fallido' },
  cancelled: { icon: XCircle, color: 'text-gray-600 dark:text-gray-400', label: 'Cancelado' }
};

const methodLabels: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  credit_card: 'Tarjeta de Crédito',
  debit_card: 'Tarjeta de Débito',
  bank_transfer: 'Transferencia',
  transferencia: 'Transferencia',
  check: 'Cheque',
  cheque: 'Cheque',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE'
};

export function PaymentHistoryCard({ accountId, onUpdate }: PaymentHistoryCardProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPayments();
  }, [accountId]);

  const loadPayments = async () => {
    try {
      setIsLoading(true);
      const account = await CuentaPorPagarDetailService.obtenerDetalleCuentaPorPagar(accountId);
      if (account) {
        setPayments(account.payment_history);
      }
    } catch (error) {
      console.error('Error cargando pagos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Historial de Pagos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Historial de Pagos
          <Badge variant="outline" className="ml-auto dark:border-gray-600">
            {payments.length} {payments.length === 1 ? 'pago' : 'pagos'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay pagos registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const statusInfo = statusConfig[payment.status] || statusConfig.pending;
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full bg-white dark:bg-gray-800 ${statusInfo.color}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <span>{methodLabels[payment.method] || payment.method}</span>
                        {payment.reference && (
                          <>
                            <span>•</span>
                            <span>Ref: {payment.reference}</span>
                          </>
                        )}
                      </div>
                      {payment.bank_account_name && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-1">
                          <Building2 className="h-3 w-3" />
                          <span>{payment.bank_account_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={`${statusInfo.color} border-current`}>
                      {statusInfo.label}
                    </Badge>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDate(payment.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
