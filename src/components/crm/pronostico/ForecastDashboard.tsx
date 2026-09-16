'use client';

import { useState, useEffect, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ForecastScenarios } from './ForecastScenarios';
import { weightedOpenAmount } from '@/lib/services/crm/revenueOs/forecastScenarios';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';

interface ForecastDashboardProps {
  /** Moneda base de la organización (`dashboard.currency` de Revenue OS); null → cifras sin símbolo. */
  currency: string | null;
}

export function ForecastDashboard({ currency }: ForecastDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  // Con la base intermitente esta pantalla se quedaba en el esqueleto de carga
  // (isLoading && pipelines.length === 0) para siempre.
  const [loadError, setLoadError] = useState<string | null>(null);

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
    setLoadError(null);
    try {
      const pipelinesData = await opportunitiesService.getPipelines();
      setPipelines(pipelinesData);

      if (pipelinesData.length > 0) {
        const defaultPipeline = pipelinesData.find((p) => p.is_default) || pipelinesData[0];
        setSelectedPipelineId(defaultPipeline.id);
        setSelectedPipeline(defaultPipeline);
      }
    } catch (error) {
      logError('[ForecastDashboard] cargar pipelines', error);
      setLoadError(describeError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPipelineData = useCallback(async () => {
    if (!selectedPipelineId) return;

    setIsLoading(true);
    setLoadError(null);
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

      // `stages.probability` es 0–100: el ponderado sale del módulo puro de
      // F14 (antes se multiplicaba sin dividir por 100 y salía 100× inflado).
      const weighted = weightedOpenAmount(oppsData, stagesData);

      setWonAmount(won);
      setOpenAmount(open);
      setWeightedAmount(weighted);

      // Actualizar pipeline seleccionado
      const pipeline = pipelines.find((p) => p.id === selectedPipelineId);
      setSelectedPipeline(pipeline || null);
    } catch (error) {
      logError('[ForecastDashboard] cargar datos del pipeline', error);
      setLoadError(describeError(error));
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

  // El error manda sobre el esqueleto: si la carga falló hay que decirlo.
  if (loadError) {
    return (
      <div className="p-4">
        <LoadErrorState
          title="No se pudo cargar el pronóstico"
          message={loadError}
          onRetry={() => {
            if (selectedPipelineId) void loadPipelineData();
            else void loadInitialData();
          }}
          isRetrying={isLoading}
        />
      </div>
    );
  }

  if (isLoading && pipelines.length === 0) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
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
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progreso de meta */}
        <GoalProgress
          pipeline={selectedPipeline}
          wonAmount={wonAmount}
          openAmount={openAmount}
          weightedAmount={weightedAmount}
          isLoading={isLoading}
          currency={currency}
        />

        {/* Gráfico de tendencia */}
        <div className="lg:col-span-2">
          <ForecastChart data={forecastData} isLoading={isLoading} currency={currency} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Escenarios (F14): mejor / esperado / peor sobre las abiertas */}
        <ForecastScenarios stages={stages} opportunities={opportunities} isLoading={isLoading} currency={currency} />

        {/* Pronóstico por etapa */}
        <div className="lg:col-span-2">
          <ForecastByStage stages={stages} opportunities={opportunities} isLoading={isLoading} currency={currency} />
        </div>
      </div>
    </div>
  );
}
