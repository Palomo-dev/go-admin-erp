'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Calendar, 
  DollarSign, 
  AlertTriangle,
  CheckCircle 
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface CuentaPorPagar {
  id: string;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
  days_overdue: number | null;
  created_at: string;
  supplier?: {
    id: number;
    name: string;
    nit: string;
  };
}

interface CuentaPorPagarInfoProps {
  cuentaPorPagar: CuentaPorPagar | null;
  currency: string;
  loading?: boolean;
}

export function CuentaPorPagarInfo({ 
  cuentaPorPagar, 
  currency, 
  loading = false 
}: CuentaPorPagarInfoProps) {
  if (loading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2 sm:space-y-3">
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
            <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cuentaPorPagar) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-3 sm:py-4">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              No se encontró información de cuenta por pagar
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string, balance: number) => {
    const baseClasses = "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5";
    if (balance === 0) {
      return (
        <Badge variant="default" className={`${baseClasses} bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700`}>
          <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
          <span>Pagada</span>
        </Badge>
      );
    }

    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>
            Pendiente
          </Badge>
        );
      case 'overdue':
        return (
          <Badge variant="destructive" className={`${baseClasses} dark:bg-red-900/30 dark:text-red-400`}>
            <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            <span>Vencida</span>
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className={`${baseClasses} border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400`}>
            Parcial
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>
            {status}
          </Badge>
        );
    }
  };

  const calcularDiasVencimiento = () => {
    if (!cuentaPorPagar.due_date) return null;
    const vencimiento = new Date(cuentaPorPagar.due_date);
    const hoy = new Date();
    return Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const diasVencimiento = calcularDiasVencimiento();

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
          {getStatusBadge(cuentaPorPagar.status, cuentaPorPagar.balance)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {/* Monto y Balance */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Monto Original</p>
            <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              {formatCurrency(cuentaPorPagar.amount, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Saldo Pendiente</p>
            <p className="text-base sm:text-lg font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(cuentaPorPagar.balance, currency)}
            </p>
          </div>
        </div>

        <Separator className="dark:bg-gray-600" />

        {/* Información de fechas */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3">
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Fecha de Vencimiento</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                  {formatDate(new Date(cuentaPorPagar.due_date))}
                </p>
                {diasVencimiento !== null && cuentaPorPagar.balance > 0 && (
                  <Badge 
                    variant={diasVencimiento < 0 ? "destructive" : diasVencimiento <= 7 ? "outline" : "secondary"}
                    className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 whitespace-nowrap ${
                      diasVencimiento < 0 ? "dark:bg-red-900/30 dark:text-red-400" :
                      diasVencimiento <= 7 ? "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400" : 
                      "dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {diasVencimiento < 0 ? 
                      `${Math.abs(diasVencimiento)}d vencida` : 
                      `${diasVencimiento}d restantes`
                    }
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Monto Pagado</p>
              <p className="text-sm sm:text-base font-medium text-green-600 dark:text-green-400">
                {formatCurrency(cuentaPorPagar.amount - cuentaPorPagar.balance, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Progreso de pago */}
        {cuentaPorPagar.amount > 0 && (
          <>
            <Separator className="dark:bg-gray-600" />
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-1.5 sm:mb-2">
                <span className="text-gray-700 dark:text-gray-400">Progreso de Pago</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {Math.round(((cuentaPorPagar.amount - cuentaPorPagar.balance) / cuentaPorPagar.amount) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2">
                <div 
                  className="bg-green-500 dark:bg-green-600 h-1.5 sm:h-2 rounded-full transition-all duration-300" 
                  style={{ 
                    width: `${((cuentaPorPagar.amount - cuentaPorPagar.balance) / cuentaPorPagar.amount) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
