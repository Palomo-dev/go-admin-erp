'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart3, TrendingUp, Activity } from 'lucide-react';
import type { ReportData, ReporteColumna } from '@/lib/services/reportes/types';

type ChartType = 'bar' | 'line' | 'area';

interface ReporteChartProps {
  data: ReportData;
  comparisonData?: ReportData | null;
}

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1',
];

const COMPARISON_COLOR = '#94A3B8';

function isNumericColumn(col: ReporteColumna): boolean {
  return col.tipo === 'numero' || col.tipo === 'moneda' || col.tipo === 'porcentaje';
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg shadow-xl px-4 py-3 text-xs border-0">
      <p className="font-semibold mb-2 text-sm">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="opacity-80">{entry.name}:</span>
          <span className="font-bold ml-auto">
            {typeof entry.value === 'number'
              ? new Intl.NumberFormat('es-CO').format(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReporteChart({ data, comparisonData }: ReporteChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');

  const { chartData, xKey, numericKeys, numericLabels } = useMemo<{
    chartData: Record<string, string | number>[];
    xKey: string;
    numericKeys: string[];
    numericLabels: string[];
  }>(() => {
    const { columnas, filas } = data;
    if (!filas.length) return { chartData: [], xKey: '', numericKeys: [], numericLabels: [] };

    const xCol =
      columnas.find((c) => c.tipo === 'fecha') ||
      columnas.find((c) => c.tipo === 'texto') ||
      columnas[0];

    const numCols = columnas.filter(isNumericColumn).slice(0, 4);
    if (!numCols.length) return { chartData: [], xKey: '', numericKeys: [], numericLabels: [] };

    const keys = numCols.map((c) => c.key);
    const labels = numCols.map((c) => c.titulo);

    const rows = filas.slice(0, 30);
    const chartRows = rows.map((fila) => {
      const point: Record<string, string | number> = {
        name: String(fila[xCol.key] ?? ''),
      };
      numCols.forEach((col) => {
        point[col.key] = Number(fila[col.key]) || 0;
      });
      return point;
    });

    if (comparisonData && comparisonData.filas.length) {
      const compRows = comparisonData.filas.slice(0, 30);
      const compMap = new Map<string, Record<string, unknown>>();
      compRows.forEach((fila) => {
        const name = String(fila[xCol.key] ?? '');
        compMap.set(name, fila);
      });

      chartRows.forEach((point) => {
        const compRow = compMap.get(point.name as string);
        numCols.forEach((col) => {
          point[`${col.key}_prev`] = compRow ? Number(compRow[col.key]) || 0 : 0;
        });
      });
    }

    return { chartData: chartRows, xKey: 'name', numericKeys: keys, numericLabels: labels };
  }, [data, comparisonData]);

  if (!chartData.length || !numericKeys.length) return null;

  const { columnas } = data;
  const numCols = columnas.filter((c) => numericKeys.includes(c.key));

  const formatTick = (val: number) => {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
    return String(val);
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 10, left: 0, bottom: 0 },
    };

    const xAxis = (
      <XAxis
        dataKey={xKey}
        tick={{ fontSize: 11, fill: '#9CA3AF' }}
        axisLine={false}
        tickLine={false}
        angle={-35}
        textAnchor="end"
        height={70}
      />
    );

    const yAxis = (
      <YAxis
        tick={{ fontSize: 11, fill: '#9CA3AF' }}
        tickFormatter={formatTick}
        axisLine={false}
        tickLine={false}
      />
    );

    const grid = (
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="currentColor"
        className="text-gray-200 dark:text-gray-700"
        vertical={false}
      />
    );

    const tooltip = <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />;
    const legend = (
      <Legend
        wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
        iconType="circle"
        iconSize={8}
      />
    );

    const elements = numericKeys.flatMap((key, i) => {
      const col = numCols.find((c) => c.key === key);
      const color = COLORS[i % COLORS.length];
      const compKey = `${key}_prev`;
      const hasComparison = comparisonData && chartData.some((d) => d[compKey] !== undefined);
      const label = col?.titulo ?? key;

      if (chartType === 'bar') {
        const bars = [
          <Bar
            key={key}
            dataKey={key}
            name={label}
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />,
        ];
        if (hasComparison) {
          bars.push(
            <Bar
              key={compKey}
              dataKey={compKey}
              name={`${label} (Anterior)`}
              fill={COMPARISON_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              opacity={0.5}
            />,
          );
        }
        return bars;
      }

      if (chartType === 'line') {
        const lines = [
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 6, stroke: color, strokeWidth: 2, fill: '#fff' }}
          />,
        ];
        if (hasComparison) {
          lines.push(
            <Line
              key={compKey}
              type="monotone"
              dataKey={compKey}
              name={`${label} (Anterior)`}
              stroke={COMPARISON_COLOR}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3, fill: COMPARISON_COLOR, strokeWidth: 0 }}
            />,
          );
        }
        return lines;
      }

      // area
      const areas = [
        <Area
          key={key}
          type="monotone"
          dataKey={key}
          name={label}
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, stroke: color, strokeWidth: 2, fill: '#fff' }}
        />,
      ];
      if (hasComparison) {
        areas.push(
          <Area
            key={compKey}
            type="monotone"
            dataKey={compKey}
            name={`${label} (Anterior)`}
            stroke={COMPARISON_COLOR}
            fill={COMPARISON_COLOR}
            fillOpacity={0.05}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
          />,
        );
      }
      return areas;
    });

    if (chartType === 'bar') {
      return (
        <BarChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {elements}
        </BarChart>
      );
    }

    if (chartType === 'line') {
      return (
        <LineChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {elements}
        </LineChart>
      );
    }

    return (
      <AreaChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {legend}
        {elements}
      </AreaChart>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gráfico</h3>
        </div>
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {([
            { type: 'bar' as ChartType, icon: BarChart3, label: 'Barras' },
            { type: 'line' as ChartType, icon: TrendingUp, label: 'Líneas' },
            { type: 'area' as ChartType, icon: Activity, label: 'Área' },
          ]).map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                chartType === type
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div className="h-[320px] w-full bg-gray-50/50 dark:bg-gray-800/30 rounded-lg p-3 border border-gray-100 dark:border-gray-800">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
