'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  MoreVertical,
  Eye,
  RotateCcw,
  Copy,
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
import { IntegrationEvent } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';

interface EventsListProps {
  events: IntegrationEvent[];
  loading?: boolean;
  onReprocess: (event: IntegrationEvent) => void;
  onCopyId: (event: IntegrationEvent) => void;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'processed':
      return {
        icon: CheckCircle2,
        label: 'Procesado',
        className: 'text-green-600 dark:text-green-400',
        bgClassName: 'bg-green-100 dark:bg-green-900/30',
      };
    case 'error':
      return {
        icon: XCircle,
        label: 'Error',
        className: 'text-red-600 dark:text-red-400',
        bgClassName: 'bg-red-100 dark:bg-red-900/30',
      };
    default:
      return {
        icon: Clock,
        label: 'Recibido',
        className: 'text-yellow-600 dark:text-yellow-400',
        bgClassName: 'bg-yellow-100 dark:bg-yellow-900/30',
      };
  }
};

const getSourceLabel = (source: string) => {
  switch (source) {
    case 'webhook':
      return 'Webhook';
    case 'sync':
      return 'Sync';
    case 'manual':
      return 'Manual';
    case 'system':
      return 'Sistema';
    default:
      return source;
  }
};

export function EventsList({
  events,
  loading = false,
  onReprocess,
  onCopyId,
}: EventsListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
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

  if (events.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <Activity className="h-8 w-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin eventos
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No hay eventos que coincidan con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Tabla de eventos */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Evento
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conexión
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Fuente
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {events.map((event) => {
              const statusConfig = getStatusConfig(event.status);
              const StatusIcon = statusConfig.icon;
              const connection = event.connection as any;

              return (
                <tr
                  key={event.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Evento */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'p-1.5 rounded-lg',
                          event.direction === 'inbound'
                            ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-orange-100 dark:bg-orange-900/30'
                        )}
                      >
                        {event.direction === 'inbound' ? (
                          <ArrowDownLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        )}
                      </div>
                      <div>
                        <Link
                          href={`/app/integraciones/eventos/${event.id}`}
                          className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {event.event_type}
                        </Link>
                        {event.external_event_id && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[150px]">
                            {event.external_event_id}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Conexión */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/integraciones/conexiones/${event.connection_id}`}
                      className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {connection?.name || 'Sin nombre'}
                    </Link>
                  </td>

                  {/* Fuente */}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {getSourceLabel(event.source)}
                    </Badge>
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={cn('h-4 w-4', statusConfig.className)} />
                      <span className={cn('text-sm', statusConfig.className)}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </td>

                  {/* Fecha */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(event.created_at)}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/integraciones/eventos/${event.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalle
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onCopyId(event)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onReprocess(event)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reprocesar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EventsList;
