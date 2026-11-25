'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, MessageSquare, Phone, Repeat, SquareCheck, type LucideIcon } from 'lucide-react';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import type { AccionSalud, MotivoSalud } from './saludLogica';

export const ICONO_ACCION: Record<AccionSalud, LucideIcon> = { cobro: MessageSquare, llamar: Phone, secuencia: Repeat, visita: CalendarDays, tarea: SquareCheck };

/** Primera letra en mayúscula (los motivos se unen con « · » en minúscula). */
export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase() + texto.slice(1) : texto;
}

/**
 * Textos derivados de un resultado de salud: «Por qué» (los factores que más
 * restan, con su valor real de `fn_customer_health`) y la acción sugerida.
 */
export function useTextosSalud() {
  const t = useTranslations('crm.redSalud');
  const { formatear } = useMonedaOrganizacion();

  const textoMotivo = useCallback(
    (m: MotivoSalud, r: Pick<HealthScoreResult, 'raw'>): string => {
      const raw = r.raw;
      switch (m.factor) {
        case 'compras':
          return raw?.days_since_last_invoice == null ? t('motivo.comprasNunca') : t('motivo.compras', { dias: raw.days_since_last_invoice });
        case 'actividad':
          return raw?.days_since_last_activity == null ? t('motivo.actividadNunca') : t('motivo.actividad', { dias: raw.days_since_last_activity });
        case 'cartera':
          return t('motivo.cartera', { importe: formatear(Number(raw?.overdue_balance) || 0) });
        case 'frecuencia':
          return t('motivo.frecuencia', { n: Number(raw?.invoices_12m) || 0 });
        case 'ingresos':
        default:
          return t('motivo.ingresos', { importe: formatear(Number(raw?.revenue_12m) || 0) });
      }
    },
    [t, formatear],
  );

  const textoMotivos = useCallback(
    (motivos: readonly MotivoSalud[], r: Pick<HealthScoreResult, 'raw'>): string =>
      motivos.length === 0 ? t('motivo.ninguno') : capitalizar(motivos.map((m) => textoMotivo(m, r)).join(' · ')),
    [t, textoMotivo],
  );

  return { t, formatear, textoMotivos };
}
