'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';

import WhatsAppChannelService, { 
  WhatsAppChannel, 
  WhatsAppCredentials, 
  MessageEvent, 
  WhatsAppStats 
} from '@/lib/services/whatsappChannelService';
import {
  WhatsAppSettingsHeader,
  WhatsAppConnectionTabs,
  WhatsAppStatsCard,
  WhatsAppEventsCard,
  WhatsAppWebhookCard
} from '@/components/chat/channels/whatsapp/id';
import { DetailSkeleton } from '@/components/common/PageSkeletons';

export default function WhatsAppChannelPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params?.id as string;
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
  const [events, setEvents] = useState<MessageEvent[]>([]);
  const [stats, setStats] = useState<WhatsAppStats>({
    totalMessages: 0,
    sentToday: 0,
    deliveredRate: 0,
    failedCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    setLoadError(null);
    try {
      const service = new WhatsAppChannelService(organization.id);

      const channelData = await service.getChannel(channelId);

      if (!channelData) {
        setChannel(null);
        setLoadError('no_access');
        return;
      }

      setChannel(channelData);

      const [eventsData, statsData] = await Promise.all([
        service.getRecentEvents(channelId),
        service.getStats(channelId)
      ]);

      setEvents(eventsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setLoadError('error');
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del canal',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, channelId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveCredentials = async (credentials: WhatsAppCredentials['credentials']) => {
    if (!organization?.id) return;

    setIsSaving(true);
    try {
      const service = new WhatsAppChannelService(organization.id);
      const success = await service.saveCredentials(channelId, credentials);

      if (success) {
        toast({
          title: 'Credenciales guardadas',
          description: 'Las credenciales se guardaron correctamente'
        });
        await loadData();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las credenciales',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateWebhook = async () => {
    if (!organization?.id) return;

    setIsValidating(true);
    try {
      const service = new WhatsAppChannelService(organization.id);
      const result = await service.validateWebhook(channelId);

      toast({
        title: result.valid ? 'Conexión válida' : 'Error de validación',
        description: result.message,
        variant: result.valid ? 'default' : 'destructive'
      });

      if (result.valid) {
        await loadData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo validar la conexión',
        variant: 'destructive'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!organization?.id || !channel) return;

    try {
      const service = new WhatsAppChannelService(organization.id);
      
      if (channel.status === 'active') {
        await service.updateChannel(channelId, { status: 'inactive' });
        toast({
          title: 'Canal desactivado',
          description: 'El canal ha sido desactivado'
        });
      } else {
        await service.activateChannel(channelId);
        toast({
          title: 'Canal activado',
          description: 'El canal ha sido activado correctamente'
        });
      }
      
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el estado del canal',
        variant: 'destructive'
      });
    }
  };

  if (isLoading) {
    return (
  <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
    <DetailSkeleton />
  </div>
);
  }

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-gray-500 dark:text-gray-400 space-y-4 px-4">
        {loadError === 'no_access' ? (
          <>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">
                Canal no disponible
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Este canal de WhatsApp no pertenece a tu organización actual
                ({organization?.name || 'N/A'}), no existe, o ha sido eliminado.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/app/chat/canales')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Ver mis canales
              </button>
              <button
                onClick={() => loadData()}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg">Canal no encontrado</p>
            <button
              onClick={() => loadData()}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Reintentar
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <WhatsAppSettingsHeader
        channel={channel}
        onRefresh={loadData}
        onToggleStatus={handleToggleStatus}
        isLoading={isLoading}
      />

      <WhatsAppStatsCard stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WhatsAppConnectionTabs
          credentials={channel.credentials || null}
          onSave={handleSaveCredentials}
          onValidate={handleValidateWebhook}
          isSaving={isSaving}
          isValidating={isValidating}
          organizationId={organization?.id}
          channelId={channelId}
          onEmbeddedSignupComplete={loadData}
        />
        <WhatsAppWebhookCard
          channelId={channelId}
          credentials={channel.credentials || null}
        />
      </div>

      <WhatsAppEventsCard events={events} />
    </div>
  );
}
