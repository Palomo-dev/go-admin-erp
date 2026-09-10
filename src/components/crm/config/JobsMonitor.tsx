'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import type { JobListItem, JobStats } from '@/lib/services/crm/jobsService';
import { JobsTable, STATUS_LABEL, type StatusFilter } from './JobsTable';

/**
 * Monitor de la cola `outbound_jobs` de la organización (FASE-00 §5.2).
 * Montado en Configuración › CRM › Créditos (`CreditosTab.tsx`).
 * Datos: GET /api/crm/jobs (sesión; admin o Manager); reintento:
 * POST /api/crm/jobs/[id]/retry (solo admin → `canRetry` de la respuesta).
 *
 * Semántica de estados (tester r1 F-10): `failed` es TERMINAL (no reintentable
 * automáticamente), `dead` agotó intentos; los reintentos automáticos son
 * `queued` con `attempts > 0` y aparecen en "Últimos fallos".
 */

const PAGE_SIZE = 50;

interface JobsResponse {
  success: boolean;
  items: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: JobStats;
  recentFailed: JobListItem[];
  canRetry?: boolean;
  error?: string;
}

export interface JobsMonitorProps {
  /** Si se indica se envía como `X-Organization-Id` (usuarios con varias orgs); la org siempre se valida en el servidor. */
  organizationId?: number;
  className?: string;
}

export function JobsMonitor({ organizationId, className }: JobsMonitorProps) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const headers = useCallback((): HeadersInit => (organizationId ? { 'X-Organization-Id': String(organizationId) } : {}), [organizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status !== 'all') qs.set('status', status);
      const res = await fetch(`/api/crm/jobs?${qs.toString()}`, { cache: 'no-store', headers: headers() });
      const json = (await res.json()) as JobsResponse;
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando jobs');
    } finally {
      setLoading(false);
    }
  }, [status, page, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      const res = await fetch(`/api/crm/jobs/${id}/retry`, { method: 'POST', headers: headers() });
      const json = (await res.json()) as { success: boolean; error?: string; jobId?: string };
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      toast({ title: 'Job re-encolado', description: 'Se ejecutará en el próximo ciclo (≤1 min).' });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo reintentar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  const stats = data?.stats;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canRetry = data?.canRetry === true;

  return (
    <section className={cn('space-y-4', className)} aria-labelledby="jobs-monitor-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="jobs-monitor-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Cola de trabajos
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Envíos, transcripciones y automatizaciones en segundo plano. Se drena cada minuto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="jobs-status-filter" className="sr-only">Filtrar por estado</label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger id="jobs-status-filter" className="w-[190px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {stats && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(['queued', 'running', 'done', 'failed', 'dead'] as const).map((s) => (
            <div key={s} className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
              <dt className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABEL[s]}</dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.byStatus[s]}</dd>
            </div>
          ))}
        </dl>
      )}
      {stats && stats.queuedOverdue > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          {stats.queuedOverdue} job(s) llevan más de 2 min en cola: revisa que el cron esté activo.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <JobsTable
        items={data?.items ?? []}
        loading={loading && !data}
        emptyText={`No hay trabajos${status === 'all' ? '' : ` en estado "${STATUS_LABEL[status]}"`}.`}
        canRetry={canRetry}
        retrying={retrying}
        onRetry={retry}
      />

      <nav className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300" aria-label="Paginación de trabajos">
        <span>
          {total} trabajo(s) · página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={loading || page >= totalPages}>
            Siguiente
          </Button>
        </div>
      </nav>

      {data && data.recentFailed.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Últimos fallos ({data.recentFailed.length})
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Fallidos, muertos y reintentos automáticos en curso (en cola con intentos previos), ordenados por última actualización.
          </p>
          <JobsTable items={data.recentFailed} loading={false} emptyText="" canRetry={canRetry} retrying={retrying} onRetry={retry} compact />
        </div>
      )}
    </section>
  );
}

export default JobsMonitor;
