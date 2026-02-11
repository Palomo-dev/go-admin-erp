'use client';

import { User, Banknote, CreditCard, ArrowRightLeft, Globe, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TipSummary } from './types';
import { formatCurrency } from '@/utils/Utils';

interface ServerSummaryProps {
  summaries: TipSummary[];
  loading: boolean;
}

export function ServerSummary({ summaries, loading }: ServerSummaryProps) {
  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Resumen por Mesero</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Resumen por Mesero</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay datos de propinas</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalAllTips = summaries.reduce((sum, s) => sum + s.total_tips, 0);

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="dark:text-white flex items-center justify-between">
          <span>Resumen por Mesero</span>
          <Badge variant="secondary" className="dark:bg-gray-700">
            {summaries.length} mesero{summaries.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summaries.map((summary) => {
          const percentage = totalAllTips > 0 ? (summary.total_tips / totalAllTips) * 100 : 0;
          const distributedPercentage = summary.total_tips > 0 
            ? (summary.distributed_amount / summary.total_tips) * 100 
            : 0;

          return (
            <div 
              key={summary.server_id} 
              className="p-4 rounded-lg border dark:border-gray-700 space-y-3"
            >
              {/* Header con nombre y total */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium dark:text-white">{summary.server_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {summary.tips_count} propina{summary.tips_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(summary.total_tips)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {percentage.toFixed(1)}% del total
                  </p>
                </div>
              </div>

              {/* Barra de progreso de distribución */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Distribución</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {distributedPercentage.toFixed(0)}%
                  </span>
                </div>
                <Progress value={distributedPercentage} className="h-2" />
              </div>

              {/* Desglose por tipo y estado */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {/* Por tipo */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3 w-3 text-green-500" />
                      Efectivo
                    </span>
                    <span>{formatCurrency(summary.cash_tips)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-blue-500" />
                      Tarjeta
                    </span>
                    <span>{formatCurrency(summary.card_tips)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-purple-500" />
                      Transf.
                    </span>
                    <span>{formatCurrency(summary.transfer_tips)}</span>
                  </div>
                  {summary.online_tips > 0 && (
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3 text-cyan-500" />
                        Online
                      </span>
                      <span>{formatCurrency(summary.online_tips)}</span>
                    </div>
                  )}
                </div>

                {/* Por estado */}
                <div className="space-y-1 border-l dark:border-gray-700 pl-2">
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Distrib.
                    </span>
                    <span className="text-green-600 dark:text-green-400">
                      {formatCurrency(summary.distributed_amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-yellow-500" />
                      Pendiente
                    </span>
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {formatCurrency(summary.pending_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
