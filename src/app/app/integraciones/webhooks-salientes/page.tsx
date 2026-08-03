'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  integrationsService,
  WebhookEndpoint,
} from '@/lib/services/integrationsService';
import {
  WebhooksHeader,
  WebhooksList,
  WebhookDialog,
  WebhookFormData,
} from '@/components/integraciones/webhooks-salientes';
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

export default function WebhooksSalientesPage() {
  const { organization } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialogs
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<WebhookEndpoint | null>(null);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      const data = await integrationsService.getWebhookEndpoints(organization.id);
      setEndpoints(data);
    } catch (error) {
      console.error('Error loading webhook endpoints:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los webhooks',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleNewEndpoint = () => {
    setSelectedEndpoint(null);
    setWebhookDialogOpen(true);
  };

  const handleEdit = (endpoint: WebhookEndpoint) => {
    setSelectedEndpoint(endpoint);
    setWebhookDialogOpen(true);
  };

  const handleSaveWebhook = async (
    data: WebhookFormData
  ): Promise<{ success: boolean; secret?: string }> => {
    if (!organization?.id) return { success: false };

    if (selectedEndpoint) {
      // Editar
      const success = await integrationsService.updateWebhookEndpoint(selectedEndpoint.id, {
        name: data.name,
        target_url: data.targetUrl,
        events: data.events,
      });

      if (success) {
        toast({
          title: 'Webhook actualizado',
          description: 'Los cambios se han guardado correctamente',
        });
        loadData();
        return { success: true };
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo actualizar el webhook',
        });
        return { success: false };
      }
    } else {
      // Crear
      const result = await integrationsService.createWebhookEndpoint(organization.id, {
        name: data.name,
        target_url: data.targetUrl,
        events: data.events,
      });

      if (result) {
        toast({
          title: 'Webhook creado',
          description: 'Guarda el secret para validar las firmas',
        });
        loadData();
        return { success: true, secret: result.secret };
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo crear el webhook',
        });
        return { success: false };
      }
    }
  };

  const handleRegenerateSecret = async (): Promise<string | null> => {
    if (!selectedEndpoint) return null;

    const newSecret = await integrationsService.regenerateWebhookSecret(selectedEndpoint.id);

    if (newSecret) {
      toast({
        title: 'Secret regenerado',
        description: 'Guarda el nuevo secret de forma segura',
      });
      return newSecret;
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo regenerar el secret',
      });
      return null;
    }
  };

  const handleDuplicate = async (endpoint: WebhookEndpoint) => {
    if (!organization?.id) return;

    const result = await integrationsService.duplicateWebhookEndpoint(endpoint.id, organization.id);

    if (result) {
      toast({
        title: 'Webhook duplicado',
        description: 'Se ha creado una copia del webhook',
      });
      loadData();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo duplicar el webhook',
      });
    }
  };

  const handleToggleStatus = async (endpoint: WebhookEndpoint) => {
    const success = await integrationsService.toggleWebhookEndpointStatus(
      endpoint.id,
      !endpoint.is_active
    );

    if (success) {
      toast({
        title: endpoint.is_active ? 'Webhook desactivado' : 'Webhook activado',
        description: endpoint.is_active
          ? 'No se enviarán más notificaciones'
          : 'El webhook está activo nuevamente',
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

  const handleTest = async (endpoint: WebhookEndpoint) => {
    const result = await integrationsService.testWebhookEndpoint(endpoint.id);

    if (result.success) {
      toast({
        title: 'Test enviado',
        description: result.message,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Error en test',
        description: result.message,
      });
    }
  };

  const handleDelete = (endpoint: WebhookEndpoint) => {
    setSelectedEndpoint(endpoint);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedEndpoint) return;

    const success = await integrationsService.deleteWebhookEndpoint(selectedEndpoint.id);

    if (success) {
      toast({
        title: 'Webhook eliminado',
        description: 'El endpoint ha sido eliminado permanentemente',
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
    setSelectedEndpoint(null);
  };

  // Calcular estadísticas
  const activeCount = endpoints.filter((e) => e.is_active).length;

  // Skeleton de carga
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64" />
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

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <WebhooksHeader
        totalEndpoints={endpoints.length}
        activeCount={activeCount}
        onRefresh={handleRefresh}
        onNewEndpoint={handleNewEndpoint}
        refreshing={refreshing}
      />

      {/* Lista de webhooks */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <WebhooksList
            endpoints={endpoints}
            loading={refreshing}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
            onTest={handleTest}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Dialog de crear/editar webhook */}
      <WebhookDialog
        open={webhookDialogOpen}
        onOpenChange={setWebhookDialogOpen}
        endpoint={selectedEndpoint}
        onSave={handleSaveWebhook}
        onRegenerateSecret={selectedEndpoint ? handleRegenerateSecret : undefined}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar Webhook?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción eliminará permanentemente el endpoint. Los sistemas externos
              dejarán de recibir notificaciones.
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
