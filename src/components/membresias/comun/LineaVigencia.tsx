'use client';

import { useTranslations } from 'next-intl';
import type { MembresiaFila } from '@/lib/services/membresias/tipos';
import type { FormatoMembresias } from './useFormatoMembresias';

/** Rango «1 sep – 8 oct 2026» de una membresía, en la zona de la organización. */
export function rangoVigencia(m: Pick<MembresiaFila, 'desde' | 'hasta'>, f: FormatoMembresias): string {
  if (!m.desde) return f.fecha(m.hasta);
  return `${f.fechaCorta(m.desde)} – ${f.fecha(m.hasta)}`;
}

/** Segunda línea de la vigencia según el estado («Quedan 10 días», «Gracia hasta 30 sep»…). */
export function useLineaVigencia(f: FormatoMembresias): (m: MembresiaFila) => string {
  const t = useTranslations('membresias.comun.vigencia');
  return (m) => {
    switch (m.estadoVisual) {
      case 'activa':
        return t('quedan', { dias: m.dias ?? 0 });
      case 'en_gracia':
        return t('graciaHasta', { fecha: f.fechaCorta(m.graceUntil ?? m.hasta) });
      case 'congelada':
        return t('congelada');
      case 'pendiente_pago':
        return t('empiezaAlPagar');
      case 'por_activar':
        return t('porActivar');
      case 'vencida':
        return t('vencio', { fecha: f.fechaCorta(m.hasta) });
      default:
        return t('cancelada');
    }
  };
}
