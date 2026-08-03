'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  ChannelApiKey,
} from '@/lib/services/integrationsService';
import {
  ApiKeysHeader,
  ApiKeysList,
  ApiKeyDialog,
  ApiKeyFormData,
} from '@/components/integraciones/api-keys';
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

export default function ApiKeysPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [apiKeys, setApiKeys] = useState<ChannelApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  // Dialogs
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ChannelApiKey | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const keys = await integrationsService.getApiKeys(organization.id, {
        showRevoked,
      });
      setApiKeys(keys);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar las API keys',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, showRevoked, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleNewKey = () => {
    setSelectedKey(null);
    setKeyDialogOpen(true);
  };

  const handleEdit = (key: ChannelApiKey) => {
    setSelectedKey(key);
    setKeyDialogOpen(true);
  };

  const handleSaveKey = async (
    data: ApiKeyFormData
  ): Promise<{ success: boolean; fullKey?: string }> => {
    if (!organization?.id) return { success: false };

    if (selectedKey) {
      // Editar
      const success = await integrationsService.updateApiKey(selectedKey.id, {
        name: data.name,
        scopes: data.scopes,
        expires_at: data.expiresAt || null,
      });

      if (success) {
        toast({
          title: 'API Key actualizada',
          description: 'Los cambios se han guardado correctamente',
        });
        loadData();
        return { success: true };
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo actualizar la API key',
        });
        return { success: false };
      }
    } else {
      // Crear
      const result = await integrationsService.createApiKey(organization.id, {
        name: data.name,
        scopes: data.scopes,
        expires_at: data.expiresAt || undefined,
      });

      if (result) {
        toast({
          title: 'API Key creada',
          description: 'Guarda la clave en un lugar seguro',
        });
        loadData();
        return { success: true, fullKey: result.fullKey };
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo crear la API key',
        });
        return { success: false };
      }
    }
  };

  const handleDuplicate = async (key: ChannelApiKey) => {
    if (!organization?.id) return;

    const result = await integrationsService.duplicateApiKey(key.id, organization.id);

    if (result) {
      toast({
        title: 'API Key duplicada',
        description: 'Se ha creado una copia. La nueva clave es: ' + result.fullKey.substring(0, 15) + '...',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo duplicar la API key',
      });
    }
  };

  const handleToggleStatus = async (key: ChannelApiKey) => {
    const success = await integrationsService.toggleApiKeyStatus(key.id, !key.is_active);

    if (success) {
      toast({
        title: key.is_active ? 'API Key desactivada' : 'API Key activada',
        description: key.is_active
          ? 'La clave ya no puede ser utilizada'
          : 'La clave está activa nuevamente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cambiar el estado de la API key',
      });
    }
  };

  const handleRevoke = (key: ChannelApiKey) => {
    setSelectedKey(key);
    setRevokeDialogOpen(true);
  };

  const confirmRevoke = async () => {
    if (!selectedKey) return;

    const success = await integrationsService.revokeApiKey(selectedKey.id);

    if (success) {
      toast({
        title: 'API Key revocada',
        description: 'La clave ha sido revocada permanentemente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo revocar la API key',
      });
    }

    setRevokeDialogOpen(false);
    setSelectedKey(null);
  };

  const handleDelete = (key: ChannelApiKey) => {
    setSelectedKey(key);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedKey) return;

    const success = await integrationsService.deleteApiKey(selectedKey.id);

    if (success) {
      toast({
        title: 'API Key eliminada',
        description: 'La clave ha sido eliminada permanentemente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar la API key',
      });
    }

    setDeleteDialogOpen(false);
    setSelectedKey(null);
  };

  // Calcular estadísticas
  const activeCount = apiKeys.filter((k) => k.is_active && !k.revoked_at).length;
  const revokedCount = apiKeys.filter((k) => k.revoked_at).length;

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <ApiKeysHeader
        totalKeys={apiKeys.length}
        activeCount={activeCount}
        revokedCount={revokedCount}
        showRevoked={showRevoked}
        onShowRevokedChange={setShowRevoked}
        onRefresh={handleRefresh}
        onNewKey={handleNewKey}
        refreshing={refreshing}
      />

      {/* Lista de API keys */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <ApiKeysList
            apiKeys={apiKeys}
            loading={refreshing}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
            onRevoke={handleRevoke}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Dialog de crear/editar API key */}
      <ApiKeyDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        apiKey={selectedKey}
        onSave={handleSaveKey}
      />

      {/* Dialog de confirmación de revocación */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Revocar API Key?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              <span className="text-orange-500 font-medium">⚠️ Esta acción es irreversible.</span>{' '}
              La API key será revocada permanentemente y no podrá ser utilizada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Revocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar API Key?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción eliminará permanentemente la API key. No podrás recuperarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-700 dark:text-gray-300">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
