'use client';

/**
 * /pos-display — pantalla del cliente del POS (docs/pos-doble-pantalla/PLAN.md).
 *
 * Fuera de /app a propósito: sin sidebar, sin header, sin AuthGuard de la
 * app (mismo molde que /qr-display). Comparte origen con la caja, así que
 * lee el mismo `localStorage` (terminal, organización activa) y el mismo
 * BroadcastChannel. No calcula ni persiste nada: refleja lo que la caja emite.
 */

import { CustomerDisplay } from '@/components/pos-display/CustomerDisplay';

export default function PosDisplayPage() {
  return <CustomerDisplay />;
}
