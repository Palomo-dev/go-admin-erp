'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import ChatChannelsService, {
  ChatChannel,
  ChannelStats,
  AIMode,
  CreateChannelData
} from '@/lib/services/chatChannelsService';
import {
  ChannelsHeader,
  ChannelsList,
  CreateChannelDialog,
  WidgetCodeDialog,
  AvailableChannels
} from '@/components/chat/channels';
import { ChannelType } from '@/lib/services/chatChannelsService';

export default function CanalesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [preselectedType, setPreselectedType] = useState<ChannelType | null>(null);

  useEffect(() => {
    if (organizationId) {
      loadData();
    }
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new ChatChannelsService(organizationId);

      const [channelsData, statsData] = await Promise.all([
        service.getChannels(),
        service.getStats()
      ]);

      setChannels(channelsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando canales:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los canales',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async (data: CreateChannelData) => {
    if (!organizationId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const newChannel = await service.createChannel(data, user.id);

      setChannels(prev => [newChannel, ...prev]);
      
      if (stats) {
        setStats({
          ...stats,
          totalChannels: stats.totalChannels + 1,
          activeChannels: stats.activeChannels + 1
        });
      }

      toast({
        title: 'Canal creado',
        description: `El canal "${newChannel.name}" ha sido creado exitosamente`
      });

      if (data.type === 'website') {
        setSelectedChannel(newChannel);
        setShowWidgetDialog(true);
      }
    } catch (error) {
      console.error('Error creando canal:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el canal',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleToggleStatus = async (channel: ChatChannel) => {
    if (!organizationId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const updatedChannel = await service.toggleChannelStatus(channel.id, user.id);

      setChannels(prev => prev.map(c => 
        c.id === channel.id ? updatedChannel : c
      ));

      if (stats) {
        const delta = updatedChannel.status === 'active' ? 1 : -1;
        setStats({
          ...stats,
          activeChannels: stats.activeChannels + delta
        });
      }

      toast({
        title: updatedChannel.status === 'active' ? 'Canal activado' : 'Canal desactivado',
        description: `El canal "${channel.name}" ha sido ${updatedChannel.status === 'active' ? 'activado' : 'desactivado'}`
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado del canal',
        variant: 'destructive'
      });
    }
  };

  const handleChangeAIMode = async (channel: ChatChannel, mode: AIMode) => {
    if (!organizationId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const updatedChannel = await service.updateAIMode(channel.id, mode, user.id);

      setChannels(prev => prev.map(c => 
        c.id === channel.id ? updatedChannel : c
      ));

      const modeLabels: Record<AIMode, string> = {
        off: 'Desactivado',
        hybrid: 'Híbrido',
        auto: 'Automático'
      };

      toast({
        title: 'Modo IA actualizado',
        description: `El modo IA ahora es "${modeLabels[mode]}"`
      });
    } catch (error) {
      console.error('Error cambiando modo IA:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el modo IA',
        variant: 'destructive'
      });
    }
  };

  const handleConfigure = (channel: ChatChannel) => {
    switch (channel.type) {
      case 'website':
        router.push(`/app/chat/canales/sitio-web/${channel.id}`);
        break;
      case 'whatsapp':
        router.push(`/app/chat/canales/whatsapp/${channel.id}`);
        break;
      case 'instagram':
        router.push(`/app/chat/canales/instagram/${channel.id}`);
        break;
      case 'facebook':
        router.push(`/app/chat/canales/facebook/${channel.id}`);
        break;
      default:
        router.push(`/app/chat/canales/${channel.id}/settings`);
    }
  };

  const handleInstallWidget = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setShowWidgetDialog(true);
  };

  const handleConnect = (channel: ChatChannel) => {
    switch (channel.type) {
      case 'whatsapp':
        router.push(`/app/chat/canales/whatsapp/${channel.id}`);
        break;
      case 'instagram':
        router.push(`/app/chat/canales/instagram/${channel.id}`);
        break;
      case 'facebook':
        router.push(`/app/chat/canales/facebook/${channel.id}`);
        break;
      default:
        toast({
          title: 'Información',
          description: 'Este tipo de canal no requiere conexión adicional'
        });
    }
  };

  const handleConnectChannel = (type: ChannelType) => {
    const existingChannel = channels.find(ch => ch.type === type);
    
    if (existingChannel) {
      handleConfigure(existingChannel);
    } else {
      setPreselectedType(type);
      setShowCreateDialog(true);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ChannelsHeader
        stats={stats}
        loading={loading}
        onCreateChannel={() => setShowCreateDialog(true)}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Available Channels Cards */}
        <AvailableChannels
          connectedChannels={channels}
          onConnect={handleConnectChannel}
        />

        {/* Connected Channels List */}
        {channels.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-800">
            <div className="p-4 pb-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Mis Canales
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Canales configurados en tu organización
              </p>
            </div>
            <ChannelsList
              channels={channels}
              loading={loading}
              onToggleStatus={handleToggleStatus}
              onChangeAIMode={handleChangeAIMode}
              onConfigure={handleConfigure}
              onInstallWidget={handleInstallWidget}
              onConnect={handleConnect}
            />
          </div>
        )}
      </div>

      {/* Create Channel Dialog */}
      <CreateChannelDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setPreselectedType(null);
        }}
        onSubmit={handleCreateChannel}
        preselectedType={preselectedType}
      />

      {/* Widget Code Dialog */}
      <WidgetCodeDialog
        open={showWidgetDialog}
        onOpenChange={setShowWidgetDialog}
        channel={selectedChannel}
      />
    </div>
  );
}
