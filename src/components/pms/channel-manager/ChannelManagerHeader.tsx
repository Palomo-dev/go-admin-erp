'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Radio, AlertTriangle, Plus, Zap } from 'lucide-react';
import type { ChannelManagerStats } from '@/lib/services/channelManagerService';

interface ChannelManagerHeaderProps {
  stats: ChannelManagerStats | null;
  isLoading: boolean;
  isSyncing: boolean;
  onSyncAll: () => void;
  onRefresh: () => void;
  onAddConnection: () => void;
  onConnectBookingApi?: () => void;
  onConnectExpediaApi?: () => void;
}

export function ChannelManagerHeader({
  stats,
  isLoading,
  isSyncing,
  onSyncAll,
  onRefresh,
  onAddConnection,
  onConnectBookingApi,
  onConnectExpediaApi,
}: ChannelManagerHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Radio className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Channel Manager
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sincroniza disponibilidad con Airbnb, Booking.com y otros canales
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={onSyncAll}
            disabled={isSyncing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Todo'}
          </Button>
          {onConnectBookingApi && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnectBookingApi}
              className="border-[#003580] text-[#003580] hover:bg-[#003580] hover:text-white dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              Booking.com API
            </Button>
          )}
          {onConnectExpediaApi && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnectExpediaApi}
              className="border-[#FBAD18] text-[#FBAD18] hover:bg-[#FBAD18] hover:text-white dark:border-yellow-400 dark:text-yellow-400 dark:hover:bg-yellow-600 dark:hover:text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              Expedia Group API
            </Button>
          )}
          <Button
            size="sm"
            onClick={onAddConnection}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Conexión
          </Button>
        </div>
      </div>

      {/* Stats rápidas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Conexiones Activas</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {stats.active_connections}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Bloqueos Importados</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {stats.total_blocks}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Canales</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {stats.channels_used.length > 0 ? stats.channels_used.map(ch => (
                <Badge key={ch} variant="secondary" className="text-xs capitalize">{ch}</Badge>
              )) : (
                <span className="text-sm text-gray-400">Ninguno</span>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Errores de Sync</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${stats.sync_errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {stats.sync_errors}
              </p>
              {stats.sync_errors > 0 && (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
