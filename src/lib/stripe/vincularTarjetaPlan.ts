/**
 * Vincular una tarjeta desde Plan, cuando el alta no la dejó guardada.
 *
 * No cobra y no crea una suscripción. Crea (si falta) el cliente de Stripe de
 * ESTA organización, confirma un SetupIntent de ese cliente y lo deja como
 * medio predeterminado. Si ya hay suscripción de ese mismo cliente, también
 * queda ahí, para que el próximo cobro —incluido el fin de la prueba— tenga
 * con qué hacerse.
 */

import type Stripe from 'stripe';
import { asegurarMedioEnCliente, fijarMedioEnSuscripcion, idDe } from './medioDePagoSuscripcion';

export const ORIGEN_VINCULAR_PLAN = 'plan_page';

const CORREO_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const SETUP_RE = /^seti_[A-Za-z0-9]{6,64}$/;

export class SetupIntentAjenoError extends Error {
  constructor() {
    super('El intento de configuración no pertenece a esta organización');
    this.name = 'SetupIntentAjenoError';
  }
}

export class TarjetaNoConfirmadaError extends Error {
  constructor() {
    super('La tarjeta no quedó confirmada');
    this.name = 'TarjetaNoConfirmadaError';
  }
}

export function idSetupIntentValido(id: string): boolean {
  return SETUP_RE.test(id);
}

function correoUtil(valor: string | null | undefined): string | undefined {
  const email = valor?.trim().toLowerCase();
  if (!email || !CORREO_RE.test(email)) return undefined;
  return email;
}

/** Cliente de la organización. Sin correo inventado: si no hay uno válido, Stripe lo crea sin email. */
export function parametrosClienteDePlan(datos: {
  organizationId: number;
  name: string;
  email: string | null;
}): Stripe.CustomerCreateParams {
  const email = correoUtil(datos.email);
  const name = datos.name.trim().slice(0, 200);
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    metadata: {
      organizationId: String(datos.organizationId),
      source: ORIGEN_VINCULAR_PLAN,
      status: 'active',
    },
  };
}

export function conPredeterminada<T extends { id: string }>(
  metodos: T[],
  predeterminadaId: string | null | undefined,
): Array<T & { isDefault: boolean }> {
  return metodos.map((m) => ({ ...m, isDefault: predeterminadaId != null && m.id === predeterminadaId }));
}

/**
 * La tarjeta ya fue confirmada en el navegador (`confirmCardSetup`). Aquí solo
 * se comprueba que el SetupIntent es de este cliente y se fija el medio.
 * No llama a cobrar ni a crear una suscripción.
 */
export async function confirmarTarjetaDelPlan(
  stripe: Stripe,
  datos: { customerId: string; organizationId: number; subscriptionId?: string | null; setupIntentId: string },
): Promise<{ paymentMethodId: string }> {
  const intent = await stripe.setupIntents.retrieve(datos.setupIntentId);
  const customerId = idDe(intent.customer);
  const organizationId = intent.metadata?.organizationId;
  if (
    customerId !== datos.customerId ||
    intent.metadata?.source !== ORIGEN_VINCULAR_PLAN ||
    organizationId !== String(datos.organizationId)
  ) {
    throw new SetupIntentAjenoError();
  }
  if (intent.status !== 'succeeded') throw new TarjetaNoConfirmadaError();
  const paymentMethodId = idDe(intent.payment_method);
  if (!paymentMethodId) throw new TarjetaNoConfirmadaError();

  const subscriptionId = datos.subscriptionId?.trim() || '';
  if (subscriptionId) {
    try {
      const suscripcion = await stripe.subscriptions.retrieve(subscriptionId);
      if (idDe(suscripcion.customer) === datos.customerId) {
        await fijarMedioEnSuscripcion(stripe, subscriptionId, paymentMethodId);
        return { paymentMethodId };
      }
      // La suscripción guardada no es de este cliente. La tarjeta se queda en
      // el cliente de la organización; no se mueve a otro cliente ni se cobra.
      console.warn('[vincular-tarjeta] la suscripción no es de este cliente; solo se guarda en el cliente', {
        organizationId: datos.organizationId,
      });
    } catch (error: unknown) {
      if (!esRecursoInexistente(error)) throw error;
      console.warn('[vincular-tarjeta] la suscripción ya no existe; solo se guarda en el cliente', {
        organizationId: datos.organizationId,
      });
    }
  }

  await asegurarMedioEnCliente(stripe, datos.customerId, paymentMethodId);
  return { paymentMethodId };
}

/** El código `resource_missing` de Stripe: el id guardado ya no existe en este entorno. */
export function esRecursoInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'resource_missing';
}
