'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
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
import InboxConfigService, { type ChannelApiKey, type Channel } from '@/lib/services/inboxConfigService';
import { ApiKeysHeader, ApiKeyCard, ApiKeyDialog } from '@/components/chat/configuracion/llaves-api';
import { ConfigNavTabs } from '@/components/chat/configuracion/ConfigNavTabs';

export default function LlavesApiPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ChannelApiKey[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ChannelApiKey | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const [keysData, channelsData] = await Promise.all([
        service.getApiKeys(),
        service.getChannels()
      ]);
      setApiKeys(keysData);
      setChannels(channelsData);
    } catch (error) {
      console.error('Error cargando API keys:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las llaves de API',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeKeys = apiKeys.filter(k => k.is_active && !k.revoked_at).length;

  const handleCreate = () => {
    setDialogOpen(true);
  };

  const handleRevoke = (key: ChannelApiKey) => {
    setSelectedKey(key);
    setRevokeDialogOpen(true);
  };

  const handleRotate = (key: ChannelApiKey) => {
    setSelectedKey(key);
    setRotateDialogOpen(true);
  };

  const handleSave = async (data: { name: string; channel_id?: string; scopes: string[]; expires_at?: string }) => {
    if (!organizationId) return;

    const service = new InboxConfigService(organizationId);

    try {
      const result = await service.createApiKey(data);
      toast({
        title: 'Llave creada',
        description: 'La llave de API se creó correctamente'
      });
      loadData();
      return { rawKey: result.rawKey };
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear la llave de API',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const confirmRevoke = async () => {
    if (!organizationId || !selectedKey) return;

    const service = new InboxConfigService(organizationId);

    try {
      await service.revokeApiKey(selectedKey.id);
      toast({
        title: 'Llave revocada',
        description: 'La llave de API fue revocada y ya no puede usarse'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo revocar la llave de API',
        variant: 'destructive'
      });
    } finally {
      setRevokeDialogOpen(false);
      setSelectedKey(null);
    }
  };

  const confirmRotate = async () => {
    if (!organizationId || !selectedKey) return;

    const service = new InboxConfigService(organizationId);

    try {
      const result = await service.rotateApiKey(selectedKey.id);
      toast({
        title: 'Llave rotada',
        description: 'Se generó una nueva llave. La anterior fue revocada.'
      });
      loadData();
      setRotateDialogOpen(false);
      setSelectedKey(null);
      setDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo rotar la llave de API',
        variant: 'destructive'
      });
      setRotateDialogOpen(false);
      setSelectedKey(null);
    }
  };

  if (loading && apiKeys.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando llaves de API...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="p-4 sm:p-6 pb-0">
        <ConfigNavTabs />
      </div>
      <ApiKeysHeader
        totalKeys={apiKeys.length}
        activeKeys={activeKeys}
        loading={loading}
        onRefresh={loadData}
        onCreate={handleCreate}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <span className="text-2xl">🔑</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No hay llaves de API configuradas
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Crea llaves de API para integrar el chat con tu aplicación o servicios externos
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <ApiKeyCard
                  key={key.id}
                  apiKey={key}
                  onRevoke={handleRevoke}
                  onRotate={handleRotate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channels={channels}
        onSave={handleSave}
      />

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar llave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción revocará la llave "{selectedKey?.name}" de forma permanente. Cualquier integración que use esta llave dejará de funcionar inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Revocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rotar llave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción creará una nueva llave con los mismos permisos y revocará la llave actual "{selectedKey?.name}". Deberás actualizar todas las integraciones con la nueva llave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRotate}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Rotar Llave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
