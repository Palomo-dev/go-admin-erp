'use client';

/**
 * Canales del Chat (Figma 91-chat-20/21): cifras, «Mis canales» con modo de
 * IA y Activo editables, aviso de canales con token vencido o suspendidos, y
 * «Conectar otro canal». Toda escritura pasa por `chatChannelsService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquare, Plus } from 'lucide-react';
import { AvisoTonal, KpiStrip, PageHeader, StatCard, clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import ChatChannelsService, { type AIMode, type ActividadCanales, type ChatChannel } from '@/lib/services/chatChannelsService';
import { TablaCanales } from '@/components/chat/channels/TablaCanales';
import { TarjetaCanal } from '@/components/chat/channels/TarjetaCanal';
import { DialogoNuevoCanal, type NuevoCanal } from '@/components/chat/channels/DialogoNuevoCanal';
import { canalDeTipo } from '@/components/chat/ui/CanalIcono';
import {
  canalesConError,
  duracionCorta,
  estadoConexion,
  rutaDetalleCanal,
  tarjetasConectar,
  type TipoDisponible,
} from '@/components/chat/channels/canalesLogica';

export default function CanalesPage() {
  const t = useTranslations('chatModulo.canales');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { getToday, toInstant } = useFormatDate();

  const [canales, setCanales] = useState<ChatChannel[]>([]);
  const [actividad, setActividad] = useState<ActividadCanales | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<{ abierto: boolean; tipo: TipoDisponible | null }>({ abierto: false, tipo: null });

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setFallo(false);
    try {
      const servicio = new ChatChannelsService(organizationId);
      const lista = await servicio.getChannels();
      setCanales(lista);
      // Las cifras son secundarias: si fallan, la tabla igual se muestra.
      servicio
        .getActividadCanales(lista.map((c) => c.id), toInstant(getToday()))
        .then(setActividad)
        .catch((e) => console.error('Error cargando actividad de canales:', e));
    } catch (e) {
      console.error('Error cargando canales:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId, getToday, toInstant]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conUsuario = async <T,>(id: string, accion: (s: ChatChannelsService, userId: string) => Promise<T>): Promise<T | null> => {
    if (!organizationId) return null;
    setGuardando((g) => new Set(g).add(id));
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sin sesión');
      return await accion(new ChatChannelsService(organizationId), data.user.id);
    } catch (e) {
      console.error('Error guardando canal:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
      return null;
    } finally {
      setGuardando((g) => {
        const n = new Set(g);
        n.delete(id);
        return n;
      });
    }
  };

  const reemplazar = (actualizado: ChatChannel) =>
    // `updateChannel` devuelve la fila sin credenciales ni ajustes del widget: se conservan.
    setCanales((prev) => prev.map((c) => (c.id === actualizado.id ? { ...c, ...actualizado, credentials: c.credentials, website_settings: c.website_settings } : c)));

  const alternarActivo = async (canal: ChatChannel) => {
    const r = await conUsuario(canal.id, (s, u) => s.toggleChannelStatus(canal.id, u));
    if (!r) return;
    reemplazar(r);
    toast({ title: t(r.status === 'active' ? 'toasts.activado' : 'toasts.desactivado', { nombre: canal.name }) });
  };

  const cambiarModo = async (canal: ChatChannel, modo: AIMode) => {
    if (modo === canal.ai_mode) return;
    const r = await conUsuario(canal.id, (s, u) => s.updateAIMode(canal.id, modo, u));
    if (!r) return;
    reemplazar(r);
    toast({ title: t('toasts.modoIa', { nombre: canal.name, modo: t(`modosTitulo.${modo}`) }) });
  };

  const configurar = (canal: ChatChannel) => {
    const ruta = rutaDetalleCanal(canal);
    if (ruta) router.push(ruta);
  };

  const crear = async (datos: NuevoCanal) => {
    if (!organizationId) return;
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sin sesión');
      const nuevo = await new ChatChannelsService(organizationId).createChannel(
        { type: datos.tipo, name: datos.nombre, ai_mode: datos.modo },
        data.user.id,
      );
      toast({ title: t('nuevo.creado') });
      const ruta = rutaDetalleCanal(nuevo, datos.tipo === 'whatsapp' ? datos.forma : undefined);
      if (ruta) router.push(ruta);
      else cargar();
    } catch (e) {
      console.error('Error creando canal:', e);
      toast({ title: t('nuevo.errorCrear'), variant: 'destructive' });
      throw e;
    }
  };

  const conectados = canales.filter((c) => estadoConexion(c) === 'conectado').length;
  const abiertas = actividad ? Object.values(actividad.porCanal).reduce((a, b) => a + b.abiertas, 0) : null;
  const conError = useMemo(() => canalesConError(canales), [canales]);
  const tarjetas = useMemo(() => tarjetasConectar(canales), [canales]);
  const sinDato = t('kpis.sinDato');

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={MessageSquare}
        cargando={cargando}
        acciones={
          <button type="button" className={clasesBoton()} onClick={() => setDialogo({ abierto: true, tipo: null })}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('nuevoCanal')}
          </button>
        }
        movil={{
          accion: (
            <button type="button" aria-label={t('nuevoCanal')} onClick={() => setDialogo({ abierto: true, tipo: null })}>
              <Plus className="size-5" />
            </button>
          ),
        }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.conectados')}
          valor={cargando ? sinDato : conectados}
          detalle={t('kpis.conectadosDetalle', { total: canales.length })}
          cargando={cargando}
        />
        <StatCard etiqueta={t('kpis.hoy')} valor={actividad?.conversacionesHoy ?? sinDato} cargando={!actividad && !fallo} />
        <StatCard etiqueta={t('kpis.abiertas')} valor={abiertas ?? sinDato} detalle={t('kpis.abiertasDetalle')} cargando={!actividad && !fallo} />
        <StatCard
          etiqueta={t('kpis.primeraRespuesta')}
          valor={duracionCorta(actividad?.primeraRespuestaSeg) ?? sinDato}
          detalle={t('kpis.primeraRespuestaDetalle')}
          cargando={!actividad && !fallo}
        />
      </KpiStrip>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">{t('misCanales')}</h2>
        <TablaCanales
          canales={canales}
          actividad={actividad?.porCanal ?? {}}
          estado={fallo ? 'error' : cargando ? 'cargando' : 'listo'}
          guardando={guardando}
          onCambiarModo={cambiarModo}
          onAlternarActivo={alternarActivo}
          onConfigurar={configurar}
          onReintentar={cargar}
          onNuevo={() => setDialogo({ abierto: true, tipo: null })}
        />
        {conError.map((c) => (
          <AvisoTonal
            key={c.id}
            tono="peligro"
            rol="alert"
            compacto
            titulo={t(estadoConexion(c) === 'suspendido' ? 'aviso.suspendido' : 'aviso.tokenVencido', { nombre: c.name })}
            accion={{ etiqueta: t('aviso.reconectar'), onClick: () => configurar(c) }}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">{t('conectar.titulo')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tarjetas.map(({ tipo, yaTiene, proximamente }) => {
            const clave = yaTiene ? `${tipo}Otro` : tipo;
            return (
              <TarjetaCanal
                key={tipo}
                canal={canalDeTipo(tipo)}
                titulo={t(`conectar.nombres.${clave}` as 'conectar.nombres.whatsapp')}
                descripcion={t(`conectar.descripciones.${clave}` as 'conectar.descripciones.whatsapp')}
                estado={proximamente ? 'proximamente' : 'disponible'}
                etiquetaEstado={t(proximamente ? 'conectar.proximamente' : 'conectar.disponible')}
                accion={{
                  etiqueta: t(proximamente ? 'conectar.proximamente' : 'conectar.conectar'),
                  onClick: proximamente ? undefined : () => setDialogo({ abierto: true, tipo: tipo as TipoDisponible }),
                }}
              />
            );
          })}
        </div>
      </section>

      <DialogoNuevoCanal
        abierto={dialogo.abierto}
        tipoInicial={dialogo.tipo}
        onAbiertoChange={(abierto) => setDialogo((d) => ({ ...d, abierto }))}
        onCrear={crear}
      />
    </div>
  );
}
