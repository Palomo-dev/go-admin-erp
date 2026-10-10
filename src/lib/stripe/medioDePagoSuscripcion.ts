/**
 * Tarjeta de la suscripción del SaaS.
 *
 * El alta confirma la tarjeta en un SetupIntent (`usage: off_session`) y la
 * deja como predeterminada del cliente. La suscripción en prueba, si nace con
 * `payment_behavior: default_incomplete`, abre OTRO SetupIntent que se queda
 * en `requires_confirmation` y no copia ese medio a
 * `subscription.default_payment_method`. Al terminar la prueba Stripe no
 * tiene con qué cobrar solo.
 *
 * Con tarjeta ya confirmada, la suscripción nace con ese medio. Sin tarjeta,
 * se mantiene el SetupIntent pendiente para que la agreguen después.
 */

import type Stripe from 'stripe';

export const COMPORTAMIENTO_SIN_TARJETA = 'default_incomplete' as const;

const ESTADOS_POR_CERRAR = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

export class MedioDePagoAjenoError extends Error {
  constructor() {
    super('El medio de pago no pertenece a este cliente');
    this.name = 'MedioDePagoAjenoError';
  }
}

export function idDe(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? ref : ref.id;
}

/** El medio del alta, o el que ya quedó predeterminado en el cliente. */
export function medioParaLaSuscripcion(
  paymentMethodId: string | null | undefined,
  cliente: { invoice_settings?: { default_payment_method?: string | { id: string } | null } | null } | null | undefined,
): string | undefined {
  const explicito = paymentMethodId?.trim();
  if (explicito) return explicito;
  return idDe(cliente?.invoice_settings?.default_payment_method ?? undefined);
}

export function parametrosSuscripcionEnPrueba(datos: {
  customerId: string;
  priceId: string;
  trialDays: number;
  paymentMethodId?: string | null;
  couponId?: string;
  metadata: Stripe.MetadataParam;
}): Stripe.SubscriptionCreateParams {
  const medio = datos.paymentMethodId?.trim() || undefined;
  return {
    customer: datos.customerId,
    items: [{ price: datos.priceId }],
    trial_period_days: datos.trialDays,
    payment_settings: { save_default_payment_method: 'on_subscription' },
    ...(medio
      ? { default_payment_method: medio }
      : { payment_behavior: COMPORTAMIENTO_SIN_TARJETA }),
    ...(datos.couponId ? { coupon: datos.couponId } : {}),
    metadata: datos.metadata,
  };
}

/** SetupIntent para cobrar después, sin pedir la tarjeta otra vez el día del cobro. */
export function parametrosSetupIntent(
  customerId: string,
  metadata?: Stripe.MetadataParam,
): Stripe.SetupIntentCreateParams {
  return {
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    ...(metadata ? { metadata } : {}),
  };
}

type ClienteConMedio = {
  deleted?: boolean;
  invoice_settings?: { default_payment_method?: string | { id: string } | null } | null;
};

type StripeMedios = {
  customers: {
    retrieve: (id: string) => Promise<ClienteConMedio>;
    update: (id: string, params: { invoice_settings: { default_payment_method: string } }) => Promise<unknown>;
  };
  paymentMethods: {
    retrieve: (id: string) => Promise<{ customer: string | { id: string } | null }>;
    attach: (id: string, params: { customer: string }) => Promise<unknown>;
  };
  subscriptions: {
    retrieve: (id: string) => Promise<{
      customer: string | { id: string } | null;
      pending_setup_intent?: string | { id: string; status?: string } | null;
    }>;
    update: (
      id: string,
      params: {
        default_payment_method: string;
        payment_settings: { save_default_payment_method: 'on_subscription' };
      },
    ) => Promise<{ pending_setup_intent?: string | { id: string; status?: string } | null }>;
  };
  setupIntents: {
    retrieve: (id: string) => Promise<{ status: string }>;
    cancel: (id: string) => Promise<unknown>;
  };
};

/** Si el alta ya guardó la tarjeta en el cliente, úsala aunque el body no la repita. */
export async function resolverMedioDeLaPrueba(
  stripe: { customers: { retrieve: (id: string) => Promise<ClienteConMedio> } },
  customerId: string,
  paymentMethodId?: string | null,
): Promise<string | undefined> {
  const explicito = paymentMethodId?.trim();
  if (explicito) return explicito;
  const cliente = await stripe.customers.retrieve(customerId);
  if (cliente.deleted) return undefined;
  return medioParaLaSuscripcion(undefined, cliente);
}

/**
 * Adjunta la tarjeta si todavía no tiene cliente y la deja predeterminada.
 * No vuelve a adjuntar una que ya es de este cliente: Stripe rechaza el segundo attach.
 */
export async function asegurarMedioEnCliente(
  stripe: Pick<StripeMedios, 'paymentMethods' | 'customers'>,
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const dueno = idDe(pm.customer);
  if (dueno && dueno !== customerId) throw new MedioDePagoAjenoError();
  if (!dueno) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/** Cierra la confirmación que Stripe dejó abierta al crear la prueba sin medio. */
export async function cerrarConfirmacionPendiente(
  stripe: Pick<StripeMedios, 'setupIntents'>,
  pending: string | { id: string; status?: string } | null | undefined,
): Promise<void> {
  const id = !pending ? undefined : typeof pending === 'string' ? pending : pending.id;
  if (!id) return;
  const estado =
    typeof pending === 'object' && pending.status
      ? pending.status
      : (await stripe.setupIntents.retrieve(id)).status;
  if (!ESTADOS_POR_CERRAR.has(estado)) return;
  await stripe.setupIntents.cancel(id);
}

/** Cliente y suscripción quedan con el mismo medio, y se cierra la confirmación colgada. */
export async function fijarMedioEnSuscripcion(
  stripe: StripeMedios,
  subscriptionId: string,
  paymentMethodId: string,
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idDe(subscription.customer);
  if (!customerId) throw new Error('La suscripción no tiene cliente');
  await asegurarMedioEnCliente(stripe, customerId, paymentMethodId);
  const actualizada = await stripe.subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
    payment_settings: { save_default_payment_method: 'on_subscription' },
  });
  await cerrarConfirmacionPendiente(stripe, actualizada.pending_setup_intent);
}
