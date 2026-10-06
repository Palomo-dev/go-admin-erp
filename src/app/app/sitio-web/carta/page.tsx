'use client';

/**
 * /app/sitio-web/carta — «Carta» (Figma 01b): qué productos salen en la web por
 * sede, con precio web y agotados. Viene de Branding › Carta por sede.
 */
import CartaPorSedePanel from '@/components/organization/branding/carta-sede/CartaPorSedePanel';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';

export default function CartaSitioWebPage() {
  return (
    <MarcoSitioWeb href="/app/sitio-web/carta">
      <CartaPorSedePanel />
    </MarcoSitioWeb>
  );
}
