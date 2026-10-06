'use client';

/**
 * /app/sitio-web/ventas — «Ventas en línea» (Figma B/10-01…10-05): tablero de
 * checkout, pagos, envíos, cupones, pedidos online, reservas web y pasarela.
 * Ya no usa BrandingCheckoutTab (escribía `website_settings` desde el
 * navegador); el checkout se guarda por `PUT /api/sitio-web/ventas/checkout`.
 */
import { PantallaVentas } from '@/components/sitio-web/ventas/PantallaVentas';

export default function VentasSitioWebPage() {
  return <PantallaVentas />;
}
