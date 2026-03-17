'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { Stage, Opportunity } from '@/components/crm/oportunidades/types';

interface ForecastByStageProps {
  stages: Stage[];
  opportunities: Opportunity[];
  isLoading?: boolean;
}

interface StageData {
  stage: Stage;
  count: number;
  totalAmount: number;
  weightedAmount: number;
}

export function ForecastByStage({ stages, opportunities, isLoading }: ForecastByStageProps) {
  const stageData: StageData[] = stages
    .sort((a, b) => a.position - b.position)
    .map((stage) => {
      const stageOpps = opportunities.filter(
        (o) => o.stage_id === stage.id && o.status === 'open'
      );
      const totalAmount = stageOpps.reduce((sum, o) => sum + (o.amount || 0), 0);
      const weightedAmount = totalAmount * (stage.probability || 0);

      return {
        stage,
        count: stageOpps.length,
        totalAmount,
        weightedAmount,
      };
    });

  const maxAmount = Math.max(...stageData.map((d) => d.totalAmount), 1);

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4 sm:p-6">
          <div className="animate-pulse space-y-3 sm:space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 sm:h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white">Pronóstico por Etapa</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <div className="space-y-3 sm:space-y-4">
          {stageData.map((data) => (
            <div key={data.stage.id} className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0"
                    style={{ backgroundColor: data.stage.color }}
                  />
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">
                    {data.stage.name}
                  </span>
                  <span className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 shrink-0">
                    ({data.count})
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(data.totalAmount)}
                  </span>
                  <span className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 ml-1 sm:ml-2">
                    × {((data.stage.probability || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="relative h-6 sm:h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300"
                  style={{
                    width: `${(data.totalAmount / maxAmount) * 100}%`,
                    backgroundColor: data.stage.color,
                    opacity: 0.3,
                  }}
                />
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300"
                  style={{
                    width: `${(data.weightedAmount / maxAmount) * 100}%`,
                    backgroundColor: data.stage.color,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-end pr-2 sm:pr-3">
                  <span className="text-[10px] sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    {formatCurrency(data.weightedAmount)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Totales */}
          <div className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm sm:text-lg font-bold gap-2">
              <span className="text-gray-900 dark:text-white">Total Ponderado</span>
              <span className="text-blue-600 dark:text-blue-400">
                {formatCurrency(stageData.reduce((sum, d) => sum + d.weightedAmount, 0))}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 mt-1 gap-2">
              <span>Valor bruto en pipeline</span>
              <span>{formatCurrency(stageData.reduce((sum, d) => sum + d.totalAmount, 0))}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
