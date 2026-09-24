/**
 * Propina del cobro del POS (POS-PLAN §2.6, L44): lo que el diálogo ofrece.
 * La aritmética vive en `@/lib/pos/display/tip` (`computeTipAmount`, la misma
 * que usa la pantalla del cliente) y el seguimiento del pago precargado en
 * `@/components/pos/display/tipNotice`; aquí solo lo que estaba escrito en
 * `CheckoutDialog.tsx`:
 *
 * - Los porcentajes que ofrece la caja son fijos (5/10/15/20 %), no salen de
 *   la configuración de la organización (H9 / D7 del plan: 15 y 20 %
 *   contradicen el tope del 10 % de cargos; se decide en el paso 12).
 * - La base es `baseTotal` (total con impuestos, sin propina ni flete).
 * - El mesero se elige entre TODOS los miembros de la organización; la misma
 *   lista sirve para el vendedor de la comisión (L45).
 */

/** Porcentajes de los botones de propina del cobro, en el orden en que se pintan. */
export const PORCENTAJES_PROPINA: readonly number[] = [5, 10, 15, 20];

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
