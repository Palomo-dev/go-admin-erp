'use client';

/**
 * «Webhook» de un canal de Meta (Figma 91-chat-22): URL a la que Meta envía
 * los mensajes y token de verificación. El token se muestra con «Ver»
 * (decisión del dueño: credenciales visibles, sin cifrar por ahora).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Eye, EyeOff, Link2 } from 'lucide-react';
import { FormField, Tarjeta, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { enmascarar } from './detalleLogica';

export interface WebhookCanalProps {
  /** Ruta del webhook en esta app (`/api/integrations/whatsapp/webhook`). */
  ruta: string;
  tokenVerificacion?: string | null;
  /** Campos que hay que suscribir en Meta. */
  campos: readonly string[];
  /** Nota propia del proveedor (p. ej. cómo identifica Meta cada canal). */
  nota?: string;
}

export function WebhookCanal({ ruta, tokenVerificacion, campos, nota }: WebhookCanalProps) {
  const t = useTranslations('chatModulo.canales.detalleCanal.webhook');
  const [copiado, setCopiado] = useState(false);
  const [verToken, setVerToken] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}${ruta}` : ruta;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el navegador no dejó copiar: la URL está a la vista */
    }
  };

  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion')}>
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('url')}>
          <Input value={url} readOnly className="font-mono text-[13px]" />
        </FormField>
        <FormField etiqueta={t('token')} ayuda={tokenVerificacion ? undefined : t('sinToken')}>
          <Input
            value={tokenVerificacion ? (verToken ? tokenVerificacion : enmascarar(tokenVerificacion)) : ''}
            readOnly
            className="font-mono text-[13px]"
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-secondary">{t('campos')}</span>
          {campos.map((c) => (
            <Badge key={c} tono="neutro" tamano="sm" className="font-mono">
              {c}
            </Badge>
          ))}
        </div>
        {nota && <p className="text-xs text-fg-muted">{nota}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copiar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {copiado ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {copiado ? t('copiada') : t('copiarUrl')}
          </button>
          {tokenVerificacion && (
            <button type="button" onClick={() => setVerToken((v) => !v)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {verToken ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {verToken ? t('ocultarToken') : t('verToken')}
            </button>
          )}
          <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Link2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('abrirMeta')}
          </a>
        </div>
      </div>
    </Tarjeta>
  );
}
