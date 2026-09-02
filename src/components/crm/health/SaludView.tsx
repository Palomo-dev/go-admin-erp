'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/use-toast';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthSnapshot, HealthBand } from '@/lib/services/crm/healthScoreService';
import {
  RefreshCw,
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  Minus,
  FileText,
} from 'lucide-react';

interface SaludViewProps {
  organizationId: number;
}

type FilterType = 'all' | 'red' | 'yellow' | 'green';

const BAND_CONFIG: Record<HealthBand, { color: string; bg: string; label: string; ring: string; iconBg: string; badgeBg: string; icon: typeof AlertTriangle }> = {
  green: {
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500',
    label: 'Saludable',
    ring: 'stroke-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    badgeBg: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
  },
  yellow: {
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500',
    label: 'Atencion',
    ring: 'stroke-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: CircleDot,
  },
  red: {
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500',
    label: 'Critico',
    ring: 'stroke-red-500',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    badgeBg: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: AlertTriangle,
  },
};

export function SaludView({ organizationId }: SaludViewProps) {
  const [scores, setScores] = useState<HealthScoreResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);

  const loadScores = useCallback(async () => {
    if (isFirstLoadRef.current) {
      setLoading(true);
    }
    setIsRefreshing(true);
    try {
      const data = await healthScoreService.getAllHealthScores(organizationId);
      setScores(data);
    } catch (err) {
      console.error('Error cargando scores de salud:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los scores de salud',
        variant: 'destructive',
      });
    } finally {
      isFirstLoadRef.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const handleRecalculate = async () => {
    setIsRefreshing(true);
    try {
      const count = await healthScoreService.refreshAllHealthScores(organizationId);
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
      setIsRefreshing(false);
    }
  };

  const filteredScores = filter === 'all'
    ? scores
    : scores.filter((s) => s.band === filter);

  const counts = {
    total: scores.length,
    red: scores.filter((s) => s.band === 'red').length,
    yellow: scores.filter((s) => s.band === 'yellow').length,
    green: scores.filter((s) => s.band === 'green').length,
  };

  const filters: { key: FilterType; label: string; count: number; icon: typeof AlertTriangle; color: string }[] = [
    { key: 'all', label: 'Todos', count: counts.total, icon: HeartPulse, color: 'text-blue-600 dark:text-blue-400' },
    { key: 'red', label: 'Criticos', count: counts.red, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400' },
    { key: 'yellow', label: 'Atencion', count: counts.yellow, icon: CircleDot, color: 'text-amber-600 dark:text-amber-400' },
    { key: 'green', label: 'Saludables', count: counts.green, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
            <HeartPulse className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
              Salud de Clientes
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Monitorea el estado de tus clientes y toma accion antes de que se pierdan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadScores} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={handleRecalculate} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {counts.total}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Total monitoreados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
                  {counts.green}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Saludables</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <CircleDot className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {counts.yellow}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Atencion</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 sm:pt-4 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {counts.red}
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Criticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-lg text-gray-900 dark:text-white">
            Clientes monitoreados
            <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
              ({filteredScores.length} resultados)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
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
            <div className={isRefreshing ? 'opacity-60 pointer-events-none' : ''}>
              {/* Grid de cards con gauge circular — todos los tamaños */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredScores.map((score) => {
                  const config = BAND_CONFIG[score.band];
                  const circumference = 2 * Math.PI * 28;
                  const offset = circumference - (score.score / 100) * circumference;
                  return (
                    <div
                      key={score.customer_id}
                      onClick={() => setSelectedCustomerId(score.customer_id)}
                      className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:shadow-md dark:hover:shadow-gray-900/30 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all"
                    >
                      {/* Gauge circular */}
                      <div className="relative shrink-0">
                        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            strokeWidth="5"
                            className="stroke-gray-200 dark:stroke-gray-700"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            className={config.ring}
                            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
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
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1.5 ${config.badgeBg}`}>
                          {config.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drawer de detalle */}
      <HealthDetailDrawer
        customerId={selectedCustomerId}
        open={!!selectedCustomerId}
        onOpenChange={(open) => !open && setSelectedCustomerId(null)}
      />
    </div>
  );
}

// ============== Drawer de detalle de salud ==============

interface HealthDetailDrawerProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function HealthDetailDrawer({ customerId, open, onOpenChange }: HealthDetailDrawerProps) {
  const [score, setScore] = useState<HealthScoreResult | null>(null);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId || !open) return;
    setLoading(true);
    (async () => {
      try {
        const [scoreData, historyData] = await Promise.all([
          healthScoreService.getCustomerHealthScore(customerId),
          healthScoreService.getHealthHistory(customerId, 20),
        ]);
        setScore(scoreData);
        setHistory(historyData);
      } catch (err) {
        console.error('Error cargando detalle de salud:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, open]);

  const bandConfig = score ? BAND_CONFIG[score.band] : null;

  // Calcular tendencia
  const trend = history.length >= 2
    ? history[history.length - 1].score - history[history.length - 2].score
    : 0;

  const gaugeCircumference = 2 * Math.PI * 40;
  const gaugeOffset = score ? gaugeCircumference - (score.score / 100) * gaugeCircumference : gaugeCircumference;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-500" />
            Detalle de Salud
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !score || !bandConfig ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <HeartPulse className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay datos de salud disponibles para este cliente.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {/* Score principal */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  {/* Gauge */}
                  <div className="relative shrink-0">
                    <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        fill="none"
                        strokeWidth="6"
                        className="stroke-gray-200 dark:stroke-gray-700"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
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
                      <span className={`text-2xl font-bold ${bandConfig.color}`}>
                        {score.score}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {score.customer_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${bandConfig.badgeBg}`}>
                        {bandConfig.label}
                      </span>
                      {trend !== 0 && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {trend > 0 ? '+' : ''}{trend}
                        </span>
                      )}
                      {trend === 0 && history.length >= 2 && (
                        <span className="text-[10px] flex items-center gap-0.5 text-gray-400">
                          <Minus className="h-3 w-3" /> estable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Indicadores */}
            {score.indicators.length > 0 && (
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-2 px-4">
                  <CardTitle className="text-sm text-gray-900 dark:text-white">
                    Indicadores
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {score.indicators.map((ind) => {
                    const Icon =
                      ind.key === 'invoices_12m' ? FileText :
                      ind.key === 'revenue_12m' ? TrendingUp :
                      ind.key === 'days_since_last_invoice' ? Activity :
                      ind.key === 'days_since_last_activity' ? Activity :
                      ind.key === 'overdue_balance' ? AlertTriangle :
                      ind.key === 'overdue_ratio' ? AlertTriangle :
                      Activity;
                    // Formatear valor según el tipo de indicador
                    const formatValue = (key: string, value: number) => {
                      if (key === 'revenue_12m' || key === 'overdue_balance') {
                        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
                      }
                      if (key === 'overdue_ratio') {
                        return `${(value * 100).toFixed(1)}%`;
                      }
                      if (key === 'days_since_last_invoice' || key === 'days_since_last_activity') {
                        return value < 0 ? 'N/A' : `${value}d`;
                      }
                      return String(value);
                    };
                    return (
                      <div key={ind.key} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{ind.label}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {formatValue(ind.key, ind.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Tendencia / historial */}
            {history.length >= 2 && (
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-2 px-4">
                  <CardTitle className="text-sm text-gray-900 dark:text-white">
                    Historial ({history.length} snapshots)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <Sparkline data={history.map((s) => s.score)} band={score.band} />
                  <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                    {history.slice(-8).reverse().map((snap, idx) => {
                      const snapConfig = BAND_CONFIG[snap.band];
                      const snapDate = new Date(snap.created_at).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <div key={snap.id || idx} className="flex items-center justify-between text-xs py-1">
                          <span className="text-gray-500 dark:text-gray-400">{snapDate}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${snapConfig.color}`}>{snap.score}</span>
                            <div className={`h-1.5 w-1.5 rounded-full ${snapConfig.bg}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Acciones */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  if (customerId) {
                    window.open(`/app/crm/clientes/${customerId}`, '_blank');
                  }
                }}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Ver ficha 360
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={async () => {
                  if (!customerId) return;
                  try {
                    await healthScoreService.snapshotHealthScore(customerId);
                    toast({ title: 'Snapshot guardado' });
                    // Recargar usando la misma RPC para consistencia
                    const [scoreData, historyData] = await Promise.all([
                      healthScoreService.getCustomerHealthScore(customerId),
                      healthScoreService.getHealthHistory(customerId, 20),
                    ]);
                    setScore(scoreData);
                    setHistory(historyData);
                  } catch {
                    toast({ title: 'Error', description: 'No se pudo guardar el snapshot', variant: 'destructive' });
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Recalcular
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============== Sparkline ==============

interface SparklineProps {
  data: number[];
  band: HealthBand;
}

function Sparkline({ data, band }: SparklineProps) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 30;
  const range = 100;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (val / range) * height;
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
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - (data[data.length - 1] / range) * height}
          r="2"
          fill={lineColor}
        />
      )}
    </svg>
  );
}

export default SaludView;
