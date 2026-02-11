'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, Info, ShieldAlert, Flame, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, Eye, XCircle, Send,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { SystemAlert } from './types';

interface AlertaListProps {
  alerts: SystemAlert[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onSelect: (alert: SystemAlert) => void;
}

const severityConfig: Record<string, { icon: typeof Info; dot: string; border: string }> = {
  info: { icon: Info, dot: 'bg-blue-500', border: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20' },
  warning: { icon: ShieldAlert, dot: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' },
  critical: { icon: Flame, dot: 'bg-red-500', border: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' },
};

const statusIcons: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', label: 'Pendiente' },
  delivered: { icon: Send, color: 'text-blue-600 dark:text-blue-400', label: 'Entregada' },
  read: { icon: Eye, color: 'text-gray-600 dark:text-gray-400', label: 'Leída' },
  resolved: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', label: 'Resuelta' },
  ignored: { icon: XCircle, color: 'text-gray-400 dark:text-gray-500', label: 'Ignorada' },
};

const moduleLabels: Record<string, string> = {
  inventario: 'Inventario', finanzas: 'Finanzas', pos: 'POS', crm: 'CRM',
  hrm: 'HRM', pms: 'PMS', sistema: 'Sistema', integraciones: 'Integraciones', transporte: 'Transporte',
};

export function AlertaList({
  alerts, total, page, pageSize, isLoading, onPageChange, onSelect,
}: AlertaListProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <AlertTriangle className="h-12 w-12 mb-3" />
        <p className="text-base font-medium">No hay alertas</p>
        <p className="text-sm">Ajusta los filtros para ver más resultados</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {alerts.map((alert) => {
          const sev = severityConfig[alert.severity] || severityConfig.info;
          const SevIcon = sev.icon;
          const stCfg = statusIcons[alert.status] || statusIcons.pending;
          const StatusIcon = stCfg.icon;
          const isActive = alert.status === 'pending' || alert.status === 'delivered';

          return (
            <div
              key={alert.id}
              onClick={() => onSelect(alert)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                isActive ? sev.border : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              )}
            >
              {/* Indicador severidad */}
              <div className="flex-shrink-0 pt-1">
                <span className={cn('block w-2.5 h-2.5 rounded-full', isActive ? sev.dot : 'bg-gray-300 dark:bg-gray-600')} />
              </div>

              {/* Icono */}
              <div className={cn('flex-shrink-0 p-2 rounded-lg', isActive ? sev.border : 'bg-gray-100 dark:bg-gray-800')}>
                <SevIcon className={cn('h-4 w-4', isActive ? '' : 'text-gray-400')} />
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-sm font-medium truncate', isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400')}>
                    {alert.title}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                    {moduleLabels[alert.source_module] || alert.source_module}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{alert.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn('text-[10px] px-1.5 py-0', stCfg.color, 'bg-transparent')}>
                    <StatusIcon className="h-3 w-3 mr-0.5" />
                    {stCfg.label}
                  </Badge>
                  <span className="text-[10px] text-gray-400">
                    {new Date(alert.created_at).toLocaleString('es', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {alert.sent_channels && alert.sent_channels.length > 0 && (
                    <span className="text-[10px] text-gray-400">
                      · {alert.sent_channels.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, idx, arr) => (
                <span key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-gray-400 px-1">…</span>}
                  <Button
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(p)}
                    className="h-7 w-7 p-0 text-xs"
                  >
                    {p}
                  </Button>
                </span>
              ))}
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
