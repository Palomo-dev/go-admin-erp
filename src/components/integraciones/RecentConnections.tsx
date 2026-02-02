'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  Link2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Clock,
} from 'lucide-react';
import type { IntegrationConnection } from '@/lib/services/integrationsService';
import Link from 'next/link';

interface RecentConnectionsProps {
  connections: IntegrationConnection[];
  loading: boolean;
  onViewConnection?: (connectionId: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  connected: {
    label: 'Conectado',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  error: {
    label: 'Error',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  paused: {
    label: 'Pausado',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <PauseCircle className="h-3.5 w-3.5" />,
  },
  draft: {
    label: 'Borrador',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  revoked: {
    label: 'Revocado',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

const categoryColors: Record<string, string> = {
  payments: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ota: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  delivery: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  social: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  messaging: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  ads: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  sms: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

export function RecentConnections({ connections, loading, onViewConnection }: RecentConnectionsProps) {
  if (loading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Conexiones Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (connections.length === 0) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Conexiones Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <Link2 className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              Sin conexiones
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Crea tu primera integración
            </p>
            <Link href="/app/integraciones/conexiones/nueva">
              <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                Nueva Conexión
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Conexiones Recientes
        </CardTitle>
        <Link href="/app/integraciones/conexiones">
          <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400">
            Ver todas
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {connections.slice(0, 5).map((connection) => {
            const status = statusConfig[connection.status] || statusConfig.draft;
            const connector = connection.connector as IntegrationConnection['connector'];
            const provider = connector?.provider;
            const category = provider?.category || 'other';

            return (
              <div
                key={connection.id}
                className={cn(
                  'p-3 rounded-lg border transition-colors cursor-pointer',
                  'border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                )}
                onClick={() => onViewConnection?.(connection.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold',
                    categoryColors[category] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  )}>
                    {(provider?.name || connector?.name || 'I')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {connection.name}
                      </span>
                      {connection.environment === 'sandbox' && (
                        <Badge variant="outline" className="text-xs">
                          Sandbox
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {provider?.name || connector?.name || 'Proveedor desconocido'}
                    </p>
                  </div>
                  <Badge className={cn('shrink-0 flex items-center gap-1', status.color)}>
                    {status.icon}
                    {status.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default RecentConnections;
