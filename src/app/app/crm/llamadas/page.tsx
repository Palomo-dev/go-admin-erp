'use client';

/**
 * Página de Llamadas — /app/crm/llamadas
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Muestra estadísticas (llamadas hoy, duración promedio, perdidas),
 * la tabla de historial (CallsTable) y el softphone flotante (SoftphoneDock).
 *
 * Envuelve todo en <SoftphoneProvider> para que el dock y los botones
 * click-to-call tengan acceso al contexto de Twilio Voice SDK.
 */

import { useState, useEffect, useCallback } from 'react';
import { Phone, Clock, PhoneMissed, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SoftphoneProvider } from '@/components/voice/SoftphoneProvider';
import { SoftphoneDock } from '@/components/voice/SoftphoneDock';
import { IncomingCallToast } from '@/components/voice/IncomingCallToast';
import { CallsTable } from '@/components/voice/CallsTable';
import { useToast } from '@/components/ui/use-toast';
import type { CallRecord } from '@/lib/services/crm/callManagementService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    fromDate: start.toISOString(),
    toDate: end.toISOString(),
  };
}

function formatAvgDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

interface CallStats {
  totalToday: number;
  avgDuration: number;
  missed: number;
}

function CallsStats({ stats, isLoading }: { stats: CallStats; isLoading: boolean }) {
  const items = [
    {
      key: 'totalToday',
      label: 'Llamadas hoy',
      value: stats.totalToday,
      icon: Phone,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      key: 'avgDuration',
      label: 'Duración promedio',
      value: formatAvgDuration(stats.avgDuration),
      icon: Clock,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      key: 'missed',
      label: 'Perdidas',
      value: stats.missed,
      icon: PhoneMissed,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.key}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${item.bg}`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  {isLoading ? (
                    <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  ) : (
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {item.value}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {item.label}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Página interna (dentro del Provider) ────────────────────────────────────

function LlamadasPageContent() {
  const { toast } = useToast();
  const [stats, setStats] = useState<CallStats>({ totalToday: 0, avgDuration: 0, missed: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const { fromDate, toDate } = getTodayRange();
      const params = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        limit: '500',
      });

      const res = await fetch(`/api/crm/calls?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar estadísticas');
      const data = await res.json();

      const calls: CallRecord[] = data.data ?? [];
      const totalToday = calls.length;

      // Duración promedio (solo llamadas con duración)
      const callsWithDuration = calls.filter((c) => c.duration_seconds !== null && c.duration_seconds > 0);
      const avgDuration =
        callsWithDuration.length > 0
          ? callsWithDuration.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0) /
            callsWithDuration.length
          : 0;

      // Llamadas perdidas (no-answer, busy, canceled, failed)
      const missed = calls.filter((c) =>
        ['no-answer', 'busy', 'canceled', 'failed'].includes(c.status)
      ).length;

      setStats({ totalToday, avgDuration: Math.round(avgDuration), missed });
    } catch (err) {
      console.error('[LlamadasPage] Error cargando stats:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las estadísticas',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingStats(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Phone size={24} className="text-blue-600 dark:text-blue-400" />
            Llamadas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Historial de llamadas y softphone integrado
          </p>
        </div>
      </div>

      {/* Stats */}
      <CallsStats stats={stats} isLoading={isLoadingStats} />

      {/* Tabla de historial */}
      <CallsTable />

      {/* Softphone flotante + Toast de llamada entrante */}
      <SoftphoneDock />
      <IncomingCallToast />
    </div>
  );
}

// ─── Página (envuelve en Provider) ───────────────────────────────────────────

export default function LlamadasPage() {
  return (
    <SoftphoneProvider>
      <LlamadasPageContent />
    </SoftphoneProvider>
  );
}
