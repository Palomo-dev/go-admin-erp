"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/utils/Utils";
import { BarChart3, Calendar } from "lucide-react";
import ForecastChart from "./ForecastChart";
import GoalCompletionWidget from "./GoalCompletionWidget";
import ForecastByStageChart from "./ForecastByStageChart";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface ForecastMonth {
  month: string; // formato: YYYY-MM
  monthName: string; // formato: Enero 2025
  totalValue: number;
  weightedValue: number;
  opportunityCount: number;
  opportunities: Opportunity[];
}

interface Opportunity {
  id: string;
  name: string;
  amount: number;
  expected_close_date: string;
  stage_id: string;
  stage_name?: string;
  probability: number;       // Valor decimal (0-1)
  probabilityPercent: number; // Valor porcentual (0-100)
  customer_name?: string;
  status: string;
}

interface ForecastViewProps {
  pipelineId: string;
}

const ForecastView: React.FC<ForecastViewProps> = ({ pipelineId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [forecastData, setForecastData] = useState<ForecastMonth[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [totalForecast, setTotalForecast] = useState({
    totalAmount: 0,
    weightedAmount: 0,
    opportunityCount: 0,
  });

  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  useEffect(() => {
    const loadForecastData = async () => {
      if (!organizationId || !pipelineId) return;

      setLoading(true);

      try {
        // Cargar oportunidades con información de etapas para obtener probabilidades
        const { data, error } = await supabase
          .from("opportunities")
          .select(`
            id, name, amount, expected_close_date, stage_id, status, customer_id,
            stages:stage_id(name, probability),
            customers:customer_id(full_name)
          `)
          .eq("organization_id", organizationId)
          .eq("pipeline_id", pipelineId)
          // Solo incluir oportunidades abiertas o ganadas
          .in("status", ["open", "won"])
          .order("expected_close_date");

        if (error) {
          console.error("Error al cargar datos para el pronóstico:", error);
          setLoading(false);
          return;
        }

        if (!data || data.length === 0) {
          setForecastData([]);
          setLoading(false);
          return;
        }

        // Procesar y agrupar oportunidades por mes
        const processedData = processOpportunitiesByMonth(data);
        setForecastData(processedData.monthData);
        setTotalForecast({
          totalAmount: processedData.totalAmount,
          weightedAmount: processedData.weightedAmount,
          opportunityCount: processedData.totalCount,
        });

        setLoading(false);
      } catch (error) {
        console.error("Error al procesar datos de pronóstico:", error);
        setLoading(false);
      }
    };

    loadForecastData();
  }, [pipelineId, organizationId]);

  // Procesar y agrupar oportunidades por mes
  const processOpportunitiesByMonth = (data: any[]) => {
    const monthMap = new Map<string, ForecastMonth>();
    let totalAmount = 0;
    let weightedAmount = 0;
    let totalCount = 0;

    // Crear un grupo para oportunidades sin fecha
    const noDateKey = 'sin-fecha';
    monthMap.set(noDateKey, {
      month: noDateKey,
      monthName: 'Sin fecha',
      totalValue: 0,
      weightedValue: 0,
      opportunityCount: 0,
      opportunities: [],
    });

    data.forEach((opp) => {
      // Calcular monto ponderado usando la probabilidad de la etapa
      const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
      const amount = Number(opp.amount) || 0;
      const weightedAmountForOpp = amount * probability;

      totalAmount += amount;
      weightedAmount += weightedAmountForOpp;
      totalCount++;

      // Extraer información de etapa y cliente
      const stageName = opp.stages?.name || "Sin etapa";
      const probabilityPercent = probability * 100; // Convertir a porcentaje para mostrar
      const customerName = opp.customers?.full_name || "Sin cliente";
      const opportunity: Opportunity = {
        id: opp.id,
        name: opp.name,
        amount,
        expected_close_date: opp.expected_close_date,
        stage_id: opp.stage_id,
        stage_name: stageName,
        probability: probability,
        probabilityPercent: probabilityPercent,
        customer_name: customerName,
        status: opp.status
      };

      let key;
      let monthName;

      // Verificar si tiene fecha de cierre esperada
      if (!opp.expected_close_date) {
        // Sin fecha, agregarlo al grupo especial
        key = noDateKey;
        monthName = 'Sin fecha';
      } else {
        // Con fecha, procesar normalmente
        const closeDate = new Date(opp.expected_close_date);
        const year = closeDate.getFullYear();
        const month = closeDate.getMonth(); // 0-indexed para arrays
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        key = `${year}-${String(month + 1).padStart(2, '0')}`;
        monthName = `${monthNames[month]} ${year}`;
      }

      // Actualizar o crear el grupo del mes
      if (monthMap.has(key)) {
        const monthData = monthMap.get(key)!;
        monthData.totalValue += amount;
        monthData.weightedValue += weightedAmountForOpp;
        monthData.opportunityCount++;
        monthData.opportunities.push(opportunity);
      } else {
        monthMap.set(key, {
          month: key,
          monthName: monthName,
          totalValue: amount,
          weightedValue: weightedAmountForOpp,
          opportunityCount: 1,
          opportunities: [opportunity]
        });
      }
    });

    // Convertir el mapa a un array ordenado por mes
    const monthData = Array.from(monthMap.values()).sort(
      (a, b) => {
        // Colocar "Sin fecha" al final
        if (a.month === noDateKey) return 1;
        if (b.month === noDateKey) return -1;
        // Ordenar el resto cronológicamente
        return new Date(a.month).getTime() - new Date(b.month).getTime();
      }
    );
    
    // Eliminar el grupo "Sin fecha" si está vacío
    if (monthData.length > 0 && 
        monthData[monthData.length - 1].month === noDateKey && 
        monthData[monthData.length - 1].opportunityCount === 0) {
      monthData.pop();
    }

    return { monthData, totalAmount, weightedAmount, totalCount };
  };

  // Renderizar el esqueleto de carga
  if (loading) {
    return (
      <div className="p-4">
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner size="lg" className="text-blue-500" />
        </div>
      </div>
    );
  }

  // Si no hay datos de pronóstico
  if (forecastData.length === 0) {
    return (
      <div className="p-4">
        <Card className="p-8 text-center">
          <h3 className="text-lg font-medium mb-2">No hay datos de pronóstico disponibles</h3>
          <p className="text-gray-500 dark:text-gray-400">
            No se encontraron oportunidades en este pipeline. 
            Añade oportunidades para ver un pronóstico mensual.
          </p>
        </Card>
      </div>
    );
  }

  // Renderizar el pronóstico
  return (
    <div className="p-4 space-y-6">
      {/* Selector de vistas */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="monthly">Vista mensual</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-6">
          {/* KPIs de resumen */}
          <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col p-3 border-r border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total de oportunidades</span>
                <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  {totalForecast.opportunityCount}
                </span>
              </div>
              <div className="flex flex-col p-3 border-r border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Valor total</span>
                <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  {formatCurrency(totalForecast.totalAmount)}
                </span>
              </div>
              <div className="flex flex-col p-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Valor ponderado</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(totalForecast.weightedAmount)}
                </span>
              </div>
            </div>
          </Card>
          
          {/* Gráficos de pronóstico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de pronóstico acumulado */}
            <ForecastChart pipelineId={pipelineId} />
            
            {/* Widget de cumplimiento de objetivos */}
            <GoalCompletionWidget pipelineId={pipelineId} />
            
            {/* Gráfico de distribución por etapas */}
            <ForecastByStageChart pipelineId={pipelineId} className="lg:col-span-2" />
          </div>
        </TabsContent>
        
        <TabsContent value="monthly" className="space-y-6">
          {/* Vista detallada por mes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {forecastData.map((month) => (
              <Card key={month.month} className="overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400 mr-2" />
                    <h3 className="font-medium text-gray-800 dark:text-gray-100">{month.monthName}</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{month.opportunityCount} oportunidades</span>
                  </div>
                </div>
                
                <div className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                      <BarChart3 className="w-5 h-5 text-blue-500 dark:text-blue-400 mr-2" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Total esperado
                      </span>
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">
                      {formatCurrency(month.totalValue)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <BarChart3 className="w-5 h-5 text-green-500 dark:text-green-400 mr-2" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Ponderado por probabilidad
                      </span>
                    </div>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(month.weightedValue)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Oportunidades destacadas:
                  </h4>
                  
                  <div className="space-y-2">
                    {month.opportunities.slice(0, 3).map((opp) => (
                      <div 
                        key={opp.id}
                        className="flex justify-between items-center p-2 rounded-md bg-white dark:bg-gray-800 text-sm border border-gray-100 dark:border-gray-700"
                      >
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{opp.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {opp.customer_name} · {opp.stage_name} ({Math.round(opp.probabilityPercent)}%)
                          </div>
                        </div>
                        <div className="font-medium text-gray-800 dark:text-gray-200">
                          {formatCurrency(opp.amount)}
                        </div>
                      </div>
                    ))}
                    
                    {month.opportunities.length > 3 && (
                      <div className="text-xs text-center text-gray-500 dark:text-gray-400">
                        + {month.opportunities.length - 3} más
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ForecastView;
