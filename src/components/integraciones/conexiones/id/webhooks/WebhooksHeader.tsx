'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Plus, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface WebhooksHeaderProps {
  connection: IntegrationConnection | null;
  webhooksCount: number;
  activeCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onNewWebhook: () => void;
}

export function WebhooksHeader({
  connection,
  webhooksCount,
  activeCount,
  refreshing,
  onRefresh,
  onNewWebhook,
}: WebhooksHeaderProps) {
  const connectionId = connection?.id;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={connectionId ? `/app/integraciones/conexiones/${connectionId}` : '/app/integraciones/conexiones'}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </Link>

          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Webhook className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                Webhooks
              </h1>
              {webhooksCount > 0 && (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  {activeCount} activo{activeCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {connection?.name || 'Conexión'} • Gestión de webhooks
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button size="sm" onClick={onNewWebhook}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo webhook
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
