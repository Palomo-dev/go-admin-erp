'use client';

/**
 * Vista «Propina» de la pantalla del cliente (PLAN §4.2 y §4.4, Fase 2-B).
 * «¿Desea dejar propina?» con los porcentajes sugeridos por la organización
 * (importe calculado en vivo sobre la base que manda la caja, con la misma
 * aritmética que usa la caja: tip.ts), «Otro» (si la organización lo
 * permite) y «Sin propina».
 *
 * - Táctil: el cliente pulsa y se envía `tip_selected` a la caja UNA vez;
 *   los botones quedan bloqueados hasta que la caja pase a «Cobro». «Otro»
 *   abre un teclado numérico sencillo (hasta TIP_CUSTOM_MAX_DIGITS cifras).
 * - No táctil: los mismos importes como INFORMACIÓN, sin botones; el cajero
 *   registra lo que el cliente diga, en la caja.
 * Nada se aplica aquí: la caja confirma (PLAN §5.3 «nada se aplica solo»).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DisplayCart, TipKind } from '@/lib/pos/display/protocol';
import { TIP_CUSTOM_MAX_DIGITS, resolveTipBase, tipOptions, type DisplayTipBlock } from '@/lib/pos/display/tip';
import { formatCurrency } from '@/utils/Utils';
import { TotalRow } from './OrderView';
import type { DisplayBrand } from './useDisplayBrand';

export interface TipViewProps {
  cart: DisplayCart;
  tip: DisplayTipBlock;
  currency: string;
  brand: DisplayBrand;
  /** resolveTouch: detección + forzado de los ajustes. Sin táctil no hay botones. */
  touch: boolean;
  /** Táctil: el cliente eligió. Se llama una sola vez por fase. */
  onSelect?: (choice: { kind: TipKind; value: number }) => void;
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'] as const;

export function TipView({ cart, tip, currency, brand, touch, onSelect }: TipViewProps) {
  const t = useTranslations('posDisplay');
  const base = resolveTipBase(tip, cart);
  const options = tipOptions(base, tip.presets);
  const [sent, setSent] = useState<{ kind: TipKind; value: number } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [digits, setDigits] = useState('');

  // Otro carrito o otra fase: se vuelve a poder elegir.
  useEffect(() => {
    setSent(null);
    setCustomOpen(false);
    setDigits('');
  }, [cart.id]);

  const interactive = touch && typeof onSelect === 'function';
  const choose = (choice: { kind: TipKind; value: number }) => {
    if (!interactive || sent) return;
    setSent(choice);
    onSelect?.(choice);
  };
  const money = (value: number) => formatCurrency(value, currency);
  const customAmount = digits.length > 0 ? Number(digits) : 0;

  const buttonBase =
    'flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.6)] transition-opacity disabled:opacity-60';

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between px-[var(--pd-gutter)] py-[var(--pd-gutter)]" data-tip-touch={interactive ? 'true' : 'false'}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('tip.question')}</p>
        {!interactive && <p className="text-[length:var(--pd-line)] text-neutral-500">{t('tip.tellCashier')}</p>}

        {interactive && customOpen && !sent ? (
          <div className="flex w-full max-w-[min(90vw,720px)] flex-col items-center gap-4" data-tip-keypad="true">
            <p className="text-[length:var(--pd-total)] font-bold leading-none tabular-nums" style={{ color: brand.primaryColor }}>
              {money(customAmount)}
            </p>
            <div className="grid w-full grid-cols-3 gap-3">
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === '⌫') {
                      setDigits((d) => d.slice(0, -1));
                      return;
                    }
                    setDigits((d) => {
                      const next = d === '0' ? key : d + key;
                      return next.length > TIP_CUSTOM_MAX_DIGITS ? d : next.replace(/^0+(?=\d)/, '');
                    });
                  }}
                  className="rounded-2xl border-2 border-neutral-200 bg-white py-[calc(var(--pd-gutter)*0.5)] text-[length:var(--pd-line)] font-semibold text-neutral-900"
                  aria-label={key === '⌫' ? t('tip.deleteDigit') : key}
                >
                  {key}
                </button>
              ))}
            </div>
            <div className="grid w-full grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCustomOpen(false);
                  setDigits('');
                }}
                className="rounded-full border-2 border-neutral-300 py-[calc(var(--pd-gutter)*0.4)] text-[length:var(--pd-line)] font-semibold text-neutral-700"
              >
                {t('tip.back')}
              </button>
              <button
                type="button"
                disabled={customAmount <= 0}
                onClick={() => choose({ kind: 'amount', value: customAmount })}
                className="rounded-full py-[calc(var(--pd-gutter)*0.4)] text-[length:var(--pd-line)] font-semibold text-white shadow-md disabled:opacity-60"
                style={{ backgroundColor: brand.primaryColor }}
              >
                {t('tip.confirmCustom')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid w-full max-w-[min(92vw,1100px)] gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}>
              {options.map((option) => {
                const chosen = sent?.kind === 'percent' && sent.value === option.percent;
                const content = (
                  <>
                    <span className="text-[length:var(--pd-big)] font-bold leading-none tabular-nums" style={{ color: chosen ? '#ffffff' : brand.primaryColor }}>
                      {option.percent} %
                    </span>
                    <span className={`text-[length:var(--pd-line)] tabular-nums ${chosen ? 'text-white' : 'text-neutral-700'}`}>{money(option.amount)}</span>
                  </>
                );
                return interactive ? (
                  <button
                    key={option.percent}
                    type="button"
                    disabled={sent !== null}
                    onClick={() => choose({ kind: 'percent', value: option.percent })}
                    className={`${buttonBase} bg-white`}
                    style={chosen ? { backgroundColor: brand.primaryColor, borderColor: brand.primaryColor } : { borderColor: brand.primaryColor }}
                    data-tip-percent={option.percent}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={option.percent} className={`${buttonBase} border-neutral-200 bg-white`} data-tip-percent={option.percent}>
                    {content}
                  </div>
                );
              })}
            </div>
            {interactive && (
              <div className="grid w-full max-w-[min(92vw,1100px)] grid-cols-2 gap-4">
                {tip.allowCustom && (
                  <button
                    type="button"
                    disabled={sent !== null}
                    onClick={() => setCustomOpen(true)}
                    className="rounded-full border-2 border-neutral-300 py-[calc(var(--pd-gutter)*0.4)] text-[length:var(--pd-line)] font-semibold text-neutral-800 disabled:opacity-60"
                    data-tip-other="true"
                  >
                    {sent?.kind === 'amount' ? `${t('tip.other')} · ${money(sent.value)}` : t('tip.other')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={sent !== null}
                  onClick={() => choose({ kind: 'none', value: 0 })}
                  className={`rounded-full border-2 border-neutral-300 py-[calc(var(--pd-gutter)*0.4)] text-[length:var(--pd-line)] font-semibold text-neutral-800 disabled:opacity-60 ${tip.allowCustom ? '' : 'col-span-2'}`}
                  data-tip-none="true"
                >
                  {t('tip.none')}
                </button>
              </div>
            )}
            {sent && (
              <p className="text-[length:var(--pd-line)] text-neutral-500" aria-live="polite">
                {t('tip.sent')}
              </p>
            )}
          </>
        )}
      </div>
      {/*
        La fila NO se llama «Total»: `base` es el total con impuestos SIN
        domicilio (PLAN §5.3, `baseTotal` del modal), y en una venta a
        domicilio el cobro siguiente pinta «Total» con el envío. Dos cifras
        distintas con la misma etiqueta confundían (F2-B ronda 4, QA-1).
      */}
      <TotalRow label={t('tip.base')} value={money(base)} color={brand.primaryColor} />
    </div>
  );
}
