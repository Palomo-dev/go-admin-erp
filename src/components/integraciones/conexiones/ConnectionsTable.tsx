'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ConnectionActions } from './ConnectionActions';
import { IntegrationConnection, IntegrationConnector, IntegrationProvider } from '@/lib/services/integrationsService';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Globe, Building2, AlertTriangle } from 'lucide-react';

interface ConnectionsTableProps {
  connections: IntegrationConnection[];
  isLoading: boolean;
  onEdit: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => Promise<void>;
  onRevoke: (connection: IntegrationConnection) => Promise<void>;
  onHealthCheck: (connection: IntegrationConnection) => Promise<void>;
  onDelete: (connection: IntegrationConnection) => Promise<void>;
}

const environmentLabels: Record<string, { label: string; className: string }> = {
  production: {
    label: 'Prod',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  sandbox: {
    label: 'Sandbox',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  test: {
    label: 'Test',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
};

function LoadingSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-8" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <TableRow>
      <TableCell colSpan={7} className="h-48 text-center">
        <div className="flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <Globe className="h-12 w-12 opacity-50" />
          <p className="text-lg font-medium">No hay conexiones</p>
          <p className="text-sm">Crea una nueva conexión para empezar</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ConnectionsTable({
  connections,
  isLoading,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDelete,
}: ConnectionsTableProps) {
  const formatLastSync = (date: string | undefined) => {
    if (!date) return 'Nunca';
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
  };

  return (
    <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="dark:text-gray-300">Conexión</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Ambiente</TableHead>
            <TableHead className="dark:text-gray-300">País</TableHead>
            <TableHead className="dark:text-gray-300">Sucursal</TableHead>
            <TableHead className="dark:text-gray-300">Último sync</TableHead>
            <TableHead className="dark:text-gray-300 w-[60px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <LoadingSkeleton />
          ) : connections.length === 0 ? (
            <EmptyState />
          ) : (
            connections.map((connection) => {
              const connector = connection.connector as IntegrationConnector | undefined;
              const provider = connector?.provider as IntegrationProvider | undefined;
              const branch = (connection as IntegrationConnection & { branch?: { id: number; name: string } }).branch;
              const env = environmentLabels[connection.environment] || environmentLabels.production;

              return (
                <TableRow
                  key={connection.id}
                  className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  {/* Conexión (Proveedor + Nombre) */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        {provider?.name?.[0]?.toUpperCase() || 'C'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {connection.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {provider?.name || connector?.name || 'Desconocido'}
                          {connector?.name && provider?.name && connector.name !== provider.name && (
                            <span className="ml-1 text-xs">({connector.name})</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Estado */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <ConnectionStatusBadge
                        status={connection.status as 'draft' | 'connected' | 'paused' | 'error' | 'revoked'}
                        size="sm"
                      />
                      {connection.error_count_24h > 0 && (
                        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          {connection.error_count_24h} errores (24h)
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Ambiente */}
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${env.className}`}>
                      {env.label}
                    </Badge>
                  </TableCell>

                  {/* País */}
                  <TableCell>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {connection.country_code || '—'}
                    </span>
                  </TableCell>

                  {/* Sucursal */}
                  <TableCell>
                    {branch ? (
                      <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        {branch.name}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </TableCell>

                  {/* Último sync */}
                  <TableCell>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatLastSync(connection.last_activity_at)}
                    </span>
                  </TableCell>

                  {/* Acciones */}
                  <TableCell>
                    <ConnectionActions
                      connection={connection}
                      onEdit={onEdit}
                      onDuplicate={onDuplicate}
                      onToggleStatus={onToggleStatus}
                      onRevoke={onRevoke}
                      onHealthCheck={onHealthCheck}
                      onDelete={onDelete}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default ConnectionsTable;
