'use client';

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ReportExecution } from './scheduledReportService';

interface ExecutionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleName: string;
  executions: ReportExecution[];
  isLoading: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    running: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  };
  const labels: Record<string, string> = { completed: 'Completado', running: 'Ejecutando', failed: 'Error' };
  return (
    <Badge variant="outline" className={cn('text-xs', colors[status] || colors.completed)}>
      {labels[status] || status}
    </Badge>
  );
}

export function ExecutionHistory({
  open, onOpenChange, scheduleName, executions, isLoading,
}: ExecutionHistoryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700 sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">
            Historial — {scheduleName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))
          ) : executions.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin ejecuciones registradas</p>
            </div>
          ) : (
            executions.map((exec) => (
              <div
                key={exec.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700"
              >
                <StatusIcon status={exec.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(exec.created_at)}
                    </span>
                    <StatusBadge status={exec.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>Módulo: {exec.module}</span>
                    <span>Filas: {exec.row_count}</span>
                    <span>Duración: {exec.duration_ms}ms</span>
                  </div>
                  {exec.error_message && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate">
                      {exec.error_message}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
