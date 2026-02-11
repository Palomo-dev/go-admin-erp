'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, Mail, MessageSquare, Smartphone, Bell, ToggleLeft, ToggleRight, Webhook } from 'lucide-react';
import type { NotificationChannel } from '@/lib/services/notificacionesDashboardService';

interface EstadoCanalesProps {
  channels: NotificationChannel[];
  isLoading: boolean;
  onToggleChannel: (channelId: string, isActive: boolean) => void;
  onNavigate?: (url: string) => void;
}

const channelRoutes: Record<string, string> = {
  app: '/app/notificaciones/bandeja',
  email: '/app/integraciones/conexiones',
  sms: '/app/integraciones/conexiones',
  push: '/app/integraciones/conexiones',
  whatsapp: '/app/integraciones/conexiones',
  webhook: '/app/integraciones/conexiones',
};

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

export function EstadoCanales({ channels, isLoading, onToggleChannel, onNavigate }: EstadoCanalesProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Estado de Canales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Estado de Canales</h2>
      </div>

      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <Radio className="h-10 w-10 mb-2" />
          <p className="text-sm">No hay canales configurados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map(channel => {
            const Icon = channelIcons[channel.code] || Bell;
            const label = channelLabels[channel.code] || channel.code;

            const route = channelRoutes[channel.code];

            return (
              <div
                key={channel.id}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  route && onNavigate ? 'cursor-pointer hover:shadow-sm' : ''
                } ${
                  channel.is_active
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                }`}
                onClick={() => { if (route && onNavigate) onNavigate(route); }}
              >
                <div className={`p-2 rounded-lg ${
                  channel.is_active
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {channel.provider_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <Badge className={
                    channel.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }>
                    {channel.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleChannel(channel.id, !channel.is_active)}
                    title={channel.is_active ? 'Desactivar canal' : 'Activar canal'}
                  >
                    {channel.is_active ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
