'use client';

import React from 'react';
import {
  Key,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Power,
  PowerOff,
  ShieldOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChannelApiKey } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';

interface ApiKeysListProps {
  apiKeys: ChannelApiKey[];
  loading?: boolean;
  onEdit: (key: ChannelApiKey) => void;
  onDuplicate: (key: ChannelApiKey) => void;
  onToggleStatus: (key: ChannelApiKey) => void;
  onRevoke: (key: ChannelApiKey) => void;
  onDelete: (key: ChannelApiKey) => void;
}

export function ApiKeysList({
  apiKeys,
  loading = false,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onRevoke,
  onDelete,
}: ApiKeysListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (apiKeys.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
          <Key className="h-8 w-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin API Keys
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No tienes API keys creadas. Crea una para permitir acceso programático a tu API.
        </p>
      </div>
    );
  }

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-3">
      {apiKeys.map((apiKey) => {
        const expired = isExpired(apiKey.expires_at);
        const isRevoked = !!apiKey.revoked_at;
        const isInactive = !apiKey.is_active || isRevoked || expired;

        return (
          <div
            key={apiKey.id}
            className={cn(
              'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 transition-all',
              isInactive && 'opacity-60'
            )}
          >
            <div className="flex items-start gap-4">
              {/* Icono */}
              <div
                className={cn(
                  'p-2.5 rounded-xl',
                  isRevoked
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : expired
                    ? 'bg-orange-100 dark:bg-orange-900/30'
                    : apiKey.is_active
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-gray-800'
                )}
              >
                <Key
                  className={cn(
                    'h-5 w-5',
                    isRevoked
                      ? 'text-red-600 dark:text-red-400'
                      : expired
                      ? 'text-orange-600 dark:text-orange-400'
                      : apiKey.is_active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400'
                  )}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {apiKey.name}
                  </h3>
                  {isRevoked ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <ShieldOff className="h-3 w-3 mr-1" />
                      Revocada
                    </Badge>
                  ) : expired ? (
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Expirada
                    </Badge>
                  ) : apiKey.is_active ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Activa
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      Inactiva
                    </Badge>
                  )}
                </div>

                {/* Key prefix */}
                <p className="font-mono text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {apiKey.key_prefix}
                </p>

                {/* Scopes */}
                {apiKey.scopes && apiKey.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {apiKey.scopes.slice(0, 4).map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      >
                        {scope}
                      </Badge>
                    ))}
                    {apiKey.scopes.length > 4 && (
                      <Badge variant="outline" className="text-xs">
                        +{apiKey.scopes.length - 4} más
                      </Badge>
                    )}
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Creada: {formatDate(apiKey.created_at)}
                  </span>
                  {apiKey.last_used_at && (
                    <span>Último uso: {formatDate(apiKey.last_used_at)}</span>
                  )}
                  {apiKey.expires_at && (
                    <span className={expired ? 'text-orange-500' : ''}>
                      Expira: {formatDate(apiKey.expires_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isRevoked && (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(apiKey)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(apiKey)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggleStatus(apiKey)}>
                        {apiKey.is_active ? (
                          <>
                            <PowerOff className="h-4 w-4 mr-2" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4 mr-2" />
                            Activar
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onRevoke(apiKey)}
                        className="text-orange-600 dark:text-orange-400"
                      >
                        <ShieldOff className="h-4 w-4 mr-2" />
                        Revocar
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(apiKey)}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ApiKeysList;
