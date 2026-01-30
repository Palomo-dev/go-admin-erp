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
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      <div className="flex flex-wrap gap-3">
        {/* Pipeline */}
        <Select value={selectedPipelineId} onValueChange={onPipelineChange}>
          <SelectTrigger className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Seleccionar pipeline" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800">
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Periodo */}
        <Select value={period} onValueChange={(v) => onPeriodChange(v as typeof period)}>
          <SelectTrigger className="w-40 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800">
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensual</SelectItem>
            <SelectItem value="quarterly">Trimestral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {onExport && (
        <Button
          variant="outline"
          onClick={onExport}
          className="border-gray-200 dark:border-gray-700"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      )}
    </div>
  );
}
