'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import InstagramChannelService, { 
  InstagramChannel, 
  InstagramCredentials, 
  MessageEvent, 
  InstagramStats 
} from '@/lib/services/instagramChannelService';
import {
  InstagramSettingsHeader,
  InstagramCredentialsCard,
  InstagramStatsCard,
  InstagramEventsCard,
  InstagramWebhookCard
} from '@/components/chat/channels/instagram/id';

export default function InstagramChannelPage() {
  const params = useParams();
  const channelId = params.id as string;
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [channel, setChannel] = useState<InstagramChannel | null>(null);
  const [events, setEvents] = useState<MessageEvent[]>([]);
  const [stats, setStats] = useState<InstagramStats>({
    totalMessages: 0,
    sentToday: 0,
    deliveredRate: 0,
    failedCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const service = new InstagramChannelService(organization.id);
      
      const [channelData, eventsData, statsData] = await Promise.all([
        service.getChannel(channelId),
        service.getRecentEvents(channelId),
        service.getStats(channelId)
      ]);

      if (channelData) {
        setChannel(channelData);
      }
      setEvents(eventsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
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

  const handleSaveCredentials = async (credentials: InstagramCredentials['credentials']) => {
    if (!organization?.id) return;

    setIsSaving(true);
    try {
      const service = new InstagramChannelService(organization.id);
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
      const service = new InstagramChannelService(organization.id);
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
      const service = new InstagramChannelService(organization.id);
      
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
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-gray-500 dark:text-gray-400">
        <p className="text-lg">Canal no encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <InstagramSettingsHeader
        channel={channel}
        onRefresh={loadData}
        onToggleStatus={handleToggleStatus}
        isLoading={isLoading}
      />

      <InstagramStatsCard stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InstagramCredentialsCard
          credentials={channel.credentials || null}
          onSave={handleSaveCredentials}
          onValidate={handleValidateWebhook}
          isSaving={isSaving}
          isValidating={isValidating}
        />
        <InstagramWebhookCard
          channelId={channelId}
          credentials={channel.credentials || null}
        />
      </div>

      <InstagramEventsCard events={events} />
    </div>
  );
}
