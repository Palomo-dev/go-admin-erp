'use client';

/**
 * /app/sitio-web/carta — «Carta» (Figma B/13-01, 13-04, 13-06): la lista de
 * cartas por horario y sede. La disponibilidad, el precio web y los agotados
 * por sede (antes la página entera) pasan a la pestaña «Por sede» del detalle.
 */
import { PantallaCartas } from '@/components/sitio-web/configuracion/carta/PantallaCartas';

export default function CartaSitioWebPage() {
  return <PantallaCartas />;
}
