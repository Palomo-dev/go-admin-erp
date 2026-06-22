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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
              <Radio className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                Channel Manager
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Sincroniza disponibilidad con Airbnb, Booking.com y otros canales
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button
            size="sm"
            onClick={onSyncAll}
            disabled={isSyncing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            <span className="sm:hidden">{isSyncing ? 'Sync...' : 'Sync'}</span>
          </Button>
          {onConnectBookingApi && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnectBookingApi}
              className="border-[#003580] text-[#003580] hover:bg-[#003580] hover:text-white dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
            >
              <Zap className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Booking.com API</span>
              <span className="md:hidden">Booking</span>
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
              <span className="hidden md:inline">Expedia Group API</span>
              <span className="md:hidden">Expedia</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={onAddConnection}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Nueva Conexión</span>
            <span className="sm:hidden">Conexión</span>
          </Button>
        </div>
      </div>

      {/* Stats rápidas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Conexiones Activas</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {stats.active_connections}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Bloqueos Importados</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {stats.total_blocks}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Canales</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {stats.channels_used.length > 0 ? stats.channels_used.map(ch => (
                <Badge key={ch} variant="secondary" className="text-xs capitalize">{ch}</Badge>
              )) : (
                <span className="text-sm text-gray-400">Ninguno</span>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Errores de Sync</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-lg sm:text-2xl font-bold ${stats.sync_errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {stats.sync_errors}
              </p>
              {stats.sync_errors > 0 && (
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
