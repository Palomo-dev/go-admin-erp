'use client';

/**
 * Página de Llamadas — /app/crm/llamadas (FASE-03 §5.1)
 * Estadísticas de hoy + CallsTable con fila expandible (player, transcripción,
 * análisis). El softphone global vive en src/app/app/layout.tsx (sin provider
 * local). `?call={id}` abre esa llamada expandida.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Phone, Clock, PhoneMissed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CallsTable } from '@/components/voice/CallsTable';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { fetchJson } from '@/lib/utils/fetchJson';
import type { CallRecord } from '@/lib/services/crm/callManagementService';

function todayRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { fromDate: start.toISOString(), toDate: end.toISOString() };
}

function formatAvg(seconds: number): string {
  if (seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

interface CallStats {
  totalToday: number;
  avgDuration: number;
  missed: number;
}

function CallsStats({ stats, isLoading }: { stats: CallStats; isLoading: boolean }) {
  const items = [
    { key: 'totalToday', label: 'Llamadas hoy', value: stats.totalToday, icon: Phone, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { key: 'avgDuration', label: 'Duración promedio', value: formatAvg(stats.avgDuration), icon: Clock, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
    { key: 'missed', label: 'Perdidas', value: stats.missed, icon: PhoneMissed, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key} className="border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:shadow-gray-900/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`shrink-0 rounded-lg p-2 ${item.bg}`}>
                  <Icon className={`h-5 w-5 ${item.color}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {isLoading ? <div className="h-7 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" /> : <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.value}</p>}
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LlamadasContent() {
  const searchParams = useSearchParams();
  const openCallId = searchParams?.get('call') ?? null;
  const sp = useSoftphone();
  const [stats, setStats] = useState<CallStats>({ totalToday: 0, avgDuration: 0, missed: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    setStatsError(null);
    try {
      const { fromDate, toDate } = todayRange();
      const data = await fetchJson<{ data?: CallRecord[] }>(
        `/api/crm/calls?${new URLSearchParams({ from_date: fromDate, to_date: toDate, limit: '200' })}`
      );
      const calls: CallRecord[] = data.data ?? [];
      const withDuration = calls.filter((c) => (c.duration_seconds ?? 0) > 0);
      const avg = withDuration.length > 0 ? withDuration.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0) / withDuration.length : 0;
      const missed = calls.filter((c) => ['no_answer', 'busy', 'canceled', 'failed', 'voicemail'].includes(c.status)).length;
      setStats({ totalToday: calls.length, avgDuration: Math.round(avg), missed });
    } catch (err) {
      logError('[LlamadasPage] estadísticas', err);
      setStatsError(describeError(err));
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Al terminar una llamada (diálogo de disposición cerrado) refresca tabla y stats.
  // `lastEnded` también es null en el primer render: sin este centinela la página
  // pedía las estadísticas dos veces al montar.
  const lastEnded = sp.available ? sp.lastEndedCall : null;
  const hadEndedCall = useRef(false);
  useEffect(() => {
    if (lastEnded) {
      hadEndedCall.current = true;
      return;
    }
    if (!hadEndedCall.current) return;
    hadEndedCall.current = false;
    setRefreshKey((k) => k + 1);
    void loadStats();
  }, [lastEnded, loadStats]);

  return (
    <div className="min-h-full space-y-6 bg-gray-50 p-4 dark:bg-gray-900 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
            <Phone size={24} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Llamadas
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Historial, grabaciones y análisis. El softphone está en la esquina inferior derecha (Ctrl+Shift+C para llamar).</p>
        </div>
      </div>
      {statsError ? (
        <LoadErrorState
          title="No se pudieron cargar las estadísticas de hoy"
          message={statsError}
          onRetry={() => void loadStats()}
          isRetrying={isLoadingStats}
        />
      ) : (
        <CallsStats stats={stats} isLoading={isLoadingStats} />
      )}
      <CallsTable openCallId={openCallId} refreshKey={refreshKey} />
    </div>
  );
}

export default function LlamadasPage() {
  return (
    <Suspense fallback={null}>
      <LlamadasContent />
    </Suspense>
  );
}
