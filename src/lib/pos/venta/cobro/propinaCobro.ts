/**
 * Propina del cobro del POS (POS-PLAN §2.6, L44): lo que el diálogo ofrece.
 * La aritmética vive en `@/lib/pos/display/tip` (`computeTipAmount`, la misma
 * que usa la pantalla del cliente) y el seguimiento del pago precargado en
 * `@/components/pos/display/tipNotice`; aquí solo lo que estaba escrito en
 * `CheckoutDialog.tsx`:
 *
 * - Paso 12 (decisión D7 del dueño): la caja ofrece 5 y 10 % y «otro valor»
 *   con tope del 10 %, y la base es el subtotal SIN impuestos del cobro
 *   (`baseDePropina`). Los porcentajes y el tope viven en
 *   `@/lib/pos/display/tip`, el mismo sitio que usa la pantalla del cliente.
 *   Antes: 5/10/15/20 % sobre el total con impuestos (`baseTotal`).
 * - El mesero se elige entre TODOS los miembros de la organización; la misma
 *   lista sirve para el vendedor de la comisión (L45).
 */

import { PORCENTAJES_PROPINA_SUGERIDOS, topePropina } from '@/lib/pos/display/tip';

export { topePropina };

/** Porcentajes de los botones de propina del cobro, en el orden en que se pintan (5 y 10 %). */
export const PORCENTAJES_PROPINA: readonly number[] = PORCENTAJES_PROPINA_SUGERIDOS;

/** Lo que el cobro sabe de sus totales para la base de la propina. */
export interface TotalesParaPropina {
  calculatedTotals: { subtotal: number };
  cart: { subtotal: number };
}

/**
 * Base de la propina: el subtotal SIN impuestos que ya calculó el cobro
 * (`calculateCartTotals`: base imponible, con los descuentos aplicados); si
 * el cobro aún no lo tiene, el subtotal del carrito. Nunca negativa.
 */
export function baseDePropina({ calculatedTotals, cart }: TotalesParaPropina): number {
  const base = calculatedTotals.subtotal > 0 ? calculatedTotals.subtotal : cart.subtotal;
  return Number.isFinite(base) && base > 0 ? base : 0;
}

/** «Otro valor» de la propina: entero no negativo y nunca por encima del 10 % de la base. */
export function propinaTopada(valor: number, base: number): number {
  const limpio = Number.isFinite(valor) && valor > 0 ? valor : 0;
  return Math.min(limpio, topePropina(base));
}

/** Miembro de la organización tal como lo devuelve `POSService.getOrganizationMembers`. */
export interface MiembroParaCobro {
  user_id: string;
  users?: {
    email?: string | null;
    raw_user_meta_data?: { full_name?: string | null; name?: string | null } | null;
  } | null;
}

export interface PersonaDelCobro {
  id: string;
  name: string;
}

/** Meseros (y vendedores) del cobro: nombre completo, nombre, correo o «Sin nombre». */
export function meserosDesdeMiembros(members: MiembroParaCobro[]): PersonaDelCobro[] {
  return members.map(m => ({
    id: m.user_id,
    name: m.users?.raw_user_meta_data?.full_name ||
          m.users?.raw_user_meta_data?.name ||
          m.users?.email || 'Sin nombre'
  }));
}
