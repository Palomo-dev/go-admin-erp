'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  Edit,
  Copy,
  Pause,
  Play,
  Trash2,
  Activity,
  XCircle,
  Loader2,
} from 'lucide-react';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface ConnectionActionsProps {
  connection: IntegrationConnection;
  onEdit: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => Promise<void>;
  onRevoke: (connection: IntegrationConnection) => Promise<void>;
  onHealthCheck: (connection: IntegrationConnection) => Promise<void>;
  onDelete: (connection: IntegrationConnection) => Promise<void>;
}

export function ConnectionActions({
  connection,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDelete,
}: ConnectionActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleAction = async (
    action: () => Promise<void>,
    actionName: string
  ) => {
    setIsLoading(actionName);
    try {
      await action();
    } finally {
      setIsLoading(null);
    }
  };

  const isPaused = connection.status === 'paused';
  const isConnected = connection.status === 'connected';
  const canPauseResume = isConnected || isPaused;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 dark:hover:bg-gray-700"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
        <DropdownMenuLabel className="dark:text-gray-200">
          Acciones
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="dark:bg-gray-700" />

        {/* Editar */}
        <DropdownMenuItem
          onClick={() => onEdit(connection)}
          className="dark:text-gray-200 dark:focus:bg-gray-700"
        >
          <Edit className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>

        {/* Duplicar */}
        <DropdownMenuItem
          onClick={() => onDuplicate(connection)}
          className="dark:text-gray-200 dark:focus:bg-gray-700"
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicar
        </DropdownMenuItem>

        <DropdownMenuSeparator className="dark:bg-gray-700" />

        {/* Pausar/Reanudar */}
        {canPauseResume && (
          <DropdownMenuItem
            onClick={() =>
              handleAction(() => onToggleStatus(connection), 'toggle')
            }
            disabled={isLoading === 'toggle'}
            className="dark:text-gray-200 dark:focus:bg-gray-700"
          >
            {isLoading === 'toggle' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isPaused ? (
              <Play className="mr-2 h-4 w-4 text-green-500" />
            ) : (
              <Pause className="mr-2 h-4 w-4 text-yellow-500" />
            )}
            {isPaused ? 'Reanudar' : 'Pausar'}
          </DropdownMenuItem>
        )}

        {/* Health Check */}
        {isConnected && (
          <DropdownMenuItem
            onClick={() =>
              handleAction(() => onHealthCheck(connection), 'health')
            }
            disabled={isLoading === 'health'}
            className="dark:text-gray-200 dark:focus:bg-gray-700"
          >
            {isLoading === 'health' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Activity className="mr-2 h-4 w-4 text-blue-500" />
            )}
            Probar conexión
          </DropdownMenuItem>
        )}

        {/* Revocar */}
        {(isConnected || isPaused) && (
          <DropdownMenuItem
            onClick={() => handleAction(() => onRevoke(connection), 'revoke')}
            disabled={isLoading === 'revoke'}
            className="text-orange-600 dark:text-orange-400 dark:focus:bg-gray-700"
          >
            {isLoading === 'revoke' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Revocar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="dark:bg-gray-700" />

        {/* Eliminar */}
        <DropdownMenuItem
          onClick={() => handleAction(() => onDelete(connection), 'delete')}
          disabled={isLoading === 'delete'}
          className="text-red-600 dark:text-red-400 dark:focus:bg-gray-700"
        >
          {isLoading === 'delete' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ConnectionActions;
