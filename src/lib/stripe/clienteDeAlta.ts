/**
 * Cliente de Stripe «de alta»: el que crea el paso de tarjeta del registro
 * (`/api/stripe/setup-intent`) ANTES de que exista la cuenta o la organización.
 * GO-sec, auditoría 2026-09-24.
 *
 * Ese paso no tiene sesión (el usuario todavía no existe), así que el cliente
 * no puede atarse a nadie. Lo que sí se puede es que sea INOFENSIVO:
 *  - siempre se crea uno nuevo, marcado `metadata.source = signup_flow` y
 *    `metadata.status = pending_verification`; nunca se reutiliza uno buscado
 *    por correo (antes se devolvía el cliente EXISTENTE de ese correo, con su
 *    `customerId`, y la tarjeta que se confirmara quedaba como predeterminada
 *    de ese cliente ajeno);
 *  - solo se opera sobre clientes que siguen en ese estado
 *    (`esClienteDeAltaPendiente`);
 *  - al crear la suscripción, con sesión, el cliente solo se reclama si además
 *    su correo es el de la sesión (`clienteDeAltaReclamable`). Después
 *    `createSubscription` lo marca `status = active` y deja de ser reclamable.
 */

import type Stripe from 'stripe';

export const ORIGEN_ALTA = 'signup_flow';
export const ESTADO_PENDIENTE = 'pending_verification';

type ClienteStripe = Stripe.Customer | Stripe.DeletedCustomer;

/** ¿Cliente vivo, creado por el paso de tarjeta del alta y aún sin reclamar? */
export function esClienteDeAltaPendiente(cliente: ClienteStripe | null | undefined): cliente is Stripe.Customer {
  if (!cliente || (cliente as Stripe.DeletedCustomer).deleted) return false;
  const meta = (cliente as Stripe.Customer).metadata ?? {};
  return meta.source === ORIGEN_ALTA && meta.status === ESTADO_PENDIENTE;
}

/** Recupera un cliente; cualquier error (id inexistente, mal formado) es «no». */
export async function recuperarCliente(stripe: Stripe, customerId: string): Promise<ClienteStripe | null> {
  if (!/^cus_[A-Za-z0-9]{6,64}$/.test(customerId)) return null;
  try {
    return await stripe.customers.retrieve(customerId);
  } catch {
    return null;
  }
}

/**
 * ¿Puede el usuario de la sesión (con `emailSesion`) usar `customerId` para su
 * suscripción? Solo si es un cliente de alta pendiente con ese mismo correo.
 */
export async function clienteDeAltaReclamable(stripe: Stripe, customerId: string, emailSesion: string): Promise<boolean> {
  const cliente = await recuperarCliente(stripe, customerId);
  if (!esClienteDeAltaPendiente(cliente)) return false;
  return (cliente.email ?? '').trim().toLowerCase() === emailSesion.trim().toLowerCase();
}
