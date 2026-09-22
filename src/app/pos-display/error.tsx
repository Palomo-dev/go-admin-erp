'use client';

/**
 * Error boundary de /pos-display (Next App Router). La pantalla del cliente
 * no puede morir entera por un `state` que una vista no supo pintar (un QR
 * que no cabe, una librería que lanza): muestra «siga las instrucciones del
 * cajero» y vuelve a montar la pantalla sola (`reset`) para engancharse al
 * siguiente `state` de la caja. Sin botones: nadie está delante para
 * pulsarlos, y el cajero no ve esta pantalla. PLAN §3.5 «nunca un código
 * roto».
 *
 * Retroceso (ronda 3 de F2-C): el reintento NO es fijo. Si el `state` que
 * tumbó la vista es determinista y la caja lo reenvía al `need_snapshot` del
 * remontaje, un reintento fijo e incondicional de 8 s entraría en un bucle
 * con display_bye/need_snapshot y la presencia parpadeando en la caja.
 * `retryBackoff.ts` crece la espera por `error.digest` (8 s, 16 s, 32 s,
 * tope 60 s) mientras siga fallando lo mismo, y vuelve a 8 s con un error
 * distinto. Hoy el único camino conocido (QR largo) lo cortan logic.ts y
 * QrCodeBoundary; esto es la última red. Solo exporta el componente: los
 * archivos especiales de App Router no admiten otros exports.
 *
 * Ronda 4 (C4): el contador avanza UNA vez por error aunque React
 * StrictMode (desarrollo) ejecute el efecto dos veces por montaje
 * (`retryDelayFor` recuerda la espera por objeto de error), y se reinicia
 * cuando CustomerDisplay vuelve a pintar bien (`markRenderHealthy`).
 */

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { retryDelayFor } from '@/components/pos-display/retryBackoff';

export default function PosDisplayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('posDisplay');

  useEffect(() => {
    // Mismo objeto `error` en las dos pasadas de StrictMode → misma espera, un solo avance.
    const delay = retryDelayFor(error);
    console.warn(`[pos-display] error de render; la pantalla se remonta sola en ${Math.round(delay / 1000)} s`, error);
    const timer = setTimeout(reset, delay);
    return () => clearTimeout(timer);
  }, [error, reset]);

  return (
    <div className="flex h-[100dvh] w-screen select-none flex-col items-center justify-center gap-4 bg-white px-8 text-center text-neutral-900">
      <p className="text-3xl font-semibold uppercase tracking-wider text-neutral-500">{t('payment.qr')}</p>
      <p className="text-4xl font-semibold">{t('payment.qrInstructions')}</p>
    </div>
  );
}
