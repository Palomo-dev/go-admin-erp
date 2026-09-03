'use client';

import { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  Receipt,
  UserCheck,
  Hotel,
  CreditCard,
  Minus,
  Eye,
  ShoppingCart,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { DashboardKPIData, PeriodoDashboard, HorasDashboard, PuntoHora, PuntoDiaMes } from './inicioService';
import { useLiveVisitors } from './useLiveVisitors';
import { KpiDetailDialog } from './KpiDetailDialog';
import { useTranslations, useLocale } from 'next-intl';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface DashboardKPIsProps {
  data: DashboardKPIData | null;
  isLoading: boolean;
  periodo?: PeriodoDashboard;
  organizationId?: number | null;
  horas?: HorasDashboard | null;
}

export interface KpiConfigItem {
  key: keyof DashboardKPIData;
  labelKey: string;
  icon: typeof DollarSign;
  color: string;
  isCurrency: boolean;
  href: string;
  deltaKey: keyof DashboardKPIData | null;
  dynamicLabel: boolean;
  useMonthLabel?: boolean;
  hasDesglose?: boolean;
  span2?: boolean; // ocupar 2 columnas en desktop (sm+)
  isPercentage?: boolean; // mostrar valor como porcentaje (conversionWeb)
}

export const kpiConfig: KpiConfigItem[] = [
  {
    key: 'ventasHoy' as const,
    labelKey: 'salesToday' as const,
    icon: DollarSign,
    color: 'blue',
    isCurrency: true,
    href: '/app/pos/ventas',
    deltaKey: 'ventasAnterior' as const,
    dynamicLabel: true, // etiqueta cambia según período
  },
  {
    key: 'ventasMes' as const,
    labelKey: 'sales30Days' as const,
    icon: TrendingUp,
    color: 'green',
    isCurrency: true,
    href: '/app/pos/ventas',
    deltaKey: 'ventasMesAnterior' as const,
    dynamicLabel: true,
    useMonthLabel: true, // etiqueta muestra nombre del mes, no el período
  },
  {
    key: 'clientesActivos' as const,
    labelKey: 'clients' as const,
    icon: Users,
    color: 'purple',
    isCurrency: false,
    href: '/app/crm',
    deltaKey: 'clientesAnterior' as const,
    dynamicLabel: false,
  },
  {
    key: 'productosActivos' as const,
    labelKey: 'products' as const,
    icon: Package,
    color: 'orange',
    isCurrency: false,
    href: '/app/inventario/productos',
    deltaKey: 'productosAnterior' as const,
    dynamicLabel: false,
  },
  {
    key: 'facturasHoy' as const,
    labelKey: 'invoicesToday' as const,
    icon: Receipt,
    color: 'cyan',
    isCurrency: false,
    href: '/app/finanzas/facturas-venta',
    deltaKey: 'facturasAnterior' as const,
    dynamicLabel: true,
  },
  {
    key: 'empleadosActivos' as const,
    labelKey: 'members' as const,
    icon: UserCheck,
    color: 'indigo',
    isCurrency: false,
    href: '/app/hrm/empleados',
    deltaKey: 'empleadosAnterior' as const,
    dynamicLabel: false,
  },
  {
    key: 'reservasActivas' as const,
    labelKey: 'activeReservations' as const,
    icon: Hotel,
    color: 'teal',
    isCurrency: false,
    href: '/app/pms',
    deltaKey: 'reservasAnterior' as const,
    dynamicLabel: false,
  },
  {
    key: 'cuentasPorCobrar' as const,
    labelKey: 'receivables' as const,
    icon: CreditCard,
    color: 'red',
    isCurrency: true,
    href: '/app/finanzas/cuentas-por-cobrar',
    deltaKey: 'cuentasAnterior' as const,
    dynamicLabel: false,
  },
  {
    key: 'visitasWeb' as const,
    labelKey: 'webVisits' as const,
    icon: Eye,
    color: 'pink',
    isCurrency: false,
    href: '/app/pos/pedidos-online',
    deltaKey: 'visitasWebAnterior' as const,
    dynamicLabel: true,
  },
  {
    key: 'comprasWeb' as const,
    labelKey: 'webOrders' as const,
    icon: ShoppingCart,
    color: 'amber',
    isCurrency: false,
    href: '/app/pos/pedidos-online',
    deltaKey: 'comprasWebAnterior' as const,
    dynamicLabel: true,
    hasDesglose: true, // mostrar desglose de pendientes/canceladas/pagadas
    span2: true,
  },
  {
    key: 'conversionWeb' as const,
    labelKey: 'webConversion' as const,
    icon: TrendingUp,
    color: 'green',
    isCurrency: false,
    href: '/app/pos/pedidos-online',
    deltaKey: 'conversionWebAnterior' as const,
    dynamicLabel: true,
    hasDesglose: true, // mostrar desglose de las 3 tasas
    isPercentage: true,
  },
];

const colorMap: Record<string, { bg: string; icon: string; text: string; stroke: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300', stroke: '#3b82f6' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-700 dark:text-green-300', stroke: '#22c55e' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-700 dark:text-purple-300', stroke: '#a855f7' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-700 dark:text-orange-300', stroke: '#f97316' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', icon: 'text-cyan-600 dark:text-cyan-400', text: 'text-cyan-700 dark:text-cyan-300', stroke: '#06b6d4' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400', text: 'text-indigo-700 dark:text-indigo-300', stroke: '#6366f1' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-900/20', icon: 'text-teal-600 dark:text-teal-400', text: 'text-teal-700 dark:text-teal-300', stroke: '#14b8a6' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', text: 'text-red-700 dark:text-red-300', stroke: '#ef4444' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-900/20', icon: 'text-pink-600 dark:text-pink-400', text: 'text-pink-700 dark:text-pink-300', stroke: '#ec4899' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-300', stroke: '#f59e0b' },
};

// Etiqueta dinámica según período
const periodoLabel: Record<PeriodoDashboard, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  año: 'Año',
};

function generateSparklineData(value: number, deltaPct: number | null, points = 7): number[] {
  if (value === 0 && deltaPct === null) return [0, 0, 0, 0, 0, 0, 0];
  const trend = deltaPct !== null ? deltaPct / 100 : 0;
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const base = value * (1 - trend * (1 - progress));
    const variation = Math.sin(i * 1.3 + value * 0.001) * value * 0.05;
    result.push(Math.max(0, base + variation));
  }
  result[points - 1] = value;
  return result;
}

// Props comunes para tooltips de recharts
interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  payload: { hora?: number; idx?: number; dia?: number };
}
interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

// Tooltip para el mini-sparkline
function SparklineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200">
      {formatCurrency(payload[0].value)}
    </div>
  );
}

// Sparkline real con eje X de horas y dos líneas: hoy vs ayer a esta misma hora
function VentasHorariasSparkline({
  hoy,
  ayer,
  horaActual,
  stroke,
  formatValue,
}: {
  hoy: PuntoHora[];
  ayer: PuntoHora[];
  horaActual: number;
  stroke: string;
  formatValue: (n: number) => string;
}) {
  // Recortar hasta la hora actual (inclusive) y combinar ambas series por hora
  const data = hoy
    .filter((p) => p.hora <= horaActual)
    .map((p) => ({
      hora: p.hora,
      hoy: p.total,
      ayer: ayer.find((a) => a.hora === p.hora)?.total ?? 0,
    }));

  const fmtHora = (h: number) => `${h}h`;

  return (
    <div className="mt-2 h-10 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="hora"
            tickFormatter={fmtHora}
            tick={{ fontSize: 8, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            interval="preserveStartEnd"
            minTickGap={16}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, 'auto']} />
          <RechartsTooltip
            content={({ active, payload }: TooltipProps) => {
              if (!active || !payload || !payload.length) return null;
              const hora = payload[0]?.payload?.hora;
              return (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 space-y-0.5">
                  <div className="text-gray-500">{fmtHora(hora ?? 0)}</div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: stroke }} />
                    Hoy: {formatValue(payload.find((p) => p.dataKey === 'hoy')?.value ?? 0)}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                    Ayer: {formatValue(payload.find((p) => p.dataKey === 'ayer')?.value ?? 0)}
                  </div>
                </div>
              );
            }}
            cursor={false}
          />
          <Line
            type="monotone"
            dataKey="ayer"
            stroke="#9ca3af"
            strokeWidth={1.25}
            strokeDasharray="3 2"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="hoy"
            stroke={stroke}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sparkline mensual genérico: eje X = día del mes, dos líneas (mes actual vs mes anterior)
function MensualSparkline({
  mesActual,
  mesAnterior,
  diaActual,
  stroke,
  formatValue,
}: {
  mesActual: PuntoDiaMes[];
  mesAnterior: PuntoDiaMes[];
  diaActual: number;
  stroke: string;
  formatValue: (n: number) => string;
}) {
  // Combinar ambas series por día del mes, recortando hasta el día actual
  const dias = Array.from({ length: diaActual }, (_, i) => i + 1);
  const data = dias.map((dia) => ({
    dia,
    actual: mesActual.find((p) => p.dia === dia)?.total ?? 0,
    anterior: mesAnterior.find((p) => p.dia === dia)?.total ?? 0,
  }));

  const fmtDia = (d: number) => `${d}`;

  return (
    <div className="mt-2 h-10 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="dia"
            tickFormatter={fmtDia}
            tick={{ fontSize: 8, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            interval="preserveStartEnd"
            minTickGap={20}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, 'auto']} />
          <RechartsTooltip
            content={({ active, payload }: TooltipProps) => {
              if (!active || !payload || !payload.length) return null;
              const dia = payload[0]?.payload?.dia;
              return (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 space-y-0.5">
                  <div className="text-gray-500">Día {dia}</div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: stroke }} />
                    Este mes: {formatValue(payload.find((p) => p.dataKey === 'actual')?.value ?? 0)}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                    Mes pasado: {formatValue(payload.find((p) => p.dataKey === 'anterior')?.value ?? 0)}
                  </div>
                </div>
              );
            }}
            cursor={false}
          />
          <Line
            type="monotone"
            dataKey="anterior"
            stroke="#9ca3af"
            strokeWidth={1.25}
            strokeDasharray="3 2"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke={stroke}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Mini-funnel de conversión web para la card (versión compacta con tooltip)
function MiniConversionFunnel({
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
}: {
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
}) {
  const max = Math.max(visitas, 1);
  const stages = [
    {
      label: 'Visitas', value: visitas, color: '#3b82f6',
      items: [
        { label: 'Visitantes', value: visitas.toLocaleString(), color: '#3b82f6' },
        ...(visitasAnterior ? [{ label: 'Período anterior', value: visitasAnterior.toLocaleString() }] : []),
        { label: 'Tasa visita→pedido', value: `${tasaVisitaPedido.toFixed(1)}%` },
      ],
    },
    {
      label: 'Pedidos', value: pedidos, color: '#f59e0b',
      items: [
        { label: 'Pedidos', value: pedidos.toLocaleString(), color: '#f59e0b' },
        ...(pedidosAnterior ? [{ label: 'Período anterior', value: pedidosAnterior.toLocaleString() }] : []),
        { label: 'Tasa visita→pedido', value: `${tasaVisitaPedido.toFixed(1)}%` },
        { label: 'Tasa pedido→completado', value: `${tasaPedidoCompletado.toFixed(1)}%` },
        { label: 'Tasa abandono', value: `${tasaAbandono.toFixed(1)}%` },
      ],
    },
    {
      label: 'Comple.', value: completados, color: '#22c55e',
      items: [
        { label: 'Completados', value: completados.toLocaleString(), color: '#22c55e' },
        ...(completadosAnterior ? [{ label: 'Período anterior', value: completadosAnterior.toLocaleString() }] : []),
        { label: 'Tasa pedido→completado', value: `${tasaPedidoCompletado.toFixed(1)}%` },
        { label: 'De pedidos', value: `${completados} / ${pedidos}` },
      ],
    },
  ];
  return (
    <div className="mt-2 space-y-0.5">
      {stages.map((s) => {
        const ratio = max > 0 ? s.value / max : 0;
        const w = Math.max(Math.sqrt(ratio) * 100, 20);
        return (
          <div key={s.label} className="group relative flex items-center gap-1.5">
            <span className="text-[9px] text-gray-400 dark:text-gray-500 w-10 text-right shrink-0">{s.label}</span>
            <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${w}%`, backgroundColor: s.color, opacity: 0.85 }}
              />
            </div>
            <span className="text-[9px] font-medium text-gray-600 dark:text-gray-300 w-8 shrink-0">{s.value.toLocaleString()}</span>
            {/* Tooltip al hacer hover */}
            <div className="absolute z-20 right-10 top-1/2 -translate-y-1/2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-[10px] rounded-md shadow-sm px-2 py-1.5 space-y-0.5 min-w-[150px]">
                {s.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                      {item.color && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                      )}
                      {item.label}
                    </span>
                    <span className="font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Colores para el desglose de compras web por estado
const COMPRAS_COLORS = {
  pedidos: '#f59e0b', // ámbar
  pagados: '#22c55e', // verde
  canceladas: '#ef4444', // rojo
};

// Tooltip compartido para los sparklines de compras web (6 series: 3 hoy + 3 ayer)
interface ComprasTooltipProps {
  active?: boolean;
  payload?: { value: number; dataKey: string; payload: { hora?: number; dia?: number } }[];
  xLabel: string; // "hora" | "día"
  fmtX: (n: number) => string;
}
function ComprasWebTooltip({ active, payload, xLabel, fmtX }: ComprasTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const x = payload[0]?.payload?.hora ?? payload[0]?.payload?.dia ?? 0;
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;
  const Row = ({ color, label, value, dashed }: { color: string; label: string; value: number; dashed?: boolean }) => (
    <div className="flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color, opacity: dashed ? 0.6 : 1 }}
      />
      <span className={dashed ? 'italic' : ''}>{label}: {value}</span>
    </div>
  );
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 space-y-0.5">
      <div className="text-gray-500">{xLabel} {fmtX(x)}</div>
      <Row color={COMPRAS_COLORS.pedidos} label="Pedidos hoy" value={get('hoyPedidos')} />
      <Row color={COMPRAS_COLORS.pagados} label="Pagados hoy" value={get('hoyPagados')} />
      <Row color={COMPRAS_COLORS.canceladas} label="Cancelados hoy" value={get('hoyCanceladas')} />
      <Row color={COMPRAS_COLORS.pedidos} label="Pedidos ayer" value={get('ayerPedidos')} dashed />
      <Row color={COMPRAS_COLORS.pagados} label="Pagados ayer" value={get('ayerPagados')} dashed />
      <Row color={COMPRAS_COLORS.canceladas} label="Cancelados ayer" value={get('ayerCanceladas')} dashed />
    </div>
  );
}

// Sparkline horario de compras web con desglose por estado (pedidos/pagados/cancelados)
// y comparación vs ayer a la misma hora.
function ComprasWebHorariasSparkline({
  hoy, ayer, hoyPagadas, ayerPagadas, hoyCanceladas, ayerCanceladas, horaActual,
}: {
  hoy: PuntoHora[];
  ayer: PuntoHora[];
  hoyPagadas: PuntoHora[];
  ayerPagadas: PuntoHora[];
  hoyCanceladas: PuntoHora[];
  ayerCanceladas: PuntoHora[];
  horaActual: number;
}) {
  const data = hoy
    .filter((p) => p.hora <= horaActual)
    .map((p) => ({
      hora: p.hora,
      hoyPedidos: p.total,
      ayerPedidos: ayer.find((a) => a.hora === p.hora)?.total ?? 0,
      hoyPagados: hoyPagadas.find((a) => a.hora === p.hora)?.total ?? 0,
      ayerPagados: ayerPagadas.find((a) => a.hora === p.hora)?.total ?? 0,
      hoyCanceladas: hoyCanceladas.find((a) => a.hora === p.hora)?.total ?? 0,
      ayerCanceladas: ayerCanceladas.find((a) => a.hora === p.hora)?.total ?? 0,
    }));
  const fmtHora = (h: number) => `${h}h`;
  const lineCfg = [
    { key: 'ayerPedidos', color: COMPRAS_COLORS.pedidos, dashed: true, w: 1 },
    { key: 'ayerPagados', color: COMPRAS_COLORS.pagados, dashed: true, w: 1 },
    { key: 'ayerCanceladas', color: COMPRAS_COLORS.canceladas, dashed: true, w: 1 },
    { key: 'hoyPedidos', color: COMPRAS_COLORS.pedidos, dashed: false, w: 1.75 },
    { key: 'hoyPagados', color: COMPRAS_COLORS.pagados, dashed: false, w: 1.5 },
    { key: 'hoyCanceladas', color: COMPRAS_COLORS.canceladas, dashed: false, w: 1.5 },
  ];
  return (
    <div className="mt-2 h-10 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="hora"
            tickFormatter={fmtHora}
            tick={{ fontSize: 8, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            interval="preserveStartEnd"
            minTickGap={16}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, 'auto']} allowDecimals={false} />
          <RechartsTooltip
            content={<ComprasWebTooltip xLabel="hora" fmtX={fmtHora} />}
            cursor={false}
          />
          {lineCfg.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={l.w}
              strokeDasharray={l.dashed ? '3 2' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sparkline por período (7d/30d/90d/año) de compras web con desglose por estado
// y comparación vs período anterior.
function ComprasWebMensualSparkline({
  actual, anterior, actualPagadas, anteriorPagadas, actualCanceladas, anteriorCanceladas, diaActual,
}: {
  actual: PuntoDiaMes[];
  anterior: PuntoDiaMes[];
  actualPagadas: PuntoDiaMes[];
  anteriorPagadas: PuntoDiaMes[];
  actualCanceladas: PuntoDiaMes[];
  anteriorCanceladas: PuntoDiaMes[];
  diaActual: number;
}) {
  const dias = Array.from({ length: diaActual }, (_, i) => i + 1);
  const data = dias.map((dia) => ({
    dia,
    hoyPedidos: actual.find((p) => p.dia === dia)?.total ?? 0,
    ayerPedidos: anterior.find((p) => p.dia === dia)?.total ?? 0,
    hoyPagados: actualPagadas.find((p) => p.dia === dia)?.total ?? 0,
    ayerPagados: anteriorPagadas.find((p) => p.dia === dia)?.total ?? 0,
    hoyCanceladas: actualCanceladas.find((p) => p.dia === dia)?.total ?? 0,
    ayerCanceladas: anteriorCanceladas.find((p) => p.dia === dia)?.total ?? 0,
  }));
  const fmtDia = (d: number) => `${d}`;
  const lineCfg = [
    { key: 'ayerPedidos', color: COMPRAS_COLORS.pedidos, dashed: true, w: 1 },
    { key: 'ayerPagados', color: COMPRAS_COLORS.pagados, dashed: true, w: 1 },
    { key: 'ayerCanceladas', color: COMPRAS_COLORS.canceladas, dashed: true, w: 1 },
    { key: 'hoyPedidos', color: COMPRAS_COLORS.pedidos, dashed: false, w: 1.75 },
    { key: 'hoyPagados', color: COMPRAS_COLORS.pagados, dashed: false, w: 1.5 },
    { key: 'hoyCanceladas', color: COMPRAS_COLORS.canceladas, dashed: false, w: 1.5 },
  ];
  return (
    <div className="mt-2 h-10 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="dia"
            tickFormatter={fmtDia}
            tick={{ fontSize: 8, fill: 'currentColor' }}
            className="text-gray-400 dark:text-gray-500"
            interval="preserveStartEnd"
            minTickGap={20}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, 'auto']} allowDecimals={false} />
          <RechartsTooltip
            content={<ComprasWebTooltip xLabel="día" fmtX={fmtDia} />}
            cursor={false}
          />
          {lineCfg.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={l.w}
              strokeDasharray={l.dashed ? '3 2' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardKPIs({ data, isLoading, periodo = 'hoy', organizationId, horas }: DashboardKPIsProps) {
  const t = useTranslations('home.kpis');
  const locale = useLocale();
  // Visitantes en vivo via Realtime (solo para el KPI visitasWeb)
  const { liveCount, isActive } = useLiveVisitors(organizationId);
  // KPI seleccionado para el modal de detalle
  const [selectedKpi, setSelectedKpi] = useState<KpiConfigItem | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {kpiConfig.map((kpi) => {
        const colors = colorMap[kpi.color] || colorMap.blue;
        const Icon = kpi.icon;
        const isLiveVisits = kpi.key === 'visitasWeb' && periodo === 'hoy';
        const value = data ? (data[kpi.key] as number) : 0;

        // Etiqueta dinámica:
        // - ventasMes con useMonthLabel → "Ventas {NombreMes}" (ej: "Ventas Agosto")
        // - otros dynamicLabel → "Ventas {periodo}" (ej: "Ventas 7 días")
        const baseLabel = t(kpi.labelKey);
        let label = baseLabel;
        if (kpi.useMonthLabel && data?.mesActualNumero && data?.anioActual) {
          const nombreMes = new Date(data.anioActual, data.mesActualNumero - 1)
            .toLocaleDateString(locale, { month: 'long' });
          // Reemplazar "30 días"/"30 days"/"30 dias"/"30 jours" por el nombre del mes
          label = baseLabel.replace(/\s*30\s+\S+$/i, ` ${nombreMes}`);
        } else if (kpi.dynamicLabel) {
          label = baseLabel.replace(/Hoy$/i, periodoLabel[periodo]);
        }

        // Cálculo de delta % vs período anterior
        let deltaPct: number | null = null;
        if (kpi.deltaKey && data && data[kpi.deltaKey] !== undefined) {
          const anterior = data[kpi.deltaKey] as number;
          if (anterior > 0) {
            deltaPct = ((value - anterior) / anterior) * 100;
          } else if (value > 0) {
            deltaPct = 100;
          }
        }

        const hasDelta = deltaPct !== null;
        const isPositive = hasDelta && deltaPct! >= 0;

        // Badge estilos: pill con fondo
        const badgeClass = !hasDelta
          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
          : isPositive
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300';

        // Datos para el mini-sparkline sintético (fallback)
        const sparkData = generateSparklineData(value, deltaPct).map((v, i) => ({ idx: i, val: v }));

        // Determinar qué sparkline mostrar según KPI y período
        const fmtVal = kpi.isCurrency ? formatCurrency : (n: number) => n.toLocaleString(locale);
        const isDynamicKpi = kpi.dynamicLabel; // ventasHoy, facturasHoy

        // Series horarias (periodo='hoy'): ventasHoy, facturasHoy, visitasWeb, comprasWeb
        const horaHoy = kpi.key === 'ventasHoy'
          ? data?.ventasPorHoraHoy
          : kpi.key === 'facturasHoy'
            ? data?.facturasPorHoraHoy
            : kpi.key === 'visitasWeb'
              ? data?.visitasPorHoraHoy
              : kpi.key === 'comprasWeb'
                ? data?.comprasPorHoraHoy
                : undefined;
        const horaAyer = kpi.key === 'ventasHoy'
          ? data?.ventasPorHoraAyer
          : kpi.key === 'facturasHoy'
            ? data?.facturasPorHoraAyer
            : kpi.key === 'visitasWeb'
              ? data?.visitasPorHoraAyer
              : kpi.key === 'comprasWeb'
                ? data?.comprasPorHoraAyer
                : undefined;
        const hasHoraria = isDynamicKpi && (periodo === 'hoy' || periodo === 'ayer') && horaHoy && horaAyer && data?.horaActualOrg !== undefined;

        // Series por período (periodo!='hoy'): ventasHoy, facturasHoy, visitasWeb, comprasWeb
        const periodoSerie = kpi.key === 'ventasHoy'
          ? data?.ventasPorDiaPeriodo
          : kpi.key === 'facturasHoy'
            ? data?.facturasPorDiaPeriodo
            : kpi.key === 'visitasWeb'
              ? data?.visitasPorDiaPeriodo
              : kpi.key === 'comprasWeb'
                ? data?.comprasPorDiaPeriodo
                : undefined;
        const hasPeriodo = isDynamicKpi && periodo !== 'hoy' && periodo !== 'ayer' && periodoSerie;

        // Desglose de compras web por estado (pedidos/pagados/cancelados) para sparkline
        const isComprasWeb = kpi.key === 'comprasWeb';
        const hasComprasHoraria = isComprasWeb
          && hasHoraria
          && !!data?.comprasPorHoraHoyPagadas && !!data?.comprasPorHoraHoyCanceladas
          && !!data?.comprasPorHoraAyerPagadas && !!data?.comprasPorHoraAyerCanceladas;
        const hasComprasPeriodo = isComprasWeb
          && hasPeriodo
          && !!data?.comprasPorDiaPeriodoPagadas && !!data?.comprasPorDiaPeriodoCanceladas;

        // Series mensuales (KPIs no dinámicos): ventasMes o seriesDiarias
        let serieMensual: { actual: PuntoDiaMes[]; anterior: PuntoDiaMes[] } | null = null;
        if (kpi.key === 'ventasMes' && data?.ventasPorDiaMesActual && data?.ventasPorDiaMesAnterior) {
          serieMensual = { actual: data.ventasPorDiaMesActual, anterior: data.ventasPorDiaMesAnterior };
        } else if (data?.seriesDiarias) {
          const entry = data.seriesDiarias[kpi.key as keyof typeof data.seriesDiarias];
          if (entry) serieMensual = entry;
        }

        const content = (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all h-full flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                {label}
              </span>
            </div>
            {/* Total del día + contador en vivo al lado (solo visitasWeb + periodo 'hoy') */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-lg font-bold ${colors.text}`}>
                {kpi.isCurrency
                  ? formatCurrency(value)
                  : kpi.isPercentage
                    ? `${value.toFixed(1)}%`
                    : value.toLocaleString(locale)}
              </p>
              {isLiveVisits && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <span className="relative flex h-2 w-2">
                    {isActive && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-[10px] font-semibold text-green-700 dark:text-green-300">
                    {liveCount} {liveCount === 1 ? t('liveVisitor') : t('liveVisitors')}
                  </span>
                </span>
              )}
            </div>
            {/* Desglose de compras web por estado */}
            {kpi.hasDesglose && kpi.key === 'comprasWeb' && data && (
              <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {data.comprasWebPendientes} {t('pending')}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {data.comprasWebPagadas} {t('paid')}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  {data.comprasWebCanceladas} {t('cancelled')}
                </span>
              </div>
            )}
            {/* Desglose de tasas de conversión web */}
            {kpi.hasDesglose && kpi.key === 'conversionWeb' && data && (
              <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span title="Visitantes que hicieron pedido">
                  Visita→Pedido: <span className="font-semibold text-gray-700 dark:text-gray-200">{data.tasaVisitaPedido.toFixed(1)}%</span>
                </span>
                <span title="Pedidos que se completaron (pagados online o confirmados manuales)">
                  Conv.: <span className="font-semibold text-green-600 dark:text-green-400">{data.tasaPedidoCompletado.toFixed(1)}%</span>
                </span>
                <span title="Pedidos expirados o cancelados">
                  Abandono: <span className="font-semibold text-red-500 dark:text-red-400">{data.tasaAbandono.toFixed(1)}%</span>
                </span>
              </div>
            )}
            {/* Badge pill */}
            <div className="mt-1.5">
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}`}>
                {hasDelta ? (
                  <>
                    {isPositive ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {isPositive ? '+' : ''}{deltaPct!.toFixed(1)}%
                  </>
                ) : (
                  <>
                    <Minus className="h-2.5 w-2.5" />
                    —
                  </>
                )}
              </span>
            </div>
            {/* Mini-sparkline:
                - conversionWeb: mini-funnel Visitas → Pedidos → Completados
                - comprasWeb con desglose por estado: pedidos/pagados/cancelados (hoy vs ayer)
                - KPIs dinámicos (ventasHoy, facturasHoy) con periodo='hoy': horario (hoy vs ayer a esta hora)
                - KPIs dinámicos con periodo!='hoy': diario por posición del período (actual vs anterior)
                - KPIs no dinámicos con serie mensual: diario del mes (mes actual vs anterior)
                - fallback: sintético */}
            {kpi.key === 'conversionWeb' && data ? (
              <MiniConversionFunnel
                visitas={data.visitasWeb}
                pedidos={data.comprasWeb}
                completados={data.comprasWebCompletadas}
                cancelados={data.comprasWebCanceladas}
                tasaVisitaPedido={data.tasaVisitaPedido}
                tasaPedidoCompletado={data.tasaPedidoCompletado}
                tasaAbandono={data.tasaAbandono}
                visitasAnterior={data.visitasWebAnterior}
                pedidosAnterior={data.comprasWebAnterior}
                completadosAnterior={data.comprasWebCompletadasAnterior}
              />
            ) : hasComprasHoraria ? (
              <ComprasWebHorariasSparkline
                hoy={horaHoy!}
                ayer={horaAyer!}
                hoyPagadas={data!.comprasPorHoraHoyPagadas!}
                ayerPagadas={data!.comprasPorHoraAyerPagadas!}
                hoyCanceladas={data!.comprasPorHoraHoyCanceladas!}
                ayerCanceladas={data!.comprasPorHoraAyerCanceladas!}
                horaActual={data!.horaActualOrg!}
              />
            ) : hasComprasPeriodo ? (
              <ComprasWebMensualSparkline
                actual={periodoSerie!.actual}
                anterior={periodoSerie!.anterior}
                actualPagadas={data!.comprasPorDiaPeriodoPagadas!.actual}
                anteriorPagadas={data!.comprasPorDiaPeriodoPagadas!.anterior}
                actualCanceladas={data!.comprasPorDiaPeriodoCanceladas!.actual}
                anteriorCanceladas={data!.comprasPorDiaPeriodoCanceladas!.anterior}
                diaActual={periodoSerie!.actual.length}
              />
            ) : hasHoraria ? (
              <VentasHorariasSparkline
                hoy={horaHoy!}
                ayer={horaAyer!}
                horaActual={data!.horaActualOrg!}
                stroke={colors.stroke}
                formatValue={fmtVal}
              />
            ) : hasPeriodo ? (
              <MensualSparkline
                mesActual={periodoSerie!.actual}
                mesAnterior={periodoSerie!.anterior}
                diaActual={periodoSerie!.actual.length}
                stroke={colors.stroke}
                formatValue={fmtVal}
              />
            ) : serieMensual && data?.diaActualMes ? (
              <MensualSparkline
                mesActual={serieMensual.actual}
                mesAnterior={serieMensual.anterior}
                diaActual={data.diaActualMes}
                stroke={colors.stroke}
                formatValue={fmtVal}
              />
            ) : (
              <div className="mt-2 h-8 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <YAxis domain={['dataMin', 'dataMax']} hide />
                    <RechartsTooltip content={<SparklineTooltip />} cursor={false} />
                    <Line
                      type="monotone"
                      dataKey="val"
                      stroke={colors.stroke}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );

        const spanClass = kpi.span2 ? 'col-span-2 sm:col-span-2' : '';

        if (kpi.href) {
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() => setSelectedKpi(kpi)}
              className={`block text-left w-full ${spanClass}`}
              aria-label={`${label} - ver detalle`}
            >
              {content}
            </button>
          );
        }
        return <div key={kpi.key} className={spanClass}>{content}</div>;
      })}
    </div>
    <KpiDetailDialog
      open={selectedKpi !== null}
      onOpenChange={(open) => { if (!open) setSelectedKpi(null); }}
      kpi={selectedKpi}
      periodo={periodo}
      horas={horas}
      organizationId={organizationId}
      initialData={data}
    />
    </>
  );
}
