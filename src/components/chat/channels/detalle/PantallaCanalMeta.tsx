'use client';

/**
 * Marco del detalle de un canal de Meta (WhatsApp, Instagram, Messenger;
 * Figma 91-chat-22/23): cabecera con «Chat › Canales», cifras del canal,
 * Conexión y Webhook a la izquierda, Ayuda de la IA y Eventos recientes a la
 * derecha. Cada página pone su tarjeta de conexión y su lógica de guardado.
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Power, RefreshCw } from 'lucide-react';
import { EmptyState, KpiStrip, RowActionsMenu, StatCard, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { AIMode, ChannelCredentials, ChannelType } from '@/lib/services/chatChannelsService';
import { CanalIcono, canalDeTipo } from '@/components/chat/ui/CanalIcono';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { estadoConexion, type EstadoConexion } from '../canalesLogica';
import { AyudaIaCanal } from './AyudaIaCanal';
import { EventosRecientesCanal, type EventoCanal } from './EventosRecientesCanal';
import { WebhookCanal, type WebhookCanalProps } from './WebhookCanal';

export interface CanalMetaVista {
  id: string;
  type: ChannelType;
  name: string;
  status: string;
  ai_mode: AIMode;
  credentials?: Pick<ChannelCredentials, 'is_valid'> | null;
}

export interface EstadisticasCanalMeta {
  totalMessages: number;
  sentToday: number;
  deliveredRate: number;
  failedCount: number;
}

export const TONO_CONEXION: Record<EstadoConexion, 'exito' | 'peligro' | 'advertencia' | 'neutro'> = {
  conectado: 'exito',
  tokenVencido: 'peligro',
  suspendido: 'peligro',
  sinConectar: 'advertencia',
  inactivo: 'neutro',
};

export interface PantallaCanalMetaProps {
  canal: CanalMetaVista | null;
  cargando: boolean;
  /** `noEncontrado`: el canal no es de la organización activa o no existe. */
  error: 'noEncontrado' | 'error' | null;
  estadisticas: EstadisticasCanalMeta;
  eventos: readonly EventoCanal[];
  conexion: ReactNode;
  webhook: WebhookCanalProps;
  onRefrescar: () => void;
  onAlternarActivo: () => void;
  onCambiarModo: (modo: AIMode) => void;
  guardandoModo: boolean;
}

export function PantallaCanalMeta({
  canal,
  cargando,
  error,
  estadisticas,
  eventos,
  conexion,
  webhook,
  onRefrescar,
  onAlternarActivo,
  onCambiarModo,
  guardandoModo,
}: PantallaCanalMetaProps) {
  const t = useTranslations('chatModulo.canales');
  const migas = [t('migas.chat'), t('migas.canales')];

  if (!canal) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
        {cargando ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-10 w-72" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : (
          <EmptyState
            variante={error === 'noEncontrado' ? 'forbidden' : 'error'}
            titulo={t(error === 'noEncontrado' ? 'detalleCanal.noEncontrado.titulo' : 'detalleCanal.error.titulo')}
            descripcion={t(error === 'noEncontrado' ? 'detalleCanal.noEncontrado.descripcion' : 'detalleCanal.error.descripcion')}
            accion={{ etiqueta: t('detalleCanal.verCanales'), href: '/app/chat/canales' }}
            onReintentar={error === 'error' ? onRefrescar : undefined}
          />
        )}
      </div>
    );
  }

  const estado = estadoConexion({ type: canal.type, status: canal.status as 'active', public_key: null, credentials: canal.credentials as ChannelCredentials | undefined });
  const activo = canal.status === 'active';
  const tasaFallos = estadisticas.totalMessages > 0 ? (estadisticas.failedCount / estadisticas.totalMessages) * 100 : 0;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <CabeceraDetalleChat
        titulo={canal.name}
        volverA="/app/chat/canales"
        migas={migas}
        subtituloMovil={t(`tipos.${canal.type}`)}
        icono={<CanalIcono canal={canalDeTipo(canal.type)} size={40} className="rounded-lg" />}
        badge={
          <Badge tono={TONO_CONEXION[estado]} tamano="sm">
            {t(`estados.${estado}`)}
          </Badge>
        }
        acciones={
          <>
            <button type="button" onClick={onRefrescar} disabled={cargando} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {t('detalleCanal.actualizar')}
            </button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={canal.name}
              acciones={[
                {
                  id: 'activo',
                  etiqueta: t(activo ? 'detalleCanal.desactivar' : 'detalleCanal.activar'),
                  icono: Power,
                  onSelect: onAlternarActivo,
                },
              ]}
            />
          </>
        }
      />

      <KpiStrip etiqueta={t('detalleCanal.kpis.etiqueta')}>
        <StatCard etiqueta={t('detalleCanal.kpis.mensajes')} valor={estadisticas.totalMessages.toLocaleString()} cargando={cargando} />
        <StatCard etiqueta={t('detalleCanal.kpis.enviadosHoy')} valor={estadisticas.sentToday.toLocaleString()} cargando={cargando} />
        <StatCard
          etiqueta={t('detalleCanal.kpis.fallidos')}
          valor={estadisticas.failedCount.toLocaleString()}
          detalle={estadisticas.failedCount > 0 ? t('detalleCanal.kpis.fallidosDetalle', { pct: tasaFallos.toFixed(1) }) : undefined}
          tono={estadisticas.failedCount > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={estadisticas.failedCount > 0 ? AlertTriangle : undefined}
          href={estadisticas.failedCount > 0 ? '#eventos-canal' : undefined}
          cargando={cargando}
        />
        <StatCard etiqueta={t('detalleCanal.kpis.entrega')} valor={`${estadisticas.deliveredRate.toLocaleString()} %`} cargando={cargando} />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          {conexion}
          <WebhookCanal {...webhook} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <AyudaIaCanal modo={canal.ai_mode} onCambiar={onCambiarModo} guardando={guardandoModo} />
          <EventosRecientesCanal id="eventos-canal" eventos={eventos} />
        </div>
      </div>
    </div>
  );
}
