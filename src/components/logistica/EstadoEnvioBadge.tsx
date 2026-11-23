'use client';

/**
 * Insignia del estado de un envío (Figma «22 Logística», estados canónicos 2802:10982).
 *
 * Recibe el estado canónico (`transport_events.canonical_status`) o el interno
 * (`shipments.status`) y pinta SIEMPRE el canónico: un solo idioma de estados para el
 * domiciliario propio y las transportadoras. Tono y apariencia salen de `INSIGNIA_ESTADO`
 * (estadoEnvioUi.ts); el texto, de `logistica.envio.estados.*` en los 4 idiomas.
 */
import { useTranslations } from 'next-intl';
import { Badge, type TamanoBadge } from '@/components/ui/badge';
import { estadoParaInsignia, INSIGNIA_ESTADO } from '@/lib/logistica/estadoEnvioUi';

export interface EstadoEnvioBadgeProps {
  estado: string | null | undefined;
  /** Texto que reemplaza la etiqueta (p. ej. «Cliente ausente · 2.º intento»). */
  etiqueta?: string;
  tamano?: TamanoBadge;
  className?: string;
}

export function EstadoEnvioBadge({ estado, etiqueta, tamano = 'sm', className }: EstadoEnvioBadgeProps) {
  const t = useTranslations('logistica.envio.estados');
  const canonico = estadoParaInsignia(estado);
  const { tono, apariencia } = INSIGNIA_ESTADO[canonico];
  return (
    <Badge tono={tono} apariencia={apariencia} tamano={tamano} className={className} data-estado={canonico}>
      {etiqueta ?? t(canonico)}
    </Badge>
  );
}
