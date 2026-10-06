/**
 * Pedidos web pagados que quedaron a medias: con venta, pero sin líneas o, en
 * restaurante, sin comanda, porque un paso de la confirmación falló.
 *
 * Lo usa el cron `reconcile-web-orders` (bloque 4b) para saber a cuáles
 * volver a llamar `autoConfirmPaidOrder`; la RPC `fn_confirmar_pedido_web_completo`
 * completa lo que falte. Solo lectura y en lote (sin N+1).
 *
 * Por qué hace falta: el sitio escribe `status='confirmed'` en la misma
 * actualización que `payment_status='paid'` (webhooks y /checkout/resultado),
 * así que el huérfano real de pasarela está «confirmado» aunque le falten las
 * líneas o la comanda. Filtrar solo por `status='pending'` no lo encontraba.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CandidatoAMedias {
  id: string;
  order_number: string;
  organization_id: number;
  created_at: string;
  sale_id: string | null;
}

export interface EvidenciaAMedias {
  ventasConLineas: Set<string>;
  ventasConComanda: Set<string>;
  organizacionesRestaurante: Set<number>;
}

/** Máximo de candidatos que se revisan por ejecución del cron. */
export const MAX_CANDIDATOS_A_MEDIAS = 200;

/** Regla pura: venta sin líneas, o restaurante con venta sin comanda. */
export function esPedidoAMedias(c: CandidatoAMedias, e: EvidenciaAMedias): boolean {
  if (!c.sale_id) return false;
  if (!e.ventasConLineas.has(c.sale_id)) return true;
  return e.organizacionesRestaurante.has(c.organization_id) && !e.ventasConComanda.has(c.sale_id);
}

/** Lee la evidencia en lote y devuelve solo los candidatos a medias. */
export async function filtrarAMedias<T extends CandidatoAMedias>(
  supabase: SupabaseClient,
  candidatos: T[],
): Promise<T[]> {
  const ventas = [...new Set(candidatos.map((c) => c.sale_id).filter((x): x is string => !!x))];
  if (ventas.length === 0) return [];
  const orgs = [...new Set(candidatos.map((c) => c.organization_id))];

  const [lineas, comandas, organizaciones] = await Promise.all([
    supabase.from('sale_items').select('sale_id').in('sale_id', ventas),
    supabase.from('kitchen_tickets').select('sale_id').in('sale_id', ventas).eq('ticket_type', 'order'),
    supabase.from('organizations').select('id, type_id').in('id', orgs),
  ]);
  const error = lineas.error ?? comandas.error ?? organizaciones.error;
  if (error) {
    // Sin evidencia fiable no se reintenta nada: mejor esperar a la próxima
    // ejecución que crear comandas por error.
    console.error('[pedidosAMedias] No se pudo leer la evidencia:', error.message);
    return [];
  }

  const evidencia: EvidenciaAMedias = {
    ventasConLineas: new Set(((lineas.data ?? []) as Array<{ sale_id: string }>).map((l) => l.sale_id)),
    ventasConComanda: new Set(((comandas.data ?? []) as Array<{ sale_id: string | null }>).map((k) => k.sale_id).filter((x): x is string => !!x)),
    organizacionesRestaurante: new Set(
      ((organizaciones.data ?? []) as Array<{ id: number; type_id: number | null }>).filter((o) => o.type_id === 1).map((o) => o.id),
    ),
  };
  return candidatos.filter((c) => esPedidoAMedias(c, evidencia));
}
