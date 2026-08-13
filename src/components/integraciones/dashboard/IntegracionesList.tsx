'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { Link2, ExternalLink, CheckCircle2, AlertCircle, PauseCircle, Clock } from 'lucide-react';
import type { IntegrationConnection } from '@/lib/services/integrationsService';

interface IntegracionesListProps {
  connections: IntegrationConnection[];
  isLoading: boolean;
  maxItems?: number;
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

export function IntegracionesList({ connections, isLoading, maxItems = 6 }: IntegracionesListProps) {
  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Link2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Integraciones conectadas
        </CardTitle>
        <Link href="/app/integraciones/conexiones">
          <Button variant="ghost" size="sm" className="text-purple-600 dark:text-purple-400">
            Ver todas
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
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
        ) : connections.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <Link2 className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Sin integraciones</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Conecta tu primer proveedor para comenzar
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.slice(0, maxItems).map((connection) => {
              const status = statusConfig[connection.status] || statusConfig.draft;
              const connector = connection.connector as IntegrationConnection['connector'];
              const provider = connector?.provider;
              const initial = (provider?.name || connector?.name || connection.name || 'I')[0].toUpperCase();

              return (
                <div
                  key={connection.id}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 dark:text-white block truncate">
                        {connection.name}
                      </span>
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
        )}
      </CardContent>
    </Card>
  );
}

export default IntegracionesList;
