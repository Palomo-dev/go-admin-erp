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
  ayer: 'Ayer',
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
  // - horaria: KPIs dinámicos (no useMonthLabel) con período 'hoy' o 'ayer'
  // - periodo: KPIs dinámicos (no useMonthLabel) con período != 'hoy'/'ayer'
  // - mensual: KPIs no dinámicos o useMonthLabel (ventasMes) — siempre serie del mes
  const isHorario = periodo === 'hoy' || periodo === 'ayer';
  const chartMode: 'horaria' | 'periodo' | 'mensual' = kpi.dynamicLabel && !kpi.useMonthLabel
    ? (isHorario ? 'horaria' : 'periodo')
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
  const fmtVal = kpi.isCurrency
    ? formatCurrency
    : kpi.isPercentage
      ? (n: number) => `${n.toFixed(1)}%`
      : (n: number) => n.toLocaleString(locale);

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
              {kpi.isCurrency
                ? formatCurrency(value)
                : kpi.isPercentage
                  ? `${value.toFixed(1)}%`
                  : value.toLocaleString(locale)}
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
        {kpi.hasDesglose && kpi.key === 'comprasWeb' && data && (
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
        {/* Desglose de tasas de conversión web */}
        {kpi.hasDesglose && kpi.key === 'conversionWeb' && data && (
          <div className="flex items-center gap-3 text-sm flex-wrap py-1">
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Visita → Pedido</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">{data.tasaVisitaPedido.toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Pedido → Completado</span>
              <span className="font-semibold text-green-600 dark:text-green-400">{data.tasaPedidoCompletado.toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Abandono</span>
              <span className="font-semibold text-red-500 dark:text-red-400">{data.tasaAbandono.toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-start ml-auto">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Completados</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{data.comprasWebCompletadas} / {data.comprasWeb}</span>
            </div>
          </div>
        )}

        {/* Gráfica ampliada */}
        <div className="mt-2">
          {/* Funnel de conversión web — reemplaza el line chart para este KPI */}
          {kpi.key === 'conversionWeb' && data ? (
            <WebConversionFunnel
              visitas={data.visitasWeb}
              pedidos={data.comprasWeb}
              completados={data.comprasWebCompletadas}
              cancelados={data.comprasWebCanceladas}
              tasaVisitaPedido={data.tasaVisitaPedido}
              tasaPedidoCompletado={data.tasaPedidoCompletado}
              tasaAbandono={data.tasaAbandono}
              visitasAnterior={data.visitasWebAnterior}
              pedidosAnterior={data.comprasWebAnterior}
              completadosAnterior={data.comprasWebCompletadasAnterior ?? 0}
            />
          ) : chartData && chartData.length > 0 ? (
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

// ─── Funnel de conversión web ────────────────────────────────────────────────

interface WebConversionFunnelProps {
  visitas: number;
  pedidos: number;
  completados: number;
  cancelados: number;
  tasaVisitaPedido: number;
  tasaPedidoCompletado: number;
  tasaAbandono: number;
  visitasAnterior?: number;
  pedidosAnterior?: number;
  completadosAnterior?: number;
}

function FunnelStage({
  label,
  value,
  maxValue,
  color,
  subtitle,
  delta,
  tooltip,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  subtitle?: string;
  delta?: string;
  tooltip?: { items: { label: string; value: string; color?: string }[] };
}) {
  const rawRatio = maxValue > 0 ? value / maxValue : 0;
  const scaledRatio = Math.sqrt(rawRatio);
  const widthPercent = Math.max(scaledRatio * 100, 15);

  return (
    <div className="group relative flex items-center gap-3">
      <div className="w-28 text-right shrink-0">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        {subtitle && (
          <span className="block text-[10px] text-gray-400 dark:text-gray-500">{subtitle}</span>
        )}
      </div>
      <div className="flex-1 relative">
        <div
          className="h-12 rounded-r-lg transition-all duration-500 flex items-center px-3 cursor-default"
          style={{ width: `${widthPercent}%`, backgroundColor: color, opacity: 0.9 }}
        >
          <span className="text-white text-sm font-bold whitespace-nowrap">{value.toLocaleString()}</span>
        </div>
      </div>
      {delta && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 w-24">
          {delta}
        </span>
      )}
      {/* Tooltip al hacer hover */}
      {tooltip && tooltip.items.length > 0 && (
        <div className="absolute z-20 left-32 top-1/2 -translate-y-1/2 ml-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs rounded-md shadow-sm px-3 py-2 space-y-1 min-w-[160px]">
            {tooltip.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  {item.color && (
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  )}
                  {item.label}
                </span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelArrow({ rate, label, color }: { rate: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pl-28 py-0.5">
      <svg width="16" height="20" viewBox="0 0 16 20" className="text-gray-300 dark:text-gray-600">
        <path d="M8 0 L8 18 M4 14 L8 18 L12 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {label}: <span className="font-semibold" style={{ color }}>{rate.toFixed(1)}%</span>
      </span>
    </div>
  );
}

function WebConversionFunnel({
  visitas,
  pedidos,
  completados,
  cancelados,
  tasaVisitaPedido,
  tasaPedidoCompletado,
  tasaAbandono,
  visitasAnterior,
  pedidosAnterior,
  completadosAnterior,
}: WebConversionFunnelProps) {
  const maxValue = Math.max(visitas, 1);

  const fmtDelta = (actual: number, anterior: number): string | undefined => {
    if (!anterior || anterior === 0) return undefined;
    const diff = actual - anterior;
    const pct = (diff / anterior) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}% vs anterior`;
  };

  return (
    <div className="space-y-1 py-2">
      {/* Etapa 1: Visitantes */}
      <FunnelStage
        label="Visitantes"
        value={visitas}
        maxValue={maxValue}
        color="#3b82f6"
        subtitle={visitasAnterior ? `${visitasAnterior.toLocaleString()} período anterior` : undefined}
        delta={fmtDelta(visitas, visitasAnterior ?? 0)}
        tooltip={{
          items: [
            { label: 'Visitantes', value: visitas.toLocaleString(), color: '#3b82f6' },
            ...(visitasAnterior ? [{ label: 'Período anterior', value: visitasAnterior.toLocaleString() }] : []),
            { label: 'Tasa visita→pedido', value: `${tasaVisitaPedido.toFixed(1)}%` },
          ],
        }}
      />

      {/* Flecha 1: Visita → Pedido */}
      <FunnelArrow rate={tasaVisitaPedido} label="Visita → Pedido" color="#3b82f6" />

      {/* Etapa 2: Pedidos */}
      <FunnelStage
        label="Pedidos"
        value={pedidos}
        maxValue={maxValue}
        color="#f59e0b"
        subtitle={pedidosAnterior ? `${pedidosAnterior.toLocaleString()} período anterior` : undefined}
        delta={fmtDelta(pedidos, pedidosAnterior ?? 0)}
        tooltip={{
          items: [
            { label: 'Pedidos', value: pedidos.toLocaleString(), color: '#f59e0b' },
            ...(pedidosAnterior ? [{ label: 'Período anterior', value: pedidosAnterior.toLocaleString() }] : []),
            { label: 'Tasa visita→pedido', value: `${tasaVisitaPedido.toFixed(1)}%` },
            { label: 'Tasa pedido→completado', value: `${tasaPedidoCompletado.toFixed(1)}%` },
            { label: 'Tasa abandono', value: `${tasaAbandono.toFixed(1)}%` },
          ],
        }}
      />

      {/* Flecha 2: Pedido → Completado */}
      <FunnelArrow rate={tasaPedidoCompletado} label="Pedido → Completado" color="#22c55e" />

      {/* Etapa 3: Completados */}
      <FunnelStage
        label="Completados"
        value={completados}
        maxValue={maxValue}
        color="#22c55e"
        subtitle={completadosAnterior ? `${completadosAnterior.toLocaleString()} período anterior` : undefined}
        delta={fmtDelta(completados, completadosAnterior ?? 0)}
        tooltip={{
          items: [
            { label: 'Completados', value: completados.toLocaleString(), color: '#22c55e' },
            ...(completadosAnterior ? [{ label: 'Período anterior', value: completadosAnterior.toLocaleString() }] : []),
            { label: 'Tasa pedido→completado', value: `${tasaPedidoCompletado.toFixed(1)}%` },
            { label: 'De pedidos', value: `${completados} / ${pedidos}` },
          ],
        }}
      />

      {/* Resumen de abandono */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="text-gray-500 dark:text-gray-400">
            Abandono: <span className="font-semibold text-red-500 dark:text-red-400">{tasaAbandono.toFixed(1)}%</span>
          </span>
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-xs">
          ({cancelados.toLocaleString()} cancelados/expirados de {pedidos.toLocaleString()} pedidos)
        </span>
      </div>
    </div>
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
  const isConversionWeb = kpi.key === 'conversionWeb';
  const isDynamic = kpi.dynamicLabel;
  // ventasMes (useMonthLabel): siempre muestra la serie mensual del mes calendario,
  // ignora el filtro de período (hoy/7d/30d/etc.) porque representa el mes actual.
  const isMensualFijo = !!kpi.useMonthLabel;

  // ── Caso 1: períodos 'hoy' y 'ayer' con series horarias ──
  // Generamos TODAS las horas de 0 hasta la hora actual de la organización,
  // aunque no haya datos para algunas → la línea se muestra plana en 0.
  if (isDynamic && !isMensualFijo && (periodo === 'hoy' || periodo === 'ayer')) {
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
      } else if (isConversionWeb) {
        const pedidosHoy = hoy.find((p) => p.hora === h)?.total ?? 0;
        const completadosHoy = data.comprasPorHoraHoyCompletadas?.find((a) => a.hora === h)?.total ?? 0;
        const pedidosAyer = ayer.find((a) => a.hora === h)?.total ?? 0;
        const completadosAyer = data.comprasPorHoraAyerCompletadas?.find((a) => a.hora === h)?.total ?? 0;
        row['Completados hoy'] = completadosHoy;
        row['Completados ayer'] = completadosAyer;
        row['Pedidos hoy'] = pedidosHoy;
        row['Tasa hoy'] = pedidosHoy > 0 ? (completadosHoy / pedidosHoy) * 100 : 0;
        row['Tasa ayer'] = pedidosAyer > 0 ? (completadosAyer / pedidosAyer) * 100 : 0;
      } else {
        row['Hoy'] = hoy.find((p) => p.hora === h)?.total ?? 0;
        row['Ayer'] = ayer.find((a) => a.hora === h)?.total ?? 0;
      }
      return row;
    });
    return result;
  }

  // ── Caso 2: período != 'hoy'/'ayer' con series por día ──
  if (isDynamic && !isMensualFijo && periodo !== 'hoy' && periodo !== 'ayer') {
    const serie = getPeriodoSerie(kpi.key, data);
    if (!serie) return null;

    const dias = Array.from({ length: serie.actual.length }, (_, i) => i + 1);
    const result = dias.map((dia, idx) => {
      const row: Record<string, number | undefined> = { dia };
      if (isComprasWeb) {
        row['Pedidos actual'] = serie.actual[idx]?.total ?? 0;
        row['Pagados actual'] = data.comprasPorDiaPeriodoPagadas?.actual[idx]?.total ?? 0;
        row['Cancelados actual'] = data.comprasPorDiaPeriodoCanceladas?.actual[idx]?.total ?? 0;
      } else if (isConversionWeb) {
        const pedidosActual = serie.actual[idx]?.total ?? 0;
        const completadosActual = data.comprasPorDiaPeriodoCompletadas?.actual[idx]?.total ?? 0;
        const pedidosAnterior = serie.anterior[idx]?.total ?? 0;
        const completadosAnterior = data.comprasPorDiaPeriodoCompletadas?.anterior[idx]?.total ?? 0;
        row['Completados actual'] = completadosActual;
        row['Pedidos actual'] = pedidosActual;
        row['Tasa actual'] = pedidosActual > 0 ? (completadosActual / pedidosActual) * 100 : 0;
        row['Tasa anterior'] = pedidosAnterior > 0 ? (completadosAnterior / pedidosAnterior) * 100 : 0;
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
    conversionWeb: hoy ? data.comprasPorHoraHoy : data.comprasPorHoraAyer,
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
    conversionWeb: data.comprasPorDiaPeriodo,
  };
  return map[key] ?? null;
}

function getSeriesLabels(kpi: KpiConfigItem, periodo: PeriodoDashboard): Record<string, string> {
  const isComprasWeb = kpi.key === 'comprasWeb';
  const isConversionWeb = kpi.key === 'conversionWeb';
  if (isComprasWeb) {
    if (periodo === 'hoy' || periodo === 'ayer') {
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
  if (isConversionWeb) {
    if (periodo === 'hoy' || periodo === 'ayer') {
      return {
        'Tasa hoy': 'Tasa de conversión hoy',
        'Tasa ayer': 'Tasa de conversión ayer',
        'Completados hoy': 'Completados hoy',
        'Pedidos hoy': 'Pedidos hoy',
      };
    }
    return {
      'Tasa actual': 'Tasa de conversión actual',
      'Tasa anterior': 'Tasa de conversión anterior',
      'Completados actual': 'Completados actual',
      'Pedidos actual': 'Pedidos actual',
    };
  }
  // KPIs mensuales fijos (ventasMes) y no dinámicos: siempre serie del mes
  if (!kpi.dynamicLabel || kpi.useMonthLabel) {
    return { 'Mes actual': 'Mes actual', 'Mes anterior': 'Mes anterior' };
  }
  if (periodo === 'hoy' || periodo === 'ayer') {
    return { Hoy: 'Hoy', Ayer: 'Ayer' };
  }
  return { 'Período actual': 'Período actual', 'Período anterior': 'Período anterior' };
}

function getSeriesColors(kpi: KpiConfigItem, periodo: PeriodoDashboard): Record<string, string> {
  const stroke = colorStrokeMap[kpi.color] || '#3b82f6';
  const isComprasWeb = kpi.key === 'comprasWeb';
  const isConversionWeb = kpi.key === 'conversionWeb';
  if (isComprasWeb) {
    if (periodo === 'hoy' || periodo === 'ayer') {
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
  if (isConversionWeb) {
    if (periodo === 'hoy' || periodo === 'ayer') {
      return {
        'Tasa hoy': '#22c55e',
        'Tasa ayer': '#86efac',
        'Completados hoy': '#3b82f6',
        'Pedidos hoy': '#f59e0b',
      };
    }
    return {
      'Tasa actual': '#22c55e',
      'Tasa anterior': '#86efac',
      'Completados actual': '#3b82f6',
      'Pedidos actual': '#f59e0b',
    };
  }
  // KPIs mensuales fijos (ventasMes) y no dinámicos: siempre serie del mes
  if (!kpi.dynamicLabel || kpi.useMonthLabel) {
    return { 'Mes actual': stroke, 'Mes anterior': '#9ca3af' };
  }
  if (periodo === 'hoy' || periodo === 'ayer') return { Hoy: stroke, Ayer: '#9ca3af' };
  return { 'Período actual': stroke, 'Período anterior': '#9ca3af' };
}
