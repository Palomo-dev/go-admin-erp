'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  RefreshCw,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { useTranslations, useLocale } from 'next-intl';
import type {
  DashboardKPIData,
  PeriodoDashboard,
  HorasDashboard,
  PuntoHora,
  PuntoDiaMes,
} from './inicioService';
import { inicioService } from './inicioService';
import { useLiveVisitors } from './useLiveVisitors';
import { useDashboardRealtime } from './useDashboardRealtime';
import { cn } from '@/utils/Utils';
import type { KpiConfigItem } from './DashboardKPIs';

// ─── Etiquetas y colores (espejo de DashboardKPIs para el modal) ──────────────

const periodoLabel: Record<PeriodoDashboard, string> = {
  hoy: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  año: 'Año',
};

const colorStrokeMap: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  cyan: '#06b6d4',
  indigo: '#6366f1',
  teal: '#14b8a6',
  red: '#ef4444',
  pink: '#ec4899',
  amber: '#f59e0b',
};

const colorTextMap: Record<string, string> = {
  blue: 'text-blue-700 dark:text-blue-300',
  green: 'text-green-700 dark:text-green-300',
  purple: 'text-purple-700 dark:text-purple-300',
  orange: 'text-orange-700 dark:text-orange-300',
  cyan: 'text-cyan-700 dark:text-cyan-300',
  indigo: 'text-indigo-700 dark:text-indigo-300',
  teal: 'text-teal-700 dark:text-teal-300',
  red: 'text-red-700 dark:text-red-300',
  pink: 'text-pink-700 dark:text-pink-300',
  amber: 'text-amber-700 dark:text-amber-300',
};

const colorBgMap: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-900/20',
  green: 'bg-green-50 dark:bg-green-900/20',
  purple: 'bg-purple-50 dark:bg-purple-900/20',
  orange: 'bg-orange-50 dark:bg-orange-900/20',
  cyan: 'bg-cyan-50 dark:bg-cyan-900/20',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/20',
  teal: 'bg-teal-50 dark:bg-teal-900/20',
  red: 'bg-red-50 dark:bg-red-900/20',
  pink: 'bg-pink-50 dark:bg-pink-900/20',
  amber: 'bg-amber-50 dark:bg-amber-900/20',
};

const colorIconMap: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  purple: 'text-purple-600 dark:text-purple-400',
  orange: 'text-orange-600 dark:text-orange-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  teal: 'text-teal-600 dark:text-teal-400',
  red: 'text-red-600 dark:text-red-400',
  pink: 'text-pink-600 dark:text-pink-400',
  amber: 'text-amber-600 dark:text-amber-400',
};

// ─── Tooltip enriquecido para la gráfica grande ──────────────────────────────

interface LargeTooltipProps {
  active?: boolean;
  payload?: { value: number; dataKey: string; payload: { hora?: number; dia?: number } }[];
  xLabel: string;
  fmtX: (n: number) => string;
  formatValue: (n: number) => string;
  seriesLabels: Record<string, string>;
  seriesColors: Record<string, string>;
}

function LargeChartTooltip({
  active,
  payload,
  xLabel,
  fmtX,
  formatValue,
  seriesLabels,
  seriesColors,
}: LargeTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const x = payload[0]?.payload?.hora ?? payload[0]?.payload?.dia ?? 0;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
      <div className="font-semibold text-gray-500 dark:text-gray-400">
        {xLabel} {fmtX(x)}
      </div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: seriesColors[item.dataKey] }}
          />
          <span className="text-gray-700 dark:text-gray-200">
            {seriesLabels[item.dataKey] ?? item.dataKey}: {formatValue(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

interface KpiDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KpiConfigItem | null;
  periodo: PeriodoDashboard;
  horas: HorasDashboard | null | undefined;
  organizationId: number | null | undefined;
  // Datos iniciales (los que ya tiene el dashboard) para mostrar al instante
  initialData: DashboardKPIData | null;
}

export function KpiDetailDialog({
  open,
  onOpenChange,
  kpi,
  periodo,
  horas,
  organizationId,
  initialData,
}: KpiDetailDialogProps) {
  const router = useRouter();
  const t = useTranslations('home.kpis');
  const locale = useLocale();
  const [data, setData] = useState<DashboardKPIData | null>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Filtro de estado para el diálogo de Compras Web: todos | pedidos | pagados | cancelados
  type FiltroCompras = 'todos' | 'pedidos' | 'pagados' | 'cancelados';
  const [filtroCompras, setFiltroCompras] = useState<FiltroCompras>('todos');

  // Visitantes en vivo (solo para visitasWeb)
  const { liveCount, isActive } = useLiveVisitors(open ? organizationId : null);

  // Cargar datos frescos al abrir el dialog
  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setIsRefreshing(true);
    try {
      const dashboardData = await inicioService.getDashboardData(organizationId, periodo, horas);
      setData(dashboardData.kpis);
    } catch (err) {
      console.error('Error refrescando KPI:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [organizationId, periodo, horas]);

  // Carga inicial al abrir
  useEffect(() => {
    if (open && organizationId) {
      setData(initialData);
      setFiltroCompras('todos');
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  // Actualización en tiempo real (Realtime + auto-refresh 30s) solo cuando está abierto
  useDashboardRealtime(organizationId, periodo, horas, loadData, open);

  if (!kpi) return null;

  const colors = {
    stroke: colorStrokeMap[kpi.color] || colorStrokeMap.blue,
    text: colorTextMap[kpi.color] || colorTextMap.blue,
    bg: colorBgMap[kpi.color] || colorBgMap.blue,
    icon: colorIconMap[kpi.color] || colorIconMap.blue,
  };
  const Icon = kpi.icon;
  const value = data ? (data[kpi.key] as number) : 0;
  const isLiveVisits = kpi.key === 'visitasWeb' && periodo === 'hoy';

  // Determinar el modo de gráfica (igual que la card):
  // - horaria: KPIs dinámicos (no useMonthLabel) con período 'hoy'
  // - periodo: KPIs dinámicos (no useMonthLabel) con período != 'hoy'
  // - mensual: KPIs no dinámicos o useMonthLabel (ventasMes) — siempre serie del mes
  const chartMode: 'horaria' | 'periodo' | 'mensual' = kpi.dynamicLabel && !kpi.useMonthLabel
    ? (periodo === 'hoy' ? 'horaria' : 'periodo')
    : 'mensual';

  // Etiqueta dinámica
  const baseLabel = t(kpi.labelKey);
  let label = baseLabel;
  if (kpi.useMonthLabel && data?.mesActualNumero && data?.anioActual) {
    const nombreMes = new Date(data.anioActual, data.mesActualNumero - 1)
      .toLocaleDateString(locale, { month: 'long' });
    label = baseLabel.replace(/\s*30\s+\S+$/i, ` ${nombreMes}`);
  } else if (kpi.dynamicLabel) {
    label = baseLabel.replace(/Hoy$/i, periodoLabel[periodo]);
  }

  // Delta % vs período anterior (mismo cálculo que la card)
  let deltaPct: number | null = null;
  let anteriorValue: number | null = null;
  if (kpi.deltaKey && data && data[kpi.deltaKey] !== undefined) {
    const anterior = data[kpi.deltaKey] as number;
    anteriorValue = anterior;
    if (anterior > 0) {
      deltaPct = ((value - anterior) / anterior) * 100;
    } else if (value > 0) {
      deltaPct = 100;
    }
  }
  const hasDelta = deltaPct !== null;
  const isPositive = hasDelta && deltaPct! >= 0;
  const fmtVal = kpi.isCurrency ? formatCurrency : (n: number) => n.toLocaleString(locale);

  // ─── Datos para la gráfica grande ──────────────────────────────────────────
  const chartData = buildChartData(kpi, data, periodo);
  let seriesLabels = getSeriesLabels(kpi, periodo);
  let seriesColors = getSeriesColors(kpi, periodo);

  // Filtrar series de Compras Web según el filtro de estado seleccionado
  if (kpi.key === 'comprasWeb' && filtroCompras !== 'todos') {
    const claveFiltro = filtroCompras === 'pedidos'
      ? 'Pedidos'
      : filtroCompras === 'pagados'
        ? 'Pagados'
        : 'Cancelados';
    seriesLabels = Object.fromEntries(
      Object.entries(seriesLabels).filter(([k]) => k.includes(claveFiltro)),
    );
    seriesColors = Object.fromEntries(
      Object.entries(seriesColors).filter(([k]) => k.includes(claveFiltro)),
    );
  }

  const xLabel = chartMode === 'horaria' ? 'Hora' : 'Día';
  const fmtX = (n: number) => (chartMode === 'horaria' ? `${n}h` : `${n}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('p-2.5 rounded-lg', colors.bg)}>
              <Icon className={cn('h-6 w-6', colors.icon)} />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{label}</DialogTitle>
              <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
                {chartMode === 'mensual' && data?.mesActualNumero && data?.anioActual
                  ? new Date(data.anioActual, data.mesActualNumero - 1)
                      .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
                  : periodoLabel[periodo]}
                {isRefreshing && (
                  <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Actualizando...
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Resumen del KPI */}
        <div className="flex flex-wrap items-center gap-4 py-2">
          <div>
            <p className={cn('text-3xl font-bold', colors.text)}>
              {kpi.isCurrency ? formatCurrency(value) : value.toLocaleString(locale)}
            </p>
          </div>
          {isLiveVisits && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <span className="relative flex h-2.5 w-2.5">
                {isActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                )}
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                {liveCount} {liveCount === 1 ? t('liveVisitor') : t('liveVisitors')}
              </span>
            </span>
          )}
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
                isPositive
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
              )}
            >
              {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {isPositive ? '+' : ''}{deltaPct!.toFixed(1)}%
            </span>
          )}
          {anteriorValue !== null && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              vs {fmtVal(anteriorValue)} período anterior
            </span>
          )}
        </div>

        {/* Desglose de compras web por estado — clicable para filtrar la gráfica */}
        {kpi.hasDesglose && data && (
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <button
              type="button"
              onClick={() => setFiltroCompras('todos')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
                filtroCompras === 'todos'
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroCompras('pedidos')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
                filtroCompras === 'pedidos'
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              {data.comprasWebPendientes} {t('pending')}
            </button>
            <button
              type="button"
              onClick={() => setFiltroCompras('pagados')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
                filtroCompras === 'pagados'
                  ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              {data.comprasWebPagadas} {t('paid')}
            </button>
            <button
              type="button"
              onClick={() => setFiltroCompras('cancelados')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors',
                filtroCompras === 'cancelados'
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              {data.comprasWebCanceladas} {t('cancelled')}
            </button>
          </div>
        )}

        {/* Gráfica ampliada */}
        <div className="mt-2">
          {chartData && chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey={chartMode === 'horaria' ? 'hora' : 'dia'}
                    tickFormatter={fmtX}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-gray-500 dark:text-gray-400"
                    interval="preserveStartEnd"
                    minTickGap={20}
                    axisLine={{ stroke: 'currentColor' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-gray-500 dark:text-gray-400"
                    tickFormatter={(v: number) => (kpi.isCurrency ? formatCurrency(v) : v.toLocaleString(locale))}
                    width={70}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    content={
                      <LargeChartTooltip
                        xLabel={xLabel}
                        fmtX={fmtX}
                        formatValue={fmtVal}
                        seriesLabels={seriesLabels}
                        seriesColors={seriesColors}
                      />
                    }
                    cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                  />
                  {Object.entries(seriesColors).map(([key, color]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={seriesLabels[key] ?? key}
                      stroke={color}
                      strokeWidth={key.includes('Anterior') || key.includes('Ayer') ? 1.5 : 2.5}
                      strokeDasharray={key.includes('Anterior') || key.includes('Ayer') ? '5 3' : undefined}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin datos suficientes para mostrar la gráfica</p>
              </div>
            </div>
          )}
        </div>

        {/* CTA: ir a la página completa */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              router.push(kpi.href);
            }}
            className="gap-1.5"
          >
            {t('viewFullPage')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers para construir los datos de la gráfica grande ───────────────────

/**
 * Construye el array de datos para la gráfica grande según el KPI y período.
 * Combina la serie actual y la anterior en un solo array de objetos.
 */
function buildChartData(
  kpi: KpiConfigItem,
  data: DashboardKPIData | null,
  periodo: PeriodoDashboard,
): Record<string, number | undefined>[] | null {
  if (!data) return null;

  const isComprasWeb = kpi.key === 'comprasWeb';
  const isDynamic = kpi.dynamicLabel;
  // ventasMes (useMonthLabel): siempre muestra la serie mensual del mes calendario,
  // ignora el filtro de período (hoy/7d/30d/etc.) porque representa el mes actual.
  const isMensualFijo = !!kpi.useMonthLabel;

  // ── Caso 1: período 'hoy' con series horarias ──
  // Generamos TODAS las horas de 0 hasta la hora actual de la organización,
  // aunque no haya datos para algunas → la línea se muestra plana en 0.
  if (isDynamic && !isMensualFijo && periodo === 'hoy') {
    const hoy = getHoraSerie(kpi.key, data, true) ?? [];
    const ayer = getHoraSerie(kpi.key, data, false) ?? [];
    if (data.horaActualOrg === undefined) return null;

    const result = Array.from({ length: data.horaActualOrg + 1 }, (_, h) => {
      const row: Record<string, number | undefined> = { hora: h };
      if (isComprasWeb) {
        row['Pedidos hoy'] = hoy.find((p) => p.hora === h)?.total ?? 0;
        row['Pedidos ayer'] = ayer.find((a) => a.hora === h)?.total ?? 0;
        row['Pagados hoy'] = data.comprasPorHoraHoyPagadas?.find((a) => a.hora === h)?.total ?? 0;
        row['Pagados ayer'] = data.comprasPorHoraAyerPagadas?.find((a) => a.hora === h)?.total ?? 0;
        row['Cancelados hoy'] = data.comprasPorHoraHoyCanceladas?.find((a) => a.hora === h)?.total ?? 0;
        row['Cancelados ayer'] = data.comprasPorHoraAyerCanceladas?.find((a) => a.hora === h)?.total ?? 0;
      } else {
        row['Hoy'] = hoy.find((p) => p.hora === h)?.total ?? 0;
        row['Ayer'] = ayer.find((a) => a.hora === h)?.total ?? 0;
      }
      return row;
    });
    return result;
  }

  // ── Caso 2: período != 'hoy' con series por día ──
  if (isDynamic && !isMensualFijo && periodo !== 'hoy') {
    const serie = getPeriodoSerie(kpi.key, data);
    if (!serie) return null;

    const dias = Array.from({ length: serie.actual.length }, (_, i) => i + 1);
    const result = dias.map((dia, idx) => {
      const row: Record<string, number | undefined> = { dia };
      if (isComprasWeb) {
        row['Pedidos actual'] = serie.actual[idx]?.total ?? 0;
        row['Pagados actual'] = data.comprasPorDiaPeriodoPagadas?.actual[idx]?.total ?? 0;
        row['Cancelados actual'] = data.comprasPorDiaPeriodoCanceladas?.actual[idx]?.total ?? 0;
      } else {
        row['Período actual'] = serie.actual[idx]?.total ?? 0;
        row['Período anterior'] = serie.anterior[idx]?.total ?? 0;
      }
      return row;
    });
    return result;
  }

  // ── Caso 3: KPIs no dinámicos con serie mensual ──
  let serieMensual: { actual: PuntoDiaMes[]; anterior: PuntoDiaMes[] } | null = null;
  if (kpi.key === 'ventasMes' && data.ventasPorDiaMesActual) {
    serieMensual = {
      actual: data.ventasPorDiaMesActual,
      anterior: data.ventasPorDiaMesAnterior ?? [],
    };
  } else if (data.seriesDiarias) {
    const entry = data.seriesDiarias[kpi.key as keyof typeof data.seriesDiarias];
    if (entry) serieMensual = entry;
  }

  if (serieMensual && data.diaActualMes) {
    const dias = Array.from({ length: data.diaActualMes }, (_, i) => i + 1);
    return dias.map((dia) => ({
      dia,
      'Mes actual': serieMensual!.actual.find((p) => p.dia === dia)?.total ?? 0,
      'Mes anterior': serieMensual!.anterior.find((p) => p.dia === dia)?.total ?? 0,
    }));
  }

  return null;
}

function getHoraSerie(
  key: keyof DashboardKPIData,
  data: DashboardKPIData,
  hoy: boolean,
): PuntoHora[] | undefined {
  const map: Record<string, PuntoHora[] | undefined> = {
    ventasHoy: hoy ? data.ventasPorHoraHoy : data.ventasPorHoraAyer,
    facturasHoy: hoy ? data.facturasPorHoraHoy : data.facturasPorHoraAyer,
    visitasWeb: hoy ? data.visitasPorHoraHoy : data.visitasPorHoraAyer,
    comprasWeb: hoy ? data.comprasPorHoraHoy : data.comprasPorHoraAyer,
  };
  return map[key] ?? undefined;
}

function getPeriodoSerie(
  key: keyof DashboardKPIData,
  data: DashboardKPIData,
): { actual: PuntoDiaMes[]; anterior: PuntoDiaMes[] } | null {
  const map: Record<string, { actual: PuntoDiaMes[]; anterior: PuntoDiaMes[] } | undefined> = {
    ventasHoy: data.ventasPorDiaPeriodo,
    facturasHoy: data.facturasPorDiaPeriodo,
    visitasWeb: data.visitasPorDiaPeriodo,
    comprasWeb: data.comprasPorDiaPeriodo,
  };
  return map[key] ?? null;
}

function getSeriesLabels(kpi: KpiConfigItem, periodo: PeriodoDashboard): Record<string, string> {
  const isComprasWeb = kpi.key === 'comprasWeb';
  if (isComprasWeb) {
    if (periodo === 'hoy') {
      return {
        'Pedidos hoy': 'Pedidos hoy',
        'Pedidos ayer': 'Pedidos ayer',
        'Pagados hoy': 'Pagados hoy',
        'Pagados ayer': 'Pagados ayer',
        'Cancelados hoy': 'Cancelados hoy',
        'Cancelados ayer': 'Cancelados ayer',
      };
    }
    return {
      'Pedidos actual': 'Pedidos actual',
      'Pagados actual': 'Pagados actual',
      'Cancelados actual': 'Cancelados actual',
    };
  }
  // KPIs mensuales fijos (ventasMes) y no dinámicos: siempre serie del mes
  if (!kpi.dynamicLabel || kpi.useMonthLabel) {
    return { 'Mes actual': 'Mes actual', 'Mes anterior': 'Mes anterior' };
  }
  if (periodo === 'hoy') {
    return { Hoy: 'Hoy', Ayer: 'Ayer' };
  }
  return { 'Período actual': 'Período actual', 'Período anterior': 'Período anterior' };
}

function getSeriesColors(kpi: KpiConfigItem, periodo: PeriodoDashboard): Record<string, string> {
  const stroke = colorStrokeMap[kpi.color] || '#3b82f6';
  const isComprasWeb = kpi.key === 'comprasWeb';
  if (isComprasWeb) {
    if (periodo === 'hoy') {
      return {
        'Pedidos hoy': '#f59e0b',
        'Pedidos ayer': '#fcd34d',
        'Pagados hoy': '#22c55e',
        'Pagados ayer': '#86efac',
        'Cancelados hoy': '#ef4444',
        'Cancelados ayer': '#fca5a5',
      };
    }
    return {
      'Pedidos actual': '#f59e0b',
      'Pagados actual': '#22c55e',
      'Cancelados actual': '#ef4444',
    };
  }
  // KPIs mensuales fijos (ventasMes) y no dinámicos: siempre serie del mes
  if (!kpi.dynamicLabel || kpi.useMonthLabel) {
    return { 'Mes actual': stroke, 'Mes anterior': '#9ca3af' };
  }
  if (periodo === 'hoy') return { Hoy: stroke, Ayer: '#9ca3af' };
  return { 'Período actual': stroke, 'Período anterior': '#9ca3af' };
}
