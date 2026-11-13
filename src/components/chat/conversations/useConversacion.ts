'use client';

/**
 * Estado y acciones de UNA conversación del Chat, compartidos por la Bandeja
 * (panel derecho y hoja «Detalles» en móvil) y la vista completa
 * (`/app/chat/conversaciones/[id]`). Una sola implementación (regla dura 7):
 * estado, prioridad, asignación, etiquetas, notas, IA, ventana de WhatsApp y
 * envío pasan por aquí, y de aquí a los servicios.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import ConversationDetailService, {
  type ConversationDetail,
  type ConversationNote,
  type ConversationSummary,
  type QuickReply,
} from '@/lib/services/conversationDetailService';
import { enviarMensajeConversacion, ErrorEnvio, motivoErrorEnvio } from '@/lib/services/chat/envioMensaje';
import { chatApi } from '@/lib/services/chat/chatApi';
import type { AgenteChat } from '@/lib/services/chat/agentesChat';
import { waApi } from '@/components/crm/whatsapp/api';
import { estadoComposer, type EstadoComposer } from '@/components/chat/ui/composerLogica';
import type { EnvioComposer } from '@/components/chat/ui/ComposerChat';

// ─── Agentes: una sola lectura compartida por todas las vistas abiertas ─────
let agentesCache: Promise<AgenteChat[]> | null = null;

export function useAgentesChat() {
  const [agentes, setAgentes] = useState<AgenteChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(async (forzar = false) => {
    if (forzar || !agentesCache) agentesCache = chatApi.agentes().catch((e) => {
      agentesCache = null;
      throw e;
    });
    try {
      setAgentes(await agentesCache);
    } catch {
      setAgentes([]);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { agentes, cargando, recargar };
}

export interface VentanaWhatsApp {
  abierta: boolean;
  puedeContactar: boolean;
}

export type Etiqueta = { id: string; name: string; color: string };

export function useConversacion(organizationId: number | null | undefined, conversationId: string | null | undefined) {
  const t = useTranslations('chatBandeja.avisos');
  const te = useTranslations('chatUi.composer.errores');
  const { toast } = useToast();
  const { agentes, recargar: recargarAgentes } = useAgentesChat();

  const [detalle, setDetalle] = useState<ConversationDetail | null>(null);
  const [notas, setNotas] = useState<ConversationNote[]>([]);
  const [resumen, setResumen] = useState<ConversationSummary | null>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [respuestasRapidas, setRespuestasRapidas] = useState<QuickReply[]>([]);
  const [ventana, setVentana] = useState<VentanaWhatsApp | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sugerencia, setSugerencia] = useState<{ texto: string; jobId: string | null } | null>(null);
  const vigente = useRef<string | null>(null);

  const servicio = useMemo(() => (organizationId ? new ConversationDetailService(organizationId) : null), [organizationId]);

  const error = useCallback(
    (titulo: string, e: unknown) => {
      console.error(titulo, e);
      toast({ title: titulo, description: e instanceof Error && e.message ? e.message : undefined, variant: 'destructive' });
    },
    [toast],
  );

  const leerDetalle = useCallback(async () => {
    if (!servicio || !conversationId) return null;
    const d = await servicio.getConversation(conversationId);
    if (vigente.current === conversationId) setDetalle(d);
    return d;
  }, [servicio, conversationId]);

  const leerVentana = useCallback(async (d: ConversationDetail | null) => {
    if (!d || d.channel?.type !== 'whatsapp' || !d.customer_id) {
      setVentana(null);
      return;
    }
    try {
      const w = await waApi.window(d.customer_id, d.channel_id);
      if (vigente.current === d.id) setVentana({ abierta: !!w.is_open, puedeContactar: w.can_contact !== false });
    } catch {
      setVentana(null); // sin dato no se bloquea: el servidor valida al enviar
    }
  }, []);

  useEffect(() => {
    vigente.current = conversationId ?? null;
    setDetalle(null);
    setNotas([]);
    setResumen(null);
    setVentana(null);
    setSugerencia(null);
    if (!servicio || !conversationId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    void (async () => {
      try {
        const [d, n, r, tags, rapidas] = await Promise.all([
          servicio.getConversation(conversationId),
          servicio.getNotes(conversationId).catch(() => []),
          servicio.getSummary(conversationId),
          servicio.getTags().catch(() => []),
          servicio.getQuickReplies().catch(() => []),
        ]);
        if (vigente.current !== conversationId) return;
        setDetalle(d);
        setNotas(n);
        setResumen(r);
        setEtiquetas(tags);
        setRespuestasRapidas(rapidas);
        void leerVentana(d);
        void servicio.markMessagesAsRead(conversationId).catch(() => undefined);
      } catch (e) {
        error(t('errorCargar'), e);
      } finally {
        if (vigente.current === conversationId) setCargando(false);
      }
    })();
  }, [servicio, conversationId, error, t, leerVentana]);

  const conAviso = useCallback(
    async (fn: () => Promise<unknown>, ok: string | null, fallo: string) => {
      try {
        await fn();
        if (ok) toast({ title: ok });
        return true;
      } catch (e) {
        error(fallo, e);
        return false;
      }
    },
    [toast, error],
  );

  const cambiarEstado = useCallback(
    (estado: 'open' | 'pending' | 'closed') =>
      conAviso(
        async () => {
          await servicio!.updateConversationStatus(conversationId!, estado);
          await leerDetalle();
        },
        estado === 'closed' ? t('cerrada') : estado === 'pending' ? t('pendiente') : t('reabierta'),
        t('errorEstado'),
      ),
    [conAviso, servicio, conversationId, leerDetalle, t],
  );

  const cambiarPrioridad = useCallback(
    (prioridad: string) =>
      conAviso(
        async () => {
          await servicio!.updateConversationPriority(conversationId!, prioridad);
          await leerDetalle();
        },
        t('prioridad'),
        t('errorPrioridad'),
      ),
    [conAviso, servicio, conversationId, leerDetalle, t],
  );

  const asignar = useCallback(
    (memberId: number | null) =>
      conAviso(
        async () => {
          await servicio!.assignConversation(conversationId!, memberId);
          await Promise.all([leerDetalle(), recargarAgentes(true)]);
        },
        memberId == null ? t('asignacionQuitada') : t('asignada'),
        t('errorAsignar'),
      ),
    [conAviso, servicio, conversationId, leerDetalle, recargarAgentes, t],
  );

  const agregarEtiqueta = useCallback(
    (tagId: string) =>
      conAviso(
        async () => {
          await servicio!.addTag(conversationId!, tagId);
          await leerDetalle();
        },
        null,
        t('errorEtiqueta'),
      ),
    [conAviso, servicio, conversationId, leerDetalle, t],
  );

  const quitarEtiqueta = useCallback(
    (tagId: string) =>
      conAviso(
        async () => {
          await servicio!.removeTag(conversationId!, tagId);
          await leerDetalle();
        },
        null,
        t('errorEtiqueta'),
      ),
    [conAviso, servicio, conversationId, leerDetalle, t],
  );

  const recargarNotas = useCallback(async () => {
    if (!servicio || !conversationId) return;
    const n = await servicio.getNotes(conversationId);
    if (vigente.current === conversationId) setNotas(n);
  }, [servicio, conversationId]);

  /** Lanza si falla (el compositor conserva el texto). */
  const agregarNota = useCallback(
    async (texto: string) => {
      try {
        await servicio!.addNote(conversationId!, texto);
        await recargarNotas();
      } catch (e) {
        error(t('errorNota'), e);
        throw e;
      }
    },
    [servicio, conversationId, recargarNotas, error, t],
  );

  const fijarNota = useCallback(
    (id: string, fijada: boolean) => conAviso(async () => {
      await servicio!.toggleNotePin(id, fijada);
      await recargarNotas();
    }, null, t('errorNota')),
    [conAviso, servicio, recargarNotas, t],
  );

  const eliminarNota = useCallback(
    (id: string) => conAviso(async () => {
      await servicio!.deleteNote(id);
      await recargarNotas();
    }, t('notaEliminada'), t('errorNota')),
    [conAviso, servicio, recargarNotas, t],
  );

  /** Envío del agente por el camino único. Lanza si falla. */
  const enviar = useCallback(
    async (envio: EnvioComposer | { plantilla: { templateId: string; variables?: Record<string, string> } }) => {
      if (!organizationId || !detalle) return;
      try {
        await enviarMensajeConversacion({
          organizationId,
          conversacion: { id: detalle.id, channel_id: detalle.channel_id, tipoCanal: detalle.channel?.type },
          mensaje: envio,
          supabase,
        });
        void leerDetalle();
      } catch (e) {
        const motivo = motivoErrorEnvio(e instanceof ErrorEnvio ? e.codigo : null);
        toast({ title: te('titulo'), description: motivo === 'generico' && e instanceof Error ? e.message : te(motivo), variant: 'destructive' });
        if (motivo === 'ventanaCerrada' || motivo === 'sinConsentimiento') void leerVentana(detalle);
        throw e;
      }
    },
    [organizationId, detalle, leerDetalle, leerVentana, toast, te],
  );

  const sugerirIA = useCallback(async (): Promise<string | null> => {
    if (!conversationId) return null;
    try {
      const s = await chatApi.sugerirRespuesta(conversationId);
      if (vigente.current === conversationId) setSugerencia(s);
      return s.texto || null;
    } catch (e) {
      error(t('errorIA'), e);
      return null;
    }
  }, [conversationId, error, t]);

  const generarResumen = useCallback(
    () =>
      conAviso(
        async () => {
          await chatApi.generarResumen(conversationId!);
          const r = await servicio!.getSummary(conversationId!);
          if (vigente.current === conversationId) setResumen(r);
        },
        null,
        t('errorIA'),
      ),
    [conAviso, servicio, conversationId, t],
  );

  const usarRespuestaRapida = useCallback(
    (id: string) => {
      void servicio?.useQuickReply(id, conversationId ?? undefined);
    },
    [servicio, conversationId],
  );

  const estadoEscritura: EstadoComposer = estadoComposer({
    estadoConversacion: detalle?.status,
    tipoCanal: detalle?.channel?.type,
    ventana,
  });

  return {
    detalle,
    notas,
    resumen,
    etiquetas,
    respuestasRapidas,
    agentes,
    ventana,
    cargando,
    sugerencia,
    estadoEscritura,
    cambiarEstado,
    cambiarPrioridad,
    asignar,
    agregarEtiqueta,
    quitarEtiqueta,
    agregarNota,
    fijarNota,
    eliminarNota,
    enviar,
    sugerirIA,
    generarResumen,
    usarRespuestaRapida,
    recargar: leerDetalle,
  };
}

export type ConversacionControl = ReturnType<typeof useConversacion>;
