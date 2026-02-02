'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Clock,
  ExternalLink,
  Zap,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import type { IntegrationConnection } from '@/lib/services/integrationsService';

interface IntegrationConnectionCardProps {
  connection: IntegrationConnection | null;
  providerName: string;
  category: string;
  isLoading?: boolean;
  onConnect?: () => void;
  onConfigure?: () => void;
  compact?: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  connected: {
    label: 'Conectado',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  error: {
    label: 'Error',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  paused: {
    label: 'Pausado',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <PauseCircle className="h-4 w-4" />,
  },
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    icon: <Clock className="h-4 w-4" />,
  },
};

const categoryColors: Record<string, string> = {
  payments: 'bg-green-500',
  messaging: 'bg-blue-500',
  ota: 'bg-purple-500',
  delivery: 'bg-orange-500',
  social: 'bg-pink-500',
};

export function IntegrationConnectionCard({
  connection,
  providerName,
  category,
  isLoading,
  onConnect,
  onConfigure,
  compact = false,
}: IntegrationConnectionCardProps) {
  const isConnected = connection && connection.status === 'connected';
  const status = connection ? statusConfig[connection.status] || statusConfig.draft : null;

  if (isLoading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardContent className={cn('flex items-center gap-4', compact ? 'p-3' : 'p-4')}>
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      'border transition-all',
      isConnected
        ? 'border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-900/10'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
      'hover:shadow-md'
    )}>
      <CardContent className={cn('flex items-center gap-4', compact ? 'p-3' : 'p-4')}>
        {/* Logo/Icono del proveedor */}
        <div className={cn(
          'flex items-center justify-center rounded-lg text-white font-bold',
          compact ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-lg',
          categoryColors[category] || 'bg-gray-500'
        )}>
          {providerName[0]?.toUpperCase()}
        </div>

        {/* Información */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium text-gray-900 dark:text-white truncate',
              compact ? 'text-sm' : 'text-base'
            )}>
              {providerName}
            </span>
            {connection?.environment === 'sandbox' && (
              <Badge variant="outline" className="text-xs">
                Sandbox
              </Badge>
            )}
          </div>
          {status && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge className={cn('text-xs flex items-center gap-1', status.color)}>
                {status.icon}
                {status.label}
              </Badge>
              {connection?.last_activity_at && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Última actividad: {new Date(connection.last_activity_at).toLocaleDateString('es-CO')}
                </span>
              )}
            </div>
          )}
          {!connection && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              No conectado
            </p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              {onConfigure && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConfigure}
                  className="border-gray-300 dark:border-gray-600"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Configurar
                </Button>
              )}
              {connection && (
                <Link href={`/app/integraciones/conexiones/${connection.id}`}>
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <Button
              size="sm"
              onClick={onConnect}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Zap className="h-4 w-4 mr-1" />
              Conectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default IntegrationConnectionCard;
