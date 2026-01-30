'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatCurrency } from '@/utils/Utils';
import { FunnelData, PipelineStageData, Pipeline } from './types';

interface CRMFunnelChartProps {
  data: FunnelData | null;
  isLoading: boolean;
  pipelines: Pipeline[];
  selectedPipelineId: string | null;
  onPipelineChange: (pipelineId: string | null) => void;
}

function FunnelBar({ stage, maxCount, index }: { stage: PipelineStageData; maxCount: number; index: number }) {
  const widthPercent = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
  // Ancho mínimo del 20% para visualización
  const displayWidth = Math.max(widthPercent, 20);
  
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-28 text-right">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {stage.name}
        </span>
      </div>
      <div className="flex-1 relative">
        <div
          className="h-10 rounded-r-lg transition-all duration-300 group-hover:shadow-md flex items-center justify-between px-3"
          style={{
            width: `${displayWidth}%`,
            backgroundColor: stage.color,
            opacity: 0.9,
          }}
        >
          <span className="text-white text-sm font-bold">
            {stage.count}
          </span>
          <span className="text-white text-xs opacity-80">
            {formatCurrency(stage.value, 'COP')}
          </span>
        </div>
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
          {stage.probability}% probabilidad
        </div>
      </div>
    </div>
  );
}

export function CRMFunnelChart({ 
  data, 
  isLoading, 
  pipelines, 
  selectedPipelineId, 
  onPipelineChange 
}: CRMFunnelChartProps) {
  const defaultPipeline = pipelines.find(p => p.isDefault);
  const currentPipelineId = selectedPipelineId || defaultPipeline?.id || '';

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 flex-1" style={{ width: `${100 - i * 15}%` }} />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const stages = data?.stages || [];
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Embudo de Ventas
            </CardTitle>
            {pipelines.length > 0 && (
              <Select
                value={currentPipelineId}
                onValueChange={(value) => onPipelineChange(value || null)}
              >
                <SelectTrigger className="w-[180px] h-8 text-sm bg-gray-50 dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                      {pipeline.isDefault && ' (default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Valor total</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(data?.totalValue || 0, 'COP')}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay etapas configuradas en el pipeline
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <FunnelBar
                key={stage.id}
                stage={stage}
                maxCount={maxCount}
                index={index}
              />
            ))}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Valor ponderado (pronóstico)
                </span>
                <span className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(data?.weightedValue || 0, 'COP')}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
