'use client';

/**
 * Configuración › Chat › Etiquetas y respuestas rápidas (id estable
 * `chat.general`; Figma pág. 10, 12.8 y pantallazo 94-config-03).
 *
 * - Etiquetas: se administran SOLO aquí (decisión del dueño); Configuración ›
 *   CRM enlaza a esta pestaña.
 * - Respuestas rápidas: los textos que el equipo inserta con «/».
 * - Llaves de API: ya no se crean aquí; un enlace lleva a Integraciones ›
 *   Desarrolladores, el único lugar de las llaves.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Hash, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog, RowActionsMenu, clasesBoton, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import InboxConfigService, { type ConversationTag, type QuickReply } from '@/lib/services/inboxConfigService';
import { TagDialog } from '@/components/chat/configuracion/etiquetas';
import { QuickReplyDialog } from '@/components/chat/configuracion/respuestas-rapidas';
import { rutaSeccion } from '../../config/configSectionsRegistry';
import { BotonEnlace, GrupoAjustes, TarjetaEnlace } from '../../layout/EnlacesAjuste';

/** «envio» o «/envio» → «/envio». */
const atajo = (s: string | null) => (s ? `/${s.replace(/^\/+/, '')}` : null);

function FilasCargando() {
  return (
    <div className="flex flex-col gap-3 py-4" aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ChatConfigPanel() {
  const t = useTranslations('configuracionTextos.chatConfigPanel');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [tagsLoading, setTagsLoading] = useState(true);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<ConversationTag | null>(null);

  const [repliesLoading, setRepliesLoading] = useState(true);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [selectedReply, setSelectedReply] = useState<QuickReply | null>(null);
  const [replyToDelete, setReplyToDelete] = useState<QuickReply | null>(null);

  const loadTags = useCallback(async () => {
    if (!organizationId) return;
    setTagsLoading(true);
    try {
      setTags(await new InboxConfigService(organizationId).getTags());
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
      toast({ title: t('toast.error'), description: t('toast.errorCargarEtiquetas'), variant: 'destructive' });
    } finally {
      setTagsLoading(false);
    }
  }, [organizationId, toast, t]);

  const loadReplies = useCallback(async () => {
    if (!organizationId) return;
    setRepliesLoading(true);
    try {
      setReplies(await new InboxConfigService(organizationId).getQuickReplies());
    } catch (error) {
      console.error('Error cargando respuestas rápidas:', error);
      toast({ title: t('toast.error'), description: t('toast.errorCargarRespuestas'), variant: 'destructive' });
    } finally {
      setRepliesLoading(false);
    }
  }, [organizationId, toast, t]);

  useEffect(() => {
    if (organizationId) {
      void loadTags();
      void loadReplies();
    }
  }, [organizationId, loadTags, loadReplies]);

  // === Etiquetas ===
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
      void loadTags();
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errorGuardarEtiqueta'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteTag = async () => {
    if (!organizationId || !tagToDelete) return;
    try {
      await new InboxConfigService(organizationId).deleteTag(tagToDelete.id);
      toast({ title: t('toast.etiquetaEliminada'), description: t('toast.etiquetaEliminadaDescripcion') });
      void loadTags();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorEliminarEtiqueta'), variant: 'destructive' });
    } finally {
      setTagToDelete(null);
    }
  };

  const accionesEtiqueta = (tag: ConversationTag): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => { setSelectedTag(tag); setTagDialogOpen(true); } },
    { id: 'eliminar', etiqueta: t('dialogos.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setTagToDelete(tag) },
  ];

  // === Respuestas rápidas ===
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
      void loadReplies();
    } catch (error) {
      toast({ title: t('toast.error'), description: t('toast.errorGuardarRespuesta'), variant: 'destructive' });
      throw error;
    }
  };

  const confirmDeleteReply = async () => {
    if (!organizationId || !replyToDelete) return;
    try {
      await new InboxConfigService(organizationId).deleteQuickReply(replyToDelete.id);
      toast({ title: t('toast.respuestaEliminada'), description: t('toast.respuestaEliminadaDescripcion') });
      void loadReplies();
    } catch {
      toast({ title: t('toast.error'), description: t('toast.errorEliminarRespuesta'), variant: 'destructive' });
    } finally {
      setReplyToDelete(null);
    }
  };

  const accionesRespuesta = (reply: QuickReply): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => { setSelectedReply(reply); setReplyDialogOpen(true); } },
    { id: 'eliminar', etiqueta: t('dialogos.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setReplyToDelete(reply) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <GrupoAjustes
        id="chat-etiquetas-titulo"
        titulo={t('secciones.etiquetas')}
        descripcion={t('descripciones.etiquetas')}
        accion={
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => { setSelectedTag(null); setTagDialogOpen(true); }}>
            <Plus aria-hidden="true" className="size-4" />
            {t('acciones.nuevaEtiqueta')}
          </button>
        }
      >
        {tagsLoading && tags.length === 0 ? (
          <FilasCargando />
        ) : tags.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">{t('vacio.etiquetasDescripcion')}</p>
        ) : (
          tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-4 py-3.5">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{tag.name}</p>
                {tag.description && <p className="truncate text-[13px] text-fg-muted">{tag.description}</p>}
              </div>
              <RowActionsMenu acciones={accionesEtiqueta(tag)} titulo={tag.name} orientacion="horizontal" />
            </div>
          ))
        )}
      </GrupoAjustes>

      <GrupoAjustes
        id="chat-respuestas-titulo"
        titulo={t('secciones.respuestasRapidas')}
        descripcion={t('descripciones.respuestasRapidas')}
        accion={
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => { setSelectedReply(null); setReplyDialogOpen(true); }}>
            <Plus aria-hidden="true" className="size-4" />
            {t('acciones.nuevaRespuesta')}
          </button>
        }
      >
        {repliesLoading && replies.length === 0 ? (
          <FilasCargando />
        ) : replies.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">{t('vacio.respuestasDescripcion')}</p>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className="flex items-center gap-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{[atajo(reply.shortcut), reply.title].filter(Boolean).join(' · ')}</p>
                <p className="truncate text-[13px] text-fg-muted">{reply.content}</p>
              </div>
              <RowActionsMenu acciones={accionesRespuesta(reply)} titulo={reply.title} orientacion="horizontal" />
            </div>
          ))
        )}
      </GrupoAjustes>

      {/* Llaves de API: solo en Integraciones › Desarrolladores (el diálogo cambia de sección). */}
      <GrupoAjustes id="chat-llaves-titulo" titulo={t('secciones.llavesApi')} sinFilas>
        <TarjetaEnlace icono={Hash} texto={t('llaves.enlace')}>
          <BotonEnlace href={rutaSeccion('integraciones.desarrolladores')}>{t('llaves.irDesarrolladores')}</BotonEnlace>
        </TarjetaEnlace>
      </GrupoAjustes>

      <TagDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} tag={selectedTag} onSave={handleSaveTag} />
      <QuickReplyDialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen} reply={selectedReply} onSave={handleSaveReply} />

      <ConfirmDialog
        abierto={!!tagToDelete}
        onAbiertoChange={(v) => !v && setTagToDelete(null)}
        titulo={t('dialogos.eliminarEtiquetaTitulo')}
        descripcion={t('dialogos.eliminarEtiquetaDescripcion', { nombre: tagToDelete?.name ?? '' })}
        textoConfirmar={t('dialogos.eliminar')}
        textoCancelar={t('dialogos.cancelar')}
        onConfirmar={confirmDeleteTag}
        tono="peligro"
      />
      <ConfirmDialog
        abierto={!!replyToDelete}
        onAbiertoChange={(v) => !v && setReplyToDelete(null)}
        titulo={t('dialogos.eliminarRespuestaTitulo')}
        descripcion={t('dialogos.eliminarRespuestaDescripcion', { titulo: replyToDelete?.title ?? '' })}
        textoConfirmar={t('dialogos.eliminar')}
        textoCancelar={t('dialogos.cancelar')}
        onConfirmar={confirmDeleteReply}
        tono="peligro"
      />
    </div>
  );
}
