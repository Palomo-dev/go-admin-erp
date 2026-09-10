'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/utils/Utils';
import type { JobListItem } from '@/lib/services/crm/jobsService';

/** Tabla de jobs usada por `JobsMonitor` (lista principal y "Últimos fallos"). */

export type StatusFilter = 'all' | 'queued' | 'running' | 'done' | 'failed' | 'dead';

export const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'Todos',
  queued: 'En cola',
  running: 'Ejecutando',
  done: 'Completados',
  failed: 'Fallidos (definitivo)',
  dead: 'Muertos (sin intentos)',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info'> = {
  queued: 'info',
  running: 'warning',
  done: 'success',
  failed: 'destructive',
  dead: 'destructive',
};

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Un job `queued` con intentos previos es un reintento automático pendiente. */
function statusText(job: JobListItem): string {
  if (job.status === 'queued' && job.attempts > 0) return 'reintento';
  return job.status;
}

export interface JobsTableProps {
  items: JobListItem[];
  loading: boolean;
  emptyText: string;
  canRetry: boolean;
  retrying: string | null;
  onRetry: (id: string) => void | Promise<void>;
  compact?: boolean;
}

export function JobsTable({ items, loading, emptyText, canRetry, retrying, onRetry, compact }: JobsTableProps) {
  const cols = canRetry ? 7 : 6;
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Intentos</TableHead>
            <TableHead>{compact ? 'Actualizado' : 'Programado'}</TableHead>
            <TableHead>Payload</TableHead>
            <TableHead>Error</TableHead>
            {canRetry && <TableHead className="text-right">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && items.length === 0 && emptyText && (
            <TableRow>
              <TableCell colSpan={cols} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {loading && (
            <TableRow>
              <TableCell colSpan={cols} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Cargando…</TableCell>
            </TableRow>
          )}
          {items.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-mono text-xs">{job.kind}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[job.status] ?? 'secondary'}>{statusText(job)}</Badge>
              </TableCell>
              <TableCell className="tabular-nums">{job.attempts}/{job.max_attempts}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{fmtDate(compact ? job.updated_at : job.run_at)}</TableCell>
              <TableCell className="max-w-[220px] truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" title={job.payload_preview}>
                {job.payload_preview === '{}' ? '—' : job.payload_preview}
              </TableCell>
              <TableCell className={cn('max-w-[280px] truncate text-xs text-gray-600 dark:text-gray-300')} title={job.last_error ?? ''}>
                {job.last_error ?? '—'}
              </TableCell>
              {canRetry && (
                <TableCell className="text-right">
                  {(job.status === 'dead' || job.status === 'failed') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onRetry(job.id)}
                      disabled={retrying === job.id}
                      aria-label={`Reintentar job ${job.kind}`}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reintentar
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
