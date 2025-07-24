'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSession, CashSummary } from './types';

interface CashSummaryCardProps {
  session: CashSession;
  refreshTrigger?: number; // Para forzar actualización desde componente padre
}

export function CashSummaryCard({ session, refreshTrigger }: CashSummaryCardProps) {
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [session.id, refreshTrigger]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await CajasService.getCashSummary(session.id);
      setSummary(data);
    } catch (error) {
      console.error('Error loading cash summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg dark:text-white light:text-gray-900">
            Resumen de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            <span className="ml-2 dark:text-gray-300">Calculando resumen...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg dark:text-white light:text-gray-900">
            Resumen de Caja
          </CardTitle>
          <Badge 
            variant={session.status === 'open' ? "default" : "secondary"}
            className={session.status === 'open' 
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" 
              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
            }
          >
            {session.status === 'open' ? 'Caja Abierta' : 'Caja Cerrada'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Información de la sesión */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="dark:text-gray-400 light:text-gray-600">Abierta:</span>
            <p className="font-medium dark:text-white light:text-gray-900">
              {formatDate(session.opened_at)}
            </p>
          </div>
          {session.closed_at && (
            <div>
              <span className="dark:text-gray-400 light:text-gray-600">Cerrada:</span>
              <p className="font-medium dark:text-white light:text-gray-900">
                {formatDate(session.closed_at)}
              </p>
            </div>
          )}
        </div>

        <Separator className="dark:bg-gray-700 light:bg-gray-200" />

        {summary && (
          <>
            {/* Resumen de movimientos */}
            <div className="grid grid-cols-2 gap-4">
              {/* Monto inicial */}
              <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
                  <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 light:text-gray-600">Inicial</p>
                  <p className="font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(summary.initial_amount)}
                  </p>
                </div>
              </div>

              {/* Ventas en efectivo */}
              <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-800 rounded-full">
                  <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 light:text-gray-600">Ventas</p>
                  <p className="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.sales_cash)}
                  </p>
                </div>
              </div>

              {/* Ingresos */}
              <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-green-100 dark:bg-green-800 rounded-full">
                  <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 light:text-gray-600">Ingresos</p>
                  <p className="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.cash_in)}
                  </p>
                </div>
              </div>

              {/* Egresos */}
              <div className="flex items-center space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-800 rounded-full">
                  <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm dark:text-gray-300 light:text-gray-600">Egresos</p>
                  <p className="font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(summary.cash_out)}
                  </p>
                </div>
              </div>
            </div>

            <Separator className="dark:bg-gray-700 light:bg-gray-200" />

            {/* Total esperado */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium dark:text-gray-200 light:text-gray-700">
                  Total Esperado:
                </span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(summary.expected_amount)}
                </span>
              </div>
            </div>

            {/* Si la caja está cerrada, mostrar información del arqueo */}
            {session.status === 'closed' && summary.counted_amount !== undefined && (
              <>
                <Separator className="dark:bg-gray-700 light:bg-gray-200" />
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 light:text-gray-700">
                      Monto Contado:
                    </span>
                    <span className="font-bold dark:text-white light:text-gray-900">
                      {formatCurrency(summary.counted_amount)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium dark:text-gray-200 light:text-gray-700">
                      Diferencia:
                    </span>
                    <span className={`font-bold ${
                      summary.difference === 0 
                        ? 'text-gray-600 dark:text-gray-400'
                        : summary.difference! > 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {summary.difference! >= 0 ? '+' : ''}{formatCurrency(summary.difference || 0)}
                    </span>
                  </div>
                  
                  {summary.difference !== 0 && (
                    <div className={`p-2 rounded text-center text-sm ${
                      summary.difference! > 0 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                    }`}>
                      {summary.difference! > 0 ? '📈 Sobrante' : '📉 Faltante'} de efectivo
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Notas de la sesión */}
            {session.notes && (
              <>
                <Separator className="dark:bg-gray-700 light:bg-gray-200" />
                <div>
                  <span className="text-sm font-medium dark:text-gray-200 light:text-gray-700 block mb-2">
                    Observaciones:
                  </span>
                  <p className="text-sm dark:text-gray-400 light:text-gray-600 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    {session.notes}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
