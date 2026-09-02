'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';
import { Filter, TrendingDown, Clock, AlertTriangle } from 'lucide-react';

interface FunnelViewProps {
  pipelineId?: string;
}

interface StageMetrics {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  position: number;
  probability: number;
  current_count: number;
  current_amount: number;
  entered_count: number;
  exited_count: number;
  conversion_rate: number; // exited / entered
  avg_days_in_stage: number;
  bottleneck_score: number; // avg_days / sla_days
}

/**
 * Vista de Funnel real con métricas de opportunity_stage_history.
 * Muestra conversión por etapa, tiempo medio y cuellos de botella.
 *
 * Tabla: opportunity_stage_history (opportunity_id, stage_id, entered_at, exited_at)
 */
export function FunnelView({ pipelineId }: FunnelViewProps) {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageMetrics[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string | undefined>(pipelineId);

  const loadPipelines = useCallback(async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;

    const { data } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name');

    setPipelines((data as { id: string; name: string }[]) || []);
    if (!selectedPipeline && data && data.length > 0) {
      setSelectedPipeline((data[0] as { id: string }).id);
    }
  }, [selectedPipeline]);

  const loadFunnelData = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = getOrganizationId();
      if (!orgId) {
        setLoading(false);
        return;
      }

      // 1. Obtener etapas del pipeline
      let stageQuery = supabase
        .from('stages')
        .select('id, name, color, position, probability, sla_days, pipeline_id')
        .order('position');

      if (selectedPipeline) {
        stageQuery = stageQuery.eq('pipeline_id', selectedPipeline);
      }

      const { data: stageData, error: stageError } = await stageQuery;

      if (stageError || !stageData || stageData.length === 0) {
        setStages([]);
        setLoading(false);
        return;
      }

      const stageIds = stageData.map((s) => (s as { id: string }).id);

      // 2. Obtener oportunidades actuales agrupadas por etapa
      const { data: oppData } = await supabase
        .from('opportunities')
        .select('stage_id, status, amount, currency')
        .eq('organization_id', orgId)
        .in('stage_id', stageIds);

      // Agrupar por stage
      const currentByStage: Record<string, { count: number; amount: number }> = {};
      for (const opp of (oppData || []) as Array<Record<string, unknown>>) {
        const sid = opp.stage_id as string;
        if (!currentByStage[sid]) currentByStage[sid] = { count: 0, amount: 0 };
        currentByStage[sid].count++;
        currentByStage[sid].amount += (opp.amount as number) || 0;
      }

      // 3. Intentar consultar opportunity_stage_history
      // Si la tabla no existe, usar updated_at de opportunities como aproximación
      let historyData: Array<Record<string, unknown>> = [];
      try {
        const { data: histData, error: histError } = await supabase
          .from('opportunity_stage_history')
          .select('opportunity_id, stage_id, entered_at, exited_at')
          .in('stage_id', stageIds);

        if (!histError && histData) {
          historyData = histData as Array<Record<string, unknown>>;
        }
      } catch {
        // Tabla no existe aún — usar aproximación
      }

      // 4. Calcular métricas por etapa
      const metrics: StageMetrics[] = stageData.map((stageRow) => {
        const stage = stageRow as {
          id: string;
          name: string;
          color: string;
          position: number;
          probability: number;
          sla_days: number | null;
        };

        const current = currentByStage[stage.id] || { count: 0, amount: 0 };

        // Filtrar historial de esta etapa
        const stageHistory = historyData.filter((h) => h.stage_id === stage.id);
        const enteredCount = stageHistory.length;
        const exitedCount = stageHistory.filter((h) => h.exited_at !== null).length;

        // Conversión: exited / entered
        const conversionRate = enteredCount > 0 ? (exitedCount / enteredCount) * 100 : 0;

        // Tiempo medio en etapa (días)
        let totalDays = 0;
        let completedEntries = 0;
        for (const h of stageHistory) {
          const enteredAt = h.entered_at as string;
          const exitedAt = h.exited_at as string | null;
          if (enteredAt && exitedAt) {
            totalDays += Math.floor(
              (new Date(exitedAt).getTime() - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            completedEntries++;
          }
        }
        const avgDaysInStage = completedEntries > 0 ? Math.round(totalDays / completedEntries) : 0;

        // Bottleneck score: avg_days / sla_days
        const slaDays = stage.sla_days;
        const bottleneckScore = slaDays && avgDaysInStage > 0 ? avgDaysInStage / slaDays : 0;

        return {
          stage_id: stage.id,
          stage_name: stage.name,
          stage_color: stage.color,
          position: stage.position,
          probability: stage.probability,
          current_count: current.count,
          current_amount: current.amount,
          entered_count: enteredCount,
          exited_count: exitedCount,
          conversion_rate: conversionRate,
          avg_days_in_stage: avgDaysInStage,
          bottleneck_score: bottleneckScore,
        };
      });

      setStages(metrics);
    } catch (err) {
      console.error('Error cargando funnel:', err);
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPipeline]);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    loadFunnelData();
  }, [loadFunnelData]);

  // Calcular totales para el funnel
  const maxCount = Math.max(...stages.map((s) => s.current_count), 1);
  const totalEntered = stages.reduce((sum, s) => sum + s.entered_count, 0);
  const totalExited = stages.reduce((sum, s) => sum + s.exited_count, 0);
  const overallConversion = totalEntered > 0 ? (totalExited / totalEntered) * 100 : 0;

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Funnel
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Conversión por etapa · Tiempo medio · Cuellos de botella
          </p>
        </div>
        {pipelines.length > 0 && (
          <select
            value={selectedPipeline || ''}
            onChange={(e) => setSelectedPipeline(e.target.value || undefined)}
            className="text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-gray-700 dark:text-gray-300"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPIs globales */}
      {!loading && stages.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Conversión global</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              {overallConversion.toFixed(1)}%
            </div>
          </Card>
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Oportunidades activas</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              {stages.reduce((sum, s) => sum + s.current_count, 0)}
            </div>
          </Card>
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Valor pipeline</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              {formatCurrency(
                stages.reduce((sum, s) => sum + s.current_amount, 0),
                'COP'
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Funnel visual */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Filter className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay datos de funnel para este pipeline.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, index) => {
            const widthPercent = (stage.current_count / maxCount) * 100;
            const isBottleneck = stage.bottleneck_score > 1.5;
            const prevStage = index > 0 ? stages[index - 1] : null;
            const stageConversion =
              prevStage && prevStage.current_count > 0
                ? (stage.current_count / prevStage.current_count) * 100
                : 100;

            return (
              <Card
                key={stage.stage_id}
                className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              >
                {/* Barra del funnel */}
                <div className="flex items-center gap-3">
                  {/* Etiqueta etapa */}
                  <div className="w-32 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: stage.stage_color }}
                      />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                        {stage.stage_name}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {Math.round(Number(stage.probability))}% prob.
                    </div>
                  </div>

                  {/* Barra visual */}
                  <div className="flex-1 relative">
                    <div
                      className="h-8 rounded-md flex items-center px-3 transition-all"
                      style={{
                        width: `${Math.max(widthPercent, 15)}%`,
                        backgroundColor: `${stage.stage_color}33`,
                        borderLeft: `3px solid ${stage.stage_color}`,
                      }}
                    >
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {stage.current_count} · {formatCurrency(stage.current_amount, 'COP')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Métricas debajo */}
                <div className="flex items-center gap-3 mt-2 pl-32 flex-wrap">
                  {prevStage && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <TrendingDown className="h-3 w-3" />
                      Conv: {stageConversion.toFixed(0)}%
                    </div>
                  )}
                  {stage.avg_days_in_stage > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      {stage.avg_days_in_stage}d promedio
                    </div>
                  )}
                  {isBottleneck && (
                    <Badge className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      Cuello de botella
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
