'use client';

/**
 * /app/sitio-web/ventas — «Ventas en línea» (Figma 01b): checkout, pagos y
 * envíos de la tienda web. Viene de Branding › Checkout (BrandingCheckoutTab).
 */
import { BrandingCheckoutTab } from '@/components/organization/branding';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';

export default function VentasSitioWebPage() {
  return (
    <MarcoSitioWeb href="/app/sitio-web/ventas">
      <BrandingCheckoutTab />
    </MarcoSitioWeb>
  );
}
