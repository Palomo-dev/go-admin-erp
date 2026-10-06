'use client';

/**
 * «Vista previa en vivo · Inicio» de Diseño (Figma A/06a, derecha): el borrador
 * pintado por el propio sitio (SitePreview + DevicePreviewFrame) a 1440, 1024 o
 * 390, con el estilo en edición aplicado al instante (`goadmin:settings`) antes
 * de guardarse. Los colores del cliente solo existen dentro del iframe.
 */
import { useState } from 'react';
import { cn } from '@/utils/Utils';
import { DevicePreviewFrame } from '../ui/DevicePreviewFrame';
import { SitePreview } from '../ui/SitePreview';
import { VIEWPORT_DISPOSITIVO, type DispositivoVista } from '../ui/dispositivos';
import { SelectorAnchoVista } from '../ui/SelectorAnchoVista';
import { ajustesVivosDeEstilo, type TokensEstilo } from '@/lib/website/v2/tokensEstilo';
import { useTextosDiseno } from './textos';

export interface VistaPreviaEnVivoProps {
  url: string | null;
  host: string | null;
  estilo: TokensEstilo | null;
  /** La URL es el sitio publicado (no se pudo abrir el borrador). */
  esPublicado?: boolean;
  /** Dispositivo inicial (390 en la hoja móvil). */
  dispositivoInicial?: DispositivoVista;
  /** Sin título ni selector (hoja móvil). */
  sinCabecera?: boolean;
  className?: string;
}

export function VistaPreviaEnVivo({ url, host, estilo, esPublicado, dispositivoInicial = 'escritorio', sinCabecera, className }: VistaPreviaEnVivoProps) {
  const t = useTextosDiseno();
  const [dispositivo, setDispositivo] = useState<DispositivoVista>(dispositivoInicial);
  const { ancho, alto } = VIEWPORT_DISPOSITIVO[dispositivo];

  return (
    <section aria-label={t('vista.titulo')} className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>
      {!sinCabecera && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold leading-5 text-fg">{t('vista.titulo')}</h2>
          <SelectorAnchoVista etiqueta={t('vista.anchos')} valor={dispositivo} onValorChange={setDispositivo} />
        </header>
      )}
      {esPublicado && url && <p className="text-xs leading-4 text-fg-secondary">{t('vista.publicado')}</p>}
      <DevicePreviewFrame dispositivo={dispositivo} host={host}>
        <SitePreview
          url={url}
          anchoViewport={ancho}
          altoViewport={alto}
          ajustes={estilo ? ajustesVivosDeEstilo(estilo) : undefined}
          interactivo
          titulo={t('vista.iframe')}
          textoVacio={t('vista.sinDireccion')}
        />
      </DevicePreviewFrame>
    </section>
  );
}
