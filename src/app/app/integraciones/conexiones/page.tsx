'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Link2, RefreshCw, Upload, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationConnector,
  IntegrationProvider,
} from '@/lib/services/integrationsService';
import {
  AvailableProviders,
  ImportDialog,
} from '@/components/integraciones/conexiones';

export default function ConexionesPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  // Estado principal
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modales
  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<IntegrationConnection | null>(null);

  // Cargar datos iniciales
  const loadInitialData = useCallback(async () => {
    if (!organizationId) return;

    try {
      const [connectorsData, providersData, branchesData] = await Promise.all([
        integrationsService.getConnectors(),
        integrationsService.getProviders(),
        integrationsService.getBranches(organizationId),
      ]);

      setConnectors(connectorsData);
      setProviders(providersData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos iniciales',
        variant: 'destructive',
      });
    }
  }, [organizationId, toast]);

  // Cargar conexiones
  const loadConnections = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const data = await integrationsService.getConnections(organizationId);
      setConnections(data);
    } catch (error) {
      console.error('Error loading connections:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las conexiones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  // Efectos
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Refrescar datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadConnections(), loadInitialData()]);
    setIsRefreshing(false);
  };

  // Conectar con proveedor
  const handleConnectProvider = (provider: IntegrationProvider) => {
    router.push(`/app/integraciones/conexiones/nueva?provider=${provider.id}`);
  };

  // Toggle estado (pausar/reanudar)
  const handleToggleStatus = async (connection: IntegrationConnection) => {
    const newStatus = connection.status === 'paused' ? 'connected' : 'paused';
    const success = await integrationsService.toggleConnectionStatus(connection.id, newStatus);

    if (success) {
      toast({
        title: newStatus === 'paused' ? 'Conexión pausada' : 'Conexión reanudada',
        description: `La conexión "${connection.name}" ha sido ${newStatus === 'paused' ? 'pausada' : 'reanudada'}`,
      });
      loadConnections();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la conexión',
        variant: 'destructive',
      });
    }
  };

  // Revocar conexión
  const handleRevoke = async (connection: IntegrationConnection) => {
    const success = await integrationsService.revokeConnection(connection.id);

    if (success) {
      toast({
        title: 'Conexión revocada',
        description: `La conexión "${connection.name}" ha sido desconectada`,
      });
      loadConnections();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo revocar la conexión',
        variant: 'destructive',
      });
    }
  };

  // Health check
  const handleHealthCheck = async (connection: IntegrationConnection) => {
    toast({
      title: 'Probando conexión...',
      description: `Verificando "${connection.name}"`,
    });

    const result = await integrationsService.healthCheck(connection.id);

    toast({
      title: result.success ? 'Conexión OK' : 'Error de conexión',
      description: result.message,
      variant: result.success ? 'default' : 'destructive',
    });

    if (result.success) {
      loadConnections();
    }
  };

  // Confirmar eliminación
  const confirmDelete = (connection: IntegrationConnection) => {
    setConnectionToDelete(connection);
    setDeleteDialogOpen(true);
  };

  // Eliminar conexión
  const handleDelete = async () => {
    if (!connectionToDelete) return;

    const success = await integrationsService.deleteConnection(connectionToDelete.id);

    if (success) {
      toast({
        title: 'Conexión eliminada',
        description: `La conexión "${connectionToDelete.name}" ha sido eliminada`,
      });
      loadConnections();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la conexión',
        variant: 'destructive',
      });
    }

    setDeleteDialogOpen(false);
    setConnectionToDelete(null);
  };

  // Importar conexiones
  const handleImport = async (
    connectorId: string,
    connectionsData: Array<{
      name: string;
      branchId?: number;
      countryCode?: string;
      environment?: string;
    }>
  ) => {
    if (!organizationId) {
      return { success: 0, failed: 0, errors: ['No se pudo determinar la organización'] };
    }

    const result = await integrationsService.importConnectionsFromCSV(
      organizationId,
      connectorId,
      connectionsData
    );

    if (result.success > 0) {
      loadConnections();
    }

    return result;
  };


  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/app/integraciones"
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </Link>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Conexiones
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Conecta tus servicios y plataformas favoritas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-gray-300 dark:border-gray-700"
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="border-gray-300 dark:border-gray-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button
                size="sm"
                onClick={() => router.push('/app/integraciones/conexiones/nueva')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Conexión
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-6">
            {/* Skeleton de estadísticas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            {/* Skeleton de filtros */}
            <Skeleton className="h-10 w-full max-w-md" />
            {/* Skeleton de proveedores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <AvailableProviders
            providers={providers}
            connections={connections}
            branches={branches}
            onConnect={handleConnectProvider}
            onConfigure={(conn) => router.push(`/app/integraciones/conexiones/nueva?mode=edit&id=${conn.id}`)}
            onToggleStatus={handleToggleStatus}
            onRevoke={handleRevoke}
            onHealthCheck={handleHealthCheck}
            onDuplicate={(conn) => router.push(`/app/integraciones/conexiones/nueva?mode=duplicate&id=${conn.id}`)}
            onDelete={confirmDelete}
          />
        )}
      </div>

      {/* Modal de Importación */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        connectors={connectors}
        onImport={handleImport}
      />

      {/* Dialog de Confirmación de Eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">
              ¿Eliminar conexión?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La conexión &quot;{connectionToDelete?.name}&quot; 
              será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
