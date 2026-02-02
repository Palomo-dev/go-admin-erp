'use client';

import React from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  AlertCircle,
  XCircle,
  MoreVertical,
  Copy,
  Trash2,
  RefreshCw,
  Settings,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface ConnectionItemProps {
  connection: IntegrationConnection;
  branchName?: string;
  onConfigure: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => void;
  onRevoke: (connection: IntegrationConnection) => void;
  onHealthCheck: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onDelete: (connection: IntegrationConnection) => void;
}

export function ConnectionItem({
  connection,
  branchName,
  onConfigure,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDuplicate,
  onDelete,
}: ConnectionItemProps) {
  const isActive = connection.status === 'connected' || connection.status === 'error';
  const isRevoked = connection.status === 'revoked';

  return (
    <div className="p-3 border-b last:border-b-0 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Nombre y ambiente */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
              {connection.name}
            </span>
            <Badge 
              variant="outline" 
              className={`text-xs shrink-0 ${
                connection.environment === 'production' 
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                  : 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
              }`}
            >
              {connection.environment === 'production' ? 'Producción' : 'Sandbox'}
            </Badge>
          </div>

          {/* Estado y sucursal */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            {connection.status === 'connected' && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Conectado
              </span>
            )}
            {connection.status === 'paused' && (
              <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                <Pause className="h-3 w-3" />
                Pausado
              </span>
            )}
            {connection.status === 'error' && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
            {connection.status === 'revoked' && (
              <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <XCircle className="h-3 w-3" />
                Revocado
              </span>
            )}
            {connection.status === 'draft' && (
              <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <Settings className="h-3 w-3" />
                Borrador
              </span>
            )}
            {branchName && (
              <>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {branchName}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Switch para activar/pausar */}
          <Switch
            checked={isActive}
            onCheckedChange={() => onToggleStatus(connection)}
            disabled={isRevoked}
            className="scale-75"
          />

          {/* Menú de acciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={() => onConfigure(connection)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurar
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => onDuplicate(connection)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => onHealthCheck(connection)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Probar conexión
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              {connection.status === 'paused' ? (
                <DropdownMenuItem onClick={() => onToggleStatus(connection)}>
                  <Play className="h-4 w-4 mr-2 text-green-500" />
                  <span className="text-green-600">Reanudar</span>
                </DropdownMenuItem>
              ) : !isRevoked && (
                <DropdownMenuItem onClick={() => onToggleStatus(connection)}>
                  <Pause className="h-4 w-4 mr-2 text-yellow-500" />
                  <span className="text-yellow-600">Pausar</span>
                </DropdownMenuItem>
              )}
              
              {!isRevoked && (
                <DropdownMenuItem onClick={() => onRevoke(connection)}>
                  <XCircle className="h-4 w-4 mr-2 text-orange-500" />
                  <span className="text-orange-600">Revocar</span>
                </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={() => onDelete(connection)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default ConnectionItem;
