'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  RefreshCw,
  Copy,
  Trash2,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
} from 'lucide-react';
import { CHANNEL_PROVIDERS } from '@/lib/services/channelManagerService';
import type { SpaceChannelSummary } from '@/lib/services/channelManagerService';
import type { ChannelConnection } from '@/lib/services/icalService';

interface SpaceConnectionsListProps {
  summaries: SpaceChannelSummary[];
  isLoading: boolean;
  syncingConnectionId: string | null;
  onAddConnection: (spaceId: string) => void;
  onSyncConnection: (connectionId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onCopyExportUrl: (exportToken: string) => void;
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case 'success':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          OK
        </Badge>
      );
    case 'error':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );
    case 'partial':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Parcial
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs">
          Sin sync
        </Badge>
      );
  }
}

function getChannelColor(channelId: string): string {
  const provider = CHANNEL_PROVIDERS.find(p => p.id === channelId);
  return provider?.color || '#6B7280';
}

function getChannelName(channelId: string): string {
  const provider = CHANNEL_PROVIDERS.find(p => p.id === channelId);
  return provider?.name || channelId;
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

function ConnectionCard({
  connection,
  isSyncing,
  onSync,
  onDelete,
  onCopyUrl,
}: {
  connection: ChannelConnection;
  isSyncing: boolean;
  onSync: () => void;
  onDelete: () => void;
  onCopyUrl: () => void;
}) {
  const color = getChannelColor(connection.channel);
  const name = getChannelName(connection.channel);

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {name}
            </span>
            {getStatusBadge(connection.last_sync_status)}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span>Comisión: {connection.commission_percent}%</span>
            <span>Última sync: {formatLastSync(connection.last_sync_at)}</span>
          </div>
          {connection.last_sync_error && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate max-w-[300px]">
              {connection.last_sync_error}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          title="Sincronizar ahora"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyUrl}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar URL de Export
            </DropdownMenuItem>
            {connection.ical_import_url && (
              <DropdownMenuItem
                onClick={() => window.open(connection.ical_import_url!, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver URL de Import
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar Conexión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SpaceConnectionsList({
  summaries,
  isLoading,
  syncingConnectionId,
  onAddConnection,
  onSyncConnection,
  onDeleteConnection,
  onCopyExportUrl,
}: SpaceConnectionsListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSummaries = summaries.filter(s =>
    s.space_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.space_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.connections.some(c => getChannelName(c.channel).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <Input
        placeholder="Buscar espacio o canal..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-sm"
      />

      {filteredSummaries.length === 0 ? (
        <Card className="p-8 text-center">
          <Link2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {searchTerm ? 'No se encontraron resultados' : 'Sin conexiones de canal'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {searchTerm
              ? 'Intenta con otro término de búsqueda'
              : 'Conecta tus espacios con Airbnb, Booking.com u otros canales para sincronizar disponibilidad automáticamente'
            }
          </p>
          {!searchTerm && (
            <Button
              onClick={() => onAddConnection('')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Conectar primer canal
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSummaries.map(summary => (
            <Card key={summary.space_id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {summary.space_label}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {summary.space_type}
                    {summary.total_blocks > 0 && (
                      <span className="ml-2">
                        · {summary.total_blocks} bloqueo{summary.total_blocks !== 1 ? 's' : ''} importado{summary.total_blocks !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddConnection(summary.space_id)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Canal
                </Button>
              </div>

              {summary.connections.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2 text-center">
                  Sin canales conectados
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.connections.map(conn => (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      isSyncing={syncingConnectionId === conn.id}
                      onSync={() => onSyncConnection(conn.id)}
                      onDelete={() => onDeleteConnection(conn.id)}
                      onCopyUrl={() => onCopyExportUrl(conn.ical_export_token)}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
