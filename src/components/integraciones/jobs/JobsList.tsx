'use client';

import React from 'react';
import Link from 'next/link';
import {
  Cog,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  MoreVertical,
  RotateCcw,
  Copy,
  Trash2,
  RefreshCcw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IntegrationJob } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';

interface JobsListProps {
  jobs: IntegrationJob[];
  loading?: boolean;
  onRetry: (job: IntegrationJob) => void;
  onDuplicate: (job: IntegrationJob) => void;
  onCancel: (job: IntegrationJob) => void;
  onResetCursor: (job: IntegrationJob) => void;
  onDelete: (job: IntegrationJob) => void;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'success':
      return {
        icon: CheckCircle2,
        label: 'Exitoso',
        className: 'text-green-600 dark:text-green-400',
        bgClassName: 'bg-green-100 dark:bg-green-900/30',
      };
    case 'failed':
      return {
        icon: XCircle,
        label: 'Fallido',
        className: 'text-red-600 dark:text-red-400',
        bgClassName: 'bg-red-100 dark:bg-red-900/30',
      };
    case 'running':
      return {
        icon: Loader2,
        label: 'Ejecutando',
        className: 'text-blue-600 dark:text-blue-400',
        bgClassName: 'bg-blue-100 dark:bg-blue-900/30',
        animate: true,
      };
    case 'cancelled':
      return {
        icon: Ban,
        label: 'Cancelado',
        className: 'text-gray-600 dark:text-gray-400',
        bgClassName: 'bg-gray-100 dark:bg-gray-800',
      };
    default:
      return {
        icon: Clock,
        label: 'En cola',
        className: 'text-yellow-600 dark:text-yellow-400',
        bgClassName: 'bg-yellow-100 dark:bg-yellow-900/30',
      };
  }
};

const JOB_TYPE_LABELS: Record<string, string> = {
  pull: 'Pull',
  push: 'Push',
  full_sync: 'Full Sync',
  incremental: 'Incremental',
  reconcile: 'Reconcile',
  webhook_replay: 'Replay',
};

export function JobsList({
  jobs,
  loading = false,
  onRetry,
  onDuplicate,
  onCancel,
  onResetCursor,
  onDelete,
}: JobsListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
          <Cog className="h-8 w-8 text-orange-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin jobs
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No hay jobs que coincidan con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Job
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conexión
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ejecuciones
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Última ejecución
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {jobs.map((job) => {
              const statusConfig = getStatusConfig(job.status);
              const StatusIcon = statusConfig.icon;
              const connection = job.connection as any;

              return (
                <tr
                  key={job.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Job */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-1.5 rounded-lg', statusConfig.bgClassName)}>
                        <Cog className={cn('h-4 w-4', statusConfig.className)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {job.resource_type}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px]">
                          {job.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Conexión */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/integraciones/conexiones/${job.connection_id}`}
                      className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {connection?.name || 'Sin nombre'}
                    </Link>
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon
                        className={cn(
                          'h-4 w-4',
                          statusConfig.className,
                          (statusConfig as any).animate && 'animate-spin'
                        )}
                      />
                      <span className={cn('text-sm', statusConfig.className)}>
                        {statusConfig.label}
                      </span>
                    </div>
                    {job.last_error && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span className="text-xs text-red-500 truncate max-w-[150px]">
                          {job.last_error}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Ejecuciones */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {job.run_count}
                    </span>
                  </td>

                  {/* Última ejecución */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {job.last_run_at ? formatDate(job.last_run_at) : 'Nunca'}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {job.status === 'failed' && (
                          <DropdownMenuItem onClick={() => onRetry(job)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reintentar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onDuplicate(job)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        {(job.status === 'queued' || job.status === 'running') && (
                          <DropdownMenuItem onClick={() => onCancel(job)}>
                            <Ban className="h-4 w-4 mr-2" />
                            Cancelar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onResetCursor(job)}
                          className="text-orange-600 dark:text-orange-400"
                        >
                          <RefreshCcw className="h-4 w-4 mr-2" />
                          Reiniciar Cursor
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(job)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JobsList;
