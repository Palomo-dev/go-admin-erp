'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthBand } from '@/lib/services/crm/healthScoreService';
import {
  RefreshCw,
  Loader2,
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
} from 'lucide-react';

interface SaludViewProps {
  organizationId: number;
}

type FilterType = 'all' | 'red' | 'yellow' | 'green';

export function SaludView({ organizationId }: SaludViewProps) {
  void organizationId;
  const [scores, setScores] = useState<HealthScoreResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadScores = useCallback(async () => {
    setLoading(true);
    try {
      const data = await healthScoreService.getAllHealthScores();
      setScores(data);
    } catch (err) {
      console.error('Error cargando scores de salud:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los scores de salud',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const count = await healthScoreService.refreshAllHealthScores();
      toast({
        title: 'Recalculo completado',
        description: `${count} clientes recalculados`,
      });
      await loadScores();
    } catch (err) {
      console.error('Error recalculando:', err);
      toast({
        title: 'Error',
        description: 'No se pudo recalcular los scores',
        variant: 'destructive',
      });
    } finally {
      setRecalculating(false);
    }
  };

  const filteredScores = filter === 'all'
    ? scores
    : scores.filter((s) => s.band === filter);

  const counts = {
    red: scores.filter((s) => s.band === 'red').length,
    yellow: scores.filter((s) => s.band === 'yellow').length,
    green: scores.filter((s) => s.band === 'green').length,
  };

  const filters: { key: FilterType; label: string; count: number; icon: typeof AlertTriangle; color: string }[] = [
    { key: 'all', label: 'Todos', count: scores.length, icon: HeartPulse, color: 'text-gray-500' },
    { key: 'red', label: 'Criticos', count: counts.red, icon: AlertTriangle, color: 'text-red-500' },
    { key: 'yellow', label: 'Atencion', count: counts.yellow, icon: CircleDot, color: 'text-amber-500' },
    { key: 'green', label: 'Saludables', count: counts.green, icon: CheckCircle2, color: 'text-green-500' },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Salud de Clientes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {scores.length} clientes monitoreados
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="h-8"
        >
          {recalculating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Recalcular
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {filters.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${f.color}`} />
              {f.label}
              {f.count > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {f.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista de clientes */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filteredScores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <HeartPulse className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filter === 'all'
              ? 'No hay clientes con datos de salud. Usa "Recalcular" para generar scores.'
              : `No hay clientes en estado ${filter === 'red' ? 'critico' : filter === 'yellow' ? 'atencion' : 'saludable'}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredScores.map((score) => (
            <HealthScoreRow key={score.customer_id} score={score} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============== Sub-componente ==============

interface HealthScoreRowProps {
  score: HealthScoreResult;
}

function HealthScoreRow({ score }: HealthScoreRowProps) {
  const bandConfig: Record<HealthBand, { color: string; bg: string; label: string }> = {
    green: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500', label: 'Saludable' },
    yellow: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', label: 'Atencion' },
    red: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500', label: 'Critico' },
  };

  const config = bandConfig[score.band];
  const gaugeCircumference = 2 * Math.PI * 28;
  const gaugeOffset = gaugeCircumference - (score.score / 100) * gaugeCircumference;

  return (
    <Card className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        {/* Gauge compacto */}
        <div className="relative shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              strokeWidth="4"
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={gaugeCircumference}
              strokeDashoffset={gaugeOffset}
              className={config.bg === 'bg-green-500' ? 'stroke-green-500' : config.bg === 'bg-amber-500' ? 'stroke-amber-500' : 'stroke-red-500'}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-base font-bold ${config.color}`}>
              {score.score}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {score.customer_name}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-[10px] ${config.color} border-current`}>
              {config.label}
            </Badge>
            {score.indicators.length > 0 && (
              <div className="flex gap-1.5">
                {score.indicators.slice(0, 3).map((ind) => (
                  <span
                    key={ind.key}
                    className="text-[10px] text-gray-400 dark:text-gray-500"
                    title={`${ind.label}: ${ind.value}`}
                  >
                    {ind.key === 'recency' ? `${ind.value}d` :
                     ind.key === 'frequency' ? `${ind.value}x` :
                     ind.key === 'ltv' ? 'LTV' : ind.key}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default SaludView;
