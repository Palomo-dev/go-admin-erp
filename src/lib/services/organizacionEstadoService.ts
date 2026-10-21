/**
 * Desactivar una organización: SOLO desde el servidor (auditoría de
 * Organización 2026-10, P0-9).
 *
 * Antes lo hacía el navegador (`update organizations set status = ...` con la
 * clave anónima): una organización suspendida por la plataforma volvía a
 * `active` con un clic de su admin y «eliminar» dejaba la suscripción de
 * Stripe cobrando. Reglas:
 *
 * - Desactivar: solo una organización `active`. Si Stripe va a cobrar
 *   (activa, vencida, o prueba con tarjeta), 409: primero se cancela en
 *   Plan y facturación. Un id de otra cuenta, o una prueba sin tarjeta,
 *   no bloquean: se cierran y se sigue.
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
import {
  accionAlDesactivar,
  lectorStripeReal,
  parcheSuscripcionAusente,
  parcheSuscripcionCancelada,
  type LectorSuscripcionStripe,
} from '@/lib/stripe/suscripcionAusente';

export const ESTADOS_SUSCRIPCION_VIVOS = ['active', 'trialing', 'past_due'] as const;

export interface SuscripcionParaEstado {
  id?: string;
  status: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id?: string | null;
  cancel_at_period_end: boolean | null;
  metadata?: unknown;
}

export interface Rechazo {
  status: 404 | 409;
  codigo: 'ESTADO_NO_PERMITIDO' | 'SUSCRIPCION_VIVA' | 'NO_EXISTE';
  mensaje: string;
}

/**
 * Fila que hay que contrastar con Stripe. No decide el 409: un id de otra
 * cuenta también cumple esto y no va a cobrar.
 */
export function tieneSuscripcionStripeViva(subs: readonly SuscripcionParaEstado[]): boolean {
  return subs.some(
    (s) =>
      !!s.stripe_subscription_id &&
      (ESTADOS_SUSCRIPCION_VIVOS as readonly string[]).includes(String(s.status)) &&
      !s.cancel_at_period_end
  );
}

const RECHAZO_VIVA: Rechazo = {
  status: 409,
  codigo: 'SUSCRIPCION_VIVA',
  mensaje: 'Cancela la suscripción antes de desactivar la organización',
};

export function rechazoDesactivar(estadoOrg: string | null): Rechazo | null {
  // `suspended` también cae aquí: su estado lo maneja la plataforma.
  if (estadoOrg !== 'active') {
    return { status: 409, codigo: 'ESTADO_NO_PERMITIDO', mensaje: 'Solo se puede desactivar una organización activa' };
  }
  return null;
}

async function leer(servicio: SupabaseClient, organizationId: number) {
  const [{ data: org, error: errOrg }, { data: subs, error: errSubs }] = await Promise.all([
    servicio.from('organizations').select('id, status').eq('id', organizationId).maybeSingle(),
    servicio
      .from('subscriptions')
      .select('id, status, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, metadata')
      .eq('organization_id', organizationId),
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
async function cerrarFilasQueNoCobran(
  servicio: SupabaseClient,
  organizationId: number,
  subs: readonly SuscripcionParaEstado[],
  lector: LectorSuscripcionStripe,
): Promise<Rechazo | null> {
  const candidatas = subs.filter((s) => tieneSuscripcionStripeViva([s]));
  if (candidatas.some((s) => !s.id || !s.stripe_subscription_id)) return RECHAZO_VIVA;
  const leidas: Array<{ fila: SuscripcionParaEstado; accion: ReturnType<typeof accionAlDesactivar> }> = [];
  for (const fila of candidatas) {
    const lectura = await lector.leer(fila.stripe_subscription_id as string);
    leidas.push({ fila, accion: accionAlDesactivar(lectura) });
  }
  if (leidas.some((x) => x.accion === 'bloquear')) return RECHAZO_VIVA;

  const ahora = new Date().toISOString();
  for (const { fila, accion } of leidas) {
    let ausente = accion === 'ausente';
    if (accion === 'cancelar_prueba') {
      const cancelacion = await lector.cancelar(fila.stripe_subscription_id as string);
      ausente = cancelacion.ausente;
    }
    const valores = ausente
      ? parcheSuscripcionAusente(
          {
            stripe_subscription_id: fila.stripe_subscription_id,
            stripe_customer_id: fila.stripe_customer_id ?? null,
            metadata: fila.metadata,
          },
          ahora,
        )
      : parcheSuscripcionCancelada(ahora);
    const { error } = await servicio
      .from('subscriptions')
      .update(valores)
      .eq('id', fila.id)
      .eq('organization_id', organizationId);
    if (error) throw new Error(`cerrar suscripción ${fila.id}: ${error.message}`);
    if (ausente) {
      console.warn('[organizacionEstado] suscripción ausente en Stripe; se cancela en la base', {
        organizationId,
        subscriptionRowId: fila.id,
      });
    }
  }
  return null;
}

export async function desactivarOrganizacion(
  servicio: SupabaseClient,
  organizationId: number,
  userId: string,
  lector?: LectorSuscripcionStripe,
): Promise<ResultadoEstado> {
  const { org, subs } = await leer(servicio, organizationId);
  if (!org) return { ok: false, rechazo: { status: 404, codigo: 'NO_EXISTE', mensaje: 'Organización no encontrada' } };
  const rechazo = rechazoDesactivar(org.status as string | null);
  if (rechazo) return { ok: false, rechazo };

  const candidatas = subs.some((s) => tieneSuscripcionStripeViva([s]));
  if (candidatas) {
    const usado = lector ?? lectorStripeReal;
    const bloqueo = await cerrarFilasQueNoCobran(servicio, organizationId, subs, usado);
    if (bloqueo) return { ok: false, rechazo: bloqueo };
  }

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
