'use client';

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RotateCw,
  ExternalLink, Copy,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';
import type { DeliveryLog } from './types';
import { STATUS_OPTIONS } from './types';

interface LogDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: DeliveryLog | null;
  onRetry: (log: DeliveryLog) => void;
}

const statusIcons: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  fail: XCircle,
  pending: Clock,
  bounced: AlertTriangle,
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function LogDetailSheet({ open, onOpenChange, log, onRetry }: LogDetailSheetProps) {
  if (!log) return null;

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === log.status);
  const StatusIcon = statusIcons[log.status] || Clock;
  const provider = log.provider_response?.provider || '-';
  const hasError = log.status === 'fail' || log.status === 'bounced';
  const errorMsg = log.provider_response?.error_message || log.provider_response?.error_code || null;
  const payload = log.notification?.payload || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-white dark:bg-gray-900 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-200 dark:border-gray-800">
          <SheetTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <StatusIcon className={cn('h-5 w-5',
              log.status === 'success' ? 'text-green-500' :
              log.status === 'fail' ? 'text-red-500' :
              log.status === 'bounced' ? 'text-orange-500' : 'text-yellow-500'
            )} />
            Detalle del Log
          </SheetTitle>
          <SheetDescription>
            Intento #{log.attempt_no} — {formatDate(log.created_at)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-3">
            <Badge className={cn('text-xs px-2 py-0.5', statusOpt?.color)}>
              {statusOpt?.label || log.status}
            </Badge>
            {hasError && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(log)}
                className="h-7 text-xs border-amber-300 text-amber-600 hover:text-amber-700 dark:border-amber-700 dark:text-amber-400"
              >
                <RotateCw className="h-3.5 w-3.5 mr-1" />
                Reintentar
              </Button>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Error</p>
              <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          {/* IDs */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Identificadores</h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Log ID</span>
                <button onClick={() => copyToClipboard(log.id)} className="flex items-center gap-1 text-xs font-mono text-gray-700 dark:text-gray-300 hover:text-blue-600">
                  {log.id.substring(0, 12)}...
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">Notification ID</span>
                <button onClick={() => copyToClipboard(log.notification_id)} className="flex items-center gap-1 text-xs font-mono text-gray-700 dark:text-gray-300 hover:text-blue-600">
                  {log.notification_id.substring(0, 12)}...
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Delivery info */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Envío</h3>
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Provider" value={provider} />
              <InfoItem label="Canal" value={log.notification?.channel || '-'} />
              <InfoItem label="Intento" value={`#${log.attempt_no}`} />
              <InfoItem label="Status notif." value={log.notification?.status || '-'} />
              <InfoItem label="Entregado" value={formatDate(log.delivered_at)} />
              <InfoItem label="Creado" value={formatDate(log.created_at)} />
            </div>
          </div>

          {/* Recipient */}
          {(log.notification?.recipient_email || log.notification?.recipient_phone) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Destinatario</h3>
              <div className="grid grid-cols-2 gap-2">
                {log.notification?.recipient_email && (
                  <InfoItem label="Email" value={log.notification.recipient_email} />
                )}
                {log.notification?.recipient_phone && (
                  <InfoItem label="Teléfono" value={log.notification.recipient_phone} />
                )}
              </div>
            </div>
          )}

          {/* Provider response (raw JSON) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Provider Response</h3>
            <pre className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300 max-h-40">
              {JSON.stringify(log.provider_response, null, 2)}
            </pre>
          </div>

          {/* Notification payload */}
          {Object.keys(payload).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payload de Notificación</h3>
              <pre className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300 max-h-40">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          )}

          {/* Link to bandeja */}
          <Link href="/app/notificaciones/bandeja" className="block">
            <Button variant="outline" size="sm" className="w-full border-gray-300 dark:border-gray-700">
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Ver en Bandeja de Notificaciones
            </Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{value}</p>
    </div>
  );
}
