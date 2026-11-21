'use client';

/**
 * Cifras de Comisiones (Figma 1012:87993): devengado, por pagar, pagado y
 * vendedores. SOLO en la moneda base; las demás monedas se listan aparte,
 * nunca sumadas (ronda 2: 18 COP + 1 USD no es un «devengado»). Si la carga
 * falló y no hay datos (`unavailable`), «—» en vez de $0.
 */

import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { StatCard } from '@/components/kit';
import type { CurrencySummary } from '@/lib/services/crm/commissionTransitions';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';

interface Props {
  summary: CurrencySummary;
  /** Otras monedas del mismo filtro, cada una con su resumen. */
  others?: CurrencySummary[];
  currency: string;
  /** Vendedores con comisiones en la lista. */
  vendedores: number;
  /** La pestaña es «Por pagar»: los vendedores son los que tienen comisiones abiertas. */
  soloPendientes: boolean;
  loading: boolean;
  /** La última carga falló y no hay datos previos: no se muestran ceros que mientan. */
  unavailable?: boolean;
}

export function ComisionesSummary({ summary, others = [], currency, vendedores, soloPendientes, loading, unavailable = false }: Props) {
  const t = useTranslations('finanzasComisiones.cifras');
  const { paraDocumento } = useMonedaOrganizacion();
  const fmt = (valor: number, moneda?: string | null) => (unavailable ? '—' : formatMoneda(valor, paraDocumento(moneda || currency)));
  const detalle = (texto: string) => (unavailable ? t('noDisponible') : texto);

  return (
    <section aria-label={t('etiqueta')} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          etiqueta={t('devengado')}
          valor={fmt(summary.accrued_total)}
          detalle={detalle(t('devengadoDetalle', { count: summary.count_pending + summary.count_paid }))}
          cargando={loading}
        />
        <StatCard
          etiqueta={t('porPagar')}
          valor={fmt(summary.pending_total)}
          detalle={detalle(t('porPagarDetalle', { count: summary.count_pending }))}
          tono={!unavailable && summary.count_pending > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={!unavailable && summary.count_pending > 0 ? TriangleAlert : undefined}
          cargando={loading}
        />
        <StatCard
          etiqueta={t('pagado')}
          valor={fmt(summary.paid_total)}
          detalle={detalle(summary.count_paid === 0 ? t('sinPagos') : t('pagadoDetalle', { count: summary.count_paid }))}
          cargando={loading}
        />
        <StatCard
          etiqueta={t('vendedores')}
          valor={unavailable ? '—' : String(vendedores)}
          detalle={detalle(soloPendientes ? t('vendedoresAbiertas') : t('vendedoresLista'))}
          cargando={loading}
        />
      </div>
      {!loading && !unavailable && summary.count_cancelled > 0 && (
        <p className="text-xs text-fg-secondary">
          {t('canceladas', { count: summary.count_cancelled, rechazadas: fmt(summary.rejected_total), clawback: fmt(summary.clawback_total) })}
        </p>
      )}
      {!loading && !unavailable && others.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-fg-secondary" aria-label={t('otrasMonedas')}>
          {others.map((o) => (
            <li key={o.currency}>
              {t('otraMoneda', {
                count: o.count,
                moneda: o.currency,
                devengado: fmt(o.accrued_total, o.currency),
                pagado: fmt(o.paid_total, o.currency),
                pendiente: fmt(o.pending_total, o.currency),
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
