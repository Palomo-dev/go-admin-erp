'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { Pipeline } from '@/components/crm/oportunidades/types';

interface ForecastFiltersProps {
  pipelines: Pipeline[];
  selectedPipelineId: string;
  period: 'weekly' | 'monthly' | 'quarterly';
  onPipelineChange: (id: string) => void;
  onPeriodChange: (period: 'weekly' | 'monthly' | 'quarterly') => void;
  onExport?: () => void;
}

export function ForecastFilters({
  pipelines,
  selectedPipelineId,
  period,
  onPipelineChange,
  onPeriodChange,
  onExport,
}: ForecastFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center justify-between">
      <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
        {/* Pipeline */}
        <Select value={selectedPipelineId} onValueChange={onPipelineChange}>
          <SelectTrigger className="w-full sm:w-48 h-9 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            <SelectValue placeholder="Seleccionar pipeline" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id} className="text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Periodo */}
        <Select value={period} onValueChange={(v) => onPeriodChange(v as typeof period)}>
          <SelectTrigger className="w-full sm:w-40 h-9 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectItem value="weekly" className="text-gray-900 dark:text-gray-100 text-xs sm:text-sm">Semanal</SelectItem>
            <SelectItem value="monthly" className="text-gray-900 dark:text-gray-100 text-xs sm:text-sm">Mensual</SelectItem>
            <SelectItem value="quarterly" className="text-gray-900 dark:text-gray-100 text-xs sm:text-sm">Trimestral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {onExport && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="h-9 text-xs sm:text-sm border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
          Exportar
        </Button>
      )}
    </div>
  );
}
