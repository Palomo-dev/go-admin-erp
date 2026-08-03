'use client';

import React from 'react';
import {
  Send,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Power,
  PowerOff,
  PlayCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Link2,
  Shield,
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
import { WebhookEndpoint } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';

interface WebhooksListProps {
  endpoints: WebhookEndpoint[];
  loading?: boolean;
  onEdit: (endpoint: WebhookEndpoint) => void;
  onDuplicate: (endpoint: WebhookEndpoint) => void;
  onToggleStatus: (endpoint: WebhookEndpoint) => void;
  onTest: (endpoint: WebhookEndpoint) => void;
  onDelete: (endpoint: WebhookEndpoint) => void;
}

export function WebhooksList({
  endpoints,
  loading = false,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onTest,
  onDelete,
}: WebhooksListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
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

  if (endpoints.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mb-4">
          <Send className="h-8 w-8 text-cyan-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin Webhooks Salientes
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No tienes endpoints configurados. Crea uno para enviar notificaciones de eventos a sistemas externos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {endpoints.map((endpoint) => (
        <div
          key={endpoint.id}
          className={cn(
            'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 transition-all',
            !endpoint.is_active && 'opacity-60'
          )}
        >
          <div className="flex items-start gap-4">
            {/* Icono */}
            <div
              className={cn(
                'p-2.5 rounded-xl',
                endpoint.is_active
                  ? 'bg-cyan-100 dark:bg-cyan-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              )}
            >
              <Send
                className={cn(
                  'h-5 w-5',
                  endpoint.is_active
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {endpoint.name}
                </h3>
                {endpoint.is_active ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Activo
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    <XCircle className="h-3 w-3 mr-1" />
                    Inactivo
                  </Badge>
                )}
              </div>

              {/* URL */}
              <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mb-2">
                <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-mono truncate">{endpoint.target_url}</span>
              </div>

              {/* Eventos */}
              {endpoint.events && endpoint.events.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {endpoint.events.slice(0, 4).map((event) => (
                    <Badge
                      key={event}
                      variant="outline"
                      className="text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                    >
                      {event}
                    </Badge>
                  ))}
                  {endpoint.events.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{endpoint.events.length - 4} más
                    </Badge>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Secret configurado
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Actualizado: {formatDate(endpoint.updated_at)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTest(endpoint)}
                disabled={!endpoint.is_active}
                className="dark:border-gray-700"
              >
                <PlayCircle className="h-4 w-4 mr-1" />
                Probar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(endpoint)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(endpoint)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleStatus(endpoint)}>
                    {endpoint.is_active ? (
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
                    onClick={() => onDelete(endpoint)}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default WebhooksList;
