"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { forecastRealTimeService } from '@/lib/services/forecastRealTimeService';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import { ArrowUpRight, ArrowDownRight, LineChart, TrendingUp, ChevronRight, RefreshCw } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { toast } from '@/components/ui/use-toast';
import { useTheme } from 'next-themes';
// No se necesita importar realtime por separado

interface ForecastSidebarProps {
  pipelineId: string;
  showDetailed?: boolean;
}

interface Stage {
  name: string;
  probability: number;
}

interface Opportunity {
  id: string;
  name: string;
  amount: number;
  expected_close_date: string | null;
  status: 'open' | 'won' | 'lost';
  stage_id: string;
  created_at: string;
  updated_at: string;
  stages: Stage | null;
}

interface ForecastSummary {
  totalAmount: number;
  weightedAmount: number;
  openOpportunities: number;
  wonOpportunities: number;
  lostOpportunities: number;
  averageAmount: number;
  conversionRate: number;
  baseCurrency: string;
  lastMonthComparison: {
    totalAmount: number;
    weightedAmount: number;
    percentageChange: number;
  };
}

const ForecastSidebar: React.FC<ForecastSidebarProps> = ({ pipelineId, showDetailed = true }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState<ForecastSummary | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Obtener el ID de organización del almacenamiento local
  useEffect(() => {
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
  }, []);

  // Cargar datos de pronóstico
  useEffect(() => {
    const loadForecastData = async () => {
      if (!organizationId || !pipelineId) return;

      setLoading(true);
      try {
        // Obtener oportunidades del pipeline
        const { data: opportunities, error: opportunitiesError } = await supabase
          .from('opportunities')
          .select(`
            id, 
            name, 
            amount, 
            expected_close_date,
            status,
            stage_id,
            created_at,
            updated_at,
            stages:stage_id (name, probability)
          `)
          .eq('pipeline_id', pipelineId)
          .eq('organization_id', organizationId) as { data: Opportunity[] | null, error: any };

        if (opportunitiesError) {
          toast({
            title: "Error",
            description: "Error al cargar datos de pronóstico",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Calcular métricas de pronóstico
        const baseCurrency = "COP"; // Usar moneda base predeterminada
        let totalAmount = 0;
        let weightedAmount = 0;
        let openCount = 0;
        let wonCount = 0;
        let lostCount = 0;
        
        // Datos del mes actual
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        // Datos del mes pasado para comparación
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const lastMonth = lastMonthDate.getMonth();
        const lastMonthYear = lastMonthDate.getFullYear();
        
        let lastMonthTotal = 0;
        let lastMonthWeighted = 0;

        opportunities?.forEach(opp => {
          const amount = Number(opp.amount) || 0;
          // Manejar correctamente el acceso a la propiedad probability
          const probability = opp.stages && typeof opp.stages === 'object' ? (Number(opp.stages.probability) / 100) : 0;
          const weightedAmountForOpp = amount * probability;
          
          // Fecha esperada de cierre
          const closeDate = opp.expected_close_date ? new Date(opp.expected_close_date) : null;
          const closeMonth = closeDate?.getMonth();
          const closeYear = closeDate?.getFullYear();
          
          // Contar por estado
          if (opp.status === 'open') {
            openCount++;
            totalAmount += amount;
            weightedAmount += weightedAmountForOpp;
            
            // Comparar con el mes pasado - con verificación adicional de valores undefined
            if (closeDate && typeof closeYear === 'number' && closeYear === currentYear && 
                typeof closeMonth === 'number' && closeMonth === currentMonth) {
              // Oportunidad de este mes
            } else if (closeDate && typeof closeYear === 'number' && typeof closeMonth === 'number' && 
                      (closeYear < lastMonthYear || (closeYear === lastMonthYear && closeMonth <= lastMonth))) {
              // Oportunidad del mes pasado o anterior
              lastMonthTotal += amount;
              lastMonthWeighted += weightedAmountForOpp;
            }
          } else if (opp.status === 'won') {
            wonCount++;
          } else if (opp.status === 'lost') {
            lostCount++;
          }
        });
        
        // Calcular porcentaje de cambio
        const percentageChange = lastMonthWeighted > 0 
          ? ((weightedAmount - lastMonthWeighted) / lastMonthWeighted) * 100
          : 0;
        
        // Calcular tasa de conversión
        const totalOpportunities = openCount + wonCount + lostCount;
        const conversionRate = totalOpportunities > 0 ? (wonCount / totalOpportunities) * 100 : 0;
        
        // Calcular monto promedio
        const averageAmount = openCount > 0 ? totalAmount / openCount : 0;

        setForecastData({
          totalAmount,
          weightedAmount,
          openOpportunities: openCount,
          wonOpportunities: wonCount,
          lostOpportunities: lostCount,
          averageAmount,
          conversionRate,
          baseCurrency,
          lastMonthComparison: {
            totalAmount: lastMonthTotal,
            weightedAmount: lastMonthWeighted,
            percentageChange
          }
        });
      } catch (error) {
        console.error('Error al procesar datos de pronóstico:', error);
      } finally {
        setLoading(false);
      }
    };

    loadForecastData();
  }, [pipelineId, organizationId, refreshTrigger]);

  // Suscribirse a cambios en tiempo real
  useEffect(() => {
    if (!pipelineId) return;
    
    // Inicializar el servicio de tiempo real
    forecastRealTimeService.initialize();
    
    // Suscribirse a cambios en el pipeline específico
    const unsubscribe = forecastRealTimeService.subscribeToPipelineChanges(
      pipelineId,
      () => {
        // Actualizar el trigger para recargar datos
        setRefreshTrigger(prev => prev + 1);
      }
    );
    
    return () => {
      // Limpiar la suscripción al desmontar el componente
      unsubscribe();
    };
  }, [pipelineId]);

  // Función para actualización manual
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Renderizar cargando
  if (loading) {
    return (
      <Card className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-6 flex flex-col justify-center items-center min-h-[200px] gap-3">
          <LoadingSpinner />
          <span className="text-sm text-gray-600 dark:text-gray-400">Cargando pronóstico...</span>
        </CardContent>
      </Card>
    );
  }

  // Si no hay datos
  if (!forecastData) {
    return (
      <Card className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-6 text-center">
          <TrendingUp className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No hay datos de pronóstico disponibles</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="bg-gray-50 dark:bg-gray-900/50 pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold flex items-center text-gray-900 dark:text-gray-100">
            <LineChart className="h-5 w-5 mr-2 text-blue-500 dark:text-blue-400" />
            Pronóstico
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="h-8 w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only">Actualizar</span>
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        {/* Totales principales */}
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total ponderado</p>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(forecastData.weightedAmount, forecastData.baseCurrency)}
              </h3>
              
              {forecastData.lastMonthComparison.percentageChange !== 0 && (
                <Badge className={`flex items-center ${
                  forecastData.lastMonthComparison.percentageChange > 0 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {forecastData.lastMonthComparison.percentageChange > 0 
                    ? <ArrowUpRight className="h-3 w-3 mr-1" /> 
                    : <ArrowDownRight className="h-3 w-3 mr-1" />
                  }
                  {Math.abs(forecastData.lastMonthComparison.percentageChange).toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Total bruto: {formatCurrency(forecastData.totalAmount, forecastData.baseCurrency)}
            </p>
          </div>
          
          {showDetailed && (
            <>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Oportunidades</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{forecastData.openOpportunities}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Promedio</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(forecastData.averageAmount, forecastData.baseCurrency)}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Tasa conversión</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{forecastData.conversionRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ganadas</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{forecastData.wonOpportunities}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="bg-gray-50 dark:bg-gray-900/30 py-2 px-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="ghost" size="sm" className="w-full h-8 justify-between text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
          <span className="text-xs">Ver detalles</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ForecastSidebar;
