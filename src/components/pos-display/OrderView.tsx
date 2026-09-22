'use client';

/**
 * Vista «Pedido» (PLAN §4.3): líneas, descuento, impuestos y TOTAL grande.
 * Sin scroll: se muestran las últimas líneas que caben y «y X más». La línea
 * que acaba de cambiar se resalta 600 ms; el total hace un tick de 200 ms.
 *
 * Recorte en dos pasos:
 * 1. Estimación pura (logic.ts · estimateRowHeightPx) con el presupuesto
 *    ÚTIL del contenedor (clientHeight menos su padding vertical) y los
 *    tamaños reales de `--pd-line` y `--pd-small` medidos en el DOM.
 * 2. Corrección tras el render (useLayoutEffect, antes de pintar): si el
 *    contenido sigue desbordando (scrollHeight > clientHeight), se quita una
 *    línea más por el principio hasta que quepa. Así nunca se recorta la
 *    línea MÁS RECIENTE aunque la estimación se quede corta por un píxel.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DisplayCart, DisplayLine } from '@/lib/pos/display/protocol';
import {
  HIGHLIGHT_MS,
  counterReservePx,
  estimateRowHeightPx,
  fitLastLines,
  formatDisplayMoney,
  parseHexColor,
  resolveTaxRowKind,
  subLineCount,
  taxLabelKind,
  trimLines,
} from './logic';
import type { DisplayBrand } from './useDisplayBrand';

export { HIGHLIGHT_MS };

interface OrderViewProps {
  cart: DisplayCart;
  /**
   * Instante (Date.now()) hasta el que debe verse el resaltado de
   * `cart.lastChangedLineId`. Lo fija useDisplayReceiver solo cuando de verdad
   * entró o cambió una línea; un remontaje de la vista (key={view}) no lo
   * re-dispara porque el instante ya pasó.
   */
  highlightUntil: number;
  brand: DisplayBrand;
  /** Etiqueta BCP 47 con la que se formatean los importes (F4, PLAN §4.5). */
  locale?: string;
  /**
   * Ajuste `showTaxBreakdown` (F4): apagado, un carrito con impuesto INCLUIDO
   * muestra solo «IVA incluido»; encendido, también el importe, como en el
   * recibo. Con el impuesto sumado al subtotal el importe se muestra siempre
   * (si no, subtotal + nada no daría el total). Ver `resolveTaxRowKind`.
   */
  showTaxBreakdown?: boolean;
}

interface ViewportMetrics {
  /** Alto útil para las filas: clientHeight menos padding vertical. */
  height: number;
  lineFontPx: number;
  smallFontPx: number;
}

function useHighlightedLine(lineId: string | null, highlightUntil: number): string | null {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    const remaining = highlightUntil - Date.now();
    if (!lineId || remaining <= 0) {
      setHighlighted(null);
      return;
    }
    setHighlighted(lineId);
    const timer = setTimeout(() => setHighlighted(null), Math.min(remaining, HIGHLIGHT_MS));
    return () => clearTimeout(timer);
  }, [lineId, highlightUntil]);
  return highlighted;
}

/**
 * Alto útil del contenedor de líneas y tamaños reales de fuente. El
 * contenedor lleva padding vertical (py) que clientHeight INCLUYE y que no
 * está disponible para las filas: se descuenta. `--pd-small` se mide en un
 * <span> sonda invisible porque getComputedStyle sobre la variable devuelve
 * el `clamp()` sin resolver.
 */
function useLinesViewport(ref: React.RefObject<HTMLDivElement | null>, probeRef: React.RefObject<HTMLSpanElement | null>) {
  const [metrics, setMetrics] = useState<ViewportMetrics>({ height: 0, lineFontPx: 28, smallFontPx: 18 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const lineFontPx = parseFloat(style.fontSize) || 28;
      const probe = probeRef.current;
      const smallFontPx = (probe && parseFloat(getComputedStyle(probe).fontSize)) || lineFontPx * 0.65;
      const height = Math.max(0, el.clientHeight - paddingTop - paddingBottom);
      setMetrics((prev) =>
        prev.height === height && prev.lineFontPx === lineFontPx && prev.smallFontPx === smallFontPx
          ? prev
          : { height, lineFontPx, smallFontPx },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, probeRef]);
  return metrics;
}

/**
 * Cuántas líneas más de las estimadas hay que ocultar para que el contenido
 * no desborde. Se recalcula desde 0 cada vez que cambian las líneas o las
 * medidas; cada pasada de layout quita una línea si aún desborda, y como
 * corre antes de pintar, el cliente nunca ve la fila cortada.
 */
function useOverflowCorrection(ref: React.RefObject<HTMLDivElement | null>, key: string, estimatedVisible: number): number {
  const [state, setState] = useState<{ key: string; extra: number }>({ key, extra: 0 });
  const extra = state.key === key ? state.extra : 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight && estimatedVisible - extra > 1) {
      setState({ key, extra: extra + 1 });
    }
  }, [ref, key, estimatedVisible, extra]);
  return extra;
}

export function OrderView({ cart, highlightUntil, brand, locale, showTaxBreakdown = false }: OrderViewProps) {
  const t = useTranslations('posDisplay');
  const linesRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const { height, lineFontPx, smallFontPx } = useLinesViewport(linesRef, probeRef);
  const highlighted = useHighlightedLine(cart.lastChangedLineId, highlightUntil);

  const estimated = useMemo(
    () =>
      // Antes de la primera medida no se recorta: mejor un instante de más que una pantalla vacía.
      height > 0
        ? fitLastLines(
            cart.lines,
            (line: DisplayLine) => estimateRowHeightPx(line, { lineFontPx, smallFontPx }),
            height,
            counterReservePx(smallFontPx),
          )
        : { visible: cart.lines, hidden: 0 },
    [cart.lines, height, lineFontPx, smallFontPx],
  );

  // Firma de lo que afecta al alto real: qué líneas hay (id + sublíneas), las medidas y cuántas se estimaron.
  const correctionKey = useMemo(
    () => `${cart.lines.map((line) => `${line.id}:${subLineCount(line)}`).join(',')}|${height}|${lineFontPx}|${smallFontPx}|${estimated.visible.length}`,
    [cart.lines, height, lineFontPx, smallFontPx, estimated.visible.length],
  );
  const extraHidden = useOverflowCorrection(linesRef, correctionKey, estimated.visible.length);
  const { visible, hidden } = extraHidden > 0 ? trimLines(cart.lines, estimated.visible.length - extraHidden) : estimated;

  const highlightRgb = parseHexColor(brand.rawPrimaryColor) ?? parseHexColor(brand.primaryColor);
  const highlightBg = highlightRgb ? `rgba(${highlightRgb.r}, ${highlightRgb.g}, ${highlightRgb.b}, 0.14)` : 'rgba(0,0,0,0.06)';

  const taxKind = taxLabelKind(cart);
  const taxRow = resolveTaxRowKind(taxKind, showTaxBreakdown);
  const currency = cart.currency;
  const money = (value: number) => formatDisplayMoney(value, currency, locale);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={linesRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.5)] text-[length:var(--pd-line)]"
        aria-live="polite"
      >
        <span ref={probeRef} aria-hidden="true" className="invisible absolute h-0 w-0 overflow-hidden text-[length:var(--pd-small)]" />
        {hidden > 0 ? (
          <p className="pb-2 text-[length:var(--pd-small)] text-neutral-400">{t('andMore', { count: hidden })}</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {visible.map((line) => {
            const isHighlighted = highlighted === line.id;
            return (
              <li
                key={line.id}
                className="rounded-xl px-3 py-1.5 transition-colors duration-300"
                style={{ backgroundColor: isHighlighted ? highlightBg : 'transparent' }}
              >
                <div className="flex items-baseline justify-between gap-6">
                  <p className="min-w-0 truncate text-neutral-900">
                    <span className="tabular-nums text-neutral-500">{t('qty', { qty: line.qty })}</span>{' '}
                    <span className="font-medium">{line.name}</span>
                    {line.taxExcluded ? (
                      <span className="ml-2 text-[length:var(--pd-small)] text-neutral-400">{t('taxExcludedLine')}</span>
                    ) : null}
                  </p>
                  <p className="shrink-0 tabular-nums text-neutral-900">{money(line.total)}</p>
                </div>
                {line.variant && line.variant.length > 0 ? (
                  <div className="ml-[2.2em] flex flex-wrap gap-2 text-[length:var(--pd-small)] text-neutral-500">
                    {line.variant.map((attr) => (
                      <span key={`${attr.attr}:${attr.value}`} className="rounded-md bg-neutral-100 px-2">
                        {attr.attr}: {attr.value}
                      </span>
                    ))}
                  </div>
                ) : null}
                {line.modifiers.map((mod, index) => (
                  <p key={`${mod.name}:${index}`} className="ml-[2.2em] text-[length:var(--pd-small)] text-neutral-500">
                    ▸ {mod.name}
                    {mod.extraPrice > 0 ? ` (+${money(mod.extraPrice)})` : ''}
                  </p>
                ))}
                {line.note ? (
                  <p className="ml-[2.2em] text-[length:var(--pd-small)] italic text-neutral-500">{line.note}</p>
                ) : null}
                {line.discount && line.discount > 0 ? (
                  <p className="ml-[2.2em] text-[length:var(--pd-small)] text-neutral-500">
                    {t('lineDiscount')} −{money(line.discount)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-neutral-200 px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.5)] text-[length:var(--pd-line)] text-neutral-700">
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between gap-6">
            <dt>{t('subtotal')}</dt>
            <dd className="tabular-nums">{money(cart.subtotal)}</dd>
          </div>
          {cart.discountTotal > 0 ? (
            <div className="flex justify-between gap-6">
              <dt className="min-w-0 truncate">
                {cart.discountLabel ? t('discountWithLabel', { label: cart.discountLabel }) : t('discount')}
              </dt>
              <dd className="shrink-0 tabular-nums">−{money(cart.discountTotal)}</dd>
            </div>
          ) : null}
          {taxRow !== 'none' ? (
            <div className="flex justify-between gap-6" data-tax-row={taxRow}>
              <dt>{t(taxKind === 'included' ? 'taxIncluded' : taxKind === 'mixed' ? 'taxMixed' : 'taxes')}</dt>
              {taxRow === 'amount' ? <dd className="tabular-nums">{money(cart.taxTotal)}</dd> : null}
            </div>
          ) : null}
        </dl>
        <TotalRow label={t('total')} value={money(cart.total)} color={brand.primaryColor} />
      </div>
    </div>
  );
}

/** TOTAL grande en color de marca; un tick de 200 ms cuando cambia el importe. */
export function TotalRow({ label, value, color }: { label: string; value: string; color: string }) {
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((n) => n + 1);
  }, [value]);
  return (
    <div className="mt-2 flex items-baseline justify-between gap-6">
      <span className="text-[length:var(--pd-heading)] font-semibold uppercase tracking-wider text-neutral-900">{label}</span>
      <span
        key={tick}
        className="pd-tick origin-right text-[length:var(--pd-total)] font-bold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
