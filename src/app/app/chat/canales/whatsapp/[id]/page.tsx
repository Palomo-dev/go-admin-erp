'use client';

/** Detalle de un canal de WhatsApp (Figma 91-chat-22/23). */
import { useParams, useSearchParams } from 'next/navigation';
import WhatsAppChannelService, { type WhatsAppChannel, type WhatsAppCredentials } from '@/lib/services/whatsappChannelService';
import { PantallaCanalMeta } from '@/components/chat/channels/detalle/PantallaCanalMeta';
import { useCanalMeta, type ServicioCanalMeta } from '@/components/chat/channels/detalle/useCanalMeta';
import { pestanaConexionInicial } from '@/components/chat/channels/detalle/detalleLogica';
import { ConexionWhatsApp } from '@/components/chat/channels/whatsapp/id/ConexionWhatsApp';
import { useTranslations } from 'next-intl';

type ConMetodo = WhatsAppCredentials & { connection_method?: 'cloud_api' | 'coexistence' | 'qr_scan' };

const crearServicio = (organizationId: number) =>
  new WhatsAppChannelService(organizationId) as unknown as ServicioCanalMeta<WhatsAppChannel, WhatsAppCredentials['credentials']>;

export default function WhatsAppChannelPage() {
  const params = useParams();
  const busqueda = useSearchParams();
  const t = useTranslations('chatModulo.canales.detalleCanal.whatsapp');
  const channelId = params?.id as string;
  const c = useCanalMeta(channelId, crearServicio);
  const credenciales = (c.canal?.credentials ?? null) as ConMetodo | null;

  return (
    <PantallaCanalMeta
      canal={c.canal}
      cargando={c.cargando}
      error={c.error}
      estadisticas={c.estadisticas}
      eventos={c.eventos}
      onRefrescar={c.recargar}
      onAlternarActivo={c.alternarActivo}
      onCambiarModo={c.cambiarModo}
      guardandoModo={c.guardandoModo}
      webhook={{
        ruta: '/api/integrations/whatsapp/webhook',
        tokenVerificacion: credenciales?.credentials?.webhook_verify_token,
        campos: ['messages', 'message_template_status_update'],
        nota: t('webhookNota'),
      }}
      conexion={
        <ConexionWhatsApp
          pestanaInicial={pestanaConexionInicial(busqueda?.get('conexion') ?? null, credenciales?.connection_method)}
          credenciales={credenciales}
          organizationId={c.organizationId}
          channelId={channelId}
          guardando={c.guardando}
          validando={c.validando}
          onGuardar={c.guardarCredenciales}
          onValidar={c.validar}
          onConectado={c.recargar}
        />
      }
    />
  );
}
