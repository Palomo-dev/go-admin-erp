'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2, Tags, MessageSquareText, Key } from 'lucide-react';
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
import InboxConfigService, { type ConversationTag, type ChannelApiKey, type Channel, type QuickReply } from '@/lib/services/inboxConfigService';
import { TagsHeader, TagCard, TagDialog } from '@/components/chat/configuracion/etiquetas';
import { ApiKeysHeader, ApiKeyCard, ApiKeyDialog } from '@/components/chat/configuracion/llaves-api';
import { QuickRepliesHeader, QuickReplyCard, QuickReplyDialog } from '@/components/chat/configuracion/respuestas-rapidas';

export function ChatConfigPanel() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Etiquetas state
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);
  const [deleteTagDialogOpen, setDeleteTagDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<ConversationTag | null>(null);

  // Llaves API state
  const [keysLoading, setKeysLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ChannelApiKey[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ChannelApiKey | null>(null);

  // Respuestas rápidas state
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [selectedReply, setSelectedReply] = useState<QuickReply | null>(null);
  const [deleteReplyDialogOpen, setDeleteReplyDialogOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<QuickReply | null>(null);

  // Load etiquetas
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

  // Load llaves API
  const loadApiKeys = useCallback(async () => {
    if (!organizationId) return;
    setKeysLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const [keysData, channelsData] = await Promise.all([service.getApiKeys(), service.getChannels()]);
      setApiKeys(keysData);
      setChannels(channelsData);
    } catch (error) {
      console.error('Error cargando API keys:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las llaves de API', variant: 'destructive' });
    } finally {
      setKeysLoading(false);
    }
  }, [organizationId, toast]);

  // Load respuestas rápidas
  const loadReplies = useCallback(async () => {
    if (!organizationId) return;
    setRepliesLoading(true);
    try {
      const service = new InboxConfigService(organizationId);
      const data = await service.getQuickReplies();
      setReplies(data);
    } catch (error) {
      console.error('Error cargando respuestas rápidas:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las respuestas rápidas', variant: 'destructive' });
    } finally {
      setRepliesLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (organizationId) {
      loadTags();
      loadApiKeys();
      loadReplies();
    }
  }, [organizationId, loadTags, loadApiKeys, loadReplies]);

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

  // === Llaves API handlers ===
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
      toast({ title: 'Llave revocada', description: 'La llave de API fue revocada y ya no puede usarse' });
      loadApiKeys();
    } catch {
      toast({ title: 'Error', description: 'No se pudo revocar la llave de API', variant: 'destructive' });
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
      toast({ title: 'Llave rotada', description: 'Se generó una nueva llave. La anterior fue revocada.' });
      loadApiKeys();
      setRotateDialogOpen(false);
      setSelectedKey(null);
      setKeyDialogOpen(true);
    } catch {
      toast({ title: 'Error', description: 'No se pudo rotar la llave de API', variant: 'destructive' });
      setRotateDialogOpen(false);
      setSelectedKey(null);
    }
  };

  // === Respuestas rápidas handlers ===
  const filteredReplies = replies.filter(
    (reply) =>
      reply.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reply.shortcut?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reply.tags?.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const handleCreateReply = () => { setSelectedReply(null); setReplyDialogOpen(true); };
  const handleEditReply = (reply: QuickReply) => { setSelectedReply(reply); setReplyDialogOpen(true); };
  const handleDeleteReply = (reply: QuickReply) => { setReplyToDelete(reply); setDeleteReplyDialogOpen(true); };

  const handleSaveReply = async (data: { title: string; content: string; shortcut?: string; tags?: string[]; is_active?: boolean }) => {
    if (!organizationId) return;
    const service = new InboxConfigService(organizationId);
    try {
      if (selectedReply) {
        await service.updateQuickReply(selectedReply.id, data);
        toast({ title: 'Respuesta actualizada', description: 'Los cambios se guardaron correctamente' });
      } else {
        await service.createQuickReply(data);
        toast({ title: 'Respuesta creada', description: 'La respuesta rápida se creó correctamente' });
      }
      loadReplies();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar la respuesta rápida', variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteReply = async () => {
    if (!organizationId || !replyToDelete) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.deleteQuickReply(replyToDelete.id);
      toast({ title: 'Respuesta eliminada', description: 'La respuesta rápida se eliminó correctamente' });
      loadReplies();
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar la respuesta rápida', variant: 'destructive' });
    } finally {
      setDeleteReplyDialogOpen(false);
      setReplyToDelete(null);
    }
  };

  const isLoading = tagsLoading && keysLoading && repliesLoading;

  if (isLoading && tags.length === 0 && apiKeys.length === 0 && replies.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Etiquetas */}
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

      {/* Respuestas Rápidas */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Respuestas Rápidas</h3>
        </div>
        <QuickRepliesHeader
          totalReplies={replies.length}
          searchTerm={searchTerm}
          loading={repliesLoading}
          onSearchChange={setSearchTerm}
          onRefresh={loadReplies}
          onCreate={handleCreateReply}
        />

        {replies.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">💬</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay respuestas rápidas configuradas</h3>
            <p className="text-gray-500 dark:text-gray-400">Crea plantillas de respuesta para agilizar la atención al cliente</p>
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No se encontraron respuestas que coincidan con &quot;{searchTerm}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReplies.map((reply) => (
              <QuickReplyCard key={reply.id} reply={reply} onEdit={handleEditReply} onDelete={handleDeleteReply} />
            ))}
          </div>
        )}
      </div>

      {/* Llaves API */}
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
            <p className="text-gray-500 dark:text-gray-400">Crea llaves de API para integrar el chat con tu aplicación o servicios externos</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <ApiKeyCard key={key.id} apiKey={key} onRevoke={handleRevokeKey} onRotate={handleRotateKey} />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <TagDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} tag={selectedTag} onSave={handleSaveTag} />
      <ApiKeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} channels={channels} onSave={handleSaveKey} />
      <QuickReplyDialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen} reply={selectedReply} onSave={handleSaveReply} />

      {/* Delete tag dialog */}
      <AlertDialog open={deleteTagDialogOpen} onOpenChange={setDeleteTagDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la etiqueta &quot;{tagToDelete?.name}&quot; y la removerá de todas las conversaciones donde esté asignada. Esta acción no se puede deshacer.
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
              Esta acción revocará la llave &quot;{selectedKey?.name}&quot; de forma permanente. Cualquier integración que use esta llave dejará de funcionar inmediatamente.
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
              Esta acción creará una nueva llave con los mismos permisos y revocará la llave actual &quot;{selectedKey?.name}&quot;. Deberás actualizar todas las integraciones con la nueva llave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRotateKey} className="bg-blue-600 hover:bg-blue-700 text-white">Rotar Llave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete reply dialog */}
      <AlertDialog open={deleteReplyDialogOpen} onOpenChange={setDeleteReplyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar respuesta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la respuesta &quot;{replyToDelete?.title}&quot; de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReply} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
