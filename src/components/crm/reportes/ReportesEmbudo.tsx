'use client';

import { TrendingUp, DollarSign, Target } from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import type { PipelineMetrics } from './types';

interface ReportesEmbudoProps {
  metrics: PipelineMetrics[];
  loading?: boolean;
}

export function ReportesEmbudo({ metrics, loading }: ReportesEmbudoProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Embudo de Ventas
        </h3>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Embudo de Ventas
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No hay datos de pipelines disponibles
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {metrics.map((pipeline) => {
        const maxCount = Math.max(...pipeline.stages.map(s => s.count), 1);

        return (
          <div
            key={pipeline.pipelineId}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {pipeline.pipelineName}
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {pipeline.totalOpportunities} oportunidades
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(pipeline.totalValue)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {pipeline.conversionRate}% conversión
                  </span>
                </div>
              </div>
            </div>

            {/* Embudo visual */}
            <div className="space-y-2">
              {pipeline.stages.map((stage, index) => {
                const widthPercent = Math.max((stage.count / maxCount) * 100, 10);
                
                return (
                  <div key={stage.stageId} className="relative">
                    <div
                      className="h-12 rounded-lg flex items-center justify-between px-4 transition-all"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: stage.color + '20',
                        borderLeft: `4px solid ${stage.color}`,
                        marginLeft: `${(100 - widthPercent) / 2}%`
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {stage.stageName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          {stage.count} ops
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(stage.value)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {stage.probability}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Métricas adicionales */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {pipeline.totalOpportunities}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total Oportunidades
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(pipeline.avgDealSize)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ticket Promedio
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {pipeline.conversionRate}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tasa de Conversión
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
