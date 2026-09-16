'use client';

/**
 * Vistas de la pantalla del cliente que no son «Pedido» (PLAN §4.2):
 * Reposo, Cobro (efectivo / tarjeta / QR sin imagen), Gracias, Conectando y
 * «Actualice la pantalla». Ninguna calcula nada: pintan lo que llega.
 */

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { DisplayPayment } from '@/lib/pos/display/protocol';
import { formatDateInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { formatCurrency } from '@/utils/Utils';
import { BrandLogo } from './BrandHeader';
import { capitalizeFirst } from './logic';
import { TotalRow } from './OrderView';
import type { DisplayBrand } from './useDisplayBrand';

const LOCALE_TAGS: Record<string, string> = { es: 'es-CO', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' };

const MINUTE_MS = 60_000;

/**
 * Reloj en la zona horaria de la organización (hh:mm, sin segundos). Se
 * alinea al cambio de minuto: un setTimeout hasta el siguiente minuto exacto
 * y, desde ahí, un intervalo de 60 s, así el minuto cambia con ≤ 1 s de
 * retraso respecto a un reloj de referencia.
 */
function useClock(timezone: string) {
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    let interval: ReturnType<typeof setInterval> | null = null;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), MINUTE_MS);
    }, MINUTE_MS - (Date.now() % MINUTE_MS));
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);
  if (!now) return { time: '', date: '' };
  const tag = LOCALE_TAGS[locale] ?? 'es-CO';
  return {
    time: formatTimeInTz(now, timezone),
    // Solo la inicial en mayúscula: «Miércoles, 16 de septiembre», nunca «16 De Septiembre».
    date: capitalizeFirst(formatDateInTz(now, timezone, { locale: tag, weekday: 'long', day: 'numeric', month: 'long' }), tag),
  };
}

function Centered({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-[var(--pd-gutter)] text-center ${muted ? 'grayscale opacity-60' : ''}`}
    >
      {children}
    </div>
  );
}

export function IdleView({ brand }: { brand: DisplayBrand }) {
  const t = useTranslations('posDisplay');
  const { time, date } = useClock(brand.timezone);
  return (
    <Centered>
      <BrandLogo brand={brand} className="h-[calc(var(--pd-logo)*3)] w-[calc(var(--pd-logo)*3)] text-[calc(var(--pd-logo)*1.5)]" />
      <p className="text-[length:var(--pd-heading)] font-semibold uppercase tracking-wide text-neutral-900">{brand.name}</p>
      <p className="text-[length:var(--pd-total)] font-bold leading-none tabular-nums" style={{ color: brand.primaryColor }}>
        {time}
      </p>
      <p className="text-[length:var(--pd-line)] text-neutral-500">{date}</p>
      <p className="text-[length:var(--pd-line)] text-neutral-700">{t('welcome')}</p>
    </Centered>
  );
}

/** Importe o «—»: un campo que no es un número finito nunca se pinta como $ 0,00 (PLAN §4.1.3: «nunca miente»). */
function moneyOrDash(value: unknown, currency: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value, currency) : '—';
}

function PaymentFrame({
  brand,
  total,
  currency,
  children,
}: {
  brand: DisplayBrand;
  total: number;
  currency: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('posDisplay');
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between px-[var(--pd-gutter)] py-[var(--pd-gutter)]">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">{children}</div>
      <TotalRow label={t('total')} value={moneyOrDash(total, currency)} color={brand.primaryColor} />
    </div>
  );
}

export function PaymentView({ payment, currency, brand }: { payment: DisplayPayment; currency: string; brand: DisplayBrand }) {
  const t = useTranslations('posDisplay');
  const money = (value: unknown) => moneyOrDash(value, currency);

  if (payment.method === 'cash') {
    return (
      <PaymentFrame brand={brand} total={payment.total} currency={currency}>
        <p className="text-[length:var(--pd-heading)] uppercase tracking-wider text-neutral-500">{t('payment.cash')}</p>
        <div className="grid w-full grid-cols-2 gap-8">
          <div>
            <p className="text-[length:var(--pd-line)] text-neutral-500">{t('payment.received')}</p>
            <p className="text-[length:var(--pd-big)] font-semibold tabular-nums text-neutral-900">
              {money(payment.received)}
            </p>
          </div>
          <div>
            <p className="text-[length:var(--pd-line)] text-neutral-500">{t('payment.change')}</p>
            <p className="text-[length:var(--pd-big)] font-semibold tabular-nums" style={{ color: brand.primaryColor }}>
              {money(payment.change)}
            </p>
          </div>
        </div>
      </PaymentFrame>
    );
  }

  if (payment.method === 'card') {
    return (
      <PaymentFrame brand={brand} total={payment.total} currency={currency}>
        <p className="text-[length:var(--pd-heading)] uppercase tracking-wider text-neutral-500">
          {payment.provider ? t('payment.cardWith', { provider: payment.provider }) : t('payment.card')}
        </p>
        <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('payment.cardInstructions')}</p>
      </PaymentFrame>
    );
  }

  // QR: en Fase 0 sin imagen (PLAN §12 F0); el código llega en Fase 2.
  return (
    <PaymentFrame brand={brand} total={payment.total} currency={currency}>
      <p className="text-[length:var(--pd-heading)] uppercase tracking-wider text-neutral-500">
        {payment.provider ? t('payment.qrWith', { provider: payment.provider }) : t('payment.qr')}
      </p>
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('payment.qrInstructions')}</p>
    </PaymentFrame>
  );
}

export function ThanksView({ total, currency, brand }: { total: number; currency: string; brand: DisplayBrand }) {
  const t = useTranslations('posDisplay');
  return (
    <Centered>
      <BrandLogo brand={brand} className="h-[calc(var(--pd-logo)*2)] w-[calc(var(--pd-logo)*2)] text-[length:var(--pd-logo)]" />
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('thanks.title')}</p>
      <p className="text-[length:var(--pd-line)] text-neutral-500">{t('thanks.paid')}</p>
      <p className="text-[length:var(--pd-total)] font-bold leading-none tabular-nums" style={{ color: brand.primaryColor }}>
        {moneyOrDash(total, currency)}
      </p>
    </Centered>
  );
}

export function ConnectingView({ brand, hasTerminal }: { brand: DisplayBrand; hasTerminal: boolean }) {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <BrandLogo brand={brand} className="h-[calc(var(--pd-logo)*2)] w-[calc(var(--pd-logo)*2)] text-[length:var(--pd-logo)]" />
      <p className="text-[length:var(--pd-heading)] font-semibold uppercase tracking-wide text-neutral-900">{brand.name}</p>
      <p className="text-[length:var(--pd-line)] text-neutral-600">{hasTerminal ? t('connecting') : t('noTerminal')}</p>
    </Centered>
  );
}

export function UpdateRequiredView({ brand }: { brand: DisplayBrand }) {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <BrandLogo brand={brand} className="h-[calc(var(--pd-logo)*2)] w-[calc(var(--pd-logo)*2)] text-[length:var(--pd-logo)]" />
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('updateRequired')}</p>
      <p className="text-[length:var(--pd-line)] text-neutral-600">{t('updateRequiredHint')}</p>
    </Centered>
  );
}

export function UnsupportedView() {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('unsupported')}</p>
    </Centered>
  );
}
