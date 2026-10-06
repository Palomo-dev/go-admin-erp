/**
 * Desactivar una organización: SOLO desde el servidor (auditoría de
 * Organización 2026-10, P0-9).
 *
 * Antes lo hacía el navegador (`update organizations set status = ...` con la
 * clave anónima): una organización suspendida por la plataforma volvía a
 * `active` con un clic de su admin y «eliminar» dejaba la suscripción de
 * Stripe cobrando. Reglas:
 *
 * - Desactivar: solo una organización `active`, y solo si no tiene una
 *   suscripción de Stripe viva (sin cancelación programada): primero se
 *   cancela en Plan y facturación.
 * - Reactivar no se expone a la organización: lo hace la plataforma (soporte,
 *   service role). Una ruta de reactivar tendría que aceptar la organización
 *   del body sin membresía activa en ella (regla 5); y `suspended` en ningún
 *   caso lo deshace nadie de la organización.
 * - La migración 20261006150300 lo hace firme en la base: `authenticated` no
 *   escribe `status`, `owner_user_id` ni `plan_id`, y entrar o salir de
 *   `suspended` exige la plataforma.
 *
 * `servicio` es el cliente de service role; quien llama ya validó la sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ESTADOS_SUSCRIPCION_VIVOS = ['active', 'trialing', 'past_due'] as const;

export interface SuscripcionParaEstado {
  status: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
}

export interface Rechazo {
  status: 404 | 409;
  codigo: 'ESTADO_NO_PERMITIDO' | 'SUSCRIPCION_VIVA' | 'NO_EXISTE';
  mensaje: string;
}

/** ¿Sigue cobrando Stripe? Viva y sin cancelación programada. */
export function tieneSuscripcionStripeViva(subs: readonly SuscripcionParaEstado[]): boolean {
  return subs.some(
    (s) =>
      !!s.stripe_subscription_id &&
      (ESTADOS_SUSCRIPCION_VIVOS as readonly string[]).includes(String(s.status)) &&
      !s.cancel_at_period_end
  );
}

export function rechazoDesactivar(estadoOrg: string | null, subs: readonly SuscripcionParaEstado[]): Rechazo | null {
  // `suspended` también cae aquí: su estado lo maneja la plataforma.
  if (estadoOrg !== 'active') {
    return { status: 409, codigo: 'ESTADO_NO_PERMITIDO', mensaje: 'Solo se puede desactivar una organización activa' };
  }
  if (tieneSuscripcionStripeViva(subs)) {
    return { status: 409, codigo: 'SUSCRIPCION_VIVA', mensaje: 'Cancela la suscripción antes de desactivar la organización' };
  }
  return null;
}

async function leer(servicio: SupabaseClient, organizationId: number) {
  const [{ data: org, error: errOrg }, { data: subs, error: errSubs }] = await Promise.all([
    servicio.from('organizations').select('id, status').eq('id', organizationId).maybeSingle(),
    servicio.from('subscriptions').select('status, stripe_subscription_id, cancel_at_period_end').eq('organization_id', organizationId),
  ]);
  if (errOrg || errSubs) throw new Error(`organización ${organizationId}: ${errOrg?.message ?? errSubs?.message}`);
  return { org, subs: (subs ?? []) as SuscripcionParaEstado[] };
}

export type ResultadoEstado = { ok: true } | { ok: false; rechazo: Rechazo };

/**
 * Desactiva la organización y la membresía de quien lo pide (para que salga
 * de su selector, como antes). La organización ya está validada por la ruta
 * (sesión + membresía activa + administrador).
 */
export async function desactivarOrganizacion(servicio: SupabaseClient, organizationId: number, userId: string): Promise<ResultadoEstado> {
  const { org, subs } = await leer(servicio, organizationId);
  if (!org) return { ok: false, rechazo: { status: 404, codigo: 'NO_EXISTE', mensaje: 'Organización no encontrada' } };
  const rechazo = rechazoDesactivar(org.status as string | null, subs);
  if (rechazo) return { ok: false, rechazo };

  const { data: cambiada, error } = await servicio
    .from('organizations')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', organizationId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`desactivar ${organizationId}: ${error.message}`);
  // Otro proceso la cambió entre la lectura y la escritura.
  if (!cambiada) return { ok: false, rechazo: { status: 409, codigo: 'ESTADO_NO_PERMITIDO', mensaje: 'Solo se puede desactivar una organización activa' } };

  const { error: errMiembro } = await servicio
    .from('organization_members')
    .update({ is_active: false })
    .eq('organization_id', organizationId)
    .eq('user_id', userId);
  if (errMiembro) console.warn('[organizacionEstado] membresía de quien desactiva', errMiembro.message);
  return { ok: true };
}
