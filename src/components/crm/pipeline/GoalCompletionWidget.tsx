"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from "@/components/ui/use-toast";
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

interface GoalCompletionWidgetProps {
  pipelineId: string;
  className?: string;
}

interface GoalData {
  goalAmount: number;
  goalPeriod: 'monthly' | 'quarterly' | 'yearly';
  /** Moneda de la meta del pipeline (`pipelines.goal_currency`); null = base. */
  goalCurrency: string | null;
  forecastAmount: number;
  totalAmount: number;
  completionPercentage: number;
}

const GoalCompletionWidget: React.FC<GoalCompletionWidgetProps> = ({ pipelineId, className }) => {
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const { paraDocumento } = useMonedaOrganizacion();
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  // Obtener el ID de organización usando la función canónica
  useEffect(() => {
    const orgId = getOrganizationIdFromContext();
    if (orgId) {
      setOrganizationId(orgId);
    }
  }, []);

  // Cargar datos de objetivo y pronóstico
  useEffect(() => {
    const fetchGoalData = async () => {
      if (!organizationId || !pipelineId) return;

      setLoading(true);
      try {
        // 1. Obtener los datos del objetivo del pipeline
        const { data: pipelineData, error: pipelineError } = await supabase
          .from('pipelines')
          .select('goal_amount, goal_period, goal_currency')
          .eq('id', pipelineId)
          .single();

        if (pipelineError) {
          console.error('Error al cargar información del pipeline:', pipelineError);
          setLoading(false);
          return;
        }

        // Si no hay objetivo configurado
        if (!pipelineData?.goal_amount || pipelineData.goal_amount <= 0) {
          setGoalData(null);
          setLoading(false);
          return;
        }

        // 2. Obtener datos de oportunidades y sus etapas directamente (sin usar la vista materializada)
        const { data: opportunitiesData, error: opportunitiesError } = await supabase
          .from('opportunities')
          .select(`
            id,
            amount,
            stages:stage_id (probability)
          `)
          .eq('pipeline_id', pipelineId)
          .eq('status', 'open');

        if (opportunitiesError) {
          toast({
            title: "Error",
            description: "Error al cargar datos de oportunidades",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
        
        // Calcular montos ponderados basados en la probabilidad de cada etapa
        const forecastData = opportunitiesData?.map(opp => ({
          amount: Number(opp.amount) || 0,
          forecast_amount: (Number(opp.amount) || 0) * ((opp.stages?.[0]?.probability ?? 100) / 100)
        }));

        // 3. Calcular totales
        let totalForecastAmount = 0;
        let totalBrutoAmount = 0;

        if (forecastData && forecastData.length > 0) {
          totalForecastAmount = forecastData.reduce((sum, item) =>
            sum + (Number(item.forecast_amount) || 0), 0);

          totalBrutoAmount = forecastData.reduce((sum, item) =>
            sum + (Number(item.amount) || 0), 0);
        }

        // 4. Calcular porcentaje de cumplimiento
        const goalAmount = parseFloat(pipelineData.goal_amount) || 0;
        const completionPercentage = goalAmount > 0 
          ? Math.min(100, (totalForecastAmount / goalAmount) * 100)
          : 0;

        setGoalData({
          goalAmount,
          goalPeriod: pipelineData.goal_period || 'monthly',
          goalCurrency: pipelineData.goal_currency || null,
          forecastAmount: totalForecastAmount,
          totalAmount: totalBrutoAmount,
          completionPercentage
        });

      } catch (error) {
        console.error('Error al procesar datos de objetivo:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGoalData();
  }, [pipelineId, organizationId]);

  const getPerformanceColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-500 dark:text-green-400';
    if (percentage >= 70) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-red-500 dark:text-red-400';
  };

  const getPeriodText = (period: string): string => {
    switch (period) {
      case 'monthly': return 'mensual';
      case 'quarterly': return 'trimestral';
      case 'yearly': return 'anual';
      default: return 'mensual';
    }
  };

  if (loading) {
    return (
      <Card className={`p-4 space-y-4 h-48 ${className}`}>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }

  // Si no hay objetivo configurado
  if (!goalData) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-48 text-center">
          <div>
            <Target className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Sin objetivo definido</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configura un objetivo de ventas en la configuración del pipeline.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Target className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Cumplimiento de objetivo {getPeriodText(goalData.goalPeriod)}
          </h3>
        </div>
      </div>
      
      <div className="space-y-6 mt-4">
        {/* Barra de progreso */}
        <div className="w-full">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-300">Progreso</span>
            <span className={getPerformanceColor(goalData.completionPercentage)}>
              {goalData.completionPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className={`h-3 rounded-full ${getPerformanceColor(goalData.completionPercentage).replace('text-', 'bg-')}`}
              style={{ width: `${goalData.completionPercentage}%` }}
            ></div>
          </div>
        </div>
        
        {/* Detalle de montos */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="border-r border-gray-200 dark:border-gray-700 pr-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Objetivo</div>
            <div className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {formatMoneda(goalData.goalAmount, paraDocumento(goalData.goalCurrency))}
            </div>
          </div>
          <div className="pl-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Pronóstico</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {formatMoneda(goalData.forecastAmount, paraDocumento(goalData.goalCurrency))}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              De {formatMoneda(goalData.totalAmount, paraDocumento(goalData.goalCurrency))} bruto
            </div>
          </div>
        </div>
        
        {/* Indicador de tendencia */}
        <div className="flex items-center mt-2">
          <TrendingUp className={`h-4 w-4 mr-2 ${getPerformanceColor(goalData.completionPercentage)}`} />
          <span className={`text-sm ${getPerformanceColor(goalData.completionPercentage)}`}>
            {goalData.completionPercentage >= 90 
              ? 'En camino a cumplir el objetivo' 
              : goalData.completionPercentage >= 70 
                ? 'Acercándose al objetivo' 
                : 'Por debajo del objetivo'}
          </span>
        </div>
      </div>
    </Card>
  );
};

export default GoalCompletionWidget;
