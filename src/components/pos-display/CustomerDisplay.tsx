'use client';

/**
 * Pantalla del cliente (PLAN §4). Raíz de /pos-display: une el receptor
 * (useDisplayReceiver), la marca (useDisplayBrand) y la resolución de vista
 * (logic.ts) y pinta el estado con un fundido de 200 ms entre vistas.
 *
 * Tipografías fluidas con clamp(): el TOTAL mide ≥ 96 px a 1920×1080 y sigue
 * legible a 1024×768 (PLAN §4.1 y §13). Sin scroll, sin sonidos, ninguna
 * animación mayor de 300 ms.
 *
 * Fase 3 (parte B): antes del receptor decide useRemoteDisplay. En `local`
 * todo sigue igual (BroadcastChannel / relay); en `ready` el receptor es el
 * remoto (Supabase Broadcast), la marca sale del bootstrap y el idioma del
 * comercio (`bootstrap.locale`) se aplica a la tableta; `pairing`,
 * `bootstrapping` y `unavailable` pintan sus vistas sin tocar el enlace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { changeLanguage } from '@/i18n/provider';
import { offersPairingFromBootstrap, resolveRemoteLocale } from '@/lib/pos/display/remoteDisplay';
import { BrandHeader } from './BrandHeader';
import { FullscreenButton } from './FullscreenButton';
import { OrderView } from './OrderView';
import { PairingView } from './PairingView';
import { TipView } from './TipView';
import { offersPairing, resolveDisplayCurrency, resolveShellContent, resolveTouch, resolveView, viewShowsAmounts } from './logic';
import { markRenderHealthy } from './retryBackoff';
import { NEUTRAL_DISPLAY_BRAND, brandFromBootstrap, useLocalDisplayBrand, type DisplayBrand } from './useDisplayBrand';
import { useDisplayReceiver } from './useDisplayReceiver';
import { useRemoteDisplay } from './useRemoteDisplay';
import {
  ConnectingView,
  IdleView,
  PaymentView,
  RemoteBootstrappingView,
  RemoteUnavailableView,
  ThanksView,
  UnsupportedView,
  UpdateRequiredView,
} from './views';

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
  const remote = useRemoteDisplay();
  const remotePhase = remote.phase;
  const remoteSource = remotePhase.kind === 'ready' ? remotePhase.source : null;
  // El receptor solo se abre cuando ya se sabe si la pantalla es local o remota.
  const link = useDisplayReceiver(remoteSource, remotePhase.kind === 'local' || remotePhase.kind === 'ready');
  // Remoto: la marca viene del bootstrap (la tableta no tiene sesión). Se memoriza por bootstrap
  // para no construir un objeto nuevo en cada render.
  const remoteBrand = useMemo(() => (remotePhase.kind === 'ready' ? brandFromBootstrap(remotePhase.bootstrap.brand) : null), [remotePhase]);
  const state = link.state;

  /**
   * Idioma de la pantalla REMOTA (ronda 4 · QA-4). `bootstrap.locale` sale
   * del ajuste `pos_customer_display` de la organización, resuelto en el
   * servidor; hasta ahora se validaba, viajaba y no se usaba, así que una
   * tableta recién sacada de la caja pintaba en el idioma de su navegador y
   * no en el del comercio. `changeLanguage` carga los mensajes y avisa al
   * proveedor sin recargar. `resolveRemoteLocale` devuelve null si el idioma
   * ya es ese o no es uno de los de la app: el efecto no puede ciclar.
   */
  const currentLocale = useLocale();
  const bootstrapLocale = remotePhase.kind === 'ready' ? remotePhase.bootstrap.locale : null;
  useEffect(() => {
    const next = resolveRemoteLocale(bootstrapLocale, currentLocale);
    if (next) changeLanguage(next);
  }, [bootstrapLocale, currentLocale]);

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

  /**
   * Todo lo que necesita la marca, como función: así la marca LOCAL —que
   * arrastra `useOrganization()`— solo se monta cuando la pantalla es local
   * (ronda 2 · 5). En remoto la marca es el bootstrap; en emparejamiento y
   * bootstrap todavía no se sabe de qué comercio es (marca neutra).
   */
  const renderShell = (brand: DisplayBrand) => {
    // Qué bloque se pinta y si se ofrece emparejar: regla pura en logic.ts
    // (ronda 3 · 1), para que «no compatible» deje de tapar el único acceso
    // al emparejamiento en un navegador sin BroadcastChannel.
    const shell = resolveShellContent(remotePhase.kind, link.supported);
    const onPair = offersPairing(shell, remotePhase.kind, link.terminalId !== null) ? remote.openPairing : undefined;
    let content: React.ReactNode;
    if (shell === 'deciding') {
      // Primer render: aún no se leyó la URL ni el storage. Un fotograma en blanco antes que un texto equivocado.
      content = <div className="flex-1" data-deciding="true" />;
    } else if (shell === 'pairing' && remotePhase.kind === 'pairing') {
      content = (
        <PairingView
          // `key` por prefill: un código conservado tras un fallo de red entra
          // aunque la vista ya estuviera montada (el campo se inicializa una
          // sola vez); el efecto de sincronía lo cubre igual, y esto lo hace
          // evidente en el árbol.
          key={`pairing:${remotePhase.prefill}`}
          busy={remotePhase.busy}
          error={remotePhase.error}
          prefill={remotePhase.prefill}
          keepCodeOnError={remotePhase.keepCode === true}
          retryAfterSeconds={remotePhase.retryAfterSeconds ?? null}
          touch={link.touchDetected}
          onSubmit={remote.submitCode}
          onCancel={remotePhase.canCancel ? remote.cancelPairing : undefined}
        />
      );
    } else if (shell === 'bootstrapping' && remotePhase.kind === 'bootstrapping') {
      // Tras tres fallos seguidos que no son 401 se ofrece teclear un
      // código (ronda 4 · B4): la fase reintenta para siempre y, si el token
      // guardado ya no sirve por algo que el servidor no dice con un 401, sin
      // esto no hay salida desde la propia pantalla.
      content = (
        <RemoteBootstrappingView
          failureCode={remotePhase.failure === null ? null : remotePhase.failure.kind === 'http' ? remotePhase.failure.code : 'NETWORK'}
          onPair={offersPairingFromBootstrap(remotePhase.attempt, remotePhase.failure) ? remote.openPairing : undefined}
        />
      );
    } else if (shell === 'unavailable') {
      content = <RemoteUnavailableView />;
    } else if (shell === 'unsupported') {
      content = <UnsupportedView onPair={onPair} />;
    } else if (view === 'connecting') {
      content = (
        <ConnectingView
          brand={brand}
          hasTerminal={link.terminalId !== null}
          onPair={onPair}
          remoteChannelDown={remoteSource !== null && remote.channelStatus !== 'SUBSCRIBED'}
        />
      );
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
  };

  if (remoteBrand) return renderShell(remoteBrand);
  if (remotePhase.kind === 'local') return <LocalBrandShell organizationId={link.hello?.organizationId ?? null} render={renderShell} />;
  return renderShell(NEUTRAL_DISPLAY_BRAND);
}

/**
 * Monta la marca LOCAL y pinta con ella. Existe para que `useOrganization()`
 * —y su reintento de 1,5 s en un equipo sin sesión— no se monte nunca en una
 * pantalla remota: las reglas de los hooks no dejan saltárselo dentro del
 * hook, pero sí no montar el componente que lo llama.
 */
function LocalBrandShell({
  organizationId,
  render,
}: {
  organizationId: number | null;
  render: (brand: DisplayBrand) => React.ReactElement;
}): React.ReactElement {
  const brand = useLocalDisplayBrand(organizationId);
  return render(brand);
}
