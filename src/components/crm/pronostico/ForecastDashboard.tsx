'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import {
  Pipeline,
  Stage,
  Opportunity,
  ForecastData,
} from '@/components/crm/oportunidades/types';
import { ForecastFilters } from './ForecastFilters';
import { GoalProgress } from './GoalProgress';
import { ForecastByStage } from './ForecastByStage';
import { ForecastChart } from './ForecastChart';

export function ForecastDashboard() {
  const [isLoading, setIsLoading] = useState(true);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');

  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);

  // Estadísticas calculadas
  const [wonAmount, setWonAmount] = useState(0);
  const [openAmount, setOpenAmount] = useState(0);
  const [weightedAmount, setWeightedAmount] = useState(0);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const pipelinesData = await opportunitiesService.getPipelines();
      setPipelines(pipelinesData);

      if (pipelinesData.length > 0) {
        const defaultPipeline = pipelinesData.find((p) => p.is_default) || pipelinesData[0];
        setSelectedPipelineId(defaultPipeline.id);
        setSelectedPipeline(defaultPipeline);
      }
    } catch (error) {
      console.error('Error cargando pipelines:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los pipelines',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPipelineData = useCallback(async () => {
    if (!selectedPipelineId) return;

    setIsLoading(true);
    try {
      const [stagesData, oppsData, forecastDataResult] = await Promise.all([
        opportunitiesService.getStages(selectedPipelineId),
        opportunitiesService.getOpportunities({ pipelineId: selectedPipelineId }),
        opportunitiesService.getForecastByPeriod(selectedPipelineId, period),
      ]);

      setStages(stagesData);
      setOpportunities(oppsData);
      setForecastData(forecastDataResult);

      // Calcular estadísticas
      const won = oppsData
        .filter((o) => o.status === 'won')
        .reduce((sum, o) => sum + (o.amount || 0), 0);

      const open = oppsData
        .filter((o) => o.status === 'open')
        .reduce((sum, o) => sum + (o.amount || 0), 0);

      const weighted = oppsData
        .filter((o) => o.status === 'open')
        .reduce((sum, o) => {
          const stage = stagesData.find((s) => s.id === o.stage_id);
          return sum + (o.amount || 0) * (stage?.probability || 0);
        }, 0);

      setWonAmount(won);
      setOpenAmount(open);
      setWeightedAmount(weighted);

      // Actualizar pipeline seleccionado
      const pipeline = pipelines.find((p) => p.id === selectedPipelineId);
      setSelectedPipeline(pipeline || null);
    } catch (error) {
      console.error('Error cargando datos del pipeline:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedPipelineId, period, pipelines]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedPipelineId) {
      loadPipelineData();
    }
  }, [selectedPipelineId, period, loadPipelineData]);

  const handlePipelineChange = (id: string) => {
    setSelectedPipelineId(id);
  };

  const handlePeriodChange = (newPeriod: 'weekly' | 'monthly' | 'quarterly') => {
    setPeriod(newPeriod);
  };

  const handleExport = () => {
    toast({
      title: 'Info',
      description: 'Función de exportación próximamente',
    });
  };

  if (isLoading && pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <ForecastFilters
        pipelines={pipelines}
        selectedPipelineId={selectedPipelineId}
        period={period}
        onPipelineChange={handlePipelineChange}
        onPeriodChange={handlePeriodChange}
        onExport={handleExport}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progreso de meta */}
        <GoalProgress
          pipeline={selectedPipeline}
          wonAmount={wonAmount}
          openAmount={openAmount}
          weightedAmount={weightedAmount}
          isLoading={isLoading}
        />

        {/* Gráfico de tendencia */}
        <div className="lg:col-span-2">
          <ForecastChart data={forecastData} isLoading={isLoading} />
        </div>
      </div>

      {/* Pronóstico por etapa */}
      <ForecastByStage stages={stages} opportunities={opportunities} isLoading={isLoading} />
    </div>
  );
}
