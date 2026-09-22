'use client';

/**
 * Vistas de la pantalla del cliente que no son «Pedido» (PLAN §4.2):
 * Reposo, Cobro (efectivo / tarjeta / QR sin imagen), Gracias, Conectando y
 * «Actualice la pantalla». Ninguna calcula nada: pintan lo que llega.
 */

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import type { DisplayPayment } from '@/lib/pos/display/protocol';
import { formatDateInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { formatCurrency } from '@/utils/Utils';
import { BrandLogo } from './BrandHeader';
import { capitalizeFirst, formatCountdown, resolveQrPresentation } from './logic';
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

export interface PaymentViewProps {
  payment: DisplayPayment;
  currency: string;
  brand: DisplayBrand;
  /** Cobro·QR (Fase 2): ¿se puede mostrar el botón «Ya pagué»? (resolveTouch: detección + forzado). */
  touch?: boolean;
  /** Cobro·QR: el cliente pulsó «Ya pagué». Solo avisa a la caja; no confirma nada. */
  onQrPaidClaim?: () => void;
}

export function PaymentView({ payment, currency, brand, touch = false, onQrPaidClaim }: PaymentViewProps) {
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

  return <QrPaymentView payment={payment} currency={currency} brand={brand} touch={touch} onQrPaidClaim={onQrPaidClaim} />;
}

/** Reloj de 1 s para la cuenta atrás del QR; se para cuando no hay vencimiento. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** `navigator.onLine`, reevaluado con los eventos online/offline; true si el navegador no lo expone. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Última red bajo `QRCodeSVG`: qrcode.react LANZA durante el render si el
 * texto no cabe en un QR («Data too long»). `resolveQrPresentation` ya
 * degrada los textos largos, pero un error de la librería no puede tumbar la
 * pantalla entera (PLAN §3.5). Se monta con `key={valor}` desde QrPaymentView:
 * un código nuevo remonta el boundary y vuelve a intentar pintar.
 */
class QrCodeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[pos-display] no se pudo generar el QR; se muestran las instrucciones', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Cobro · QR (PLAN §4.2, Fase 2): el código a pantalla completa (imagen del
 * proveedor, o generado desde el texto EMVCo con qrcode.react), el nombre del
 * medio, el total y la cuenta atrás si el cobro vence. Sin código, vencido,
 * imagen que no carga o sin red → «Pago con QR: siga las instrucciones del
 * cajero» (PLAN §3.5), nunca un código roto. Táctil: botón «Ya pagué» que
 * SOLO avisa a la caja (una vez por código); no táctil: sin botón.
 */
export function QrPaymentView({
  payment,
  currency,
  brand,
  touch = false,
  onQrPaidClaim,
}: PaymentViewProps & { payment: Extract<DisplayPayment, { method: 'qr' }> }) {
  const t = useTranslations('posDisplay');
  const qrValue = payment.qr?.value ?? null;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [claimedFor, setClaimedFor] = useState<string | null>(null);
  const online = useOnline();
  const now = useNow(payment.expiresAt !== null);
  const view = resolveQrPresentation(payment, {
    now,
    online,
    imageFailed: failedImage !== null && failedImage === qrValue,
  });
  // Un código nuevo (otro intento del cajero) vuelve a permitir avisar.
  const claimKey = `${qrValue ?? ''}|${payment.expiresAt ?? ''}`;
  const claimed = claimedFor === claimKey;
  const label = payment.provider ? t('payment.qrWith', { provider: payment.provider }) : t('payment.qr');
  // Pago mixto (F2-C r3): el QR cobra `amount` (lo pendiente), no el total.
  // Solo se pinta cuando difiere: con un único pago sobra la línea.
  const partialAmount =
    typeof payment.amount === 'number' && Number.isFinite(payment.amount) && payment.amount !== payment.total ? payment.amount : null;

  return (
    <PaymentFrame brand={brand} total={payment.total} currency={currency}>
      <p className="text-[length:var(--pd-heading)] uppercase tracking-wider text-neutral-500">{label}</p>
      {partialAmount !== null && (
        <p className="text-[length:var(--pd-line)] font-semibold tabular-nums text-neutral-900" data-qr-amount={partialAmount}>
          {t('payment.qrAmountOfTotal', { total: moneyOrDash(payment.total, currency), amount: moneyOrDash(partialAmount, currency) })}
        </p>
      )}
      {view.kind === 'fallback' ? (
        <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">
          {view.expired ? t('payment.qrExpired') : t('payment.qrInstructions')}
        </p>
      ) : (
        <div
          className="flex aspect-square h-[min(52vh,60vw)] items-center justify-center rounded-2xl border border-neutral-200 bg-white p-[2vh]"
          data-qr-kind={view.kind}
        >
          {view.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica del proveedor de pago (URL o data URL), sin optimizador
            <img
              src={view.value ?? ''}
              alt={label}
              className="h-full w-full object-contain"
              draggable={false}
              onError={() => setFailedImage(qrValue)}
            />
          ) : (
            <QrCodeBoundary
              key={view.value ?? ''}
              fallback={<p className="text-center text-[length:var(--pd-line)] font-semibold text-neutral-900">{t('payment.qrInstructions')}</p>}
            >
              <QRCodeSVG value={view.value ?? ''} className="h-full w-full" level="M" includeMargin={false} />
            </QrCodeBoundary>
          )}
        </div>
      )}
      {view.kind !== 'fallback' && (
        <p className="text-[length:var(--pd-line)] text-neutral-700">{t('payment.qrScan')}</p>
      )}
      {view.remainingMs !== null && (
        <p className="text-[length:var(--pd-line)] tabular-nums text-neutral-500" aria-live="polite">
          {t('payment.qrExpiresIn', { time: formatCountdown(view.remainingMs) })}
        </p>
      )}
      {touch && onQrPaidClaim && view.kind !== 'fallback' && (
        <button
          type="button"
          disabled={claimed}
          onClick={() => {
            if (claimed) return;
            setClaimedFor(claimKey);
            onQrPaidClaim();
          }}
          className="mt-2 rounded-full px-[calc(var(--pd-gutter)*1.5)] py-[calc(var(--pd-gutter)*0.5)] text-[length:var(--pd-line)] font-semibold text-white shadow-md transition-opacity disabled:opacity-60"
          style={{ backgroundColor: brand.primaryColor }}
        >
          {claimed ? t('payment.qrPaidSent') : t('payment.qrPaidButton')}
        </button>
      )}
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

export interface ConnectingViewProps {
  brand: DisplayBrand;
  hasTerminal: boolean;
  /**
   * Fase 3 (parte B): sin caja en este equipo, la pantalla puede ser una
   * tableta. Si se pasa, se ofrece «Emparejar con un código» (useRemoteDisplay
   * · openPairing). Con caja local no se muestra: aquí la pantalla es local.
   */
  onPair?: () => void;
  /** Remoto: el canal aún no está unido (JWT rechazado, red). Cambia el texto de ayuda. */
  remoteChannelDown?: boolean;
}

export function ConnectingView({ brand, hasTerminal, onPair, remoteChannelDown = false }: ConnectingViewProps) {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <BrandLogo brand={brand} className="h-[calc(var(--pd-logo)*2)] w-[calc(var(--pd-logo)*2)] text-[length:var(--pd-logo)]" />
      <p className="text-[length:var(--pd-heading)] font-semibold uppercase tracking-wide text-neutral-900">{brand.name}</p>
      <p className="text-[length:var(--pd-line)] text-neutral-600">{hasTerminal ? t('connecting') : t('noTerminal')}</p>
      {hasTerminal && (
        // Con identidad de caja pero sin señal, la causa habitual es el interruptor
        // maestro apagado en la caja (por defecto lo está) o el POS cerrado. Se dice
        // en pequeño para que el cajero sepa qué tocar sin que el cliente lo sufra.
        <p className="mt-2 text-[length:calc(var(--pd-line)*0.7)] text-neutral-500">{remoteChannelDown ? t('pairing.channelDown') : t('connectingHint')}</p>
      )}
      {!hasTerminal && onPair && <PairButton onPair={onPair} />}
    </Centered>
  );
}

/**
 * Acceso a la pantalla de emparejamiento. Lo usan «Conectando» (sin caja en
 * este equipo) y «no compatible» (ronda 3 · 1): en un navegador sin
 * BroadcastChannel era el único camino y quedaba tapado, aunque el
 * transporte remoto no necesita BroadcastChannel para nada.
 */
function PairButton({ onPair }: { onPair: () => void }) {
  const t = useTranslations('posDisplay');
  return (
    <button
      type="button"
      onClick={onPair}
      className="mt-4 rounded-full border-2 border-neutral-400 px-[var(--pd-gutter)] py-[calc(var(--pd-gutter)*0.3)] text-[length:calc(var(--pd-line)*0.8)] font-semibold text-neutral-800"
      data-pair-button="true"
    >
      {t('pairing.open')}
    </button>
  );
}

/**
 * Remoto (parte B): hay token y se está pidiendo `/bootstrap`. Con `failure`
 * el servidor o la red fallaron y se reintenta con retroceso; 503
 * `REALTIME_NOT_CONFIGURED` se dice tal cual para que quien instala sepa qué
 * falta (no es un error de emparejamiento).
 *
 * Con `onPair` se ofrece además teclear un código (ronda 4 · B4): la fase no
 * sale nunca por sí sola mientras el fallo no sea un 401, así que tras tres
 * fallos seguidos —la regla está en `offersPairingFromBootstrap`— hace falta
 * una salida que no pase por el sistema operativo del quiosco. El reintento
 * sigue corriendo por debajo: si la red vuelve, la pantalla arranca sola.
 */
export function RemoteBootstrappingView({ failureCode, onPair }: { failureCode: string | null; onPair?: () => void }) {
  const t = useTranslations('posDisplay');
  const text = failureCode === null ? t('pairing.bootstrapping') : failureCode === 'REALTIME_NOT_CONFIGURED' ? t('pairing.notConfigured') : t('pairing.retrying');
  return (
    <Centered muted>
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('pairing.title')}</p>
      <p className="max-w-[min(92vw,900px)] text-[length:var(--pd-line)] text-neutral-600" aria-live="polite">
        {text}
      </p>
      {onPair && <PairButton onPair={onPair} />}
    </Centered>
  );
}

/** Remoto: faltan `NEXT_PUBLIC_SUPABASE_*` en este bundle: no hay cliente que construir. */
export function RemoteUnavailableView() {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('pairing.unavailable')}</p>
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

/**
 * Este navegador no puede ser pantalla LOCAL (sin BroadcastChannel ni puente
 * de escritorio). Con `onPair` se ofrece igualmente el emparejamiento remoto
 * (ronda 3 · 1): el canal remoto va por WebSocket y no depende de nada de
 * esto, así que un callejón sin salida sería mentira.
 */
export function UnsupportedView({ onPair }: { onPair?: () => void }) {
  const t = useTranslations('posDisplay');
  return (
    <Centered muted>
      <p className="text-[length:var(--pd-big)] font-semibold text-neutral-900">{t('unsupported')}</p>
      {onPair && <PairButton onPair={onPair} />}
    </Centered>
  );
}
