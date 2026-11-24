/**
 * Acciones del ERP sobre el anticipo de un pedido contraentrega (Figma 3014:194407 › 06).
 *
 * - «Marcar anticipo recibido…»: RPC `fn_web_order_anticipo_marcar_recibido` (sesión, organización,
 *   sede y permiso `pos.pedidos_web.marcar_pagado` o `pos.void` los comprueba la base; el pago lo
 *   registra la base como cobro del anticipo y queda en ops_audit_log). Nunca se escribe
 *   `payments` ni la cartera desde aquí.
 * - Enlace de pago: `/api/web-orders/[id]/enlace-pago` (token de seguimiento firmado en el servidor).
 */
import { supabase } from '@/lib/supabase/config';

export const ERRORES_MARCAR_ANTICIPO = [
  'SIN_PERMISO', 'COMPROBANTE_REQUERIDO', 'PEDIDO_CERRADO', 'METODO_INVALIDO', 'SIN_ANTICIPO', 'SESION_REQUERIDA',
] as const;
export type ErrorMarcarAnticipo = (typeof ERRORES_MARCAR_ANTICIPO)[number] | 'OTRO';

export class MarcarAnticipoError extends Error {
  constructor(public readonly codigo: ErrorMarcarAnticipo, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'MarcarAnticipoError';
  }
}

/** Código del error de la RPC (el RAISE de la base), u `OTRO`. Puro. */
export function codigoErrorAnticipo(error: { message?: string; code?: string } | null | undefined): ErrorMarcarAnticipo {
  const m = `${error?.message ?? ''}`;
  const codigo = ERRORES_MARCAR_ANTICIPO.find((c) => m.includes(c));
  if (codigo) return codigo;
  return error?.code === '42501' ? 'SIN_PERMISO' : 'OTRO';
}

/** Medios con que el cliente pudo pagar el anticipo por fuera de la pasarela. */
export const MEDIOS_ANTICIPO_MANUAL = ['transfer', 'cash', 'qr', 'card'] as const;

export async function marcarAnticipoRecibido(
  orderId: string,
  datos: { metodo: string; referencia: string; motivo?: string | null },
): Promise<{ yaPagado: boolean }> {
  const { data, error } = await supabase.rpc('fn_web_order_anticipo_marcar_recibido', {
    p_order_id: orderId,
    p_metodo: datos.metodo,
    p_referencia: datos.referencia,
    p_motivo: datos.motivo ?? null,
  });
  if (error) throw new MarcarAnticipoError(codigoErrorAnticipo(error), error.message);
  return { yaPagado: (data as { ya_pagado?: boolean } | null)?.ya_pagado === true };
}

/** URL de la página del pedido en la tienda, o `null` si no se pudo armar. */
export async function enlacePagoPedido(orderId: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/web-orders/${encodeURIComponent(orderId)}/enlace-pago`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { url?: unknown };
    return typeof j.url === 'string' ? j.url : null;
  } catch {
    return null;
  }
}

/** Enlace de WhatsApp al teléfono del cliente (solo dígitos; Colombia si viene sin indicativo). Puro. */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length < 7) return null;
  const numero = digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
