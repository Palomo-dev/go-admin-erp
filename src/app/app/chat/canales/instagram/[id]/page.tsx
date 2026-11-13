'use client';

/** Detalle de un canal de Instagram (Figma 91-chat-22, mismo marco que WhatsApp). */
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import InstagramChannelService, { type InstagramChannel, type InstagramCredentials } from '@/lib/services/instagramChannelService';
import { PantallaCanalMeta } from '@/components/chat/channels/detalle/PantallaCanalMeta';
import { useCanalMeta, type ServicioCanalMeta } from '@/components/chat/channels/detalle/useCanalMeta';
import { CredencialesMeta, type CampoCredencial } from '@/components/chat/channels/detalle/CredencialesMeta';

const crearServicio = (organizationId: number) =>
  new InstagramChannelService(organizationId) as unknown as ServicioCanalMeta<InstagramChannel, InstagramCredentials['credentials']>;

export default function InstagramChannelPage() {
  const params = useParams();
  const channelId = params?.id as string;
  const t = useTranslations('chatModulo.canales.detalleCanal.credenciales.campos');
  const c = useCanalMeta(channelId, crearServicio);
  const cred = c.canal?.credentials ?? null;

  const campos = useMemo<CampoCredencial[]>(
    () => [
      { clave: 'instagram_business_account_id', etiqueta: t('instagramBusinessId') },
      { clave: 'page_id', etiqueta: t('paginaVinculada') },
      { clave: 'app_id', etiqueta: t('appId') },
      { clave: 'app_secret', etiqueta: t('appSecret'), secreto: true },
      { clave: 'access_token', etiqueta: t('accessToken'), secreto: true, ancho: 'completo', ayuda: t('tokenAyuda') },
      { clave: 'webhook_verify_token', etiqueta: t('verifyToken'), ancho: 'completo' },
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
        ruta: `/api/webhooks/instagram/${channelId}`,
        tokenVerificacion: cred?.credentials?.webhook_verify_token,
        campos: ['messages', 'messaging_seen', 'messaging_postbacks'],
      }}
      conexion={
        <CredencialesMeta
          campos={campos}
          valores={cred?.credentials as Record<string, string | undefined> | undefined}
          estado={cred ? { is_valid: cred.is_valid, last_validated_at: cred.last_validated_at } : null}
          guardando={c.guardando}
          validando={c.validando}
          onGuardar={(v) => c.guardarCredenciales(v as InstagramCredentials['credentials'])}
          onValidar={c.validar}
        />
      }
    />
  );
}
