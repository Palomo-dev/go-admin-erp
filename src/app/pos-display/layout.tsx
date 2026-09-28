/**
 * Cabeceras de /pos-display.
 *
 * `Referrer-Policy: no-referrer` porque el código de emparejamiento viaja en
 * la URL (`?pair=123456`): sin esto, cualquier recurso externo que la pantalla
 * cargue —una imagen de reposo subida por la organización, por ejemplo— se
 * llevaría el código en el `Referer`. Mismo criterio que `publicPage.ts` para
 * el token de baja. El código se retira de la URL en cuanto se canjea o se
 * descarta (`forgetPairInUrl`), pero la cabecera cubre el rato en que está.
 *
 * `noindex, nofollow`: es un quiosco, no una página que deba indexarse.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function PosDisplayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
