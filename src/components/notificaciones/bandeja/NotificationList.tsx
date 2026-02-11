'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell, Mail, Smartphone, MessageSquare, Eye, EyeOff,
  ChevronLeft, ChevronRight, Copy, RotateCcw,
  AlertCircle, CheckCircle2, Clock, Send, XCircle,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import { NotificationDetailSheet } from '../NotificationDetailSheet';
import type { BandejaNotification } from './types';

interface NotificationListProps {
  notifications: BandejaNotification[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onResend: (id: string) => void;
  onNavigate: (url: string) => void;
}

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageSquare,
  push: Bell,
  app: Bell,
  website: Bell,
};

const statusConfig: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  sent: { label: 'Enviada', icon: Send, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  delivered: { label: 'Entregada', icon: CheckCircle2, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  read: { label: 'Leída', icon: Eye, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  failed: { label: 'Fallida', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

const typeLabels: Record<string, string> = {
  ar_overdue: 'CxC vencida', ap_overdue: 'CxP vencida', purchase_invoice_created: 'Factura compra',
  payment_registered: 'Pago', reservation_created: 'Reserva', checkin: 'Check-in', checkout: 'Check-out',
  stock_low: 'Stock bajo', stock_out: 'Sin stock', task_assigned: 'Tarea', task_completed: 'Tarea completada',
  calendar_event_assigned: 'Evento', role_changed: 'Cambio de rol', new_member: 'Nuevo miembro',
  reservation_cancelled: 'Reserva cancelada', housekeeping_assigned: 'Limpieza',
  opportunity_stage_change: 'Oportunidad', cash_opened: 'Caja abierta', cash_closed: 'Caja cerrada',
};

export function NotificationList({
  notifications,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onMarkRead,
  onMarkUnread,
  onResend,
  onNavigate,
}: NotificationListProps) {
  const [selected, setSelected] = useState<BandejaNotification | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  const handleRowClick = (notif: BandejaNotification) => {
    setSelected(notif);
    if (!notif.read_at) onMarkRead(notif.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Bell className="h-12 w-12 mb-3" />
        <p className="text-base font-medium">No hay notificaciones</p>
        <p className="text-sm">Ajusta los filtros para ver más resultados</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {notifications.map((notif) => {
          const type = notif.payload?.type || '';
          const title = notif.payload?.title || type || 'Notificación';
          const content = notif.payload?.content || '';
          const ChannelIcon = channelIcons[notif.channel] || Bell;
          const st = statusConfig[notif.status] || statusConfig.pending;
          const StatusIcon = st.icon;
          const isUnread = !notif.read_at;

          return (
            <div
              key={notif.id}
              onClick={() => handleRowClick(notif)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                isUnread
                  ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              )}
            >
              {/* Indicador no leída */}
              <div className="flex-shrink-0 pt-1">
                {isUnread ? (
                  <span className="block w-2.5 h-2.5 bg-blue-500 rounded-full" />
                ) : (
                  <span className="block w-2.5 h-2.5 rounded-full bg-transparent" />
                )}
              </div>

              {/* Canal */}
              <div className="flex-shrink-0 p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <ChannelIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-sm font-medium truncate', isUnread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300')}>
                    {title}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                    {typeLabels[type] || type.replace(/_/g, ' ') || 'General'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{content}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn('text-[10px] px-1.5 py-0', st.color)}>
                    <StatusIcon className="h-3 w-3 mr-0.5" />
                    {st.label}
                  </Badge>
                  <span className="text-[10px] text-gray-400">
                    {new Date(notif.created_at).toLocaleString('es', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {notif.error_msg && (
                    <span className="text-[10px] text-red-500 truncate max-w-[200px]" title={notif.error_msg}>
                      <AlertCircle className="h-3 w-3 inline mr-0.5" />
                      {notif.error_msg}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {isUnread ? (
                  <Button variant="ghost" size="sm" onClick={() => onMarkRead(notif.id)} title="Marcar como leída" className="h-7 w-7 p-0">
                    <Eye className="h-3.5 w-3.5 text-blue-500" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => onMarkUnread(notif.id)} title="Marcar como no leída" className="h-7 w-7 p-0">
                    <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                )}
                {notif.status === 'failed' && (
                  <Button variant="ghost" size="sm" onClick={() => onResend(notif.id)} title="Reintentar envío" className="h-7 w-7 p-0">
                    <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => onResend(notif.id)} title="Reenviar como nueva" className="h-7 w-7 p-0">
                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                </Button>
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

      {/* Sheet de detalle reutilizable */}
      <NotificationDetailSheet
        notification={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onNavigate={onNavigate}
      />
    </>
  );
}
