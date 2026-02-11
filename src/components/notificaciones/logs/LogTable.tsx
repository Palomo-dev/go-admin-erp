'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, RotateCw, Eye,
  Mail, Smartphone, Bell, MessageSquare, Webhook, BellRing,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { DeliveryLog } from './types';
import { STATUS_OPTIONS, PAGE_SIZE } from './types';

interface LogTableProps {
  logs: DeliveryLog[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onViewDetail: (log: DeliveryLog) => void;
  onRetry: (log: DeliveryLog) => void;
  isLoading: boolean;
}

const statusIcons: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  fail: XCircle,
  pending: Clock,
  bounced: AlertTriangle,
};

const channelIcons: Record<string, typeof Mail> = {
  app: Bell,
  email: Mail,
  sms: Smartphone,
  push: BellRing,
  whatsapp: MessageSquare,
  webhook: Webhook,
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function LogTable({ logs, total, page, onPageChange, onViewDetail, onRetry, isLoading }: LogTableProps) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <CheckCircle2 className="h-12 w-12 mb-3" />
        <p className="text-base font-medium">No hay logs de envío</p>
        <p className="text-sm">Los logs aparecerán cuando se envíen notificaciones</p>
      </div>
    );
  }

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Canal</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Provider</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Intento</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Notification ID</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Entregado</th>
              <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const statusOpt = STATUS_OPTIONS.find((s) => s.value === log.status);
              const StatusIcon = statusIcons[log.status] || Clock;
              const channel = log.notification?.channel || '-';
              const ChannelIcon = channelIcons[channel] || Bell;
              const provider = log.provider_response?.provider || '-';
              const hasError = log.status === 'fail' || log.status === 'bounced';

              return (
                <tr
                  key={log.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                  onClick={() => onViewDetail(log)}
                >
                  <td className="py-2.5 px-3">
                    <Badge className={cn('text-[10px] px-1.5 py-0', statusOpt?.color)}>
                      <StatusIcon className="h-3 w-3 mr-0.5" />
                      {statusOpt?.label || log.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <ChannelIcon className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">{channel}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-gray-600 dark:text-gray-400">{provider}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      #{log.attempt_no}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
                      {log.notification_id.substring(0, 8)}...
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-gray-500 dark:text-gray-400">{formatDate(log.delivered_at)}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDetail(log)}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {hasError && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRetry(log)}
                          className="h-6 w-6 p-0 text-gray-400 hover:text-amber-600"
                          title="Reintentar"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Página {page} de {totalPages} ({total} registros)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-7 w-7 p-0 border-gray-300 dark:border-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-7 w-7 p-0 border-gray-300 dark:border-gray-700"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
