'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { useConversacion } from '@/components/chat/conversations/useConversacion';
import { CabeceraConversacion } from '@/components/chat/conversations/CabeceraConversacion';
import { supabase } from '@/lib/supabase/config';
import ConversationFilesService, { type ConversationFile } from '@/lib/services/conversationFilesService';
import { FilesHeader, FilesList } from '@/components/chat/conversations/id/files';
import { resumenArchivos } from '@/components/chat/conversations/id/files/archivosLogica';

/** Enlace para abrir o descargar ya: 1 minuto. */
const SEGUNDOS_ENLACE_INMEDIATO = 60;
/** Enlace para compartir: 1 hora (lo dice el aviso de la pantalla). */
const SEGUNDOS_ENLACE_COMPARTIR = 3600;

/** Conversación › Archivos (Figma 91-chat-12). */
export default function ChatConversationFilesPage() {
  const params = useParams();
  const conversationId = params?.id as string;
  const { toast } = useToast();
  const t = useTranslations('chatHilo.archivos.toasts');
  const tComun = useTranslations('chatHilo.comun');
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const c = useConversacion(organizationId, conversationId);
  // Eliminar lo decide el servidor (`/api/me/capacidades`), nunca el nombre del rol.
  const { datos: capacidades } = useCapacidades();

  const fallo = useCallback(
    (descripcion: string, error: unknown) => {
      console.error(descripcion, error);
      toast({ title: tComun('error'), description: descripcion, variant: 'destructive' });
    },
    [toast, tComun],
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !conversationId) return;
    try {
      setLoading(true);
      // Una sola lectura: las cifras salen de la misma lista.
      setFiles(await new ConversationFilesService(organizationId).getConversationFiles(conversationId));
    } catch (error) {
      fallo(t('errorCarga'), error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, conversationId, fallo, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resumen = useMemo(() => (loading ? null : resumenArchivos(files)), [files, loading]);

  const enlace = (file: ConversationFile, segundos: number) => {
    if (!organizationId) throw new Error('Sin organización');
    return new ConversationFilesService(organizationId).getSignedUrl(file, segundos);
  };

  const handleOpen = async (file: ConversationFile) => {
    // La pestaña se abre antes de esperar al enlace: si no, el navegador la bloquea.
    const ventana = window.open('', '_blank');
    try {
      const url = await enlace(file, SEGUNDOS_ENLACE_INMEDIATO);
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      ventana?.close();
      fallo(t('errorAbrir'), error);
    }
  };

  const handleDownload = async (file: ConversationFile) => {
    try {
      const url = await enlace(file, SEGUNDOS_ENLACE_INMEDIATO);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: t('descargando', { nombre: file.file_name }) });
    } catch (error) {
      fallo(t('errorDescarga'), error);
    }
  };

  const handleCopyLink = async (file: ConversationFile) => {
    try {
      await navigator.clipboard.writeText(await enlace(file, SEGUNDOS_ENLACE_COMPARTIR));
      toast({ title: t('enlaceCopiado'), description: t('enlaceVence') });
    } catch (error) {
      fallo(t('errorEnlace'), error);
    }
  };

  const handleDelete = async (file: ConversationFile) => {
    if (!organizationId) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');
      await new ConversationFilesService(organizationId).deleteFile(file.id, user.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast({ title: t('eliminado'), description: file.file_name });
    } catch (error) {
      fallo(t('errorEliminar'), error);
      throw error;
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <CabeceraConversacion c={c} seccion="archivos" conversationId={conversationId} contadores={{ archivos: resumen?.total ?? null }} />
      <FilesHeader resumen={resumen} loading={loading} />
      <div className="flex-1">
        <FilesList
          files={files}
          loading={loading}
          onOpen={handleOpen}
          onDownload={handleDownload}
          onCopyLink={handleCopyLink}
          onDelete={handleDelete}
          canDelete={capacidades.esAdmin}
        />
      </div>
    </div>
  );
}
