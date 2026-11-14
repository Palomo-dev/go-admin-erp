'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Tags, MessageSquareText, Key } from 'lucide-react';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
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
  const t = useTranslations('configuracionTextos.chatConfigPanel');
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
      toast({ title: t('toast.error'), description: t('toast.errorCargarEtiquetas'), variant: 'destructive' });
    } finally {
      setTagsLoading(false);
    }
  }, [organizationId, toast, t]);

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
      toast({ title: t('toast.error'), description: t('toast.errorCargarLlaves'), variant: 'destructive' });
    } finally {
      setKeysLoading(false);
    }
  }, [organizationId, toast, t]);

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
      toast({ title: t('toast.error'), description: t('toast.errorCargarRespuestas'), variant: 'destructive' });
    } finally {
      setRepliesLoading(false);
    }
  }, [organizationId, toast, t]);

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
        toast({ title: t('toast.etiquetaActualizada'), description: t('toast.cambiosGuardados') });
      } else {
        await service.createTag(data);
        toast({ title: t('toast.etiquetaCreada'), description: t('toast.etiquetaCreadaDescripcion') });
      }
      loadTags();
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errorGuardarEtiqueta'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteTag = async () => {
    if (!organizationId || !tagToDelete) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.deleteTag(tagToDelete.id);
      toast({ title: t('toast.etiquetaEliminada'), description: t('toast.etiquetaEliminadaDescripcion') });
      loadTags();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorEliminarEtiqueta'), variant: 'destructive' });
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
      toast({ title: t('toast.llaveCreada'), description: t('toast.llaveCreadaDescripcion') });
      loadApiKeys();
      return { rawKey: result.rawKey };
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errorCrearLlave'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmRevokeKey = async () => {
    if (!organizationId || !selectedKey) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.revokeApiKey(selectedKey.id);
      toast({ title: t('toast.llaveRevocada'), description: t('toast.llaveRevocadaDescripcion') });
      loadApiKeys();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorRevocarLlave'), variant: 'destructive' });
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
      toast({ title: t('toast.llaveRotada'), description: t('toast.llaveRotadaDescripcion') });
      loadApiKeys();
      setRotateDialogOpen(false);
      setSelectedKey(null);
      setKeyDialogOpen(true);
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorRotarLlave'), variant: 'destructive' });
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
      reply.tags?.some((etiqueta) => etiqueta.toLowerCase().includes(searchTerm.toLowerCase())),
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
        toast({ title: t('toast.respuestaActualizada'), description: t('toast.cambiosGuardados') });
      } else {
        await service.createQuickReply(data);
        toast({ title: t('toast.respuestaCreada'), description: t('toast.respuestaCreadaDescripcion') });
      }
      loadReplies();
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errorGuardarRespuesta'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteReply = async () => {
    if (!organizationId || !replyToDelete) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.deleteQuickReply(replyToDelete.id);
      toast({ title: t('toast.respuestaEliminada'), description: t('toast.respuestaEliminadaDescripcion') });
      loadReplies();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorEliminarRespuesta'), variant: 'destructive' });
    } finally {
      setDeleteReplyDialogOpen(false);
      setReplyToDelete(null);
    }
  };

  const isLoading = tagsLoading && keysLoading && repliesLoading;

  if (isLoading && tags.length === 0 && apiKeys.length === 0 && replies.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={6} columns="3" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Etiquetas */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">{t('secciones.etiquetas')}</h3>
        </div>
        <TagsHeader totalTags={tags.length} loading={tagsLoading} onRefresh={loadTags} onCreateTag={handleCreateTag} />

        {tags.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">🏷️</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('vacio.etiquetasTitulo')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('vacio.etiquetasDescripcion')}</p>
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
          <h3 className="text-sm font-medium text-muted-foreground">{t('secciones.respuestasRapidas')}</h3>
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('vacio.respuestasTitulo')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('vacio.respuestasDescripcion')}</p>
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">{t('vacio.sinCoincidencias', { busqueda: searchTerm })}</p>
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
          <h3 className="text-sm font-medium text-muted-foreground">{t('secciones.llavesApi')}</h3>
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('vacio.llavesTitulo')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('vacio.llavesDescripcion')}</p>
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
            <AlertDialogTitle>{t('dialogos.eliminarEtiquetaTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialogos.eliminarEtiquetaDescripcion', { nombre: tagToDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialogos.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTag} className="bg-red-600 hover:bg-red-700 text-white">{t('dialogos.eliminar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke key dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogos.revocarLlaveTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialogos.revocarLlaveDescripcion', { nombre: selectedKey?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialogos.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevokeKey} className="bg-red-600 hover:bg-red-700 text-white">{t('dialogos.revocar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate key dialog */}
      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogos.rotarLlaveTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialogos.rotarLlaveDescripcion', { nombre: selectedKey?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialogos.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRotateKey} className="bg-blue-600 hover:bg-blue-700 text-white">{t('dialogos.rotarLlave')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete reply dialog */}
      <AlertDialog open={deleteReplyDialogOpen} onOpenChange={setDeleteReplyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogos.eliminarRespuestaTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dialogos.eliminarRespuestaDescripcion', { titulo: replyToDelete?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialogos.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReply} className="bg-red-600 hover:bg-red-700 text-white">{t('dialogos.eliminar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
