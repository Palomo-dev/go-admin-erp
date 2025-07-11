"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/utils/Utils';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Interfaces
interface ForecastChartProps {
  pipelineId: string;
  period?: 'monthly' | 'quarterly'; // Período de visualización
}

interface ChartData {
  name: string; // nombre del mes o trimestre (ej. "Enero" o "Q1")
  totalAmount: number; // importe total
  forecastAmount: number; // importe ponderado
  goal?: number; // objetivo (si existe)
}

const ForecastChart: React.FC<ForecastChartProps> = ({ pipelineId, period = 'monthly' }) => {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [selectedView, setSelectedView] = useState<'monthly' | 'quarterly'>(period);

  // Obtener el ID de organización del almacenamiento local
  useEffect(() => {
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  // Cargar datos de pronóstico
  useEffect(() => {
    const fetchForecastData = async () => {
      if (!organizationId || !pipelineId) return;

      setLoading(true);
      try {
        // Consulta a la vista materializada mv_crm_forecast
        const { data: forecastData, error: forecastError } = await supabase
          .from('mv_crm_forecast')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('pipeline_id', pipelineId)
          .in('status', ['open', 'won']);

        if (forecastError) {
          console.error('Error al cargar datos de pronóstico:', forecastError);
          setLoading(false);
          return;
        }

        // Obtener los objetivos del pipeline
        const { data: pipelineData, error: pipelineError } = await supabase
          .from('pipelines')
          .select('goal_amount, goal_period')
          .eq('id', pipelineId)
          .single();

        if (pipelineError && pipelineError.code !== 'PGRST116') {
          console.error('Error al cargar información del pipeline:', pipelineError);
        }

        // Procesar datos según el período seleccionado
        processChartData(forecastData || [], pipelineData);
      } catch (error) {
        console.error('Error al procesar datos del gráfico:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchForecastData();
  }, [pipelineId, organizationId, selectedView]);

  // Procesar datos para el gráfico según período (mensual o trimestral)
  const processChartData = (forecastData: any[], pipelineData: any) => {
    if (!forecastData.length) {
      setChartData([]);
      return;
    }

    // Agrupar por mes o trimestre
    const isMonthly = selectedView === 'monthly';
    const groupedData = new Map<string, ChartData>();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    // Agregar un periodo para oportunidades sin fecha
    const noDateKey = 'no-date';
    groupedData.set(noDateKey, {
      name: 'Sin fecha',
      totalAmount: 0,
      forecastAmount: 0
    });

    forecastData.forEach(item => {
      let key;
      let displayName;

      if (!item.expected_year || !item.expected_month) {
        // Si no tiene fecha, agregarlo al grupo "sin fecha"
        key = noDateKey;
        displayName = 'Sin fecha';
      } else {
        // Si tiene fecha, usar el formato adecuado según la vista
        const year = item.expected_year;
        const month = item.expected_month - 1; // 0-indexed para arrays
        const quarter = Math.floor(month / 3);
        
        if (isMonthly) {
          key = `${year}-${String(month + 1).padStart(2, '0')}`;
          displayName = `${monthNames[month]} ${year}`;
        } else { // quarterly
          key = `${year}-Q${quarter + 1}`;
          displayName = `${quarterNames[quarter]} ${year}`;
        }
      }

      if (!groupedData.has(key)) {
        groupedData.set(key, {
          name: displayName,
          totalAmount: 0,
          forecastAmount: 0
        });
      }

      const entry = groupedData.get(key)!;
      entry.totalAmount += parseFloat(item.amount) || 0;
      entry.forecastAmount += parseFloat(item.forecast_amount) || 0;
    });

    // Agregar objetivos si existen
    if (pipelineData && pipelineData.goal_amount > 0) {
      // Ajustar el objetivo según el período de visualización y del pipeline
      const goalPeriod = pipelineData.goal_period || 'monthly';
      const goalAmount = parseFloat(pipelineData.goal_amount) || 0;

      groupedData.forEach((data) => {
        // Solo agregamos objetivo a periodos con fechas (no al "sin fecha")
        if (data.name !== 'Sin fecha') {
          // Si el objetivo es mensual y estamos viendo por meses, usamos el objetivo directo
          if (goalPeriod === 'monthly' && isMonthly) {
            data.goal = goalAmount;
          }
          // Si el objetivo es mensual y estamos viendo por trimestres, multiplicamos por 3
          else if (goalPeriod === 'monthly' && !isMonthly) {
            data.goal = goalAmount * 3;
          }
          // Si el objetivo es trimestral y estamos viendo por meses, dividimos entre 3
          else if (goalPeriod === 'quarterly' && isMonthly) {
            data.goal = goalAmount / 3;
          }
          // Si el objetivo es trimestral y estamos viendo por trimestres, usamos el objetivo directo
          else if (goalPeriod === 'quarterly' && !isMonthly) {
            data.goal = goalAmount;
          }
        }
      });
    }

    // Convertir a array y ordenar
    const sortedData = Array.from(groupedData.entries())
      .sort(([keyA], [keyB]) => {
        // Colocar "Sin fecha" al final
        if (keyA === noDateKey) return 1;
        if (keyB === noDateKey) return -1;
        // Ordenar el resto cronológicamente
        return keyA.localeCompare(keyB);
      })
      .map(([_, value]) => value);

    // Si el grupo "Sin fecha" está vacío, eliminarlo
    if (sortedData.length > 0 && 
        sortedData[sortedData.length - 1].name === 'Sin fecha' && 
        sortedData[sortedData.length - 1].totalAmount === 0) {
      sortedData.pop();
    }
    
    setChartData(sortedData);
  };

  // Color según tema
  const barColors = {
    totalAmount: '#94a3b8', // slate-400
    forecastAmount: '#3b82f6', // blue-500
    goal: '#10b981' // emerald-500
  };

  // Renderizar gráfico de carga
  if (loading) {
    return (
      <Card className="p-4 h-80 flex items-center justify-center">
        <LoadingSpinner size="lg" className="text-blue-500" />
      </Card>
    );
  }

  // Si no hay datos
  if (chartData.length === 0) {
    return (
      <Card className="p-6 h-80 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Sin datos de pronóstico</h3>
          <p className="text-gray-500 dark:text-gray-400">
            Agrega oportunidades con fechas de cierre esperadas para visualizar el pronóstico.
          </p>
        </div>
      </Card>
    );
  }

  // Tipo correcto para el tooltip
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      name: string;
      dataKey: string;
      payload: ChartData;
    }>;
  }

  const CustomTooltip: React.FC<TooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-md shadow-md">
          <p className="font-medium text-gray-800 dark:text-gray-200">{data.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Total: {formatCurrency(data.totalAmount)}
          </p>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Pronóstico: {formatCurrency(data.forecastAmount)}
          </p>
          {data.goal && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Objetivo: {formatCurrency(data.goal)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Pronóstico acumulado
        </h3>
        
        <Tabs 
          value={selectedView} 
          onValueChange={(value: string) => setSelectedView(value as 'monthly' | 'quarterly')}
          className="w-auto"
        >
          <TabsList className="bg-gray-100 dark:bg-gray-800">
            <TabsTrigger value="monthly">Mensual</TabsTrigger>
            <TabsTrigger value="quarterly">Trimestral</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            margin={{ top: 10, right: 10, left: 10, bottom: 50 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis 
              dataKey="name" 
              className="text-xs text-gray-600 dark:text-gray-300"
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              tickFormatter={(value) => formatCurrency(value, 'COP')}
              className="text-xs text-gray-600 dark:text-gray-300"
            />
            <Tooltip 
              formatter={(value: number) => [formatCurrency(value), '']}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderColor: '#e2e8f0',
                borderRadius: 4,
              }}
            />
            <Legend />
            <Bar 
              name="Total bruto" 
              dataKey="totalAmount" 
              fill={barColors.totalAmount} 
              className="dark:opacity-80"
            />
            <Bar 
              name="Pronóstico ponderado" 
              dataKey="forecastAmount" 
              fill={barColors.forecastAmount} 
              className="dark:opacity-80"
            />
            {chartData[0]?.goal && (
              <Bar 
                name="Objetivo" 
                dataKey="goal" 
                fill={barColors.goal} 
                className="dark:opacity-80"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default ForecastChart;
