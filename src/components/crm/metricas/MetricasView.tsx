'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/utils/Utils';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Target,
  BarChart3,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  commercialMetricsService,
  type CommercialMetrics,
  type VendorBreakdown,
  type FunnelMetrics,
  type Period,
} from '@/lib/services/crm/commercialMetricsService';

const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  ytd: 'Año actual',
  all: 'Todo el histórico',
};

export function MetricasView() {
  const [period, setPeriod] = useState<Period>('30d');
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [vendors, setVendors] = useState<VendorBreakdown[]>([]);
  const [funnel, setFunnel] = useState<FunnelMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, v, f] = await Promise.all([
        commercialMetricsService.getMetrics(period),
        commercialMetricsService.getVendorBreakdown(period),
        commercialMetricsService.getFunnelMetrics(),
      ]);
      setMetrics(m);
      setVendors(v);
      setFunnel(f);
    } catch (err) {
      console.error('Error cargando métricas:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxCount = funnel ? Math.max(...funnel.stages.map((s) => s.current_count), 1) : 1;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Métricas Comerciales
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            KPIs avanzados · Funnel · Vendedores · Proyección
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Win Rate */}
          <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Win Rate</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.win_rate}%
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {metrics.total_won} ganadas / {metrics.total_lost} perdidas
            </div>
          </Card>

          {/* Cycle Length */}
          <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Ciclo de venta</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.cycle_length_days}d
            </div>
            <div className="text-xs text-gray-400 mt-1">Tiempo medio de cierre</div>
          </Card>

          {/* ARPA */}
          <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">ARPA</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(metrics.arpa, 'COP')}
            </div>
            <div className="text-xs text-gray-400 mt-1">Ingreso promedio por cuenta</div>
          </Card>

          {/* Pipeline Coverage */}
          <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Pipeline Coverage</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.pipeline_coverage}x
            </div>
            <div className="text-xs text-gray-400 mt-1">Open / Won ratio</div>
          </Card>
        </div>
      ) : null}

      {/* Resumen adicional */}
      {metrics && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Oportunidades abiertas</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              {metrics.total_open}
            </div>
          </Card>
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Monto abierto</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
              {formatCurrency(metrics.total_open_amount, 'COP')}
            </div>
          </Card>
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Monto ganado</div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400 mt-0.5">
              {formatCurrency(metrics.total_won_amount, 'COP')}
            </div>
          </Card>
          <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">Proyección (forecast)</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              {formatCurrency(metrics.projection, 'COP')}
            </div>
          </Card>
        </div>
      )}

      {/* Funnel */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Funnel de conversión</h3>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : funnel && funnel.stages.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">Conversión global</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {funnel.overall_conversion}%
                </div>
              </Card>
              <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total pipeline</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {formatCurrency(funnel.total_pipeline, 'COP')}
                </div>
              </Card>
              <Card className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">Forecast ponderado</div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatCurrency(funnel.forecast, 'COP')}
                </div>
              </Card>
            </div>

            <div className="space-y-2">
              {funnel.stages.map((stage, index) => {
                const widthPercent = (stage.current_count / maxCount) * 100;
                const isBottleneck = stage.bottleneck_score > 1.5;
                const prevStage = index > 0 ? funnel.stages[index - 1] : null;
                const stageConversion =
                  prevStage && prevStage.current_count > 0
                    ? (stage.current_count / prevStage.current_count) * 100
                    : 100;

                return (
                  <Card
                    key={stage.stage_id}
                    className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
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
                          {stage.probability}% prob.
                        </div>
                      </div>
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
                          Cuello de botella
                        </Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay datos de funnel disponibles.
            </p>
          </div>
        )}
      </div>

      {/* Vendedores */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Dashboard por vendedor
          </h3>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : vendors.length > 0 ? (
          <div className="space-y-2">
            {vendors.map((v) => (
              <Card
                key={v.salesperson_id}
                className="p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {v.salesperson_name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{v.open_count} abiertas</span>
                      <span className="text-green-600 dark:text-green-400">{v.won_count} ganadas</span>
                      <span className="text-red-500">{v.lost_count} perdidas</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(v.won_amount, 'COP')}
                    </div>
                    <Badge
                      className={`mt-1 ${
                        v.win_rate >= 50
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : v.win_rate >= 25
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}
                    >
                      {v.win_rate}% cierre
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay datos de vendedores para este periodo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
