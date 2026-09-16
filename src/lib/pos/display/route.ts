/**
 * Ruta de la pantalla del cliente y cómo reconocerla desde el layout raíz.
 *
 * /pos-display vive fuera de /app (sin sidebar ni header), pero el layout
 * raíz (src/app/layout.tsx) monta componentes globales que pintan UI encima
 * de cualquier ruta: el banner de instalación de la PWA y el gestor de
 * notificaciones push. Frente al cliente no puede aparecer nada que no sea
 * la marca del comercio (PLAN §4.1.4: «cero navegación, no hay menús»;
 * §4.1.5: marca del comercio, no de GO Admin). Esos componentes consultan
 * `isCustomerDisplayPath(usePathname())` y se retiran.
 *
 * Sin React ni DOM: se prueba en Node (src/__tests__/pos-display).
 */

export const CUSTOMER_DISPLAY_ROUTE = '/pos-display';

/**
 * true para `/pos-display` y cualquier subruta (`/pos-display/…`), con o sin
 * barra final. `null` (usePathname puede serlo por src/pages) y cualquier otra
 * ruta → false. No mira query ni hash: Next entrega el pathname sin ellos.
 */
export function isCustomerDisplayPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false;
  return pathname === CUSTOMER_DISPLAY_ROUTE || pathname.startsWith(`${CUSTOMER_DISPLAY_ROUTE}/`);
}
