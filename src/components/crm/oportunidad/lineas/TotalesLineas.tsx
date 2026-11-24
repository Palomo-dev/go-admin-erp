'use client';

import { useTranslations } from 'next-intl';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { TotalesLineas as Totales } from '../lineasLogica';

/**
 * Totales de las líneas (Figma `TotalesLineas`): subtotal, impuestos de cada
 * producto y total en la moneda de la oportunidad, con la nota «COP ·
 * impuestos de cada producto».
 */
export function TotalesLineas({ totales, moneda }: { totales: Totales; moneda: ContextoMoneda }) {
  const t = useTranslations('crm.oportunidad.lineas.totales');
  return (
    <dl className="flex w-full flex-col gap-1.5 text-[13px] sm:max-w-[300px]">
      <div className="flex justify-between gap-3">
        <dt className="text-fg-secondary">{t('subtotal')}</dt>
        <dd className="tabular-nums text-fg">{formatMoneda(totales.subtotal, moneda)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-fg-secondary">{totales.tasaUnica !== null ? t('impuestosTasa', { tasa: totales.tasaUnica }) : t('impuestos')}</dt>
        <dd className="tabular-nums text-fg">{formatMoneda(totales.impuestos, moneda)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5">
        <dt className="font-medium text-fg">{t('total')}</dt>
        <dd className="text-lg font-semibold tabular-nums text-fg">{formatMoneda(totales.total, moneda)}</dd>
      </div>
      <p className="text-right text-xs text-fg-muted">{t('nota', { moneda: moneda.code })}</p>
    </dl>
  );
}
