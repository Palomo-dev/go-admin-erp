"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer } from 'recharts';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

interface WeightedFunnelChartProps {
  pipelineId: string;
  className?: string;
}

interface StageData {
  id: string;
  name: string;
  color: string;
  amount: number;
  weightedAmount: number;
  opportunityCount: number;
}

const WeightedFunnelChart: React.FC<WeightedFunnelChartProps> = ({ pipelineId, className }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stageData, setStageData] = useState<StageData[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [totalWeightedAmount, setTotalWeightedAmount] = useState(0);

  // Obtener el ID de organización usando la función canónica
  useEffect(() => {
    const orgId = getOrganizationIdFromContext();
    if (orgId) {
      setOrganizationId(orgId);
      return;
    }
    // Sin organización nadie apagaba el spinner y la tarjeta giraba sin fin.
    setLoading(false);
    setLoadError('No hay ninguna organización seleccionada.');
  }, []);

  // Cargar datos de etapas y oportunidades
  const fetchStageData = useCallback(async () => {
      if (!organizationId || !pipelineId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        // Primero obtener todas las etapas del pipeline para preservar el orden
        const { data: stagesData, error: stagesError } = await supabase
          .from('stages')
          .select('id, name, position, probability, color')
          .eq('pipeline_id', pipelineId)
          .order('position', { ascending: true });

        // Antes solo salía un toast y la tarjeta decía «No hay datos»: el
        // fallo de carga se confundía con un embudo vacío.
        if (stagesError) throw stagesError;

        // Obtener oportunidades asociadas al pipeline
        const { data: opportunitiesData, error: opportunitiesError } = await supabase
          .from('opportunities')
          .select(`
            id, amount, stage_id, status
          `)
          .eq('pipeline_id', pipelineId)
          .eq('organization_id', organizationId)
          .eq('status', 'open');

        if (opportunitiesError) throw opportunitiesError;

        // Procesar y agregar datos
        const processedData: StageData[] = [];
        let totalWeighted = 0;

        stagesData.forEach((stage) => {
          // Filtrar oportunidades por etapa
          const stageOpportunities = opportunitiesData.filter(
            (opp) => opp.stage_id === stage.id
          );

          // Calcular montos totales para esta etapa
          const totalAmount = stageOpportunities.reduce(
            (sum, opp) => sum + (parseFloat(opp.amount) || 0),
            0
          );

          const probability = parseFloat(stage.probability) || 0;
          const weightedAmount = totalAmount * (probability / 100);
          totalWeighted += weightedAmount;

          // Añadir datos de esta etapa
          processedData.push({
            id: stage.id,
            name: stage.name,
            color: stage.color || '#4f46e5',
            amount: totalAmount,
            weightedAmount: weightedAmount,
            opportunityCount: stageOpportunities.length
          });
        });

        setStageData(processedData);
        setTotalWeightedAmount(totalWeighted);
      } catch (error) {
        logError('[WeightedFunnelChart] cargar el embudo ponderado', error);
        setLoadError(describeError(error));
      } finally {
        setLoading(false);
      }
  }, [pipelineId, organizationId]);

  useEffect(() => {
    void fetchStageData();
  }, [fetchStageData]);

  // Datos para el gráfico de embudo
  const funnelData = stageData.map(stage => ({
    name: stage.name,
    value: stage.weightedAmount,
    fill: stage.color,
    amount: stage.amount,
    count: stage.opportunityCount
  }));

  // Renderizar cargando
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-4 min-h-[250px]">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // La carga falló: se explica y se ofrece reintentar.
  if (loadError) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <LoadErrorState
            title="No se pudo cargar el embudo ponderado"
            message={loadError}
            onRetry={() => void fetchStageData()}
            isRetrying={loading}
          />
        </CardContent>
      </Card>
    );
  }

  // Si no hay datos
  if (stageData.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[250px]">
          <Filter className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay datos para mostrar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Embudo Ponderado</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip 
                formatter={(value: number, name: string, props: any) => {
                  return [
                    <>
                      <div>
                        <p><strong>Monto total:</strong> {formatCurrency(props.payload.amount)}</p>
                        <p><strong>Monto ponderado:</strong> {formatCurrency(value)}</p>
                        <p><strong>Oportunidades:</strong> {props.payload.count}</p>
                      </div>
                    </>,
                    props.payload.name
                  ];
                }}
              />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive={true}
              >
                <LabelList 
                  position="right"
                  dataKey="name" 
                  fill="#666" 
                  stroke="none" 
                  fontSize={12}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center">
          <p className="text-sm text-muted-foreground">
            Total ponderado: <span className="font-medium">{formatCurrency(totalWeightedAmount)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeightedFunnelChart;
