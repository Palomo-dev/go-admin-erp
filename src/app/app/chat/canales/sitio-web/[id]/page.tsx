'use client';

/**
 * Detalle del chat del sitio web (Figma 91-chat-24): «Mostrar en el sitio»,
 * activar o desactivar el canal, cifras de sesiones, Instalación, Apariencia
 * (esquina, márgenes, logo y estilo), Al abrir el chat, Datos del visitante y
 * la vista previa en vivo. Toda escritura pasa por `chatChannelsService` (y
 * `website_settings` para mostrar el chat en el sitio de GO Admin, como antes).
 * Los valores por defecto son los del widget público (`configuracionDelWidget`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Power } from 'lucide-react';
import { EmptyState, KpiStrip, RowActionsMenu, StatCard } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import ChatChannelsService, {
  type AIMode,
  type BrandConfig,
  type ChatChannel,
  type CollectIdentity,
  type WidgetBehavior,
  type WidgetPosition,
  type WidgetStats,
  type WidgetStyle,
} from '@/lib/services/chatChannelsService';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { CanalIcono } from '@/components/chat/ui/CanalIcono';
import { AlAbrirWidget, AparienciaWidget, DatosVisitanteWidget, InstalacionWidget } from '@/components/chat/channels/website/id/SeccionesWidget';
import { VistaPreviaWidget } from '@/components/chat/channels/website/id/VistaPreviaWidget';
import { configuracionDelWidget, porcentajeCelular } from '@/components/chat/channels/website/id/widgetLogica';
import { codigoDelWidget } from '@/lib/chat/codigoWidget';

export default function WebsiteChannelSettingsPage() {
  const params = useParams();
  const channelId = params?.id as string;
  const t = useTranslations('chatModulo.canales');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [canal, setCanal] = useState<ChatChannel | null>(null);
  const [stats, setStats] = useState<WidgetStats | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'noEncontrado' | 'error' | null>(null);
  const [enSitio, setEnSitio] = useState(false);
  const [cambiandoSitio, setCambiandoSitio] = useState(false);
  const [rotando, setRotando] = useState(false);
  const [guardandoModo, setGuardandoModo] = useState(false);
  const [cambiandoActivo, setCambiandoActivo] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setError(null);
    try {
      const s = new ChatChannelsService(organizationId);
      const [c, st] = await Promise.all([s.getChannel(channelId), s.getWidgetStats(channelId).catch(() => null)]);
      if (!c || c.type !== 'website') {
        setCanal(null);
        setError('noEncontrado');
        return;
      }
      setCanal(c);
      setStats(st);
      const { data } = await supabase.from('website_settings').select('chat_widget_enabled').eq('organization_id', organizationId).maybeSingle();
      setEnSitio(data?.chat_widget_enabled ?? false);
    } catch (e) {
      console.error('Error cargando el chat del sitio web:', e);
      setError('error');
    } finally {
      setCargando(false);
    }
  }, [organizationId, channelId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ajustes = canal?.website_settings;
  // Mismos valores por defecto que el widget público: guardar un campo no cambia los demás.
  const config: BrandConfig = useMemo(() => configuracionDelWidget(ajustes?.brand_config, ajustes?.welcome_message), [ajustes]);
  const datos: CollectIdentity = ajustes?.collect_identity ?? { name: true, email: true, phone: false };

  const conUsuario = async (accion: (s: ChatChannelsService, userId: string) => Promise<void>, error: string) => {
    if (!organizationId) return;
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sin sesión');
      await accion(new ChatChannelsService(organizationId), data.user.id);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      console.error(error, e);
      toast({ title: t('widget.toasts.error'), variant: 'destructive' });
      throw e;
    }
  };

  const actualizarAjustes = (parcial: Partial<NonNullable<ChatChannel['website_settings']>>) =>
    setCanal((c) => (c && c.website_settings ? { ...c, website_settings: { ...c.website_settings, ...parcial } } : c));

  const guardarConfig = (nueva: BrandConfig) =>
    conUsuario(async (s, u) => {
      await s.updateBrandConfig(channelId, nueva, u);
      actualizarAjustes({ brand_config: nueva });
    }, 'Error guardando la apariencia del widget:');

  const guardarPosicion = (position: WidgetPosition) => guardarConfig({ ...config, position });
  const guardarEstilo = (style: WidgetStyle) => guardarConfig({ ...config, style, primary_color: style.primaryColor });
  /** Logo de la cabecera del chat (`brand_config.logo_url`); vacío = el de la organización. */
  const guardarLogo = (url: string) => {
    const nueva: BrandConfig = { ...config, logo_url: url };
    if (!url) delete nueva.logo_url;
    return guardarConfig(nueva);
  };
  const guardarComportamiento = (behavior: WidgetBehavior) =>
    conUsuario(async (s, u) => {
      const nueva = { ...config, behavior };
      await s.updateBrandConfig(channelId, nueva, u);
      await s.updateWelcomeMessage(channelId, behavior.welcomeMessage, u);
      actualizarAjustes({ brand_config: nueva, welcome_message: behavior.welcomeMessage });
    }, 'Error guardando el comportamiento del widget:');
  const guardarDatos = (c: CollectIdentity) =>
    conUsuario(async (s, u) => {
      await s.updateCollectIdentity(channelId, c, u);
      actualizarAjustes({ collect_identity: c });
    }, 'Error guardando los datos del visitante:');

  const agregarDominio = (d: string) =>
    conUsuario(async (s, u) => {
      actualizarAjustes({ allowed_domains: await s.addAllowedDomain(channelId, d, u) });
    }, 'Error agregando dominio:');
  const quitarDominio = (d: string) =>
    conUsuario(async (s, u) => {
      actualizarAjustes({ allowed_domains: await s.removeAllowedDomain(channelId, d, u) });
    }, 'Error quitando dominio:').catch(() => undefined);

  const rotarClave = async () => {
    setRotando(true);
    try {
      await conUsuario(async (s, u) => {
        const clave = await s.rotatePublicKey(channelId, u);
        setCanal((c) => (c ? { ...c, public_key: clave } : c));
        // El sitio de GO Admin carga el chat con la clave guardada en `website_settings`:
        // sin esto, rotar la clave apagaba el chat del sitio propio hasta volver a activarlo.
        if (enSitio && organizationId) {
          const { error: e } = await supabase
            .from('website_settings')
            .update({ chat_widget_public_key: clave, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId);
          if (e) console.error('Error actualizando la clave del chat en el sitio:', e);
        }
      }, 'Error rotando la clave:');
      toast({ title: t('widget.toasts.claveRotada') });
    } catch {
      /* ya avisó */
    } finally {
      setRotando(false);
    }
  };

  const cambiarModo = async (modo: AIMode) => {
    setGuardandoModo(true);
    try {
      await conUsuario(async (s, u) => {
        await s.updateAIMode(channelId, modo, u);
        setCanal((c) => (c ? { ...c, ai_mode: modo } : c));
      }, 'Error guardando el modo de IA:');
    } catch {
      /* ya avisó */
    } finally {
      setGuardandoModo(false);
    }
  };

  const alternarActivo = async () => {
    if (!canal) return;
    setCambiandoActivo(true);
    try {
      await conUsuario(async (s, u) => {
        const r = await s.toggleChannelStatus(channelId, u);
        setCanal((c) => (c ? { ...c, status: r.status } : c));
        toast({ title: t(r.status === 'active' ? 'toasts.activado' : 'toasts.desactivado', { nombre: canal.name }) });
      }, 'Error cambiando el estado del canal:');
    } catch {
      /* ya avisó */
    } finally {
      setCambiandoActivo(false);
    }
  };

  const alternarEnSitio = async (activar: boolean) => {
    if (!organizationId || !canal) return;
    setCambiandoSitio(true);
    try {
      const { data, error: e } = await supabase
        .from('website_settings')
        .update({ chat_widget_enabled: activar, chat_widget_public_key: activar ? canal.public_key : null, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select('id');
      if (e) throw e;
      // Sin permiso de edición del sitio, RLS no devuelve error: actualiza 0 filas.
      if (!data || data.length === 0) throw new Error('website_settings sin filas actualizadas');
      setEnSitio(activar);
      toast({ title: t(activar ? 'widget.toasts.visible' : 'widget.toasts.oculto') });
    } catch (err) {
      console.error('Error actualizando website_settings:', err);
      toast({ title: t('widget.toasts.errorSitio'), variant: 'destructive' });
    } finally {
      setCambiandoSitio(false);
    }
  };

  if (!canal) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
        {cargando ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-24" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <EmptyState
            variante={error === 'noEncontrado' ? 'forbidden' : 'error'}
            titulo={t(error === 'noEncontrado' ? 'detalleCanal.noEncontrado.titulo' : 'detalleCanal.error.titulo')}
            descripcion={t(error === 'noEncontrado' ? 'detalleCanal.noEncontrado.descripcion' : 'detalleCanal.error.descripcion')}
            accion={{ etiqueta: t('detalleCanal.verCanales'), href: '/app/chat/canales' }}
            onReintentar={error === 'error' ? cargar : undefined}
          />
        )}
      </div>
    );
  }

  const pctCelular = stats ? porcentajeCelular(stats.deviceBreakdown) : null;
  const activo = canal.status === 'active';
  const codigo = codigoDelWidget(canal.public_key);

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <CabeceraDetalleChat
        titulo={canal.name}
        volverA="/app/chat/canales"
        migas={[t('migas.chat'), t('migas.canales')]}
        subtituloMovil={t('tipos.website')}
        icono={<CanalIcono canal="web" size={40} className="rounded-lg" />}
        badge={
          <Badge tono={enSitio && activo ? 'exito' : 'neutro'} tamano="sm">
            {t(enSitio && activo ? 'widget.visible' : 'widget.oculto')}
          </Badge>
        }
        subtitulo={!activo ? t('widget.activaPrimero') : undefined}
        acciones={
          <>
            <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
              {t('widget.mostrarEnSitio')}
              <Switch checked={enSitio} onCheckedChange={alternarEnSitio} disabled={cambiandoSitio || !activo} />
            </label>
            {guardado && (
              <Badge tono="exito" tamano="sm" role="status">
                {t('widget.guardado')}
              </Badge>
            )}
            <RowActionsMenu
              orientacion="horizontal"
              titulo={canal.name}
              acciones={[
                {
                  id: 'activo',
                  etiqueta: t(activo ? 'detalleCanal.desactivar' : 'detalleCanal.activar'),
                  icono: Power,
                  onSelect: alternarActivo,
                  deshabilitada: cambiandoActivo,
                },
              ]}
            />
          </>
        }
      />

      <KpiStrip etiqueta={t('widget.kpis.etiqueta')}>
        <StatCard etiqueta={t('widget.kpis.sesiones')} valor={(stats?.totalSessions ?? 0).toLocaleString()} cargando={cargando} />
        <StatCard etiqueta={t('widget.kpis.enLinea')} valor={(stats?.activeSessions ?? 0).toLocaleString()} cargando={cargando} />
        <StatCard etiqueta={t('widget.kpis.visitantes')} valor={(stats?.uniqueVisitors ?? 0).toLocaleString()} cargando={cargando} />
        <StatCard etiqueta={t('widget.kpis.celular')} valor={pctCelular === null ? t('kpis.sinDato') : `${pctCelular} %`} cargando={cargando} />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <InstalacionWidget
            codigo={codigo}
            clavePublica={canal.public_key ?? null}
            dominios={ajustes?.allowed_domains ?? []}
            rotando={rotando}
            onRotarClave={rotarClave}
            onAgregarDominio={agregarDominio}
            onQuitarDominio={quitarDominio}
          />
          <AparienciaWidget config={config} onGuardarPosicion={guardarPosicion} onGuardarEstilo={guardarEstilo} onGuardarLogo={guardarLogo} />
          <AlAbrirWidget comportamiento={config.behavior} onGuardar={guardarComportamiento} />
          <DatosVisitanteWidget datos={datos} modo={canal.ai_mode} onGuardarDatos={guardarDatos} onCambiarModo={cambiarModo} guardandoModo={guardandoModo} />
        </div>
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <VistaPreviaWidget config={config} datos={datos} logoOrganizacion={organization?.logo_url ?? null} />
        </div>
      </div>
    </div>
  );
}
