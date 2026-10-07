'use client';

/**
 * Etiquetas de cuotas en el idioma activo (`org.acceso.miembros.cuotas`).
 * `quotaProgress.ts` y `quotaForm.ts` conservan el español canónico porque los
 * comparten el servidor y los tests; la pantalla lee de aquí.
 */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { QuotaPeriod, QuotaStatus, QuotaType } from '@/lib/services/crm/quotaProgress';
import type { QuotaFormError } from './quotaForm';

export function useTextosCuota() {
  const t = useTranslations('org.acceso.miembros.cuotas');
  const tipo = useCallback((x: QuotaType | string) => (t.has(`tipos.${x}`) ? t(`tipos.${x}`) : x), [t]);
  const periodo = useCallback((p: QuotaPeriod) => t(`periodos.${p}`), [t]);
  const estado = useCallback((s: QuotaStatus) => t(`estados.${s}`), [t]);
  /** «Septiembre 2026», «3.er trimestre 2026», «Año 2026» (días calendario, sin `Date`). */
  const etiquetaPeriodo = useCallback(
    (period: string, periodStart: string, periodEnd: string) => {
      const [anio, mes] = periodStart.split('-').map(Number);
      if (period === 'monthly') return t('periodoMes', { mes: t(`meses.m${mes}`), anio });
      if (period === 'quarterly') return t('periodoTrimestre', { q: Math.floor((mes - 1) / 3) + 1, anio });
      if (period === 'yearly') return t('periodoAnio', { anio });
      return `${periodStart} – ${periodEnd}`;
    },
    [t],
  );
  const error = useCallback((e: QuotaFormError | undefined) => (e ? (e.codigo ? t(`errores.${e.codigo}`) : e.message) : undefined), [t]);
  return useMemo(() => ({ t, tipo, periodo, estado, etiquetaPeriodo, error }), [t, tipo, periodo, estado, etiquetaPeriodo, error]);
}
