'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MoreVertical, RotateCcw, Trash2, Download, Eye, Copy,
  CheckCircle2, XCircle, Loader2, Clock, Database,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  ReportExecution, STATUS_CONFIG, MODULE_LABEL,
} from './executionReportService';

interface ExecutionTableProps {
  data: ReportExecution[];
  isLoading: boolean;
  onReExecute: (item: ReportExecution) => void;
  onDelete: (item: ReportExecution) => void;
  onViewDetails: (item: ReportExecution) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

export function ExecutionTable({
  data, isLoading, onReExecute, onDelete, onViewDetails,
}: ExecutionTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <Database className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No hay ejecuciones registradas</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Las ejecuciones aparecerán aquí cuando se generen reportes</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_120px_100px_100px_80px_100px_44px] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
        <span>Reporte</span>
        <span>Fecha</span>
        <span>Estado</span>
        <span>Módulo</span>
        <span>Filas</span>
        <span>Duración</span>
        <span></span>
      </div>

      {/* Rows */}
      {data.map((item) => {
        const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
        return (
          <div
            key={item.id}
            className={cn(
              'grid grid-cols-1 lg:grid-cols-[1fr_120px_100px_100px_80px_100px_44px] gap-2 lg:gap-3 px-4 py-3',
              'border-b border-gray-100 dark:border-gray-800 last:border-b-0',
              'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors'
            )}
          >
            {/* Reporte + Usuario */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusIcon status={item.status} />
                <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                  {item.saved_report_name || 'Ejecución manual'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-6">
                {item.user_name && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {item.user_name}
                  </span>
                )}
                {item.error_message && (
                  <span className="text-xs text-red-500 dark:text-red-400 truncate" title={item.error_message}>
                    {item.error_message}
                  </span>
                )}
              </div>
            </div>

            {/* Fecha */}
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center lg:block">
              <span className="lg:hidden font-medium mr-1">Fecha:</span>
              {formatDate(item.created_at)}
            </div>

            {/* Estado */}
            <div className="flex items-center">
              <Badge variant="outline" className={cn('text-[11px]', statusCfg.color, statusCfg.darkColor)}>
                {statusCfg.label}
              </Badge>
            </div>

            {/* Módulo */}
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <span className="lg:hidden font-medium mr-1">Módulo:</span>
              {MODULE_LABEL[item.module] || item.module}
            </div>

            {/* Filas */}
            <div className="text-sm text-gray-700 dark:text-gray-300 flex items-center">
              <span className="lg:hidden font-medium mr-1 text-xs text-gray-400">Filas:</span>
              {item.row_count.toLocaleString('es-CO')}
            </div>

            {/* Duración */}
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <span className="lg:hidden font-medium mr-1">Dur:</span>
              {formatDuration(item.duration_ms)}
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                  <DropdownMenuItem onClick={() => onViewDetails(item)} className="gap-2">
                    <Eye className="h-4 w-4" /> Ver detalles
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onReExecute(item)} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Re-ejecutar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(item.filters, null, 2));
                    }}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" /> Copiar filtros
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(item)} className="gap-2 text-red-600 dark:text-red-400">
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
