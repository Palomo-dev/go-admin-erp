'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { KbdButton } from '@/components/kit';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import type { MontoRapido } from '@/lib/pos/venta/cobro/montosRapidos';

/**
 * Monto del pago que se está editando (Figma «Cobro v2»: campo con el símbolo
 * de la moneda, «Exacto · Alt+E» y billetes rápidos). Los importes (lo que
 * falta, los billetes) llegan ya calculados sobre lo que falta para esta
 * entrada (D8, `montosDeEntrada`); aquí solo se pintan y se avisa al cobro.
 */
export interface EditorPagoCobroProps {
  /** id del `<input>` (el cobro usa `amount-<id del pago>`). */
  id: string;
  /** Nombre accesible del campo («Monto del pago 2»). */
  etiqueta: string;
  valor: number;
  /** Tope del campo (los pagos QR no pasan del total). */
  max?: number;
  moneda: ContextoMoneda | string;
  onValorChange: (valor: string) => void;
  onExacto: () => void;
  /** Billetes rápidos (solo efectivo); vacío, no se pintan. */
  billetes: readonly MontoRapido[];
  onBillete: (valor: number) => void;
  deshabilitado?: boolean;
}

/** Símbolo de la moneda en el idioma de formato de la organización («$», «€», «US$»). */
function simboloMoneda(moneda: ContextoMoneda | string): string {
  const code = typeof moneda === 'string' ? moneda : moneda.code;
  const locale = typeof moneda === 'string' ? undefined : moneda.locale;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

export function EditorPagoCobro({ id, etiqueta, valor, max, moneda, onValorChange, onExacto, billetes, onBillete, deshabilitado }: EditorPagoCobroProps) {
  const t = useTranslations('posCobro.pagos');
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const simbolo = useMemo(() => simboloMoneda(moneda), [moneda]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-10 min-w-[160px] flex-1 items-center overflow-hidden rounded-lg border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-brand sm:max-w-[240px]">
        <span aria-hidden="true" className="flex h-full items-center border-r border-line bg-subtle px-3 text-sm text-fg-secondary">
          {simbolo}
        </span>
        <label htmlFor={id} className="sr-only">
          {etiqueta}
        </label>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          max={max}
          step="0.01"
          value={valor}
          disabled={deshabilitado}
          data-cobro-monto=""
          onChange={(e) => onValorChange(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-right text-base font-semibold tabular-nums text-fg outline-none disabled:opacity-50"
        />
      </div>
      <KbdButton variante="secundario" atajo={teclaAtajo('exacto')} onClick={onExacto} disabled={deshabilitado}>
        {t('exacto')}
      </KbdButton>
      {billetes.length > 0 && (
        <div role="group" aria-label={t('billetes')} className="flex flex-wrap gap-1.5">
          {billetes.map((b) => (
            <button
              key={b.value}
              type="button"
              disabled={deshabilitado}
              aria-label={t('billete', { monto: formatear(b.value) })}
              onClick={() => onBillete(b.value)}
              className="h-8 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium tabular-nums text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
