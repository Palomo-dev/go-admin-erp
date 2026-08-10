'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Loader2, MessageSquare, Tags, Key, Globe } from 'lucide-react';
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
import ChatChannelsService, {
  ChatChannel,
  ChannelStats,
  AIMode,
  CreateChannelData,
  ChannelType,
} from '@/lib/services/chatChannelsService';
import {
  ChannelsList,
  CreateChannelDialog,
  WidgetCodeDialog,
  AvailableChannels,
  ChannelDetailDrawer,
} from '@/components/chat/channels';
import InboxConfigService, {
  type ConversationTag,
  type ChannelApiKey,
  type Channel,
} from '@/lib/services/inboxConfigService';
import { TagsHeader, TagCard, TagDialog } from '@/components/chat/configuracion/etiquetas';
import { ApiKeysHeader, ApiKeyCard, ApiKeyDialog } from '@/components/chat/configuracion/llaves-api';

export function CRMConfigPanel() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // === Canales state ===
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [preselectedType, setPreselectedType] = useState<ChannelType | null>(null);
  const [drawerChannelId, setDrawerChannelId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // === Etiquetas state ===
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);
  const [deleteTagDialogOpen, setDeleteTagDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<ConversationTag | null>(null);

  // === Llaves API state ===
  const [keysLoading, setKeysLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ChannelApiKey[]>([]);
  const [apiChannels, setApiChannels] = useState<Channel[]>([]);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ChannelApiKey | null>(null);

  // === Load Canales ===
  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    setChannelsLoading(true);
    try {
      const service = new ChatChannelsService(organizationId);
      const [channelsData, statsData] = await Promise.all([
        service.getChannels(),
        service.getStats(),
      ]);
      setChannels(channelsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando canales:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los canales', variant: 'destructive' });
    } finally {
      setChannelsLoading(false);
    }
  }, [organizationId, toast]);

  // === Load Etiquetas ===
  const loadTags = useCallback(async () => {
    if (!organizationId) return;
    setTagsLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const data = await service.getTags();
      setTags(data);
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las etiquetas', variant: 'destructive' });
    } finally {
      setTagsLoading(false);
    }
  }, [organizationId, toast]);

  // === Load API Keys ===
  const loadApiKeys = useCallback(async () => {
    if (!organizationId) return;
    setKeysLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const [keysData, channelsData] = await Promise.all([service.getApiKeys(), service.getChannels()]);
      setApiKeys(keysData);
      setApiChannels(channelsData);
    } catch (error) {
      console.error('Error cargando API keys:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las llaves de API', variant: 'destructive' });
    } finally {
      setKeysLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (organizationId) {
      loadChannels();
      loadTags();
      loadApiKeys();
    }
  }, [organizationId, loadChannels, loadTags, loadApiKeys]);

  // === Canales handlers ===
  const handleCreateChannel = async (data: CreateChannelData) => {
    if (!organizationId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const newChannel = await service.createChannel(data, user.id);

      setChannels((prev) => [newChannel, ...prev]);

      if (stats) {
        setStats({
          ...stats,
          totalChannels: stats.totalChannels + 1,
          activeChannels: stats.activeChannels + 1,
        });
      }

      toast({
        title: 'Canal creado',
        description: `El canal "${newChannel.name}" ha sido creado exitosamente`,
      });

      if (data.type === 'website') {
        setSelectedChannel(newChannel);
        setShowWidgetDialog(true);
      }
    } catch (error) {
      console.error('Error creando canal:', error);
      toast({ title: 'Error', description: 'No se pudo crear el canal', variant: 'destructive' });
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

      setChannels((prev) => prev.map((c) => (c.id === channel.id ? updatedChannel : c)));

      if (stats) {
        const delta = updatedChannel.status === 'active' ? 1 : -1;
        setStats({ ...stats, activeChannels: stats.activeChannels + delta });
      }

      toast({
        title: updatedChannel.status === 'active' ? 'Canal activado' : 'Canal desactivado',
        description: `El canal "${channel.name}" ha sido ${updatedChannel.status === 'active' ? 'activado' : 'desactivado'}`,
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el estado del canal', variant: 'destructive' });
    }
  };

  const handleChangeAIMode = async (channel: ChatChannel, mode: AIMode) => {
    if (!organizationId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const updatedChannel = await service.updateAIMode(channel.id, mode, user.id);

      setChannels((prev) => prev.map((c) => (c.id === channel.id ? updatedChannel : c)));

      const modeLabels: Record<AIMode, string> = { off: 'Desactivado', hybrid: 'Híbrido', auto: 'Automático' };
      toast({ title: 'Modo IA actualizado', description: `El modo IA ahora es "${modeLabels[mode]}"` });
    } catch (error) {
      console.error('Error cambiando modo IA:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el modo IA', variant: 'destructive' });
    }
  };

  const handleConfigure = (channel: ChatChannel) => {
    if (channel.type === 'website') {
      setDrawerChannelId(channel.id);
      setDrawerOpen(true);
    } else {
      toast({
        title: 'Información',
        description: 'La configuración de este tipo de canal se gestiona desde Chat',
      });
    }
  };

  const handleInstallWidget = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setShowWidgetDialog(true);
  };

  const handleConnect = (channel: ChatChannel) => {
    void channel;
    toast({
      title: 'Información',
      description: 'La conexión de canales externos se gestiona desde Chat',
    });
  };

  const handleConnectChannel = (type: ChannelType) => {
    const existingChannel = channels.find((ch) => ch.type === type);
    if (existingChannel) {
      handleConfigure(existingChannel);
    } else {
      setPreselectedType(type);
      setShowCreateDialog(true);
    }
  };

  // === Etiquetas handlers ===
  const handleCreateTag = () => { setSelectedTag(null); setTagDialogOpen(true); };
  const handleEditTag = (tag: ConversationTag) => { setSelectedTag(tag); setTagDialogOpen(true); };
  const handleDeleteTag = (tag: ConversationTag) => { setTagToDelete(tag); setDeleteTagDialogOpen(true); };

  const handleSaveTag = async (data: { name: string; color: string; description?: string }) => {
    if (!organizationId) return;
    const service = new InboxConfigService(organizationId);
    try {
      if (selectedTag) {
        await service.updateTag(selectedTag.id, data);
        toast({ title: 'Etiqueta actualizada', description: 'Los cambios se guardaron correctamente' });
      } else {
        await service.createTag(data);
        toast({ title: 'Etiqueta creada', description: 'La etiqueta se creó correctamente' });
      }
      loadTags();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar la etiqueta', variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteTag = async () => {
    if (!organizationId || !tagToDelete) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.deleteTag(tagToDelete.id);
      toast({ title: 'Etiqueta eliminada', description: 'La etiqueta se eliminó correctamente' });
      loadTags();
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar la etiqueta', variant: 'destructive' });
    } finally {
      setDeleteTagDialogOpen(false);
      setTagToDelete(null);
    }
  };

  // === API Keys handlers ===
  const activeKeys = apiKeys.filter((k) => k.is_active && !k.revoked_at).length;

  const handleRevokeKey = (key: ChannelApiKey) => { setSelectedKey(key); setRevokeDialogOpen(true); };
  const handleRotateKey = (key: ChannelApiKey) => { setSelectedKey(key); setRotateDialogOpen(true); };

  const handleSaveKey = async (data: { name: string; channel_id?: string; scopes: string[]; expires_at?: string }) => {
    if (!organizationId) return;
    const service = new InboxConfigService(organizationId);
    try {
      const result = await service.createApiKey(data);
      toast({ title: 'Llave creada', description: 'La llave de API se creó correctamente' });
      loadApiKeys();
      return { rawKey: result.rawKey };
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear la llave de API', variant: 'destructive' });
      throw error;
    }
  };

  const confirmRevokeKey = async () => {
    if (!organizationId || !selectedKey) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.revokeApiKey(selectedKey.id);
      toast({ title: 'Llave revocada', description: 'La llave de API fue revocada' });
      loadApiKeys();
    } catch {
      toast({ title: 'Error', description: 'No se pudo revocar la llave', variant: 'destructive' });
    } finally {
      setRevokeDialogOpen(false);
      setSelectedKey(null);
    }
  };

  const confirmRotateKey = async () => {
    if (!organizationId || !selectedKey) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.rotateApiKey(selectedKey.id);
      toast({ title: 'Llave rotada', description: 'Se generó una nueva llave.' });
      loadApiKeys();
      setRotateDialogOpen(false);
      setSelectedKey(null);
      setKeyDialogOpen(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo rotar la llave', variant: 'destructive' });
      setRotateDialogOpen(false);
      setSelectedKey(null);
    }
  };

  // === Widget section ===
  const websiteChannel = channels.find((ch) => ch.type === 'website' && ch.status === 'active');

  const handleConfigureWidget = () => {
    if (websiteChannel) {
      setDrawerChannelId(websiteChannel.id);
      setDrawerOpen(true);
    } else {
      toast({
        title: 'Sin canal web',
        description: 'Crea y activa un canal de tipo Sitio Web primero',
      });
    }
  };

  const isLoading = channelsLoading && tagsLoading && keysLoading;

  if (isLoading && channels.length === 0 && tags.length === 0 && apiKeys.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* === Canales === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Canales</h3>
        </div>

        <AvailableChannels
          connectedChannels={channels}
          onConnect={handleConnectChannel}
        />

        {channels.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-800">
            <div className="p-4 pb-0">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Mis Canales
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Canales configurados en tu organización
              </p>
            </div>
            <ChannelsList
              channels={channels}
              loading={channelsLoading}
              onToggleStatus={handleToggleStatus}
              onChangeAIMode={handleChangeAIMode}
              onConfigure={handleConfigure}
              onInstallWidget={handleInstallWidget}
              onConnect={handleConnect}
            />
          </div>
        )}
      </div>

      {/* === Etiquetas === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Etiquetas</h3>
        </div>
        <TagsHeader totalTags={tags.length} loading={tagsLoading} onRefresh={loadTags} onCreateTag={handleCreateTag} />

        {tags.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">🏷️</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay etiquetas configuradas</h3>
            <p className="text-gray-500 dark:text-gray-400">Crea etiquetas para organizar y clasificar tus conversaciones</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((tag) => (
              <TagCard key={tag.id} tag={tag} onEdit={handleEditTag} onDelete={handleDeleteTag} />
            ))}
          </div>
        )}
      </div>

      {/* === Llaves API === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Llaves API</h3>
        </div>
        <ApiKeysHeader
          totalKeys={apiKeys.length}
          activeKeys={activeKeys}
          loading={keysLoading}
          onRefresh={loadApiKeys}
          onCreate={() => setKeyDialogOpen(true)}
        />

        {apiKeys.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">🔑</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay llaves de API configuradas</h3>
            <p className="text-gray-500 dark:text-gray-400">Crea llaves de API para integrar el CRM con servicios externos</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <ApiKeyCard key={key.id} apiKey={key} onRevoke={handleRevokeKey} onRotate={handleRotateKey} />
            ))}
          </div>
        )}
      </div>

      {/* === Widget Web === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Widget Web</h3>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {websiteChannel ? 'Widget activo' : 'Sin widget configurado'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {websiteChannel
                  ? `Canal: ${websiteChannel.name}`
                  : 'Crea un canal de tipo Sitio Web para configurar el widget'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleConfigureWidget}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Configurar Widget
            </button>
          </div>
        </div>
      </div>

      {/* === Dialogs === */}
      <CreateChannelDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setPreselectedType(null);
        }}
        onSubmit={handleCreateChannel}
        preselectedType={preselectedType}
      />

      <WidgetCodeDialog
        open={showWidgetDialog}
        onOpenChange={setShowWidgetDialog}
        channel={selectedChannel}
      />

      <ChannelDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        channelId={drawerChannelId}
      />

      <TagDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} tag={selectedTag} onSave={handleSaveTag} />
      <ApiKeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} channels={apiChannels} onSave={handleSaveKey} />

      {/* Delete tag dialog */}
      <AlertDialog open={deleteTagDialogOpen} onOpenChange={setDeleteTagDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la etiqueta &quot;{tagToDelete?.name}&quot; y la removerá de todas las conversaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTag} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke key dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar llave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción revocará la llave &quot;{selectedKey?.name}&quot; de forma permanente. Cualquier integración que use esta llave dejará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevokeKey} className="bg-red-600 hover:bg-red-700 text-white">Revocar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate key dialog */}
      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rotar llave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción creará una nueva llave con los mismos permisos y revocará la actual &quot;{selectedKey?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRotateKey} className="bg-blue-600 hover:bg-blue-700 text-white">Rotar Llave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
