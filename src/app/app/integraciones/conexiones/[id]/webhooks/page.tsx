'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  IntegrationConnection,
  IntegrationWebhook,
} from '@/lib/services/integrationsService';
import {
  WebhooksHeader,
  WebhooksList,
  WebhookDialog,
  WebhookFormData,
} from '@/components/integraciones/conexiones/id/webhooks';
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

export default function WebhooksPage() {
  const params = useParams();
  const connectionId = params.id as string;
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [connection, setConnection] = useState<IntegrationConnection | null>(null);
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados del dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'duplicate'>('create');
  const [selectedWebhook, setSelectedWebhook] = useState<IntegrationWebhook | null>(null);

  // Estados de confirmación
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<IntegrationWebhook | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!connectionId || !organization?.id) return;

    try {
      const [connectionData, webhooksData] = await Promise.all([
        integrationsService.getConnectionById(connectionId),
        integrationsService.getWebhooks(connectionId),
      ]);

      setConnection(connectionData);
      setWebhooks(webhooksData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los datos',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connectionId, organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleNewWebhook = () => {
    setSelectedWebhook(null);
    setDialogMode('create');
    setDialogOpen(true);
  };

  const handleEditWebhook = (webhook: IntegrationWebhook) => {
    setSelectedWebhook(webhook);
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const handleDuplicateWebhook = (webhook: IntegrationWebhook) => {
    setSelectedWebhook(webhook);
    setDialogMode('duplicate');
    setDialogOpen(true);
  };

  const handleToggleStatus = async (webhook: IntegrationWebhook) => {
    const newStatus = !webhook.is_active;
    const success = await integrationsService.toggleWebhookStatus(webhook.id, newStatus);

    if (success) {
      toast({
        title: newStatus ? 'Webhook activado' : 'Webhook desactivado',
        description: `El webhook ha sido ${newStatus ? 'activado' : 'desactivado'} correctamente`,
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cambiar el estado del webhook',
      });
    }
  };

  const handleTestWebhook = async (webhook: IntegrationWebhook) => {
    const result = await integrationsService.testWebhook(webhook.id);

    if (result.success) {
      toast({
        title: 'Prueba enviada',
        description: result.message,
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error en prueba',
        description: result.message,
      });
    }
  };

  const handleDeleteWebhook = (webhook: IntegrationWebhook) => {
    setWebhookToDelete(webhook);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!webhookToDelete) return;

    const success = await integrationsService.deleteWebhook(webhookToDelete.id);

    if (success) {
      toast({
        title: 'Webhook eliminado',
        description: 'El webhook ha sido eliminado correctamente',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el webhook',
      });
    }

    setDeleteDialogOpen(false);
    setWebhookToDelete(null);
  };

  const handleSaveWebhook = async (data: WebhookFormData): Promise<boolean> => {
    try {
      if (dialogMode === 'create' || dialogMode === 'duplicate') {
        const result = await integrationsService.createWebhook(connectionId, {
          direction: data.direction,
          url: data.url,
          events: data.events,
          secret_ref: data.secret_ref || undefined,
          signing_method: data.signing_method,
        });

        if (result) {
          toast({
            title: dialogMode === 'create' ? 'Webhook creado' : 'Webhook duplicado',
            description: 'El webhook ha sido guardado correctamente',
          });
          loadData();
          return true;
        }
      } else if (dialogMode === 'edit' && selectedWebhook) {
        const success = await integrationsService.updateWebhook(selectedWebhook.id, {
          url: data.url,
          events: data.events,
          secret_ref: data.secret_ref || undefined,
          signing_method: data.signing_method,
        });

        if (success) {
          toast({
            title: 'Webhook actualizado',
            description: 'Los cambios han sido guardados correctamente',
          });
          loadData();
          return true;
        }
      }

      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el webhook',
      });
      return false;
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al guardar el webhook',
      });
      return false;
    }
  };

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeCount = webhooks.filter((w) => w.is_active).length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <WebhooksHeader
        connection={connection}
        webhooksCount={webhooks.length}
        activeCount={activeCount}
        onRefresh={handleRefresh}
        onNewWebhook={handleNewWebhook}
        refreshing={refreshing}
      />

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <WebhooksList
            webhooks={webhooks}
            loading={refreshing}
            onEdit={handleEditWebhook}
            onDuplicate={handleDuplicateWebhook}
            onToggleStatus={handleToggleStatus}
            onTest={handleTestWebhook}
            onDelete={handleDeleteWebhook}
          />
        </div>
      </div>

      {/* Dialog de crear/editar */}
      <WebhookDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        webhook={selectedWebhook}
        mode={dialogMode}
        onSave={handleSaveWebhook}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar webhook?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. El webhook será eliminado permanentemente
              y dejará de recibir eventos.
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
