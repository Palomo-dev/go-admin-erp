'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { NotificationRow } from '@/lib/services/notificacionesDashboardService';

interface UltimasNotificacionesProps {
  notifications: NotificationRow[];
  isLoading?: boolean;
  maxItems?: number;
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
  pending: {
    label: 'Pendiente',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  sent: {
    label: 'Enviada',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  failed: {
    label: 'Fallida',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  read: {
    label: 'Leída',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
};

export function UltimasNotificaciones({ notifications, isLoading, maxItems = 20 }: UltimasNotificacionesProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            Últimas Notificaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const mostradas = notifications.slice(0, maxItems);

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            Últimas Notificaciones
          </CardTitle>
          {notifications.length > 0 && (
            <Badge variant="outline">{notifications.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No hay notificaciones recientes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Título</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Canal</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Destinatario</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((notif) => {
                  const Icon = channelIcons[notif.channel] || Bell;
                  const effectiveStatus = notif.read_at ? 'read' : notif.status;
                  const stat = statusConfig[effectiveStatus] || statusConfig.pending;
                  const title = notif.payload?.title || notif.payload?.type || '—';
                  const recipient =
                    notif.recipient_email ||
                    notif.recipient_phone ||
                    (notif.recipient_user_id ? 'Individual' : 'Todos (Org)');

                  return (
                    <tr
                      key={notif.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <span className="text-gray-900 dark:text-white font-medium truncate block text-xs">
                          {title}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                          <span className="text-gray-700 dark:text-gray-300 capitalize text-xs">
                            {notif.channel}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[150px] block text-xs">
                          {recipient}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={cn('text-[10px]', stat.badge)}>{stat.label}</Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                          {formatDate(notif.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UltimasNotificaciones;
