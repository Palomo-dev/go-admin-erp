'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CreditCard,
  Banknote,
  Wallet,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

export interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  created_at: string;
}

interface SessionPaymentsProps {
  payments: Payment[];
  totalAmount: number | null;
  sessionStatus: string;
  isLoading: boolean;
  onRegisterPayment: () => void;
}

const getMethodIcon = (method: string) => {
  const icons: Record<string, React.ReactNode> = {
    cash: <Banknote className="h-4 w-4" />,
    card: <CreditCard className="h-4 w-4" />,
    transfer: <Wallet className="h-4 w-4" />,
  };
  return icons[method] || <CreditCard className="h-4 w-4" />;
};

const getMethodLabel = (method: string) => {
  const labels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
  };
  return labels[method] || method;
};

const getStatusBadge = (status: string) => {
  const config: Record<string, { icon: React.ReactNode; class: string; label: string }> = {
    completed: {
      icon: <CheckCircle className="h-3 w-3" />,
      class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      label: 'Completado',
    },
    pending: {
      icon: <Clock className="h-3 w-3" />,
      class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      label: 'Pendiente',
    },
    failed: {
      icon: <XCircle className="h-3 w-3" />,
      class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      label: 'Fallido',
    },
  };
  const cfg = config[status] || config.pending;
  return (
    <Badge className={`flex items-center gap-1 ${cfg.class}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
};

export function SessionPayments({
  payments,
  totalAmount,
  sessionStatus,
  isLoading,
  onRegisterPayment,
}: SessionPaymentsProps) {
  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = (totalAmount || 0) - totalPaid;
  const canRegisterPayment = sessionStatus === 'open' || pendingAmount > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Pagos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Pagos
        </CardTitle>
        {canRegisterPayment && (
          <Button size="sm" onClick={onRegisterPayment}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar Pago
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {formatCurrency(totalAmount || 0)}
            </p>
          </div>
          <div className="text-center border-x border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Pagado</p>
            <p className="font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(totalPaid)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Pendiente</p>
            <p className={`font-semibold ${pendingAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {formatCurrency(pendingAmount > 0 ? pendingAmount : 0)}
            </p>
          </div>
        </div>

        {/* Lista de pagos */}
        {payments.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay pagos registrados
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    {getMethodIcon(payment.method)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getMethodLabel(payment.method)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(payment.created_at).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(payment.amount)}
                  </p>
                  {getStatusBadge(payment.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
