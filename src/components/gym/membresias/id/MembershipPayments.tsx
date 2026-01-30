'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CreditCard, 
  DollarSign, 
  Calendar,
  ExternalLink,
  Receipt,
  CheckCircle2,
  Clock,
  XCircle,
  Banknote,
  Smartphone,
  Building2
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { formatDate, formatCurrency } from '@/utils/Utils';

export interface Payment {
  id: string;
  amount: number;
  currency?: string;
  method: string;
  status: string;
  reference?: string;
  source?: string;
  source_id?: string;
  created_at: string;
  created_by?: string;
}

interface MembershipPaymentsProps {
  payments: Payment[];
  saleId?: string;
  isLoading?: boolean;
  onViewSale?: (saleId: string) => void;
}

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Building2,
  nequi: Smartphone,
  daviplata: Smartphone,
  pse: Building2,
  default: DollarSign,
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { label: 'Completado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  failed: { label: 'Fallido', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400', icon: XCircle },
};

export function MembershipPayments({ 
  payments, 
  saleId,
  isLoading,
  onViewSale
}: MembershipPaymentsProps) {
  const totalPaid = payments.reduce((sum, p) => 
    p.status === 'completed' ? sum + p.amount : sum, 0
  );

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            Historial de Pagos
          </CardTitle>
          {saleId && onViewSale && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewSale(saleId)}
              className="text-xs"
            >
              <Receipt className="h-3 w-3 mr-1" />
              Ver Venta
            </Button>
          )}
        </div>
        {payments.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Total pagado:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalPaid)}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay pagos registrados
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const MethodIcon = METHOD_ICONS[payment.method] || METHOD_ICONS.default;
              const statusConfig = STATUS_CONFIG[payment.status] || STATUS_CONFIG.completed;
              const StatusIcon = statusConfig.icon;
              const date = new Date(payment.created_at);

              return (
                <div 
                  key={payment.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <MethodIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </p>
                      <Badge className={cn("text-xs", statusConfig.color)}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{METHOD_LABELS[payment.method] || payment.method}</span>
                      {payment.reference && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{payment.reference}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>{date.toLocaleDateString('es-CO')}</p>
                    <p>{date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
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

export default MembershipPayments;
