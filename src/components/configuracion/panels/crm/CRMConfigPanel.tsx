'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { ArrowUpRight, MessageSquare, Tags, Key, Layers, AlertCircle, Gauge, ListChecks, DollarSign, Users, Network, Target } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { VerticalsManager } from './sections/VerticalsManager';
import { LossReasonsManager } from './sections/LossReasonsManager';
import { ScoringConfigurator } from './sections/ScoringConfigurator';
import { ExitGatesEditor } from './sections/ExitGatesEditor';
import { CommissionsPanel } from './sections/CommissionsPanel';
import { ReferralsProgramCard } from './sections/ReferralsProgramCard';
import { EstructuraComercialManager } from './sections/EstructuraComercialManager';
import { ICPManager } from './sections/ICPManager';
import ChatChannelsService from '@/lib/services/chatChannelsService';
import InboxConfigService, {
  type ConversationTag,
  type ChannelApiKey,
  type Channel,
} from '@/lib/services/inboxConfigService';
import { TagsHeader, TagCard, TagDialog } from '@/components/chat/configuracion/etiquetas';
import { ApiKeysHeader, ApiKeyCard, ApiKeyDialog } from '@/components/chat/configuracion/llaves-api';

/** Ruta del chat del sitio web de un canal (página nueva de Canales). */
const rutaSitioWeb = (id: string) => `/app/chat/canales/sitio-web/${id}`;
const RUTA_CANALES = '/app/chat/canales';

/**
 * Enlace que, dentro del diálogo de Configuración, navega y lo cierra
 * (`onAbrirEnlace`); fuera de él es un enlace normal.
 */
function EnlaceCanales({ href, onAbrir, className, children }: { href: string; onAbrir?: (href: string) => void; className: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (!onAbrir || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onAbrir(href);
      }}
    >
      {children}
    </Link>
  );
}

export function CRMConfigPanel({ onAbrirEnlace }: { onAbrirEnlace?: (href: string) => void } = {}) {
  const tCanales = useTranslations('chatConfig.crmCanales');
  const t = useTranslations('configuracionTextos.crmConfigPanel');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // === Canales ===
  // Los canales y el chat del sitio web se configuran en Chat › Canales (páginas
  // nuevas). Aquí solo se averigua si hay un chat del sitio web para enlazarlo.
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [sitioWebId, setSitioWebId] = useState<string | null>(null);

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

  // === CRM Config Cards state ===
  const [verticalsModalOpen, setVerticalsModalOpen] = useState(false);
  const [lossReasonsModalOpen, setLossReasonsModalOpen] = useState(false);
  const [scoringModalOpen, setScoringModalOpen] = useState(false);
  const [exitGatesModalOpen, setExitGatesModalOpen] = useState(false);
  const [commissionsModalOpen, setCommissionsModalOpen] = useState(false);
  const [referralsModalOpen, setReferralsModalOpen] = useState(false);
  const [estructuraModalOpen, setEstructuraModalOpen] = useState(false);
  const [icpModalOpen, setIcpModalOpen] = useState(false);

  // === Load Canales ===
  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    setChannelsLoading(true);
    try {
      const canales = await new ChatChannelsService(organizationId).getChannels();
      const sitio = canales.find((ch) => ch.type === 'website' && ch.status === 'active') ?? canales.find((ch) => ch.type === 'website');
      setSitioWebId(sitio?.id ?? null);
    } catch (error) {
      console.error('Error cargando canales:', error);
      setSitioWebId(null);
    } finally {
      setChannelsLoading(false);
    }
  }, [organizationId]);

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
      toast({ title: t('toast.error'), description: t('toast.errCargarEtiquetas'), variant: 'destructive' });
    } finally {
      setTagsLoading(false);
    }
  }, [organizationId, toast, t]);

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
      toast({ title: t('toast.error'), description: t('toast.errCargarLlaves'), variant: 'destructive' });
    } finally {
      setKeysLoading(false);
    }
  }, [organizationId, toast, t]);

  useEffect(() => {
    if (organizationId) {
      loadChannels();
      loadTags();
      loadApiKeys();
    }
  }, [organizationId, loadChannels, loadTags, loadApiKeys]);

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
        toast({ title: t('toast.etiquetaActualizada'), description: t('toast.etiquetaActualizadaDesc') });
      } else {
        await service.createTag(data);
        toast({ title: t('toast.etiquetaCreada'), description: t('toast.etiquetaCreadaDesc') });
      }
      loadTags();
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errGuardarEtiqueta'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteTag = async () => {
    if (!organizationId || !tagToDelete) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.deleteTag(tagToDelete.id);
      toast({ title: t('toast.etiquetaEliminada'), description: t('toast.etiquetaEliminadaDesc') });
      loadTags();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errEliminarEtiqueta'), variant: 'destructive' });
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
      toast({ title: t('toast.llaveCreada'), description: t('toast.llaveCreadaDesc') });
      loadApiKeys();
      return { rawKey: result.rawKey };
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errCrearLlave'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmRevokeKey = async () => {
    if (!organizationId || !selectedKey) return;
    const service = new InboxConfigService(organizationId);
    try {
      await service.revokeApiKey(selectedKey.id);
      toast({ title: t('toast.llaveRevocada'), description: t('toast.llaveRevocadaDesc') });
      loadApiKeys();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errRevocarLlave'), variant: 'destructive' });
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
      toast({ title: t('toast.llaveRotada'), description: t('toast.llaveRotadaDesc') });
      loadApiKeys();
      setRotateDialogOpen(false);
      setSelectedKey(null);
      setKeyDialogOpen(true);
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errRotarLlave'), variant: 'destructive' });
      setRotateDialogOpen(false);
      setSelectedKey(null);
    }
  };

  const isLoading = channelsLoading && tagsLoading && keysLoading;

  if (isLoading && tags.length === 0 && apiKeys.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={6} columns="3" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* === Canales: viven en Chat › Canales; aquí solo se enlazan === */}
      <section aria-labelledby="crm-canales-titulo" className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare aria-hidden="true" className="h-4 w-4 text-fg-muted" />
          <h3 id="crm-canales-titulo" className="text-sm font-medium text-fg-muted">{tCanales('titulo')}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 md:px-6 md:py-5">
          <p className="min-w-0 flex-1 text-sm text-fg-secondary">{tCanales('descripcion')}</p>
          <div className="flex flex-wrap gap-2">
            {!channelsLoading && sitioWebId && (
              <EnlaceCanales href={rutaSitioWeb(sitioWebId)} onAbrir={onAbrirEnlace} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                {tCanales('configurarSitio')}
              </EnlaceCanales>
            )}
            <EnlaceCanales href={RUTA_CANALES} onAbrir={onAbrirEnlace} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              {tCanales('irCanales')}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </EnlaceCanales>
          </div>
        </div>
      </section>

      {/* === Etiquetas === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">{t('etiquetas.titulo')}</h3>
        </div>
        <TagsHeader totalTags={tags.length} loading={tagsLoading} onRefresh={loadTags} onCreateTag={handleCreateTag} />

        {tags.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-2xl">🏷️</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('etiquetas.vacioTitulo')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('etiquetas.vacioDescripcion')}</p>
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
          <h3 className="text-sm font-medium text-muted-foreground">{t('llaves.titulo')}</h3>
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('llaves.vacioTitulo')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('llaves.vacioDescripcion')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <ApiKeyCard key={key.id} apiKey={key} onRevoke={handleRevokeKey} onRotate={handleRotateKey} />
            ))}
          </div>
        )}
      </div>

      {/* === CRM Config Cards === */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('tarjetas.titulo')}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card: Verticales */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.verticales.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.verticales.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setVerticalsModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Razones de perdida */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.razonesPerdida.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.razonesPerdida.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setLossReasonsModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Scoring GOC */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-purple-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.scoring.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.scoring.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setScoringModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Etapas y criterios */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-teal-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.etapas.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.etapas.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setExitGatesModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Vendedores y comisiones */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.comisiones.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.comisiones.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setCommissionsModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Programa de referidos */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-cyan-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.referidos.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.referidos.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setReferralsModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: Estructura comercial */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-rose-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.estructura.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.estructura.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setEstructuraModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>

          {/* Card: ICP */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('tarjetas.icp.titulo')}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('tarjetas.icp.descripcion')}
            </p>
            <button
              type="button"
              onClick={() => setIcpModalOpen(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t('tarjetas.configurar')}
            </button>
          </div>
        </div>
      </div>

      {/* === CRM Config Modals === */}
      <Dialog open={verticalsModalOpen} onOpenChange={setVerticalsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('modales.verticales.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.verticales.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <VerticalsManager />
        </DialogContent>
      </Dialog>

      <Dialog open={lossReasonsModalOpen} onOpenChange={setLossReasonsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('modales.razonesPerdida.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.razonesPerdida.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <LossReasonsManager />
        </DialogContent>
      </Dialog>

      <Dialog open={scoringModalOpen} onOpenChange={setScoringModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('modales.scoring.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.scoring.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <ScoringConfigurator />
        </DialogContent>
      </Dialog>

      <Dialog open={exitGatesModalOpen} onOpenChange={setExitGatesModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('modales.etapas.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.etapas.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <ExitGatesEditor />
        </DialogContent>
      </Dialog>

      <Dialog open={commissionsModalOpen} onOpenChange={setCommissionsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('modales.comisiones.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.comisiones.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <CommissionsPanel />
        </DialogContent>
      </Dialog>

      <Dialog open={referralsModalOpen} onOpenChange={setReferralsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('modales.referidos.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.referidos.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <ReferralsProgramCard />
        </DialogContent>
      </Dialog>

      <Dialog open={estructuraModalOpen} onOpenChange={setEstructuraModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('modales.estructura.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.estructura.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <EstructuraComercialManager />
        </DialogContent>
      </Dialog>

      <Dialog open={icpModalOpen} onOpenChange={setIcpModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('modales.icp.titulo')}</DialogTitle>
            <DialogDescription>
              {t('modales.icp.descripcion')}
            </DialogDescription>
          </DialogHeader>
          <ICPManager />
        </DialogContent>
      </Dialog>

      {/* === Dialogs === */}
      <TagDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} tag={selectedTag} onSave={handleSaveTag} />
      <ApiKeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} channels={apiChannels} onSave={handleSaveKey} />

      {/* Delete tag dialog */}
      <AlertDialog open={deleteTagDialogOpen} onOpenChange={setDeleteTagDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmar.eliminarEtiquetaTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmar.eliminarEtiquetaDescripcion', { nombre: tagToDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirmar.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTag} className="bg-red-600 hover:bg-red-700 text-white">{t('confirmar.eliminar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke key dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmar.revocarLlaveTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmar.revocarLlaveDescripcion', { nombre: selectedKey?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirmar.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevokeKey} className="bg-red-600 hover:bg-red-700 text-white">{t('confirmar.revocar')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rotate key dialog */}
      <AlertDialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmar.rotarLlaveTitulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmar.rotarLlaveDescripcion', { nombre: selectedKey?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirmar.cancelar')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRotateKey} className="bg-blue-600 hover:bg-blue-700 text-white">{t('confirmar.rotarLlave')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
