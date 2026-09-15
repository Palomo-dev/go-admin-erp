'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import type { HealthScoreResult, HealthBand } from '@/lib/services/crm/healthScoreService';
import { RefreshCw, HeartPulse, AlertTriangle, CheckCircle2, CircleDot, Users, type LucideIcon } from 'lucide-react';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { HealthCustomerGrid } from './HealthCustomerGrid';
import { HealthDetailDrawer } from './HealthDetailDrawer';
import { BAND_STYLES } from './healthBandStyles';

/**
 * /app/crm/salud (F11): salud de clientes. Score y banda salen de
 * `fn_customer_health` + `health_score_configs.config` (dimensiones
 * configurables); alertas y tendencia en el detalle (`HealthDetailDrawer`).
 * «Recalcular» (r2) va por `POST /api/crm/health/refresh` con sesión: misma
 * pasada que el cron (snapshot solo si cambió o venció el intervalo).
 */
interface SaludViewProps {
  organizationId: number;
}

type FilterType = 'all' | HealthBand;

const STAT_CARDS: Array<{ key: FilterType; label: string; icon: LucideIcon; iconBox: string; text: string }> = [
  { key: 'all', label: 'Total monitoreados', icon: Users, iconBox: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', text: 'text-gray-900 dark:text-white' },
  { key: 'green', label: BAND_STYLES.green.label, icon: CheckCircle2, iconBox: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', text: BAND_STYLES.green.text },
  { key: 'yellow', label: BAND_STYLES.yellow.label, icon: CircleDot, iconBox: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', text: BAND_STYLES.yellow.text },
  { key: 'red', label: BAND_STYLES.red.label, icon: AlertTriangle, iconBox: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', text: BAND_STYLES.red.text },
];

export function SaludView({ organizationId }: SaludViewProps) {
  const [scores, setScores] = useState<HealthScoreResult[]>([]);
  const [loading, setLoading] = useState(true);
  // El toast desaparece; sin esto la pantalla quedaba en «0 clientes» como si
  // no hubiera datos cuando en realidad la carga había fallado.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const isFirstLoadRef = useRef(true);

  const loadScores = useCallback(async () => {
    if (isFirstLoadRef.current) setLoading(true);
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const data = await healthScoreService.getAllHealthScores(organizationId);
      setScores(data);
    } catch (err) {
      logError('[SaludView] cargar scores de salud', err);
      setLoadError(describeError(err));
    } finally {
      isFirstLoadRef.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadScores(); }, [loadScores]);

  const handleRecalculate = async () => {
    setIsRefreshing(true);
    try {
      const r = await healthScoreService.refreshAllHealthScores();
      const description = r.reason === 'config_inactive'
        ? 'La medición de salud está desactivada en la configuración de tu organización.'
        : `${r.customers} clientes medidos · ${r.customers_updated} cambiaron de score · ${r.snapshots_written} puntos nuevos en la tendencia`;
      toast({ title: 'Recálculo completado', description });
      await loadScores();
    } catch (err) {
      logError('[SaludView] recalcular', err);
      toast({ title: 'No se pudo recalcular', description: describeError(err), variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const counts: Record<FilterType, number> = {
    all: scores.length,
    red: scores.filter((s) => s.band === 'red').length,
    yellow: scores.filter((s) => s.band === 'yellow').length,
    green: scores.filter((s) => s.band === 'green').length,
  };
  const filteredScores = filter === 'all' ? scores : scores.filter((s) => s.band === filter);
  const filters: Array<{ key: FilterType; label: string; icon: LucideIcon; color: string }> = [
    { key: 'all', label: 'Todos', icon: HeartPulse, color: 'text-blue-700 dark:text-blue-400' },
    { key: 'red', label: 'Críticos', icon: AlertTriangle, color: BAND_STYLES.red.text },
    { key: 'yellow', label: 'Atención', icon: CircleDot, color: BAND_STYLES.yellow.text },
    { key: 'green', label: 'Saludables', icon: CheckCircle2, color: BAND_STYLES.green.text },
  ];
  const emptyText = filter === 'all'
    ? 'Todavía no hay clientes con datos de salud. Pulsa «Recalcular» para medir a todos los clientes activos.'
    : `No hay clientes en estado ${filters.find((f) => f.key === filter)?.label.toLowerCase()}.`;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
            <HeartPulse className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Salud de clientes</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Detecta a tiempo a quién debes llamar antes de que se pierda.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadScores()} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            Actualizar
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleRecalculate} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            Recalcular
          </Button>
        </div>
      </div>

      {loadError && (
        <LoadErrorState title="No se pudo cargar la salud de clientes" message={loadError} onRetry={() => void loadScores()} isRetrying={isRefreshing} />
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.key} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-3 sm:pt-4 sm:px-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${c.iconBox}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <dd className={`text-lg sm:text-2xl font-bold tabular-nums ${c.text}`}>{counts[c.key]}</dd>
                    <dt className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400">{c.label}</dt>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </dl>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto" role="group" aria-label="Filtrar por banda de salud">
        {filters.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-t ${
                isActive ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${f.color}`} aria-hidden="true" />
              {f.label}
              {counts[f.key] > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{counts[f.key]}</Badge>}
            </button>
          );
        })}
      </div>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-lg text-gray-900 dark:text-white">
            Clientes monitoreados
            <span className="text-xs sm:text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">({filteredScores.length} resultados)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <HealthCustomerGrid scores={filteredScores} loading={loading} dimmed={isRefreshing} emptyText={emptyText} onSelect={setSelectedCustomerId} />
        </CardContent>
      </Card>

      <HealthDetailDrawer customerId={selectedCustomerId} open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)} />
    </div>
  );
}

export default SaludView;
