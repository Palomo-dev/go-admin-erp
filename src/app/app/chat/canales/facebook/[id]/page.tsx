'use client';

/** Detalle de un canal de Messenger (Figma 91-chat-22, mismo marco que WhatsApp). */
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import FacebookChannelService, { type FacebookChannel, type FacebookCredentials } from '@/lib/services/facebookChannelService';
import { PantallaCanalMeta } from '@/components/chat/channels/detalle/PantallaCanalMeta';
import { useCanalMeta, type ServicioCanalMeta } from '@/components/chat/channels/detalle/useCanalMeta';
import { CredencialesMeta, type CampoCredencial } from '@/components/chat/channels/detalle/CredencialesMeta';

const crearServicio = (organizationId: number) =>
  new FacebookChannelService(organizationId) as unknown as ServicioCanalMeta<FacebookChannel, FacebookCredentials['credentials']>;

export default function FacebookChannelPage() {
  const params = useParams();
  const channelId = params?.id as string;
  const t = useTranslations('chatModulo.canales.detalleCanal.credenciales.campos');
  const c = useCanalMeta(channelId, crearServicio);
  const cred = c.canal?.credentials ?? null;

  const campos = useMemo<CampoCredencial[]>(
    () => [
      { clave: 'page_id', etiqueta: t('paginaId') },
      { clave: 'app_id', etiqueta: t('appId') },
      { clave: 'page_access_token', etiqueta: t('pageAccessToken'), secreto: true, ancho: 'completo', ayuda: t('tokenAyuda') },
      { clave: 'app_secret', etiqueta: t('appSecret'), secreto: true },
      { clave: 'webhook_verify_token', etiqueta: t('verifyToken') },
    ],
    [t],
  );

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
        ruta: `/api/webhooks/facebook/${channelId}`,
        tokenVerificacion: cred?.credentials?.webhook_verify_token,
        campos: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'],
      }}
      conexion={
        <CredencialesMeta
          campos={campos}
          valores={cred?.credentials as Record<string, string | undefined> | undefined}
          estado={cred ? { is_valid: cred.is_valid, last_validated_at: cred.last_validated_at } : null}
          guardando={c.guardando}
          validando={c.validando}
          onGuardar={(v) => c.guardarCredenciales(v as FacebookCredentials['credentials'])}
          onValidar={c.validar}
        />
      }
    />
  );
}
