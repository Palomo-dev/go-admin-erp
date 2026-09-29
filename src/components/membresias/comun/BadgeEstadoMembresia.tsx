'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { EstadoVisual } from '@/lib/services/membresias/tipos';
import { tonoEstadoMembresia } from '../logica';

export interface BadgeEstadoMembresiaProps {
  estado: EstadoVisual;
  /** Días de gracia que quedan (solo «en gracia»). */
  dias?: number | null;
  tamano?: 'sm' | 'md';
  className?: string;
}

/**
 * Estado de una membresía con el tono de SISTEMA-BADGES (§4): Pendiente de pago y En gracia
 * advertencia, Activa éxito, Congelada y Por activar información, Vencida peligro, Cancelada
 * neutro; siempre suave. El texto sale de `membresias.estados` (en gracia lleva los días).
 */
export function BadgeEstadoMembresia({ estado, dias, tamano = 'sm', className }: BadgeEstadoMembresiaProps) {
  const t = useTranslations('membresias.estados');
  return (
    <Badge tono={tonoEstadoMembresia(estado)} apariencia="suave" tamano={tamano} className={className}>
      {t(estado, { dias: dias ?? 0 })}
    </Badge>
  );
}
