'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell, Mail, MessageSquare, Smartphone, RotateCcw, Eye,
  ChevronLeft, ChevronRight, CheckCheck,
} from 'lucide-react';
import { formatDate } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { NotificationDetailSheet } from './NotificationDetailSheet';
import type { NotificationRow } from '@/lib/services/notificacionesDashboardService';

interface UltimasNotificacionesProps {
  notifications: NotificationRow[];
  isLoading: boolean;
  onRetry: (notificationId: string) => void;
  onNavigate: (url: string) => void;
  onDataChange?: () => void;
}

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageSquare,
  push: Bell,
  app: Bell,
  all: Bell,
};

const statusConfig: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Pendiente', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  sent: { label: 'Enviada', badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  failed: { label: 'Fallida', badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  read: { label: 'Leída', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
};

// ── Componente principal ──────────────────────────────
const PAGE_SIZE = 10;

export function UltimasNotificaciones({ notifications, isLoading, onRetry, onNavigate, onDataChange }: UltimasNotificacionesProps) {
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(notifications.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const paginated = notifications.slice(startIdx, startIdx + PAGE_SIZE);

  // Marcar como leída
  const handleMarkRead = async (notif: NotificationRow) => {
    if (notif.read_at) return;
    const now = new Date().toISOString();
    await supabase.from('notifications').update({ read_at: now }).eq('id', notif.id);
    onDataChange?.();
  };

  // Abrir dialog de detalle
  const handleViewDetail = async (notif: NotificationRow) => {
    if (!notif.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notif.id);
      onDataChange?.();
    }
    setSelected({ ...notif, read_at: notif.read_at || new Date().toISOString() });
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Últimas Notificaciones</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Últimas Notificaciones</h2>
          <Badge variant="outline" className="ml-auto">{notifications.length}</Badge>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
            <Bell className="h-10 w-10 mb-2" />
            <p className="text-sm">No hay notificaciones recientes</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Título</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Canal</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Destinatario</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(notif => {
                    const Icon = channelIcons[notif.channel] || Bell;
                    const effectiveStatus = notif.read_at ? 'read' : notif.status;
                    const stat = statusConfig[effectiveStatus] || statusConfig.pending;
                    const title = notif.payload?.title || notif.payload?.type || '—';
                    const recipient = notif.recipient_email || notif.recipient_phone || (notif.recipient_user_id ? 'Individual' : 'Todos (Org)');

                    return (
                      <tr
                        key={notif.id}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => handleViewDetail(notif)}
                      >
                        <td className="py-2.5 px-3 max-w-[220px]">
                          <span className="text-gray-900 dark:text-white font-medium truncate block text-xs">
                            {title}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                            <span className="text-gray-700 dark:text-gray-300 capitalize text-xs">{notif.channel}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px] block text-xs">
                            {recipient}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge className={`text-[10px] ${stat.badge}`}>{stat.label}</Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                            {formatDate(notif.created_at)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleViewDetail(notif)} title="Ver detalle" className="h-7 w-7 p-0">
                              <Eye className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            {!notif.read_at && (
                              <Button variant="ghost" size="sm" onClick={() => handleMarkRead(notif)} title="Marcar como leída" className="h-7 w-7 p-0">
                                <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                              </Button>
                            )}
                            {notif.status === 'failed' && (
                              <Button variant="ghost" size="sm" onClick={() => onRetry(notif.id)} title="Reintentar envío" className="h-7 w-7 p-0">
                                <RotateCcw className="h-3.5 w-3.5 text-orange-500" />
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

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, notifications.length)} de {notifications.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-7 w-7 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-gray-400 px-1">…</span>}
                        <Button
                          variant={p === currentPage ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(p)}
                          className="h-7 w-7 p-0 text-xs"
                        >
                          {p}
                        </Button>
                      </span>
                    ))}
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-7 w-7 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sheet de detalle */}
      <NotificationDetailSheet
        notification={selected}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onNavigate={onNavigate}
      />
    </>
  );
}
