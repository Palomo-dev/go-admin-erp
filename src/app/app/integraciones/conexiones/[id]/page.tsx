'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  Power,
  Settings,
  Activity,
  Globe,
  Building2,
  Key,
  Webhook,
  Cog,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Link2,
} from 'lucide-react';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationCredential,
  IntegrationWebhook,
  IntegrationEvent,
  IntegrationJob,
} from '@/lib/services/integrationsService';
import { PROVIDER_CONFIGS } from '@/components/integraciones/conexiones';
import { SettingsDialog } from '@/components/integraciones/conexiones/id';
import { cn, formatDate } from '@/utils/Utils';

export default function ConnectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const connectionId = params.id as string;

  // Estados principales
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([]);
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [jobs, setJobs] = useState<IntegrationJob[]>([]);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);

  // Estados de carga
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de modales
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

  // Cargar datos de la conexión
  const loadConnectionData = useCallback(async () => {
    if (!connectionId) return;

    try {
      const [
        connectionData,
        credentialsData,
        webhooksData,
        eventsData,
        jobsData,
      ] = await Promise.all([
        integrationsService.getConnectionById(connectionId),
        integrationsService.getCredentials(connectionId),
        integrationsService.getWebhooks(connectionId),
        integrationsService.getEventsByConnection(connectionId, 20),
        integrationsService.getJobsByConnection(connectionId, 20),
      ]);

      if (!connectionData) {
        toast({
          title: 'Error',
          description: 'Conexión no encontrada',
          variant: 'destructive',
        });
        router.push('/app/integraciones/conexiones');
        return;
      }

      setConnection(connectionData);
      setCredentials(credentialsData);
      setWebhooks(webhooksData);
      setEvents(eventsData);
      setJobs(jobsData);
    } catch (error) {
      console.error('Error loading connection data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de la conexión',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connectionId, router, toast]);

  // Cargar sucursales
  const loadBranches = useCallback(async () => {
    if (!organizationId) return;

    try {
      const branchesData = await integrationsService.getBranches(organizationId);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    loadConnectionData();
  }, [loadConnectionData]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // Refrescar datos
  const handleRefresh = () => {
    setRefreshing(true);
    loadConnectionData();
  };

  // Toggle estado (pausar/reanudar)
  const handleToggleStatus = async () => {
    if (!connection) return;

    const newStatus = connection.status === 'paused' ? 'connected' : 'paused';
    const success = await integrationsService.toggleConnectionStatus(connection.id, newStatus);

    if (success) {
      toast({
        title: newStatus === 'paused' ? 'Conexión pausada' : 'Conexión reanudada',
        description: `La conexión ha sido ${newStatus === 'paused' ? 'pausada' : 'reanudada'} correctamente`,
      });
      loadConnectionData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la conexión',
        variant: 'destructive',
      });
    }
  };

  // Revocar conexión
  const handleRevoke = async () => {
    if (!connection) return;

    const success = await integrationsService.revokeConnection(connection.id);

    if (success) {
      toast({
        title: 'Conexión revocada',
        description: 'La conexión ha sido desconectada correctamente',
      });
      loadConnectionData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo revocar la conexión',
        variant: 'destructive',
      });
    }

    setRevokeDialogOpen(false);
  };

  // Health check
  const handleHealthCheck = async () => {
    if (!connection) return;

    toast({
      title: 'Probando conexión...',
      description: 'Verificando estado de la conexión',
    });

    const result = await integrationsService.healthCheck(connection.id);

    toast({
      title: result.success ? 'Conexión OK' : 'Error de conexión',
      description: result.message,
      variant: result.success ? 'default' : 'destructive',
    });

    if (result.success) {
      loadConnectionData();
    }
  };

  // Guardar configuración
  const handleSaveSettings = async (data: {
    name: string;
    environment: string;
    countryCode?: string;
    branchId?: number | null;
    settings: Record<string, unknown>;
  }): Promise<boolean> => {
    if (!connection) return false;

    // Primero actualizar los campos básicos
    const basicSuccess = await integrationsService.updateConnection(connection.id, {
      name: data.name,
      environment: data.environment,
      countryCode: data.countryCode,
      branchId: data.branchId,
    });

    if (!basicSuccess) return false;

    // Luego actualizar los settings
    const settingsSuccess = await integrationsService.updateConnectionSettings(
      connection.id,
      data.settings
    );

    if (settingsSuccess) {
      loadConnectionData();
    }

    return settingsSuccess;
  };

  // Reintentar job fallido
  const handleRetryJob = async (jobId: string) => {
    const success = await integrationsService.retryJob(jobId);

    if (success) {
      toast({
        title: 'Job reintentado',
        description: 'El job ha sido puesto en cola para reintentar',
      });
      loadConnectionData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo reintentar el job',
        variant: 'destructive',
      });
    }
  };

  // Reintentar último job fallido
  const handleRetryLastFailedJob = async () => {
    if (!connectionId) return;

    const lastFailedJob = await integrationsService.getLastFailedJob(connectionId);

    if (!lastFailedJob) {
      toast({
        title: 'Sin jobs fallidos',
        description: 'No hay jobs fallidos para reintentar',
      });
      return;
    }

    await handleRetryJob(lastFailedJob.id);
  };

  // Obtener configuración del proveedor para mostrar logo
  const getProviderConfig = () => {
    if (!connection?.connector) return null;
    const connector = connection.connector as { code?: string; provider?: { code?: string } };
    const providerCode = connector.provider?.code || connector.code;
    return providerCode ? PROVIDER_CONFIGS[providerCode] : null;
  };

  const providerConfig = getProviderConfig();
  const connector = connection?.connector as { name?: string; provider?: { name?: string; logo_url?: string } } | null;
  const branch = (connection as { branch?: { name?: string } } | null)?.branch;

  const isPaused = connection?.status === 'paused';
  const isRevoked = connection?.status === 'revoked';
  const canToggle = connection?.status === 'connected' || connection?.status === 'paused';

  // Configuración de estados
  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    connected: { label: 'Conectado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
    revoked: { label: 'Revocado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  };

  const ENV_CONFIG: Record<string, { label: string; color: string }> = {
    production: { label: 'Producción', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
    sandbox: { label: 'Sandbox', color: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' },
    test: { label: 'Test', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800' },
  };

  // Si está cargando, mostrar skeleton
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <Skeleton className="h-64 rounded-xl mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header Sticky */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/integraciones/conexiones"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>

            {/* Logo del proveedor */}
            {providerConfig?.logoUrl || connector?.provider?.logo_url ? (
              <div className={cn('p-2 rounded-lg border', providerConfig?.bgColor || 'bg-gray-100', providerConfig?.borderColor || 'border-gray-200')}>
                <img
                  src={providerConfig?.logoUrl || connector?.provider?.logo_url}
                  alt={connector?.provider?.name || ''}
                  className="h-6 w-6 object-contain"
                />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {connection?.name}
                </h1>
                {connection && (
                  <Badge className={cn('text-xs', STATUS_CONFIG[connection.status]?.color)}>
                    {STATUS_CONFIG[connection.status]?.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {connector?.provider?.name || connector?.name || 'Integración'} • Detalle de conexión
              </p>
            </div>

            {/* Acciones en header */}
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-gray-300 dark:border-gray-700"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleHealthCheck}
                disabled={isRevoked}
                className="border-gray-300 dark:border-gray-700"
              >
                <Activity className="h-4 w-4 mr-2" />
                Probar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Info Card Principal */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Info de la conexión */}
              <div className="flex flex-wrap gap-3">
                {connection?.environment && (
                  <Badge variant="outline" className={cn('text-sm', ENV_CONFIG[connection.environment]?.color)}>
                    {ENV_CONFIG[connection.environment]?.label}
                  </Badge>
                )}
                {connection?.country_code && (
                  <Badge variant="outline" className="text-sm dark:border-gray-600 dark:text-gray-300">
                    <Globe className="h-3.5 w-3.5 mr-1" />
                    {connection.country_code}
                  </Badge>
                )}
                {branch?.name && (
                  <Badge variant="outline" className="text-sm dark:border-gray-600 dark:text-gray-300">
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    {branch.name}
                  </Badge>
                )}
                {connection?.last_health_check_at && (
                  <Badge variant="outline" className="text-sm dark:border-gray-600 dark:text-gray-300">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Último check: {formatDate(connection.last_health_check_at)}
                  </Badge>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex flex-wrap gap-2">
                {canToggle && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleStatus}
                    className={cn(
                      'border-gray-300 dark:border-gray-700',
                      isPaused && 'text-green-600 hover:text-green-700'
                    )}
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Reanudar
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pausar
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar
                </Button>
                {!isRevoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeDialogOpen(true)}
                    className="border-red-300 dark:border-red-700 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Revocar
                  </Button>
                )}
              </div>
            </div>

            {/* Error info si existe */}
            {connection?.last_error_message && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Último error</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{connection.last_error_message}</p>
                    {connection.last_error_at && (
                      <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                        {formatDate(connection.last_error_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Grid de tarjetas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Credenciales */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold dark:text-white">
                  <Key className="h-5 w-5 text-blue-500" />
                  Credenciales
                  {credentials.length > 0 && (
                    <Badge className="ml-auto bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {credentials.filter(c => c.status === 'active').length} activa{credentials.filter(c => c.status === 'active').length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {credentials.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      Sin credenciales configuradas
                    </p>
                    <Link
                      href={`/app/integraciones/conexiones/${connectionId}/credenciales`}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      + Agregar credencial
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {credentials.slice(0, 3).map((cred) => (
                      <div key={cred.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          {cred.status === 'active' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium dark:text-white">{cred.credential_type}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {cred.purpose}
                        </Badge>
                      </div>
                    ))}
                    {credentials.length > 0 && (
                      <Link
                        href={`/app/integraciones/conexiones/${connectionId}/credenciales`}
                        className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium pt-2"
                      >
                        Ver todas las credenciales →
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Webhooks */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold dark:text-white">
                  <Webhook className="h-5 w-5 text-purple-500" />
                  Webhooks
                  {webhooks.length > 0 && (
                    <Badge className="ml-auto bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {webhooks.filter(w => w.is_active).length} activo{webhooks.filter(w => w.is_active).length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {webhooks.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      Sin webhooks configurados
                    </p>
                    <Link
                      href={`/app/integraciones/conexiones/${connectionId}/webhooks`}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      + Agregar webhook
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {webhooks.slice(0, 3).map((webhook) => (
                      <div key={webhook.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          {webhook.is_active ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                            {webhook.url}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {webhook.direction}
                        </Badge>
                      </div>
                    ))}
                    {webhooks.length > 0 && (
                      <Link
                        href={`/app/integraciones/conexiones/${connectionId}/webhooks`}
                        className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium pt-2"
                      >
                        Ver todos los webhooks →
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Eventos y Jobs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Últimos Eventos */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold dark:text-white">
                  <Activity className="h-5 w-5 text-green-500" />
                  Últimos Eventos
                  {events.length > 0 && (
                    <Badge variant="outline" className="ml-auto dark:border-gray-600 dark:text-gray-300">
                      {events.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Sin eventos registrados
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {events.slice(0, 8).map((event) => (
                      <div key={event.id} className={cn(
                        'flex items-center justify-between p-2 rounded-lg',
                        event.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800'
                      )}>
                        <div className="flex items-center gap-2 min-w-0">
                          {event.status === 'processed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : event.status === 'error' ? (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium dark:text-white truncate">
                            {event.event_type}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Jobs de Sincronización */}
            <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold dark:text-white">
                  <Cog className="h-5 w-5 text-orange-500" />
                  Jobs de Sincronización
                  {jobs.filter(j => j.status === 'failed').length > 0 && (
                    <Badge className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {jobs.filter(j => j.status === 'failed').length} fallido{jobs.filter(j => j.status === 'failed').length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Sin jobs registrados
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {jobs.slice(0, 8).map((job) => (
                      <div key={job.id} className={cn(
                        'flex items-center justify-between p-2 rounded-lg',
                        job.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800'
                      )}>
                        <div className="flex items-center gap-2 min-w-0">
                          {job.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : job.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          ) : job.status === 'running' ? (
                            <RefreshCw className="h-4 w-4 text-blue-500 flex-shrink-0 animate-spin" />
                          ) : (
                            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-sm font-medium dark:text-white block truncate">
                              {job.resource_type}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {job.job_type}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {job.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetryJob(job.id)}
                              className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Badge variant="outline" className={cn('text-xs',
                            job.status === 'success' ? 'text-green-600 border-green-200' :
                            job.status === 'failed' ? 'text-red-600 border-red-200' :
                            job.status === 'running' ? 'text-blue-600 border-blue-200' :
                            'text-gray-600 border-gray-200'
                          )}>
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialog de Configuración */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        connection={connection}
        branches={branches}
        onSave={handleSaveSettings}
      />

      {/* Dialog de Confirmación de Revocación */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">
              ¿Revocar conexión?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción desconectará la integración. La conexión quedará marcada como revocada
              y no podrá sincronizar datos. Podrás volver a conectarla más tarde si lo necesitas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700"
            >
              Revocar conexión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
