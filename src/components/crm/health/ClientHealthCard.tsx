'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthSnapshot, HealthBand } from '@/lib/services/crm/healthScoreService';
import { formatCurrency } from '@/utils/Utils';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Minus,
} from 'lucide-react';

interface ClientHealthCardProps {
  customerId: string;
  customerName: string;
}

const BAND_CONFIG: Record<HealthBand, { color: string; bg: string; label: string; ring: string }> = {
  green: {
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500',
    label: 'Saludable',
    ring: 'stroke-green-500',
  },
  yellow: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500',
    label: 'Atencion',
    ring: 'stroke-amber-500',
  },
  red: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500',
    label: 'Critico',
    ring: 'stroke-red-500',
  },
};

export function ClientHealthCard({ customerId, customerName }: ClientHealthCardProps) {
  const [score, setScore] = useState<HealthScoreResult | null>(null);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreData, historyData] = await Promise.all([
        healthScoreService.calculateHealthScore(customerId),
        healthScoreService.getHealthHistory(customerId, 20),
      ]);
      setScore(scoreData);
      setHistory(historyData);
    } catch (err) {
      console.error('Error cargando health card:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <Skeleton className="h-6 w-32 mb-3" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sin datos de salud para {customerName}
        </p>
      </Card>
    );
  }

  const bandConfig = BAND_CONFIG[score.band];

  // Detectar alerta: N ciclos seguidos en rojo (N=3)
  const recentRedCount = [...history].reverse().filter((s) => s.band === 'red').length;
  const isRedAlert = score.band === 'red' && recentRedCount >= 3;

  // Calcular tendencia
  const trend = history.length >= 2
    ? history[history.length - 1].score - history[history.length - 2].score
    : 0;

  // Indicadores clave
  const recencyIndicator = score.indicators.find((i) => i.key === 'recency');
  const frequencyIndicator = score.indicators.find((i) => i.key === 'frequency');
  const ltvIndicator = score.indicators.find((i) => i.key === 'ltv');

  // Gauge SVG
  const gaugeScore = score.score;
  const gaugeCircumference = 2 * Math.PI * 36;
  const gaugeOffset = gaugeCircumference - (gaugeScore / 100) * gaugeCircumference;

  return (
    <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {customerName}
        </h3>
        <Badge className={`text-[10px] ${bandConfig.color} border-current`}>
          {bandConfig.label}
        </Badge>
      </div>

      <div className="flex items-start gap-4">
        {/* Gauge */}
        <div className="relative shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              strokeWidth="6"
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={gaugeCircumference}
              strokeDashoffset={gaugeOffset}
              className={bandConfig.ring}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-bold ${bandConfig.color}`}>
              {gaugeScore}
            </span>
          </div>
        </div>

        {/* Indicadores */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {recencyIndicator && (
            <IndicatorRow
              icon={<Activity className="h-3 w-3" />}
              label="Recencia"
              value={`${recencyIndicator.value}d`}
              score={recencyIndicator.score}
            />
          )}
          {frequencyIndicator && (
            <IndicatorRow
              icon={<TrendingUp className="h-3 w-3" />}
              label="Frecuencia"
              value={`${frequencyIndicator.value} compras`}
              score={frequencyIndicator.score}
            />
          )}
          {ltvIndicator && (
            <IndicatorRow
              icon={<TrendingUp className="h-3 w-3" />}
              label="LTV"
              value={formatCurrency(ltvIndicator.value, 'COP')}
              score={ltvIndicator.score}
            />
          )}
        </div>
      </div>

      {/* Sparkline de tendencia */}
      {history.length >= 2 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">Tendencia</span>
            {trend !== 0 && (
              <span className={`text-[10px] flex items-center gap-0.5 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend > 0 ? '+' : ''}{trend}
              </span>
            )}
            {trend === 0 && (
              <span className="text-[10px] flex items-center gap-0.5 text-gray-400">
                <Minus className="h-3 w-3" /> estable
              </span>
            )}
          </div>
          <Sparkline data={history.map((s) => s.score)} band={score.band} />
        </div>
      )}

      {/* Alerta roja */}
      {isRedAlert && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <span className="text-[11px] text-red-700 dark:text-red-400">
            Cliente en rojo {recentRedCount} ciclos seguidos — requiere accion inmediata
          </span>
        </div>
      )}
    </Card>
  );
}

// ============== Sub-componentes ==============

interface IndicatorRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  score: number;
}

function IndicatorRow({ icon, label, value, score }: IndicatorRowProps) {
  const scoreColor =
    score >= 70 ? 'text-green-500' :
    score >= 40 ? 'text-amber-500' :
    'text-red-500';

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-gray-400 dark:text-gray-500 shrink-0">{icon}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{value}</span>
        <span className={`text-[10px] font-bold ${scoreColor}`}>{score}</span>
      </div>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  band: HealthBand;
}

function Sparkline({ data, band }: SparklineProps) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 24;
  const maxVal = 100;
  const minVal = 0;
  const range = maxVal - minVal;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - minVal) / range) * height;
    return `${x},${y}`;
  });

  const lineColor =
    band === 'green' ? '#22c55e' :
    band === 'yellow' ? '#f59e0b' :
    '#ef4444';

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Punto final */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - minVal) / range) * height}
          r="2"
          fill={lineColor}
        />
      )}
    </svg>
  );
}

export default ClientHealthCard;
