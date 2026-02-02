'use client';

import React from 'react';
import {
  MoreVertical,
  Settings,
  Copy,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  XCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  Globe,
  Building2,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { PROVIDER_CONFIGS } from './AvailableProviders';

interface ConnectionCardProps {
  connection: IntegrationConnection;
  branches: Array<{ id: number; name: string }>;
  onEdit: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => void;
  onRevoke: (connection: IntegrationConnection) => void;
  onHealthCheck: (connection: IntegrationConnection) => void;
  onDelete: (connection: IntegrationConnection) => void;
}

export function ConnectionCard({
  connection,
  branches,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDelete
}: ConnectionCardProps) {
  const [isUpdating, setIsUpdating] = React.useState(false);

  const providerCode = connection.connector?.provider?.code || '';
  const config = PROVIDER_CONFIGS[providerCode];

  const getStatusIcon = () => {
    switch (connection.status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'revoked':
        return <XCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusLabel = () => {
    const labels: Record<string, string> = {
      connected: 'Conectado',
      error: 'Error',
      paused: 'Pausado',
      revoked: 'Revocado',
      draft: 'Borrador'
    };
    return labels[connection.status] || connection.status;
  };

  const getStatusColor = () => {
    const colors: Record<string, string> = {
      connected: 'text-green-600 dark:text-green-400',
      error: 'text-red-600 dark:text-red-400',
      paused: 'text-yellow-600 dark:text-yellow-400',
      revoked: 'text-orange-600 dark:text-orange-400',
      draft: 'text-gray-500 dark:text-gray-400'
    };
    return colors[connection.status] || 'text-gray-500';
  };

  const handleToggle = async () => {
    setIsUpdating(true);
    await onToggleStatus(connection);
    setIsUpdating(false);
  };

  const branchName = branches.find(b => b.id === connection.branch_id)?.name;

  return (
    <Card className={`
      hover:shadow-md transition-all duration-200 
      dark:bg-gray-800 dark:border-gray-700
      ${connection.status === 'error' ? 'border-red-200 dark:border-red-800' : ''}
      ${connection.status === 'connected' ? 'border-green-200 dark:border-green-900' : ''}
    `}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Logo del proveedor */}
          <div className={`
            flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center
            bg-white dark:bg-gray-900 shadow-sm border
            ${config?.borderColor || 'border-gray-200 dark:border-gray-700'}
          `}>
            {config?.logoUrl ? (
              <img 
                src={config.logoUrl} 
                alt={connection.connector?.provider?.name || 'Provider'}
                className="w-9 h-9 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextElementSibling) {
                    (e.currentTarget.nextElementSibling as HTMLElement).classList.remove('hidden');
                  }
                }}
              />
            ) : null}
            <div className={`${config?.color || 'text-gray-400'} ${config?.logoUrl ? 'hidden' : ''}`}>
              {config?.icon || <Zap className="h-6 w-6" />}
            </div>
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {connection.name}
                  </h3>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {connection.environment}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-sm">
                  {/* Estado */}
                  <div className={`flex items-center gap-1 ${getStatusColor()}`}>
                    {getStatusIcon()}
                    <span>{getStatusLabel()}</span>
                  </div>
                  
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  
                  {/* Conector */}
                  <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {connection.connector?.name || 'Sin conector'}
                  </span>
                </div>

                {/* Detalles adicionales */}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {connection.country_code && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {connection.country_code}
                    </span>
                  )}
                  {branchName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {branchName}
                    </span>
                  )}
                  {connection.last_activity_at && (
                    <span>
                      Última actividad: {formatDistanceToNow(new Date(connection.last_activity_at), { locale: es, addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle y acciones */}
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={connection.status === 'connected' || connection.status === 'error'}
                  onCheckedChange={handleToggle}
                  disabled={isUpdating || connection.status === 'revoked'}
                />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(connection)}>
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
                    ) : connection.status !== 'revoked' && (
                      <DropdownMenuItem onClick={() => onToggleStatus(connection)}>
                        <Pause className="h-4 w-4 mr-2 text-yellow-500" />
                        <span className="text-yellow-600">Pausar</span>
                      </DropdownMenuItem>
                    )}
                    {connection.status !== 'revoked' && (
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
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectionCard;
