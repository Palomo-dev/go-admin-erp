'use client';

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Clock, User, FileText } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ReportExecution, STATUS_CONFIG, MODULE_LABEL } from './executionReportService';

interface ExecutionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  execution: ReportExecution | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'running': return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
    default: return <Clock className="h-5 w-5 text-yellow-500" />;
  }
}

export function ExecutionDetailDialog({ open, onOpenChange, execution }: ExecutionDetailDialogProps) {
  if (!execution) return null;

  const statusCfg = STATUS_CONFIG[execution.status] || STATUS_CONFIG.pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700 sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100 flex items-center gap-2">
            <StatusIcon status={execution.status} />
            Detalle de ejecución
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info principal */}
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Estado">
              <Badge variant="outline" className={cn('text-xs', statusCfg.color, statusCfg.darkColor)}>
                {statusCfg.label}
              </Badge>
            </InfoField>
            <InfoField label="Módulo">
              <span className="text-sm text-gray-900 dark:text-white">{MODULE_LABEL[execution.module] || execution.module}</span>
            </InfoField>
            <InfoField label="Fecha">
              <span className="text-sm text-gray-900 dark:text-white">{formatDate(execution.created_at)}</span>
            </InfoField>
            <InfoField label="Duración">
              <span className="text-sm text-gray-900 dark:text-white">{formatDuration(execution.duration_ms)}</span>
            </InfoField>
            <InfoField label="Filas procesadas">
              <span className="text-sm text-gray-900 dark:text-white">{execution.row_count.toLocaleString('es-CO')}</span>
            </InfoField>
            {execution.user_name && (
              <InfoField label="Usuario">
                <span className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> {execution.user_name}
                </span>
              </InfoField>
            )}
          </div>

          {/* Reporte guardado */}
          {execution.saved_report_name && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-blue-700 dark:text-blue-300 font-medium">{execution.saved_report_name}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {execution.error_message && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error:</p>
              <p className="text-sm text-red-600 dark:text-red-300 break-words">{execution.error_message}</p>
            </div>
          )}

          {/* Filtros */}
          {execution.filters && Object.keys(execution.filters).length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Filtros aplicados:</p>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto text-gray-700 dark:text-gray-300 max-h-40">
                {JSON.stringify(execution.filters, null, 2)}
              </pre>
            </div>
          )}

          {/* IDs */}
          <div className="text-[10px] text-gray-400 dark:text-gray-500 space-y-0.5 border-t border-gray-200 dark:border-gray-700 pt-2">
            <p>ID: {execution.id}</p>
            {execution.saved_report_id && <p>Saved Report ID: {execution.saved_report_id}</p>}
            <p>User ID: {execution.user_id}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      {children}
    </div>
  );
}
