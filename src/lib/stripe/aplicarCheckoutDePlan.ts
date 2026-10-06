/**
 * Aplica en la base un Checkout de Stripe de CAMBIO DE PLAN ya completado:
 * suscripción de la organización, `organizations.plan_id` y módulos core.
 *
 * Punto único (regla dura 7) para los dos caminos que lo necesitan:
 *  - el webhook `checkout.session.completed` (firma verificada con
 *    `constructEvent`), y
 *  - `POST /api/stripe/confirm-plan-change`, que el navegador puede llamar al
 *    volver del Checkout para no esperar al webhook (sesión + organización de
 *    la sesión = `metadata.organizationId` + permiso de facturación).
 * Antes cada uno tenía su copia y ya habían divergido (la ruta no activaba los
 * módulos core; el webhook no era idempotente).
 *
 * La organización y el plan salen SIEMPRE de la metadata que puso el servidor
 * al crear el Checkout (`create-checkout-session`), nunca de la petición.
 *
 * Idempotente: si la suscripción de la organización ya apunta a esta
 * suscripción de Stripe y a este plan, no se escribe nada (`ya_aplicado`).
 * Así el webhook y la confirmación del navegador pueden llegar en cualquier
 * orden y repetirse sin efectos dobles.
 */

import type Stripe from 'stripe';
import { periodoSuscripcionISO } from '@/lib/stripe/periodoSuscripcion';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ResultadoCheckoutDePlan =
  | { estado: 'aplicado' | 'ya_aplicado'; organizationId: number; plan: { id: number; code: string; name: string } }
  | { estado: 'invalido'; motivo: string };

/** Datos mínimos del Checkout que se leen (el objeto de Stripe o el del evento). */
export type CheckoutDePlan = Pick<Stripe.Checkout.Session, 'id' | 'metadata' | 'subscription' | 'customer'>;

/** Organización declarada en la metadata del Checkout (0 si falta o no es válida). */
export function organizacionDelCheckout(checkout: Pick<Stripe.Checkout.Session, 'metadata'>): number {
  const n = Number.parseInt(String(checkout.metadata?.organizationId ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function idDe(valor: string | { id: string } | null | undefined): string | null {
  if (!valor) return null;
  return typeof valor === 'string' ? valor : valor.id ?? null;
}

function fecha(segundos: number | null | undefined): string | null {
  return typeof segundos === 'number' && segundos > 0 ? new Date(segundos * 1000).toISOString() : null;
}

export async function aplicarCheckoutDePlan(
  supabase: SupabaseClient,
  stripe: Stripe,
  checkout: CheckoutDePlan,
): Promise<ResultadoCheckoutDePlan> {
  const organizationId = organizacionDelCheckout(checkout);
  const planCode = checkout.metadata?.planCode;
  const billingPeriod = checkout.metadata?.billingPeriod ?? null;
  const subscriptionId = idDe(checkout.subscription as string | { id: string } | null);
  const customerId = idDe(checkout.customer as string | { id: string } | null);

  if (!organizationId || !planCode) {
    return { estado: 'invalido', motivo: 'El Checkout no trae organización o plan en su metadata' };
  }
  if (!subscriptionId) {
    return { estado: 'invalido', motivo: 'El Checkout no tiene suscripción de Stripe' };
  }

  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, code, name')
    .eq('code', planCode)
    .maybeSingle();
  if (planError || !plan) {
    return { estado: 'invalido', motivo: `Plan no encontrado: ${planCode}` };
  }

  const { data: existente } = await supabase
    .from('subscriptions')
    .select('id, plan_id, stripe_subscription_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente && existente.stripe_subscription_id === subscriptionId && existente.plan_id === plan.id) {
    return { estado: 'ya_aplicado', organizationId, plan };
  }

  type Periodo = { current_period_start?: number; current_period_end?: number };
  const suscripcion = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Periodo & {
    status: string;
    trial_start?: number | null;
    trial_end?: number | null;
    items?: { data?: Periodo[] };
  };
  const periodo = periodoSuscripcionISO(suscripcion);

  const ahora = new Date().toISOString();
  const datos = {
    organization_id: organizationId,
    plan_id: plan.id,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    status: suscripcion.status,
    billing_period: billingPeriod,
    current_period_start: periodo.inicio ?? ahora,
    current_period_end: periodo.fin,
    trial_start: fecha(suscripcion.trial_start),
    trial_end: fecha(suscripcion.trial_end),
    cancel_at_period_end: false,
    updated_at: ahora,
  };

  const escritura = existente
    ? await supabase.from('subscriptions').update(datos).eq('id', existente.id)
    : await supabase.from('subscriptions').insert({ ...datos, created_at: ahora });
  if (escritura.error) {
    throw new Error(`No se pudo guardar la suscripción: ${escritura.error.message}`);
  }

  const { error: orgError } = await supabase
    .from('organizations')
    .update({ plan_id: plan.id, updated_at: ahora })
    .eq('id', organizationId);
  if (orgError) {
    throw new Error(`No se pudo actualizar el plan de la organización: ${orgError.message}`);
  }

  // Módulos core siempre activos (antes solo lo hacía el webhook).
  const { data: core } = await supabase.from('modules').select('code').eq('is_core', true);
  for (const modulo of (core ?? []) as Array<{ code: string }>) {
    await supabase
      .from('organization_modules')
      .upsert(
        { organization_id: organizationId, module_code: modulo.code, is_active: true, enabled_at: ahora },
        { onConflict: 'organization_id,module_code' },
      );
  }

  return { estado: 'aplicado', organizationId, plan };
}
