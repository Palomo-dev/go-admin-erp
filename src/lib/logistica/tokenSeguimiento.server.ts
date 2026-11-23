/**
 * Enlace público de rastreo de un pedido web (solo servidor).
 *
 * REUTILIZA el token de la tienda: es copia exacta de goadmin-websites
 * `lib/orders/tokenSeguimiento.ts` (HMAC-SHA256 de `organization_id:order_id`, base64url, 32
 * caracteres). El ERP lo necesita para poner el enlace en los avisos «en camino», «entregado» y
 * «novedad»; la tienda valida el mismo token en `/pedido/<n>?t=` y lee el rastreo con
 * `logistica_rastreo_publico` (service role). Si cambia allá, cambia aquí: la prueba
 * __tests__/tokenSeguimiento.test.ts fija un valor conocido.
 *
 * Secreto: `ORDER_TRACKING_SECRET` (mín. 16 caracteres) o, si falta, derivado de la service role
 * key (mismo proyecto de Supabase que la tienda). Sin ninguno no hay token (falla cerrado).
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';

function secreto(): Buffer | null {
  const propio = process.env.ORDER_TRACKING_SECRET;
  if (propio && propio.length >= 16) return Buffer.from(propio);
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return createHash('sha256').update(`seguimiento-pedido:${serviceRole}`).digest();
  return null;
}

export function tokenSeguimiento(organizationId: number, orderId: string): string | null {
  const s = secreto();
  if (!s) return null;
  return createHmac('sha256', s).update(`${organizationId}:${orderId}`).digest('base64url').slice(0, 32);
}

export function tokenSeguimientoValido(
  organizationId: number,
  orderId: string,
  token: string | null | undefined,
): boolean {
  if (!token || typeof token !== 'string') return false;
  const esperado = tokenSeguimiento(organizationId, orderId);
  if (!esperado || esperado.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(token));
}

/**
 * URL absoluta del rastreo en la tienda: `https://<dominio>/pedido/<número>?t=<token>`.
 * `dominio` sale de organization_domains (el principal); sin token, la URL va sin `t` y la tienda
 * muestra solo el estado, sin datos personales.
 */
export function urlRastreo(
  dominio: string,
  organizationId: number,
  order: { id: string; order_number: string },
): string {
  const base = dominio.startsWith('http') ? dominio.replace(/\/+$/, '') : `https://${dominio.replace(/\/+$/, '')}`;
  const t = tokenSeguimiento(organizationId, order.id);
  return `${base}/pedido/${encodeURIComponent(order.order_number)}${t ? `?t=${t}` : ''}`;
}
