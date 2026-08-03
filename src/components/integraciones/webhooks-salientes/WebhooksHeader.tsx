'use client';

import React from 'react';
import { Send, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WebhooksHeaderProps {
  totalEndpoints: number;
  activeCount: number;
  onRefresh: () => void;
  onNewEndpoint: () => void;
  refreshing?: boolean;
}

export function WebhooksHeader({
  totalEndpoints,
  activeCount,
  onRefresh,
  onNewEndpoint,
  refreshing = false,
}: WebhooksHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
              <Send className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Webhooks Salientes
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Endpoints para notificar eventos a terceros
              </p>
            </div>
          </div>

          {/* Badges de estadísticas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalEndpoints} endpoints
            </Badge>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {activeCount} activos
            </Badge>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="dark:border-gray-700 dark:text-gray-300"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={onNewEndpoint}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Endpoint
          </Button>
        </div>
      </div>
    </div>
  );
}

export default WebhooksHeader;
