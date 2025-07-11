"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { Filter } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';

interface ForecastByStageChartProps {
  pipelineId: string;
  className?: string;
}

interface StageData {
  id: string;
  name: string;
  color: string;
  probability: number;
  amount: number;
  forecastAmount: number;
  percentage: number;
}

const ForecastByStageChart: React.FC<ForecastByStageChartProps> = ({ pipelineId, className }) => {
  const [loading, setLoading] = useState(true);
  const [stageData, setStageData] = useState<StageData[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [totalForecast, setTotalForecast] = useState(0);

  // Obtener el ID de organización del almacenamiento local
  useEffect(() => {
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  // Cargar datos de pronóstico por etapa
  useEffect(() => {
    const fetchStageData = async () => {
      if (!organizationId || !pipelineId) return;

      setLoading(true);
      try {
        // 1. Consultar la vista materializada agrupada por etapa
        const { data: forecastData, error: forecastError } = await supabase
          .from('mv_crm_forecast')
          .select(`
            stage_id,
            stages:stage_id (
              name,
              probability,
              color
            ),
            amount,
            forecast_amount
          `)
          .eq('pipeline_id', pipelineId)
          .eq('organization_id', organizationId)
          .in('status', ['open', 'won']);

        if (forecastError) {
          console.error('Error al cargar datos de pronóstico por etapa:', forecastError);
          setLoading(false);
          return;
        }

        // 2. Agrupar y procesar los datos por etapa
        const stagesMap = new Map<string, StageData>();
        let totalForecastAmount = 0;

        // Procesar cada oportunidad y agregarla a su etapa correspondiente
        forecastData?.forEach(item => {
          const stageId = item.stage_id;
          const amount = parseFloat(item.amount) || 0;
          const forecastAmount = parseFloat(item.forecast_amount) || 0;
          totalForecastAmount += forecastAmount;
          
          if (!stagesMap.has(stageId)) {
            // Acceder correctamente a los datos de la etapa
            const stageInfo = item.stages as unknown as { name: string; color: string; probability: string };
            const stageName = stageInfo?.name || 'Sin etapa';
            const stageColor = stageInfo?.color || '#94a3b8'; // color predeterminado
            const probability = parseFloat(stageInfo?.probability) || 0;
            
            stagesMap.set(stageId, {
              id: stageId,
              name: stageName,
              color: stageColor,
              probability: probability,
              amount: amount,
              forecastAmount: forecastAmount,
              percentage: 0 // se calculará después
            });
          } else {
            const existingStage = stagesMap.get(stageId)!;
            existingStage.amount += amount;
            existingStage.forecastAmount += forecastAmount;
          }
        });

        // 3. Calcular porcentajes y ordenar las etapas por probabilidad
        const processedStages = Array.from(stagesMap.values()).map(stage => ({
          ...stage,
          percentage: totalForecastAmount > 0 
            ? (stage.forecastAmount / totalForecastAmount) * 100 
            : 0
        }));

        // Ordenar por probabilidad (de mayor a menor)
        const sortedStages = processedStages.sort((a, b) => b.probability - a.probability);
        
        setStageData(sortedStages);
        setTotalForecast(totalForecastAmount);

      } catch (error) {
        console.error('Error al procesar datos de etapas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStageData();
  }, [pipelineId, organizationId]);

  // Funciones auxiliares para los tooltips
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      payload: StageData & { value: number };
    }>;
  }

  const CustomTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-md shadow-md">
          <p className="font-medium text-gray-800 dark:text-gray-200">{data.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Probabilidad: {(data.probability * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Total: {formatCurrency(data.amount)}
          </p>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Pronóstico: {formatCurrency(data.forecastAmount)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {data.percentage.toFixed(1)}% del pronóstico total
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className={`p-4 flex justify-center items-center h-80 ${className}`}>
        <LoadingSpinner size="md" className="text-blue-500" />
      </Card>
    );
  }

  // Si no hay datos
  if (stageData.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-80 text-center">
          <div>
            <Filter className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Sin datos por etapa</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No se encontraron oportunidades abiertas en este pipeline.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Preparar datos para el gráfico
  const chartData = stageData.map(stage => ({
    ...stage,
    value: stage.forecastAmount
  }));

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Filter className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Embudo ponderado
          </h3>
        </div>
        <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {formatCurrency(totalForecast)}
        </div>
      </div>

      <div className="h-64 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={entry.color}
                  className="dark:opacity-80"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              layout="vertical" 
              verticalAlign="middle" 
              align="right"
              formatter={(value, entry) => {
                const payload = entry?.payload as StageData | undefined;
                return (
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {value} ({payload ? (payload.probability * 100).toFixed(0) : 0}%)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla de resumen */}
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2">Etapa</th>
              <th className="pb-2 text-right">Pronóstico</th>
              <th className="pb-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {stageData.map(stage => (
              <tr key={stage.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-2 flex items-center">
                  <span 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: stage.color }}
                  ></span>
                  {stage.name}
                </td>
                <td className="py-2 text-right">{formatCurrency(stage.forecastAmount)}</td>
                <td className="py-2 text-right">{stage.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ForecastByStageChart;
