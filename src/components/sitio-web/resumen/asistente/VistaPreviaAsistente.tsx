'use client';

/**
 * «Vista previa en vivo · móvil» del asistente (Figma A/03a-03f): el borrador
 * del sitio pintado por el propio sitio público (enlace privado de vista previa
 * de la API V2) dentro del marco de teléfono; en el paso 6 con el selector
 * Escritorio / Móvil. Lo que aún no está guardado (colores elegidos) se envía
 * en vivo con `ajustes` (mensaje `goadmin:settings` al origen del sitio).
 */
import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { SegmentedControl } from '@/components/kit';
import { DevicePreviewFrame } from '../../ui/DevicePreviewFrame';
import { SitePreview } from '../../ui/SitePreview';
import { VIEWPORT_DISPOSITIVO } from '../../ui/dispositivos';
import { useTextosResumen } from '../textos';

export interface VistaPreviaAsistenteProps {
  url: string | null;
  host: string | null;
  ajustes?: Record<string, unknown>;
  claveRecarga?: string | number;
  /** Paso 6: selector Escritorio / Móvil. */
  conSelector?: boolean;
}

export function VistaPreviaAsistente({ url, host, ajustes, claveRecarga, conSelector }: VistaPreviaAsistenteProps) {
  const t = useTextosResumen();
  const [dispositivo, setDispositivo] = useState<'celular' | 'escritorio'>('celular');
  const actual = conSelector ? dispositivo : 'celular';
  const { ancho } = VIEWPORT_DISPOSITIVO[actual];

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-xs font-medium text-fg-secondary">{t('asistente.vistaPrevia')}</p>
      {conSelector && (
        <SegmentedControl
          tamano="sm"
          valor={dispositivo}
          onValorChange={setDispositivo}
          etiqueta={t('asistente.vistaPrevia')}
          opciones={[
            { valor: 'escritorio', etiqueta: t('asistente.publicar.escritorio'), icono: Monitor },
            { valor: 'celular', etiqueta: t('asistente.publicar.movil'), icono: Smartphone },
          ]}
        />
      )}
      <DevicePreviewFrame dispositivo={actual} host={host} className={actual === 'celular' ? 'max-w-[300px]' : undefined}>
        <SitePreview
          url={url}
          anchoViewport={ancho}
          altoViewport={actual === 'celular' ? 780 : 900}
          ajustes={ajustes}
          claveRecarga={claveRecarga}
          interactivo
          textoVacio={t('asistente.vistaPreviaVacia')}
        />
      </DevicePreviewFrame>
    </div>
  );
}
