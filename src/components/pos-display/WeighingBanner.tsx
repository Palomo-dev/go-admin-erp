'use client';

/**
 * «Pesando: 0,735 kg × $ 18.900 / kg = $ 13.892» en la pantalla del cliente
 * mientras el cajero tiene abierto «Pesar» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.6). Con carrito va como franja encima de las líneas; sin carrito, como
 * vista propia en lugar del reposo (`completa`). El importe se redondea a la
 * moneda al formatear, igual que la línea del carrito.
 */

import { Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DisplayWeighing } from '@/lib/pos/display/protocol';
import { formatWeighingMoney, formatWeighingQty, weighingVisiblePrice } from '@/lib/pos/display/weighing';

export interface WeighingBannerProps {
  weighing: DisplayWeighing;
  currency: string;
  locale?: string;
  /** Vista completa (sin carrito) en vez de franja. */
  completa?: boolean;
}

export function WeighingBanner({ weighing, currency, locale = 'es-CO', completa = false }: WeighingBannerProps) {
  const t = useTranslations('posDisplay');
  const money = (value: number) => formatWeighingMoney(value, currency, locale, weighing.moneyDecimals);
  const visible = weighingVisiblePrice(weighing);
  const precio = t('weighing.price', { price: money(visible.price), unit: visible.unit });
  const texto =
    weighing.qty === null
      ? t('weighing.waiting', { price: precio })
      : t('weighing.line', { qty: formatWeighingQty(weighing, locale), price: precio, total: money(weighing.total) });

  if (completa) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-[var(--pd-gutter)] text-center"
        aria-live="polite"
        data-weighing="completa"
      >
        <Scale aria-hidden="true" className="size-16 text-neutral-400" strokeWidth={1.5} />
        <p className="text-[length:var(--pd-heading)] font-semibold text-neutral-900">{weighing.name}</p>
        <p className="text-[length:var(--pd-line)] tabular-nums text-neutral-700">{texto}</p>
      </section>
    );
  }

  return (
    <div
      className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-[var(--pd-gutter)] py-2 text-[length:var(--pd-line)]"
      aria-live="polite"
      data-weighing="franja"
    >
      <Scale aria-hidden="true" className="size-6 shrink-0 text-neutral-500" strokeWidth={1.5} />
      <p className="min-w-0 truncate text-neutral-900">
        <span className="font-medium">{weighing.name}</span>
        <span className="text-neutral-500"> · </span>
        <span className="tabular-nums">{texto}</span>
      </p>
    </div>
  );
}
