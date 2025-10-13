"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/utils/Utils";
import { currencyService } from "@/lib/services/currencyService";
import { BarChart3, Calendar, LineChart, Filter } from "lucide-react";
import ForecastChart from "./ForecastChart";
import GoalCompletionWidget from "./GoalCompletionWidget";
import ForecastByStageChart from "./ForecastByStageChart";
import MonthlyForecastView from "./MonthlyForecastView";
import ForecastSidebar from "./ForecastSidebar";
import WeightedFunnelChart from "./WeightedFunnelChart";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { forecastRealTimeService } from "@/lib/services/forecastRealTimeService";

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
  currency: string; // Moneda de la oportunidad (ISO 4217)
  convertedAmount?: number; // Monto convertido a la moneda base
  expected_close_date: string;
  stage_id: string;
  stage_name?: string;
  probability: number; // Valor decimal (0-1)
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
  const [baseCurrency, setBaseCurrency] = useState<string>('USD');
  const [totalForecast, setTotalForecast] = useState({
    totalAmount: 0,
    weightedAmount: 0,
    opportunityCount: 0,
  });

  // Obtener el ID de la organización y la moneda base
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      const orgIdNum = Number(orgId);
      setOrganizationId(orgIdNum);
      
      // Cargar la moneda base de la organización
      const loadBaseCurrency = async () => {
        try {
          // Usamos un bloque try-catch más robusto
          if (!orgIdNum) {
            console.log("ID de organización no disponible, usando USD");
            setBaseCurrency("USD");
            return;
          }
          
          const baseCurrency = await currencyService.getBaseCurrency(orgIdNum);
          setBaseCurrency(baseCurrency);
          console.log(`Moneda base cargada: ${baseCurrency}`);
        } catch (error) {
          console.error("Error al cargar la moneda base:", error);
          setBaseCurrency("USD"); // Valor por defecto si hay error
        }
      };
      
      loadBaseCurrency();
    }
  }, []);

  // Función para cargar oportunidades (extraída para poder llamarla desde múltiples lugares)
  const loadOpportunities = async () => {
    if (!organizationId || !pipelineId) return;

    setLoading(true);

    try {
      // Cargar oportunidades con información de etapas para obtener probabilidades
      const { data, error } = await supabase
        .from("opportunities")
        .select(
          `
          id, name, amount, currency, expected_close_date, stage_id, status, customer_id,
          stages:stage_id(name, probability),
          customers:customer_id(full_name)
        `
        )
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

      // Procesar y agrupar oportunidades por mes (ahora es async)
      try {
        const processedData = await processOpportunitiesByMonth(data);
        setForecastData(processedData.monthData);
        setTotalForecast({
          totalAmount: processedData.totalAmount,
          weightedAmount: processedData.weightedAmount,
          opportunityCount: processedData.totalCount,
        });
      } catch (processingError) {
        console.error("Error al procesar y convertir montos:", processingError);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error al procesar datos de pronóstico:", error);
      setLoading(false);
    }
  };

  // Efecto para cargar datos iniciales y configurar suscripciones en tiempo real
  useEffect(() => {
    if (!organizationId || !pipelineId) return;
    
    // Inicializar el servicio de tiempo real
    forecastRealTimeService.initialize();
    
    // Suscribirse a cambios en el pipeline
    const unsubscribe = forecastRealTimeService.subscribeToPipelineChanges(
      pipelineId, 
      () => {
        // Recargar datos cuando ocurra un cambio
        loadOpportunities();
      }
    );

    // Carga inicial de datos
    loadOpportunities();
    
    // Limpiar suscripción al desmontar
    return () => {
      unsubscribe();
    };
  }, [pipelineId, organizationId]);

  // Procesar y agrupar oportunidades por mes
  const processOpportunitiesByMonth = async (data: any[]) => {
    const monthMap = new Map<string, ForecastMonth>();
    let totalAmount = 0;
    let weightedAmount = 0;
    let totalCount = 0;

    // Crear un grupo para oportunidades sin fecha
    const noDateKey = "sin-fecha";
    monthMap.set(noDateKey, {
      month: noDateKey,
      monthName: "Sin fecha",
      totalValue: 0,
      weightedValue: 0,
      opportunityCount: 0,
      opportunities: [],
    });

    // Procesar cada oportunidad con conversión de moneda
    for (const opp of data) {
      // Calcular monto ponderado usando la probabilidad de la etapa
      const probability = opp.stages ? Number(opp.stages.probability) / 100 : 0;
      
      // Extraer moneda y monto
      const originalAmount = Number(opp.amount) || 0;
      const currency = opp.currency || baseCurrency;
      
      // Convertir el monto a la moneda base si es necesario
      let convertedAmount = originalAmount;
      if (currency !== baseCurrency && organizationId) {
        try {
          convertedAmount = await currencyService.convertAmount(
            originalAmount,
            currency,
            baseCurrency,
            organizationId
          );
        } catch (error) {
          console.warn(`No se pudo convertir ${currency} a ${baseCurrency}:`, error);
        }
      }
      
      // Usar el monto convertido para cálculos
      const weightedAmountForOpp = convertedAmount * probability;

      totalAmount += convertedAmount;
      weightedAmount += weightedAmountForOpp;
      totalCount++;

      // Extraer información de etapa y cliente
      const stageName = opp.stages?.name || "Sin etapa";
      const probabilityPercent = probability * 100; // Convertir a porcentaje para mostrar
      const customerName = opp.customers?.full_name || "Sin cliente";
      const opportunity: Opportunity = {
        id: opp.id,
        name: opp.name,
        amount: originalAmount,
        currency: currency,
        convertedAmount: convertedAmount,
        expected_close_date: opp.expected_close_date,
        stage_id: opp.stage_id,
        stage_name: stageName,
        probability: probability,
        probabilityPercent: probabilityPercent,
        customer_name: customerName,
        status: opp.status,
      };

      let key;
      let monthName;

      // Verificar si tiene fecha de cierre esperada
      if (!opp.expected_close_date) {
        // Sin fecha, agregarlo al grupo especial
        key = noDateKey;
        monthName = "Sin fecha";
      } else {
        // Con fecha, procesar normalmente
        const closeDate = new Date(opp.expected_close_date);
        const year = closeDate.getFullYear();
        const month = closeDate.getMonth(); // 0-indexed para arrays
        const monthNames = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Septiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];

        key = `${year}-${String(month + 1).padStart(2, "0")}`;
        monthName = `${monthNames[month]} ${year}`;
      }

      // Actualizar o crear el grupo del mes
      if (monthMap.has(key)) {
        const monthData = monthMap.get(key)!;
        monthData.totalValue += convertedAmount;
        monthData.weightedValue += weightedAmountForOpp;
        monthData.opportunityCount++;
        monthData.opportunities.push(opportunity);
      } else {
        monthMap.set(key, {
          month: key,
          monthName: monthName,
          totalValue: convertedAmount,
          weightedValue: weightedAmountForOpp,
          opportunityCount: 1,
          opportunities: [opportunity],
        });
      }
    } // Cierre correcto del bucle for

    // Convertir el mapa a un array ordenado por mes
    const monthData = Array.from(monthMap.values()).sort((a, b) => {
      // Colocar "Sin fecha" al final
      if (a.month === noDateKey) return 1;
      if (b.month === noDateKey) return -1;
      // Ordenar el resto cronológicamente
      return new Date(a.month).getTime() - new Date(b.month).getTime();
    });

    // Eliminar el grupo "Sin fecha" si está vacío
    if (
      monthData.length > 0 &&
      monthData[monthData.length - 1].month === noDateKey &&
      monthData[monthData.length - 1].opportunityCount === 0
    ) {
      monthData.pop();
    }

    return { monthData, totalAmount, weightedAmount, totalCount };
  };

  // Renderizar el esqueleto de carga
  if (loading) {
    return (
      <div className="p-3 sm:p-4">
        <div className="flex flex-col justify-center items-center h-40 gap-3">
          <LoadingSpinner size="lg" className="text-blue-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Cargando pronóstico...</span>
        </div>
      </div>
    );
  }

  // Si no hay datos de pronóstico
  if (forecastData.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <Card className="p-6 sm:p-8 text-center bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
            No hay datos de pronóstico disponibles
          </h3>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            No se encontraron oportunidades en este pipeline. Añade
            oportunidades para ver un pronóstico mensual.
          </p>
        </Card>
      </div>
    );
  }

  // Renderizar el pronóstico
  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
      {/* Sidebar de pronóstico - siempre visible */}
      <ForecastSidebar pipelineId={pipelineId} />
      
      <div className="flex-1 space-y-4">
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
            <TabsTrigger value="chart" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">
              <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Gráfico de pronóstico</span>
              <span className="sm:hidden">Gráfico</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">
              <LineChart className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Pronóstico Mensual</span>
              <span className="sm:hidden">Mensual</span>
            </TabsTrigger>
            <TabsTrigger value="table" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">
              <Calendar className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Tabla de oportunidades</span>
              <span className="sm:hidden">Tabla</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-3 sm:space-y-4">
            <ForecastChart pipelineId={pipelineId} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <ForecastByStageChart pipelineId={pipelineId} />
              <GoalCompletionWidget pipelineId={pipelineId} />
            </div>
            <div className="mt-3 sm:mt-4">
              <WeightedFunnelChart pipelineId={pipelineId} />
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-4">
            <MonthlyForecastView pipelineId={pipelineId} />
          </TabsContent>

          <TabsContent value="table" className="space-y-4">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">Oportunidades por mes</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden sm:table-cell">
                        Cliente
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden md:table-cell">
                        Fecha esperada
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider hidden lg:table-cell">
                        Etapa
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="p-2 sm:p-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                        Prob.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {forecastData.flatMap((month) =>
                      month.opportunities.map((opp) => (
                        <tr
                          key={opp.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                            <div className="flex flex-col">
                              <span className="font-medium">{opp.name}</span>
                              <span className="sm:hidden text-gray-600 dark:text-gray-400 text-xs mt-1">{opp.customer_name}</span>
                            </div>
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">{opp.customer_name}</td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
                            {opp.expected_close_date
                              ? new Date(
                                  opp.expected_close_date
                                ).toLocaleDateString()
                              : "Sin fecha"}
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">{opp.stage_name}</td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {opp.currency === baseCurrency ? 
                              formatCurrency(opp.convertedAmount || opp.amount, baseCurrency) :
                              <>
                                <div>{formatCurrency(opp.amount, opp.currency)}</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  ({formatCurrency(opp.convertedAmount || opp.amount, baseCurrency)})
                                </div>
                              </>
                            }
                          </td>
                          <td className="p-2 sm:p-3 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                            {Math.round(opp.probabilityPercent)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                    <tr>
                      <td
                        colSpan={4}
                        className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-right text-gray-900 dark:text-gray-100"
                      >
                        Total:
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(totalForecast.totalAmount, baseCurrency)}
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm"></td>
                    </tr>
                    <tr>
                      <td
                        colSpan={4}
                        className="p-2 sm:p-3 text-xs sm:text-sm font-semibold text-right text-gray-900 dark:text-gray-100"
                      >
                        Total ponderado:
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(totalForecast.weightedAmount, baseCurrency)}
                      </td>
                      <td className="p-2 sm:p-3 text-xs sm:text-sm"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ForecastView;
