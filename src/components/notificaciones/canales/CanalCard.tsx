'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell, Mail, Smartphone, MessageSquare, Webhook, Radio,
  Edit, Trash2, Play, Power, PowerOff, Loader2,
  CheckCircle2, XCircle, Clock, Link2, LinkIcon, Unlink,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificationChannel } from './types';

interface CanalCardProps {
  channel: NotificationChannel;
  isAdmin: boolean;
  recentLogs: any[];
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggle: () => void;
  onLink: () => void;
  onUnlink: () => void;
  isToggling: boolean;
}

const channelIcons: Record<string, typeof Mail> = {
  app: Bell,
  email: Mail,
  sms: Smartphone,
  push: Bell,
  whatsapp: MessageSquare,
  webhook: Webhook,
};

const channelColors: Record<string, { bg: string; icon: string; border: string }> = {
  app: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  email: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  sms: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  push: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    icon: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  whatsapp: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  webhook: {
    bg: 'bg-gray-50 dark:bg-gray-800',
    icon: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700',
  },
};

const statusColors: Record<string, string> = {
  connected: 'text-green-600 dark:text-green-400',
  paused: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  disconnected: 'text-gray-500 dark:text-gray-400',
};

export function CanalCard({
  channel, isAdmin, recentLogs, onEdit, onDelete, onTest, onToggle, onLink, onUnlink, isToggling,
}: CanalCardProps) {
  const Icon = channelIcons[channel.code] || Radio;
  const colors = channelColors[channel.code] || channelColors.webhook;
  const linked = channel.linked_connection;
  const isApp = channel.code === 'app';
  const lastLog = recentLogs.length > 0 ? recentLogs[0] : null;

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 border rounded-xl p-5 transition-shadow hover:shadow-sm',
      channel.is_active ? colors.border : 'border-gray-200 dark:border-gray-800 opacity-75'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl', colors.bg)}>
            <Icon className={cn('h-5 w-5', colors.icon)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {channel.provider_name}
              </h3>
              {channel.is_active ? (
                <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  Activo
                </Badge>
              ) : (
                <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  Inactivo
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Canal: <span className="font-medium">{channel.code}</span>
            </p>
          </div>
        </div>

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            disabled={isToggling}
            className={cn('h-8 px-2', channel.is_active ? 'text-green-600 hover:text-red-500' : 'text-gray-400 hover:text-green-500')}
            title={channel.is_active ? 'Desactivar' : 'Activar'}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : channel.is_active ? (
              <Power className="h-4 w-4" />
            ) : (
              <PowerOff className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Integración vinculada */}
      {!isApp && linked ? (
        <div className="mb-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Integración vinculada</span>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{linked.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{linked.provider_name}</span>
            <span className="text-[10px] text-gray-400">·</span>
            <span className={cn('text-xs font-medium', statusColors[linked.status] || 'text-gray-400')}>
              {linked.status}
            </span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">{linked.environment}</Badge>
          </div>
        </div>
      ) : !isApp ? (
        <div className="mb-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Unlink className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Sin integración — vincula desde Integraciones
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Canal nativo del sistema — no requiere integración externa
          </p>
        </div>
      )}

      {/* Último log */}
      {lastLog && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          {lastLog.status === 'delivered' || lastLog.status === 'sent' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : lastLog.status === 'failed' ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-gray-400" />
          )}
          <span className="text-gray-500 dark:text-gray-400">
            Último: {lastLog.status}
            {lastLog.sent_at && ` · ${new Date(lastLog.sent_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          </span>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mb-3">
        Actualizado: {new Date(channel.updated_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
      </p>

      {/* Acciones */}
      <div className="flex items-center gap-1 pt-2 border-t border-gray-100 dark:border-gray-800">
        <Button variant="ghost" size="sm" onClick={onTest} className="text-xs text-gray-500 hover:text-blue-600 h-7 px-2">
          <Play className="h-3.5 w-3.5 mr-1" /> Probar
        </Button>
        {!isApp && isAdmin && (
          linked ? (
            <Button variant="ghost" size="sm" onClick={onUnlink} className="text-xs text-gray-500 hover:text-amber-600 h-7 px-2">
              <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onLink} className="text-xs text-gray-500 hover:text-blue-600 h-7 px-2">
              <LinkIcon className="h-3.5 w-3.5 mr-1" /> Vincular
            </Button>
          )
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} className="text-xs text-gray-500 hover:text-blue-600 h-7 px-2">
          <Edit className="h-3.5 w-3.5 mr-1" /> Config
        </Button>
        {isAdmin && !isApp && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-gray-500 hover:text-red-600 h-7 px-2 ml-auto">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
