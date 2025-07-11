"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { Target, TrendingUp } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';

interface GoalCompletionWidgetProps {
  pipelineId: string;
  className?: string;
}

interface GoalData {
  goalAmount: number;
  goalPeriod: 'monthly' | 'quarterly' | 'yearly';
  forecastAmount: number;
  totalAmount: number;
  completionPercentage: number;
}

const GoalCompletionWidget: React.FC<GoalCompletionWidgetProps> = ({ pipelineId, className }) => {
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  // Obtener el ID de organización del almacenamiento local
  useEffect(() => {
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      setOrganizationId(Number(orgId));
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

        // 2. Obtener pronóstico utilizando la vista materializada
        const { data: forecastData, error: forecastError } = await supabase
          .from('mv_crm_forecast')
          .select('forecast_amount, amount')
          .eq('pipeline_id', pipelineId)
          .eq('organization_id', organizationId)
          .eq('status', 'open');

        if (forecastError) {
          console.error('Error al cargar datos de pronóstico:', forecastError);
          setLoading(false);
          return;
        }

        // 3. Calcular totales
        let totalForecastAmount = 0;
        let totalBrutoAmount = 0;

        if (forecastData && forecastData.length > 0) {
          totalForecastAmount = forecastData.reduce((sum, item) => 
            sum + parseFloat(item.forecast_amount || '0'), 0);
          
          totalBrutoAmount = forecastData.reduce((sum, item) => 
            sum + parseFloat(item.amount || '0'), 0);
        }

        // 4. Calcular porcentaje de cumplimiento
        const goalAmount = parseFloat(pipelineData.goal_amount) || 0;
        const completionPercentage = goalAmount > 0 
          ? Math.min(100, (totalForecastAmount / goalAmount) * 100)
          : 0;

        setGoalData({
          goalAmount,
          goalPeriod: pipelineData.goal_period || 'monthly',
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
      <Card className={`p-4 flex justify-center items-center h-48 ${className}`}>
        <LoadingSpinner size="md" className="text-blue-500" />
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
              {formatCurrency(goalData.goalAmount)}
            </div>
          </div>
          <div className="pl-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">Pronóstico</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(goalData.forecastAmount)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              De {formatCurrency(goalData.totalAmount)} bruto
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
