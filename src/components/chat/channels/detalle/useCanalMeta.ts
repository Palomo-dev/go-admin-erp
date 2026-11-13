'use client';

/**
 * Carga y acciones del detalle de un canal de Meta. Los tres servicios
 * (`whatsappChannelService`, `instagramChannelService`,
 * `facebookChannelService`) tienen la misma forma; aquí solo se orquesta y se
 * avisa. El modo de IA se guarda con `chatChannelsService.updateAIMode`, el
 * mismo de la lista de Canales.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import ChatChannelsService, { type AIMode } from '@/lib/services/chatChannelsService';
import type { EstadisticasCanalMeta } from './PantallaCanalMeta';
import type { EventoCanal } from './EventosRecientesCanal';

export interface ServicioCanalMeta<C, Cred> {
  getChannel(id: string): Promise<C | null>;
  getRecentEvents(id: string): Promise<EventoCanal[]>;
  getStats(id: string): Promise<EstadisticasCanalMeta>;
  saveCredentials(id: string, credenciales: Cred): Promise<boolean>;
  validateWebhook(id: string): Promise<{ valid: boolean; message: string }>;
  updateChannel(id: string, cambios: { status: 'inactive' }): Promise<boolean>;
  activateChannel(id: string): Promise<boolean>;
}

const SIN_ESTADISTICAS: EstadisticasCanalMeta = { totalMessages: 0, sentToday: 0, deliveredRate: 0, failedCount: 0 };

export function useCanalMeta<C extends { status: string; ai_mode: AIMode }, Cred>(
  canalId: string,
  crearServicio: (organizationId: number) => ServicioCanalMeta<C, Cred>,
) {
  const t = useTranslations('chatModulo.canales.detalleCanal.toasts');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [canal, setCanal] = useState<C | null>(null);
  const [eventos, setEventos] = useState<EventoCanal[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasCanalMeta>(SIN_ESTADISTICAS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'noEncontrado' | 'error' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [guardandoModo, setGuardandoModo] = useState(false);

  // `crearServicio` es una función estable por página (definida fuera del componente).
  const recargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setError(null);
    try {
      const s = crearServicio(organizationId);
      const datos = await s.getChannel(canalId);
      if (!datos) {
        setCanal(null);
        setError('noEncontrado');
        return;
      }
      setCanal(datos);
      const [ev, st] = await Promise.all([s.getRecentEvents(canalId), s.getStats(canalId)]);
      setEventos(ev);
      setEstadisticas(st);
    } catch (e) {
      console.error('Error cargando el canal:', e);
      setError('error');
    } finally {
      setCargando(false);
    }
  }, [organizationId, canalId, crearServicio]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const guardarCredenciales = async (credenciales: Cred) => {
    if (!organizationId) return;
    setGuardando(true);
    try {
      const ok = await crearServicio(organizationId).saveCredentials(canalId, credenciales);
      if (!ok) throw new Error('saveCredentials devolvió false');
      toast({ title: t('credencialesGuardadas') });
      await recargar();
    } catch (e) {
      console.error('Error guardando credenciales:', e);
      toast({ title: t('errorCredenciales'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const validar = async () => {
    if (!organizationId) return;
    setValidando(true);
    try {
      const r = await crearServicio(organizationId).validateWebhook(canalId);
      toast({ title: t(r.valid ? 'conexionValida' : 'conexionInvalida'), description: r.message, variant: r.valid ? 'default' : 'destructive' });
      if (r.valid) await recargar();
    } catch (e) {
      console.error('Error validando la conexión:', e);
      toast({ title: t('errorValidar'), variant: 'destructive' });
    } finally {
      setValidando(false);
    }
  };

  const alternarActivo = async () => {
    if (!organizationId || !canal) return;
    try {
      const s = crearServicio(organizationId);
      if (canal.status === 'active') {
        await s.updateChannel(canalId, { status: 'inactive' });
        toast({ title: t('desactivado') });
      } else {
        await s.activateChannel(canalId);
        toast({ title: t('activado') });
      }
      await recargar();
    } catch (e) {
      console.error('Error cambiando el estado del canal:', e);
      toast({ title: t('errorEstado'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const cambiarModo = async (modo: AIMode) => {
    if (!organizationId || !canal) return;
    setGuardandoModo(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sin sesión');
      await new ChatChannelsService(organizationId).updateAIMode(canalId, modo, data.user.id);
      setCanal({ ...canal, ai_mode: modo });
      toast({ title: t('modoGuardado') });
    } catch (e) {
      console.error('Error guardando el modo de IA:', e);
      toast({ title: t('errorModo'), variant: 'destructive' });
    } finally {
      setGuardandoModo(false);
    }
  };

  return {
    organizationId,
    canal,
    eventos,
    estadisticas,
    cargando,
    error,
    guardando,
    validando,
    guardandoModo,
    recargar,
    guardarCredenciales,
    validar,
    alternarActivo,
    cambiarModo,
  };
}
