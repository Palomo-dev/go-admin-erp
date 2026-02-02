'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  MoreVertical,
  Edit,
  Copy,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  Building2,
  Zap,
} from 'lucide-react';
import { IntegrationConnection, IntegrationProvider } from '@/lib/services/integrationsService';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConnectionsListCardProps {
  connections: IntegrationConnection[];
  providers: IntegrationProvider[];
  branches: Array<{ id: number; name: string }>;
  loading?: boolean;
  onEdit: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => void;
  onRevoke: (connection: IntegrationConnection) => void;
  onHealthCheck: (connection: IntegrationConnection) => void;
  onDelete: (connection: IntegrationConnection) => void;
}

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'connected', label: 'Conectado' },
  { value: 'error', label: 'Error' },
  { value: 'paused', label: 'Pausado' },
  { value: 'draft', label: 'Borrador' },
  { value: 'revoked', label: 'Revocado' },
];

const environmentOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'production', label: 'Producción' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'test', label: 'Test' },
];

export function ConnectionsListCard({
  connections,
  providers,
  branches,
  loading = false,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDelete,
}: ConnectionsListCardProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filtrar conexiones
  const filteredConnections = connections.filter((conn) => {
    const matchesSearch =
      !search ||
      conn.name.toLowerCase().includes(search.toLowerCase()) ||
      conn.connector?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || conn.status === statusFilter;
    const matchesEnvironment = environmentFilter === 'all' || conn.environment === environmentFilter;
    const matchesProvider =
      providerFilter === 'all' || conn.connector?.provider_id === providerFilter;

    return matchesSearch && matchesStatus && matchesEnvironment && matchesProvider;
  });

  const getProviderLogo = (connection: IntegrationConnection) => {
    const provider = connection.connector?.provider;
    if (provider?.logo_url) {
      return (
        <img
          src={provider.logo_url}
          alt={provider.name}
          className="h-8 w-8 object-contain rounded"
        />
      );
    }
    return (
      <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Lista de Conexiones
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredConnections.length} de {connections.length})
            </span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barra de búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o conector..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 dark:bg-gray-900 dark:border-gray-600"
          />
        </div>

        {/* Filtros expandibles */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                Estado
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                Ambiente
              </label>
              <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {environmentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                Proveedor
              </label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Lista de conexiones */}
        <div className="space-y-3">
          {filteredConnections.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 w-fit mx-auto mb-4">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                No se encontraron conexiones
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Intenta ajustar los filtros o crear una nueva conexión
              </p>
            </div>
          ) : (
            filteredConnections.map((connection) => (
              <div
                key={connection.id}
                className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                {/* Logo del proveedor */}
                {getProviderLogo(connection)}

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900 dark:text-white truncate">
                      {connection.name}
                    </h4>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0"
                    >
                      {connection.environment}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {connection.connector?.name || 'Sin conector'}
                    </span>
                    {connection.country_code && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {connection.country_code}
                      </span>
                    )}
                    {connection.branch_id && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {branches.find((b) => b.id === connection.branch_id)?.name || 'Sucursal'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Estado y última actividad */}
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <ConnectionStatusBadge status={connection.status} />
                  {connection.last_activity_at && (
                    <span className="text-xs text-gray-400">
                      Hace{' '}
                      {formatDistanceToNow(new Date(connection.last_activity_at), {
                        locale: es,
                      })}
                    </span>
                  )}
                </div>

                {/* Acciones */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onEdit(connection)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
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
                        <Play className="h-4 w-4 mr-2 text-green-600" />
                        <span className="text-green-600">Reanudar</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => onToggleStatus(connection)}>
                        <Pause className="h-4 w-4 mr-2 text-yellow-600" />
                        <span className="text-yellow-600">Pausar</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onRevoke(connection)}>
                      <XCircle className="h-4 w-4 mr-2 text-orange-600" />
                      <span className="text-orange-600">Revocar</span>
                    </DropdownMenuItem>
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
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ConnectionsListCard;
