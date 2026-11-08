'use client';

/**
 * Meta, TikTok y Google Ads por OAuth (diseño 85-40…44). Paso 1: qué se envía y qué no; el botón
 * «Iniciar sesión con …» pide la URL a la ruta EXISTENTE `POST /api/integrations/<p>/oauth/authorize`
 * (estado firmado + cookie de nonce) y redirige. El regreso llega a
 * `/app/integraciones/conexiones?<p>_success|<p>_error=…`, que muestra la página de Conexiones.
 * Si el servidor no tiene la app del proveedor configurada (500/503), se dice «en construcción».
 * Al volver con `conexionId` (Meta), los pasos «Activos» y «Qué se envía» (85-42/43) están en
 * `PasosMeta`.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { apiAsistentes } from './apiAsistentes';
import { ListaNumerada, MarcoAsistente } from './MarcoAsistente';
import { PasosMeta } from './PasosMeta';
import type { ProveedorOauth } from './pasosLogica';
import { useNombreServicio } from './useNombreServicio';

export interface AsistenteOauthProps {
  item: ItemCatalogo;
  abierto: boolean;
  onCerrar: () => void;
  /** Conexión que ya creó el OAuth: abre los pasos siguientes (solo Meta). */
  conexionId?: string;
  onConectado?: (conexionId: string | null) => void;
}

export function AsistenteOauth(props: AsistenteOauthProps) {
  const { item, conexionId } = props;
  const proveedor: ProveedorOauth = item.oauth ?? (item.id === 'tiktok' ? 'tiktok' : item.id === 'google_ads' ? 'google_ads' : 'meta');
  if (conexionId && proveedor === 'meta') {
    return (
      <PasosMeta
        item={item}
        conexionId={conexionId}
        abierto={props.abierto}
        onCerrar={props.onCerrar}
        onConectado={props.onConectado ?? (() => props.onCerrar())}
      />
    );
  }
  return <InicioOauth {...props} />;
}

function InicioOauth({ item, abierto, onCerrar }: AsistenteOauthProps) {
  const t = useTranslations('integracionesConexiones');
  const nombre = useNombreServicio(item);
  const proveedor: ProveedorOauth = item.oauth ?? (item.id === 'tiktok' ? 'tiktok' : item.id === 'google_ads' ? 'google_ads' : 'meta');
  const [estado, setEstado] = useState<'inicio' | 'redirigiendo' | 'sin_app' | 'error'>(item.estado === 'en_construccion' ? 'sin_app' : 'inicio');

  useEffect(() => {
    if (!abierto) setEstado(item.estado === 'en_construccion' ? 'sin_app' : 'inicio');
  }, [abierto, item.estado]);

  const iniciar = async () => {
    setEstado('redirigiendo');
    try {
      const r = await apiAsistentes.autorizarOauth(proveedor);
      if (r.tipo === 'redirigir') {
        window.location.assign(r.url);
        return;
      }
      setEstado(r.tipo === 'sin_app' ? 'sin_app' : 'error');
    } catch {
      setEstado('error');
    }
  };

  return (
    <MarcoAsistente
      abierto={abierto}
      onCerrar={onCerrar}
      servicioId={item.id}
      titulo={t('asistente.comun.titulo', { nombre })}
      subtitulo={t('asistente.oauth.subtitulo', { nombre })}
      botones={[
        { etiqueta: t('comun.cancelar'), onClick: onCerrar, deshabilitado: estado === 'redirigiendo' },
        {
          etiqueta: t('asistente.oauth.iniciarSesion', { nombre }),
          onClick: () => void iniciar(),
          cargando: estado === 'redirigiendo',
          deshabilitado: estado === 'sin_app',
          motivo: t('asistente.oauth.sinApp.titulo', { nombre }),
        },
      ]}
      ocupado={estado === 'redirigiendo'}
    >
      <p className="text-sm font-medium text-fg">{t('asistente.oauth.queSeEnvia')}</p>
      <ListaNumerada items={[1, 2, 3].map((n) => t(`asistente.oauth.envia.${proveedor}.p${n}`))} />
      <AvisoTonal tono="informacion" titulo={t('asistente.oauth.noSeEnvia.titulo')} descripcion={t('asistente.oauth.noSeEnvia.descripcion', { nombre })} />
      {estado === 'sin_app' && (
        <AvisoTonal tono="advertencia" rol="alert" titulo={t('asistente.oauth.sinApp.titulo', { nombre })} descripcion={t('asistente.oauth.sinApp.descripcion', { nombre })} />
      )}
      {estado === 'error' && <AvisoTonal tono="peligro" rol="alert" titulo={t('asistente.oauth.error')} />}
    </MarcoAsistente>
  );
}
