'use client';

/**
 * «Conexión» del detalle de WhatsApp (Figma 91-chat-22/23): pestañas Cloud API
 * (recomendado) · Coexistencia · Código QR. La pestaña inicial sale de
 * `?conexion=` (al venir de «Nuevo canal») o de la forma guardada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, Save, ShieldCheck } from 'lucide-react';
import { AvisoTonal, FormField, TabBar, Tarjeta, clasesBoton, idPanel } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { WhatsAppCredentials } from '@/lib/services/whatsappChannelService';
import type { FormaConexion } from '../../canalesLogica';
import { enmascarar } from '../../detalle/detalleLogica';
import { PanelQrWhatsApp } from './PanelQrWhatsApp';
import { useRegistroMetaWhatsApp } from './useRegistroMetaWhatsApp';

type Credenciales = WhatsAppCredentials['credentials'];

export interface ConexionWhatsAppProps {
  pestanaInicial: FormaConexion;
  credenciales: WhatsAppCredentials | null;
  organizationId?: number;
  channelId: string;
  guardando: boolean;
  validando: boolean;
  onGuardar: (c: Credenciales) => Promise<void>;
  onValidar: () => Promise<void>;
  onConectado: () => void;
}

export function ConexionWhatsApp({ pestanaInicial, credenciales, organizationId, channelId, guardando, validando, onGuardar, onValidar, onConectado }: ConexionWhatsAppProps) {
  const t = useTranslations('chatModulo.canales.detalleCanal.whatsapp');
  const [pestana, setPestana] = useState<FormaConexion>(pestanaInicial);
  useEffect(() => setPestana(pestanaInicial), [pestanaInicial]);

  return (
    <Tarjeta titulo={t('conexion.titulo')} descripcion={t('conexion.descripcion')}>
      <div className="flex flex-col gap-4">
        <TabBar<FormaConexion>
          id="conexion-wa"
          etiqueta={t('conexion.titulo')}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={[
            { valor: 'cloud_api', etiqueta: t('pestanas.cloud_api') },
            { valor: 'coexistence', etiqueta: t('pestanas.coexistence') },
            { valor: 'qr_scan', etiqueta: t('pestanas.qr_scan') },
          ]}
        />
        <div role="tabpanel" id={idPanel('conexion-wa', pestana)}>
          {pestana === 'cloud_api' && (
            <PanelCloudApi
              credenciales={credenciales}
              organizationId={organizationId}
              channelId={channelId}
              guardando={guardando}
              validando={validando}
              onGuardar={onGuardar}
              onValidar={onValidar}
              onConectado={onConectado}
            />
          )}
          {pestana === 'coexistence' && <PanelCoexistencia />}
          {pestana === 'qr_scan' && <PanelQrWhatsApp channelId={channelId} />}
        </div>
      </div>
    </Tarjeta>
  );
}

function PanelCloudApi({
  credenciales,
  organizationId,
  channelId,
  guardando,
  validando,
  onGuardar,
  onValidar,
  onConectado,
}: Omit<ConexionWhatsAppProps, 'pestanaInicial'>) {
  const t = useTranslations('chatModulo.canales.detalleCanal.whatsapp');
  const { formatDate } = useFormatDate();
  const registro = useRegistroMetaWhatsApp({ organizationId, channelId, onListo: onConectado });
  const tiene = !!credenciales?.credentials?.phone_number_id;
  const [manual, setManual] = useState(false);
  const [verToken, setVerToken] = useState(false);
  const [datos, setDatos] = useState<Credenciales>({});

  useEffect(() => {
    const c = credenciales?.credentials ?? {};
    setDatos({
      phone_number_id: c.phone_number_id ?? '',
      business_account_id: c.business_account_id ?? '',
      access_token: c.access_token ?? '',
      webhook_verify_token: c.webhook_verify_token ?? '',
    });
  }, [credenciales]);

  useEffect(() => {
    if (registro.error?.tipo === 'requiereHttps') setManual(true);
  }, [registro.error]);

  const campo = (k: keyof Credenciales) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      {credenciales && tiene && (
        <AvisoTonal
          tono={credenciales.is_valid ? 'exito' : 'peligro'}
          compacto
          titulo={
            credenciales.is_valid
              ? credenciales.last_validated_at
                ? t('cloud.verificadoEl', { fecha: formatDate(credenciales.last_validated_at) })
                : t('cloud.verificado')
              : t('cloud.invalido')
          }
        />
      )}
      {registro.exito && <AvisoTonal tono="exito" compacto titulo={t('cloud.conectadoAhora')} />}
      {registro.error && (
        <AvisoTonal tono="peligro" compacto titulo={t(`cloud.errores.${registro.error.tipo}`)} descripcion={registro.error.detalle} />
      )}

      {!tiene && !manual ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-subtle p-5 text-center">
          <ShieldCheck aria-hidden="true" className="size-8 text-success-text" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-fg">{t('cloud.unClic')}</p>
          <p className="max-w-md text-[13px] text-fg-secondary">{t('cloud.unClicDescripcion')}</p>
          <button type="button" onClick={registro.conectar} disabled={registro.conectando} className={clasesBoton()}>
            {registro.conectando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {registro.conectando ? t('cloud.conectando') : t('cloud.conectarMeta')}
          </button>
          <button type="button" onClick={() => setManual(true)} className="text-xs text-fg-secondary underline hover:text-fg">
            {t('cloud.manual')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField etiqueta={t('cloud.phoneNumberId')}>
              <Input value={datos.phone_number_id ?? ''} onChange={campo('phone_number_id')} inputMode="numeric" className="font-mono" />
            </FormField>
            <FormField etiqueta={t('cloud.waba')}>
              <Input value={datos.business_account_id ?? ''} onChange={campo('business_account_id')} inputMode="numeric" className="font-mono" />
            </FormField>
          </div>
          <FormField etiqueta={t('cloud.token')} ayuda={t('cloud.tokenAyuda')}>
            <Input
              value={verToken ? (datos.access_token ?? '') : enmascarar(datos.access_token)}
              readOnly={!verToken}
              onChange={campo('access_token')}
              className="font-mono"
              placeholder={t('cloud.tokenPlaceholder')}
              onFocus={() => !datos.access_token && setVerToken(true)}
            />
          </FormField>
          <FormField etiqueta={t('cloud.verifyToken')} ayuda={t('cloud.verifyTokenAyuda')}>
            <Input value={datos.webhook_verify_token ?? ''} onChange={campo('webhook_verify_token')} className="font-mono" />
          </FormField>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onGuardar(datos)} disabled={guardando} className={clasesBoton({ tamano: 'sm' })}>
              {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {t('cloud.guardar')}
            </button>
            <button type="button" onClick={onValidar} disabled={validando || !credenciales} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {validando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {t('cloud.verificar')}
            </button>
            <button type="button" onClick={registro.conectar} disabled={registro.conectando} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('cloud.reconectar')}
            </button>
            <button type="button" onClick={() => setVerToken((v) => !v)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {verToken ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {verToken ? t('cloud.ocultarToken') : t('cloud.verToken')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PanelCoexistencia() {
  const t = useTranslations('chatModulo.canales.detalleCanal.whatsapp.coexistencia');
  const pasos = ['paso1', 'paso2', 'paso3', 'paso4', 'paso5'] as const;
  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="informacion" compacto titulo={t('aviso')} />
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-fg">{t('requisitosTitulo')}</p>
        <ul className="list-inside list-disc text-[13px] leading-6 text-fg-secondary">
          <li>{t('requisito1')}</li>
          <li>{t('requisito2')}</li>
          <li>{t('requisito3')}</li>
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-fg">{t('pasosTitulo')}</p>
        <ol className="list-inside list-decimal text-[13px] leading-6 text-fg-secondary">
          {pasos.map((p) => (
            <li key={p}>{t(p)}</li>
          ))}
        </ol>
      </div>
      <a
        href="https://business.facebook.com/wa-manager/"
        target="_blank"
        rel="noopener noreferrer"
        className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}
      >
        <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('abrirManager')}
      </a>
    </div>
  );
}
