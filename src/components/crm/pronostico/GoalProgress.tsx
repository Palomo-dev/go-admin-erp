'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/utils/Utils';
import { Target, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { Pipeline } from '@/components/crm/oportunidades/types';

interface GoalProgressProps {
  pipeline: Pipeline | null;
  wonAmount: number;
  openAmount: number;
  weightedAmount: number;
  isLoading?: boolean;
}

export function GoalProgress({
  pipeline,
  wonAmount,
  openAmount,
  weightedAmount,
  isLoading,
}: GoalProgressProps) {
  const goal = pipeline?.goal_amount || 0;
  const goalPeriod = pipeline?.goal_period || 'monthly';
  const totalPotential = wonAmount + weightedAmount;
  const goalProgress = goal > 0 ? Math.min((wonAmount / goal) * 100, 100) : 0;
  const potentialProgress = goal > 0 ? Math.min((totalPotential / goal) * 100, 100) : 0;

  const getPeriodLabel = (period: string) => {
    const labels: Record<string, string> = {
      weekly: 'Semanal',
      monthly: 'Mensual',
      quarterly: 'Trimestral',
      yearly: 'Anual',
    };
    return labels[period] || period;
  };

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4 sm:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 sm:h-6 bg-gray-200 dark:bg-gray-700 rounded w-28 sm:w-32" />
            <div className="h-3 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            <div className="h-6 sm:h-8 bg-gray-200 dark:bg-gray-700 rounded w-20 sm:w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-lg text-gray-900 dark:text-white flex items-center gap-1.5 sm:gap-2">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">Meta {getPeriodLabel(goalPeriod)}</span>
          </CardTitle>
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
            {pipeline?.name || 'Sin pipeline'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-6 pt-0 sm:pt-0">
        {goal > 0 ? (
          <>
            {/* Meta y progreso */}
            <div>
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <span className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(wonAmount)}
                </span>
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 shrink-0">
                  de {formatCurrency(goal)}
                </span>
              </div>
              <Progress value={goalProgress} className="h-2 sm:h-3" />
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                {goalProgress.toFixed(1)}% completado (ganado)
              </p>
            </div>

            {/* Proyección con ponderado */}
            <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs sm:text-sm font-medium text-blue-800 dark:text-blue-300">
                  Proyección (ganado + ponderado)
                </span>
              </div>
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <span className="text-base sm:text-xl font-bold text-blue-800 dark:text-blue-200 truncate">
                  {formatCurrency(totalPotential)}
                </span>
                <span className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 shrink-0">
                  {potentialProgress.toFixed(1)}%
                </span>
              </div>
              <Progress value={potentialProgress} className="h-1.5 sm:h-2 bg-blue-100 dark:bg-blue-800" />
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(wonAmount)}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Ganado</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                  <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(weightedAmount)}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Ponderado</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-orange-600 dark:text-orange-400">
                  <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <p className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(openAmount)}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">En proceso</p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4 sm:py-6">
            <XCircle className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2 sm:mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay meta configurada para este pipeline
            </p>
            <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-1">
              Configura una meta en las opciones del pipeline
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
