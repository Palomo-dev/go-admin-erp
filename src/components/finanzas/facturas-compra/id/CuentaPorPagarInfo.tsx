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
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cuentaPorPagar) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400">
              No se encontró información de cuenta por pagar
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string, balance: number) => {
    if (balance === 0) {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="w-3 h-3 mr-1" />
          Pagada
        </Badge>
      );
    }

    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="dark:bg-gray-700">
            Pendiente
          </Badge>
        );
      case 'overdue':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Vencida
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
            Parcial
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
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
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="dark:text-white flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Cuenta por Pagar</span>
          </CardTitle>
          {getStatusBadge(cuentaPorPagar.status, cuentaPorPagar.balance)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Monto y Balance */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Monto Original</p>
            <p className="text-lg font-semibold dark:text-white">
              {formatCurrency(cuentaPorPagar.amount, currency)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Pendiente</p>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(cuentaPorPagar.balance, currency)}
            </p>
          </div>
        </div>

        <Separator className="dark:border-gray-600" />

        {/* Información de fechas */}
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de Vencimiento</p>
              <div className="flex items-center space-x-2">
                <p className="font-medium dark:text-white">
                  {formatDate(new Date(cuentaPorPagar.due_date))}
                </p>
                {diasVencimiento !== null && cuentaPorPagar.balance > 0 && (
                  <Badge 
                    variant={diasVencimiento < 0 ? "destructive" : diasVencimiento <= 7 ? "outline" : "secondary"}
                    className={
                      diasVencimiento < 0 ? "" :
                      diasVencimiento <= 7 ? "border-yellow-500 text-yellow-600" : ""
                    }
                  >
                    {diasVencimiento < 0 ? 
                      `${Math.abs(diasVencimiento)} días vencida` : 
                      `${diasVencimiento} días restantes`
                    }
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Monto Pagado</p>
              <p className="font-medium text-green-600 dark:text-green-400">
                {formatCurrency(cuentaPorPagar.amount - cuentaPorPagar.balance, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Progreso de pago */}
        {cuentaPorPagar.amount > 0 && (
          <>
            <Separator className="dark:border-gray-600" />
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500 dark:text-gray-400">Progreso de Pago</span>
                <span className="font-medium dark:text-white">
                  {Math.round(((cuentaPorPagar.amount - cuentaPorPagar.balance) / cuentaPorPagar.amount) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300" 
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
