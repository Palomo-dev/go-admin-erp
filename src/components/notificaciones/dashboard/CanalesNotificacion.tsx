'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Radio,
  Mail,
  MessageSquare,
  Smartphone,
  Bell,
  Webhook,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificationChannel } from '@/lib/services/notificacionesDashboardService';

interface CanalesNotificacionProps {
  channels: NotificationChannel[];
  isLoading?: boolean;
}

const channelIcons: Record<string, typeof Mail> = {
  app: Bell,
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageSquare,
  push: Bell,
  webhook: Webhook,
};

const channelLabels: Record<string, string> = {
  app: 'In-App',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
  webhook: 'Webhook',
};

export function CanalesNotificacion({ channels, isLoading }: CanalesNotificacionProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-500" />
            Estado de Canales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activos = channels.filter((c) => c.is_active).length;

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-blue-500" />
            Estado de Canales
          </CardTitle>
          {channels.length > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {activos} activos / {channels.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <Radio className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No hay canales configurados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {channels.map((channel) => {
              const Icon = channelIcons[channel.code] || Bell;
              const label = channelLabels[channel.code] || channel.code;

              return (
                <div
                  key={channel.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    channel.is_active
                      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
                  )}
                >
                  <div
                    className={cn(
                      'p-2 rounded-lg flex-shrink-0',
                      channel.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {channel.provider_name}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      'flex-shrink-0',
                      channel.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
                    )}
                  >
                    {channel.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CanalesNotificacion;
