'use client';

import React from 'react';
import { Key, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface ApiKeysHeaderProps {
  totalKeys: number;
  activeCount: number;
  revokedCount: number;
  showRevoked: boolean;
  onShowRevokedChange: (show: boolean) => void;
  onRefresh: () => void;
  onNewKey: () => void;
  refreshing?: boolean;
}

export function ApiKeysHeader({
  totalKeys,
  activeCount,
  revokedCount,
  showRevoked,
  onShowRevokedChange,
  onRefresh,
  onNewKey,
  refreshing = false,
}: ApiKeysHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Key className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                API Keys
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gestiona las claves de acceso a tu API
              </p>
            </div>
          </div>

          {/* Badges de estadísticas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalKeys} total
            </Badge>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {activeCount} activas
            </Badge>
            {revokedCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {revokedCount} revocadas
              </Badge>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-4 mt-4">
          <div className="flex items-center gap-2">
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
              onClick={onNewKey}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva API Key
            </Button>
          </div>

          {/* Toggle mostrar revocadas */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-revoked"
              checked={showRevoked}
              onCheckedChange={onShowRevokedChange}
            />
            <Label
              htmlFor="show-revoked"
              className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
            >
              Mostrar revocadas
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiKeysHeader;
