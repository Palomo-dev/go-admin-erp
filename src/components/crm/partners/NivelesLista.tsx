'use client';

/**
 * Lista de niveles (Figma 1319:94585, tarjeta «Niveles»): insignia con el
 * tono de su posición en el ranking (`rankTiers`), umbrales, cuántos partners
 * lo tienen y la tasa. La usan la pestaña «Comisiones» y la pestaña «Niveles».
 */

import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { rankTiers } from '@/lib/services/crm/partnerTierFor';
import { partnersEnNivel, tonoNivel, type PartnerFila } from './redPartnersLogica';

export function NivelesLista({ tiers, partners, moneda, cargando }: { tiers: PartnerTier[]; partners: readonly PartnerFila[]; moneda: string; cargando?: boolean }) {
  const t = useTranslations('crm.redPartners.nivelesCard');
  const idioma = useLocale();
  if (cargando) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }
  if (tiers.length === 0) return <p className="text-[13px] text-fg-secondary">{t('vacio')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rankTiers(tiers).map((x) => {
        const n = partnersEnNivel(partners, x.id);
        const deals = Number(x.min_deals);
        const revenue = Number(x.min_revenue);
        const umbral =
          revenue > 0
            ? t('umbralConMonto', { n: deals, monto: formatMoney(revenue, moneda) })
            : t('umbralDeals', { n: deals, nTexto: new Intl.NumberFormat(idioma).format(deals) });
        return (
          <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <Badge tono={tonoNivel(x.id, tiers)} tamano="sm">{x.name}</Badge>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] text-fg">{umbral}</span>
              <span className="text-xs text-fg-secondary">{n === 0 ? t('ninguno') : t('partners', { n })}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-fg">{formatRate(x.commission_rate)}</span>
          </li>
        );
      })}
    </ul>
  );
}
