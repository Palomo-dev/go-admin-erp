'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
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
import {
  integrationsService,
  IntegrationConnection,
  IntegrationCredential,
} from '@/lib/services/integrationsService';
import {
  CredentialsHeader,
  CredentialsList,
  CredentialDialog,
  CredentialFormData,
} from '@/components/integraciones/conexiones/id/credenciales';

type DialogMode = 'create' | 'edit' | 'duplicate';

export default function CredentialsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const connectionId = params.id as string;

  // Estados principales
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([]);

  // Estados de carga
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de modales
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [selectedCredential, setSelectedCredential] = useState<IntegrationCredential | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<IntegrationCredential | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!connectionId) return;

    try {
      const [connectionData, credentialsData] = await Promise.all([
        integrationsService.getConnectionById(connectionId),
        integrationsService.getCredentials(connectionId),
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
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connectionId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refrescar datos
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Abrir dialog para nueva credencial
  const handleNewCredential = () => {
    setSelectedCredential(null);
    setDialogMode('create');
    setDialogOpen(true);
  };

  // Abrir dialog para editar (rotar)
  const handleEdit = (credential: IntegrationCredential) => {
    setSelectedCredential(credential);
    setDialogMode('edit');
    setDialogOpen(true);
  };

  // Abrir dialog para duplicar
  const handleDuplicate = (credential: IntegrationCredential) => {
    setSelectedCredential(credential);
    setDialogMode('duplicate');
    setDialogOpen(true);
  };

  // Guardar credencial (crear, editar, duplicar)
  const handleSaveCredential = async (data: CredentialFormData): Promise<boolean> => {
    try {
      if (dialogMode === 'create') {
        const newCredential = await integrationsService.createCredential({
          connectionId,
          credentialType: data.credentialType,
          purpose: data.purpose,
          secretRef: data.secretRef,
          keyPrefix: data.keyPrefix,
          expiresAt: data.expiresAt,
        });

        if (newCredential) {
          toast({
            title: 'Credencial creada',
            description: 'La credencial se ha creado correctamente',
          });
          loadData();
          return true;
        }
      } else if (dialogMode === 'edit' && selectedCredential) {
        const success = await integrationsService.updateCredential(selectedCredential.id, {
          secretRef: data.secretRef,
          keyPrefix: data.keyPrefix,
          expiresAt: data.expiresAt,
        });

        if (success) {
          toast({
            title: 'Credencial rotada',
            description: 'La credencial se ha actualizado correctamente',
          });
          loadData();
          return true;
        }
      } else if (dialogMode === 'duplicate' && selectedCredential) {
        const newCredential = await integrationsService.createCredential({
          connectionId,
          credentialType: data.credentialType,
          purpose: data.purpose,
          secretRef: data.secretRef,
          keyPrefix: data.keyPrefix,
          expiresAt: data.expiresAt,
        });

        if (newCredential) {
          toast({
            title: 'Credencial duplicada',
            description: 'La credencial se ha duplicado correctamente',
          });
          loadData();
          return true;
        }
      }

      toast({
        title: 'Error',
        description: 'No se pudo guardar la credencial',
        variant: 'destructive',
      });
      return false;
    } catch (error) {
      console.error('Error saving credential:', error);
      toast({
        title: 'Error',
        description: 'Ocurrió un error al guardar',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Revocar credencial
  const handleRevoke = async (credential: IntegrationCredential) => {
    const success = await integrationsService.revokeCredential(credential.id);

    if (success) {
      toast({
        title: 'Credencial revocada',
        description: 'La credencial ha sido desactivada',
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo revocar la credencial',
        variant: 'destructive',
      });
    }
  };

  // Reactivar credencial
  const handleReactivate = async (credential: IntegrationCredential) => {
    const success = await integrationsService.reactivateCredential(credential.id);

    if (success) {
      toast({
        title: 'Credencial reactivada',
        description: 'La credencial ha sido activada nuevamente',
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo reactivar la credencial',
        variant: 'destructive',
      });
    }
  };

  // Confirmar eliminación
  const handleDeleteClick = (credential: IntegrationCredential) => {
    setCredentialToDelete(credential);
    setDeleteDialogOpen(true);
  };

  // Eliminar credencial
  const handleDelete = async () => {
    if (!credentialToDelete) return;

    const success = await integrationsService.deleteCredential(credentialToDelete.id);

    if (success) {
      toast({
        title: 'Credencial eliminada',
        description: 'La credencial ha sido eliminada permanentemente',
      });
      loadData();
    } else {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la credencial',
        variant: 'destructive',
      });
    }

    setDeleteDialogOpen(false);
    setCredentialToDelete(null);
  };

  // Contadores
  const activeCount = credentials.filter((c) => c.status === 'active').length;

  // Loading state
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
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <CredentialsHeader
        connection={connection}
        credentialsCount={credentials.length}
        activeCount={activeCount}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onNewCredential={handleNewCredential}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <CredentialsList
            credentials={credentials}
            loading={loading}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onRevoke={handleRevoke}
            onReactivate={handleReactivate}
            onDelete={handleDeleteClick}
          />
        </div>
      </div>

      {/* Dialog de Crear/Editar/Duplicar */}
      <CredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        credential={selectedCredential}
        mode={dialogMode}
        onSave={handleSaveCredential}
      />

      {/* Dialog de Confirmación de Eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-gray-100">
              ¿Eliminar credencial?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La credencial será eliminada permanentemente
              del sistema. Si solo quieres desactivarla, usa la opción &quot;Revocar&quot;.
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
