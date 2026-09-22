'use client';

/**
 * Pantalla del cliente (PLAN §4). Raíz de /pos-display: une el receptor
 * (useDisplayReceiver), la marca (useDisplayBrand) y la resolución de vista
 * (logic.ts) y pinta el estado con un fundido de 200 ms entre vistas.
 *
 * Tipografías fluidas con clamp(): el TOTAL mide ≥ 96 px a 1920×1080 y sigue
 * legible a 1024×768 (PLAN §4.1 y §13). Sin scroll, sin sonidos, ninguna
 * animación mayor de 300 ms.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BrandHeader } from './BrandHeader';
import { FullscreenButton } from './FullscreenButton';
import { OrderView } from './OrderView';
import { TipView } from './TipView';
import { resolveDisplayCurrency, resolveTouch, resolveView, viewShowsAmounts } from './logic';
import { markRenderHealthy } from './retryBackoff';
import { useDisplayBrand } from './useDisplayBrand';
import { useDisplayReceiver } from './useDisplayReceiver';
import { ConnectingView, IdleView, PaymentView, ThanksView, UnsupportedView, UpdateRequiredView } from './views';

/** Cuánto dura la vista Gracias antes de volver a Reposo (PLAN §4.2). */
export const THANKS_MS = 8_000;

/**
 * Escala tipográfica y ritmo de la pantalla; todo lo demás se expresa en
 * función de estas variables. Mínimos de PLAN §4.1: líneas ≥ 28 px, total
 * ≥ 96 px a 1920×1080 (8.5vw = 163 → tope 150).
 *
 * Aritmética a 1024×768 (la resolución objetivo más pequeña de PLAN §13),
 * con Tailwind por defecto (line-height 1.5, py-1.5 = 12 px, gap-1 = 4 px):
 * - --pd-line = 28 px → fila simple 28×1.5 + 12 + 4 = 58 px.
 * - --pd-small = 18 px → cada sublínea 27 px; contador «y X más» 27 + 8 = 35 px.
 * - Cabecera ≈ 41 (logo) + 25,6 (py) + 1 (borde) ≈ 68 px; pie ≈ 19 + 16 = 35 px.
 * - Bloque de totales: subtotal 42 + IVA 42 + gap 4 + TOTAL (mt-2 8 + fila
 *   de 87 px, --pd-total con leading-none, ≈ 92 con la base alineada) + py
 *   25,6 + borde 1 ≈ 215 px.
 * - Contenedor de líneas: 768 − 68 − 35 − 215 ≈ 450 px de clientHeight,
 *   menos py 25,6 ≈ 425 px útiles (lo que useLinesViewport entrega) → 7
 *   filas simples (7×58 = 406) sin contador, o 6 + contador (348 + 35 = 383)
 *   con más líneas: ≥ 4 en cualquier caso. Con descuento en el bloque de
 *   totales (+46 px) siguen cabiendo 6.
 * A 1920×1080: line 42,24 px (fila 79,4), small 24,96 px (sublínea 37,4).
 *
 * A 1366×768 (PLAN §13; misma aritmética, calculada, no medida en navegador):
 * gutter 34,15 px, logo 54,6 px, line 30,05 px (fila simple 61,1), small 18
 * px (mínimo del clamp), total 116,1 px. Cabecera ≈ 90, pie ≈ 35, bloque de
 * totales ≈ 258 (dos filas de 45,1 + TOTAL ≈ 121 + py 34 + borde). Contenedor
 * ≈ 385 px de clientHeight, menos py 34 ≈ 351 útiles → 5 filas simples
 * (305,5) con o sin contador (316 disponibles con él); con descuento en los
 * totales (+49 px) quedan 4. Sigue ≥ 4 en cualquier caso.
 */
const SCALE_STYLE = {
  '--pd-gutter': 'clamp(16px, 2.5vw, 48px)',
  '--pd-logo': 'clamp(40px, 4vw, 80px)',
  '--pd-small': 'clamp(18px, 1.3vw, 26px)',
  '--pd-heading': 'clamp(20px, 1.8vw, 36px)',
  '--pd-line': 'clamp(28px, 2.2vw, 44px)',
  '--pd-big': 'clamp(36px, 4vw, 80px)',
  '--pd-total': 'clamp(72px, 8.5vw, 150px)',
} as React.CSSProperties;

/**
 * true pasados THANKS_MS desde que se ENTRÓ en Gracias (o desde que cambió el
 * total pagado: otra venta); luego la vista cae a Reposo. No depende de cada
 * `state` aceptado: un hello+state que responde a un need_snapshot durante
 * Gracias no alarga los 8 s.
 */
function useThanksExpired(thanksTotal: number | null): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (thanksTotal === null) {
      setExpired(false);
      return;
    }
    setExpired(false);
    const timer = setTimeout(() => setExpired(true), THANKS_MS);
    return () => clearTimeout(timer);
  }, [thanksTotal]);
  return expired;
}

export function CustomerDisplay() {
  const t = useTranslations('posDisplay');
  const link = useDisplayReceiver();
  const brand = useDisplayBrand(link.hello?.organizationId ?? null);
  const state = link.state;

  const thanksExpired = useThanksExpired(state?.mode === 'thanks' && state.thanks ? state.thanks.total : null);
  // Táctil (PLAN §4.4): detección del navegador + forzado de los ajustes de la organización.
  // Se resuelve ANTES de la vista: una propina sin presets en pantalla no táctil cae al cobro (logic.ts).
  const touch = resolveTouch(link.touchDetected, link.hello?.settings?.touch);
  const view = resolveView({
    connected: link.connected,
    disconnectedTooLong: link.disconnectedTooLong,
    updateRequired: link.updateRequired,
    thanksExpired,
    touch,
    state,
  });

  // Moneda: carrito → hello (siempre precede al state) → última pintada → respaldo (logic.ts).
  // El recuerdo se actualiza en un efecto, nunca durante el render.
  const rememberedCurrencyRef = useRef<string | null>(null);
  const currency = resolveDisplayCurrency({
    cartCurrency: state?.cart?.currency,
    helloCurrency: link.hello?.currency,
    remembered: rememberedCurrencyRef.current,
  });
  useEffect(() => {
    rememberedCurrencyRef.current = currency;
  }, [currency]);

  // Retroceso del error boundary (error.tsx, ronda 4 de F2-C · C4): un
  // efecto solo corre si el render NO lanzó, así que cada `state` que llega
  // aquí se pintó bien y el contador de reintentos vuelve a empezar. El
  // `state` que tumba una vista nunca pasa por aquí (lo atrapa el boundary).
  useEffect(() => {
    if (state !== null) markRenderHealthy();
  }, [state]);

  const cashierName = link.connected && link.hello?.cashier?.name ? link.hello.cashier.name : null;
  const muted = view === 'connecting' || view === 'update_required';

  // Cobro·QR: «Ya pagué» solo avisa a la caja (qr_paid_claim); la confirmación sigue siendo del cajero.
  const paymentCartId = state?.mode === 'payment' && state.cart?.id ? state.cart.id : null;
  const sendUp = link.sendUp;
  const onQrPaidClaim = useCallback(() => {
    if (paymentCartId) sendUp({ t: 'qr_paid_claim', cartId: paymentCartId });
  }, [sendUp, paymentCartId]);
  // Propina (F2-B): la elección solo AVISA a la caja (tip_selected); el cajero confirma con Aplicar / Cambiar.
  const tipCartId = state?.mode === 'tip' && state.cart?.id ? state.cart.id : null;
  const onTipSelect = useCallback(
    (choice: { kind: 'percent' | 'amount' | 'none'; value: number }) => {
      if (tipCartId) sendUp({ t: 'tip_selected', cartId: tipCartId, kind: choice.kind, value: choice.value });
    },
    [sendUp, tipCartId],
  );

  let content: React.ReactNode;
  if (!link.supported) {
    content = <UnsupportedView />;
  } else if (view === 'connecting') {
    content = <ConnectingView brand={brand} hasTerminal={link.terminalId !== null} />;
  } else if (view === 'update_required') {
    content = <UpdateRequiredView brand={brand} />;
  } else if (view === 'order' && state?.cart) {
    content = <OrderView cart={state.cart} highlightUntil={link.highlightUntil} brand={brand} />;
  } else if ((view === 'payment_cash' || view === 'payment_card' || view === 'payment_qr') && state?.payment) {
    content = (
      <PaymentView
        payment={state.payment}
        currency={currency}
        brand={brand}
        touch={touch}
        onQrPaidClaim={paymentCartId ? onQrPaidClaim : undefined}
      />
    );
  } else if (view === 'tip' && state?.cart && state.tip) {
    content = <TipView cart={state.cart} tip={state.tip} currency={currency} brand={brand} touch={touch} onSelect={tipCartId ? onTipSelect : undefined} />;
  } else if (view === 'thanks' && state?.thanks) {
    content = <ThanksView total={state.thanks.total} currency={currency} brand={brand} />;
  } else {
    content = <IdleView brand={brand} />;
  }

  return (
    <div
      className="flex h-[100dvh] w-screen select-none flex-col overflow-hidden bg-white text-neutral-900"
      style={SCALE_STYLE}
      data-view={view}
      data-shows-amounts={viewShowsAmounts(view) ? 'true' : 'false'}
    >
      <style>{`@keyframes pdTick { from { transform: scale(1.04); } to { transform: scale(1); } } .pd-tick { animation: pdTick 200ms ease-out; }`}</style>
      {view === 'idle' ? null : <BrandHeader brand={brand} cashierName={cashierName} muted={muted} />}
      <main key={view} className="flex min-h-0 flex-1 flex-col animate-fade-in">
        {content}
      </main>
      <footer className="px-[var(--pd-gutter)] py-2 text-right text-[max(11px,calc(var(--pd-small)*0.7))] text-neutral-300">
        {t('poweredBy')}
      </footer>
      <FullscreenButton />
    </div>
  );
}
