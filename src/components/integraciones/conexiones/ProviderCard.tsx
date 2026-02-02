'use client';

import React from 'react';
import { Plus, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IntegrationConnection, IntegrationProvider } from '@/lib/services/integrationsService';
import { ConnectionItem } from './ConnectionItem';

interface ProviderConfig {
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  logoUrl?: string;
}

interface ProviderCardProps {
  provider: IntegrationProvider;
  config: ProviderConfig;
  connections: IntegrationConnection[];
  branches: Array<{ id: number; name: string }>;
  onConnect: (provider: IntegrationProvider) => void;
  onConfigure: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => void;
  onRevoke: (connection: IntegrationConnection) => void;
  onHealthCheck: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onDelete: (connection: IntegrationConnection) => void;
}

export function ProviderCard({
  provider,
  config,
  connections,
  branches,
  onConnect,
  onConfigure,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDuplicate,
  onDelete,
}: ProviderCardProps) {
  const hasConnections = connections.length > 0;
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const hasErrors = connections.some(c => c.status === 'error');

  const getBranchName = (branchId?: number) => {
    if (!branchId) return undefined;
    return branches.find(b => b.id === branchId)?.name;
  };

  return (
    <div
      className={`
        relative rounded-xl border-2 transition-all duration-200 overflow-hidden
        ${config.bgColor} ${config.borderColor} 
        hover:shadow-lg
      `}
    >
      {/* Header del proveedor */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            {config.logoUrl ? (
              <img 
                src={config.logoUrl} 
                alt={provider.name}
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`${config.color} ${config.logoUrl ? 'hidden' : ''}`}>
              {config.icon || <CreditCard className="h-6 w-6" />}
            </div>
          </div>

          {/* Info del proveedor */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {provider.name}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
              {config.description}
            </p>
          </div>

          {/* Badge de estado */}
          {hasConnections ? (
            <Badge 
              className={`text-xs shrink-0 ${
                hasErrors 
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : connectedCount > 0
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}
            >
              {hasErrors ? 'Error' : connectedCount > 0 ? `${connectedCount} activa${connectedCount > 1 ? 's' : ''}` : 'Pausado'}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500 dark:text-gray-400 text-xs shrink-0">
              Disponible
            </Badge>
          )}
        </div>
      </div>

      {/* Lista de conexiones existentes */}
      {hasConnections && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 max-h-[200px] overflow-y-auto">
          {connections.map((connection) => (
            <ConnectionItem
              key={connection.id}
              connection={connection}
              branchName={getBranchName(connection.branch_id)}
              onConfigure={onConfigure}
              onToggleStatus={onToggleStatus}
              onRevoke={onRevoke}
              onHealthCheck={onHealthCheck}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Botón de acción */}
      <div className="p-3 pt-2 bg-white/30 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800">
        <Button
          variant={hasConnections ? "outline" : "default"}
          size="sm"
          className={`
            w-full gap-2 transition-all
            ${hasConnections 
              ? 'border-gray-300 dark:border-gray-600' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
          onClick={() => onConnect(provider)}
        >
          <Plus className="h-4 w-4" />
          {hasConnections ? 'Nueva conexión' : 'Conectar'}
        </Button>
      </div>
    </div>
  );
}

export default ProviderCard;
