/**
 * Pantallas del anticipo pagado con el pedido vencido (Figma «05 POS y ventas» 3181-202769).
 * SOLO navegador (cliente Supabase de `@/lib/supabase/config`, con la sesión y RLS).
 *
 * - Pedidos «Anticipo pagado · vencido» de la organización (cualquier fecha): StatCard y aviso del
 *   listado. Estado deducido (`anticipoPagadoVencido`), sin columna nueva.
 * - Stock por línea en la sede: `fn_web_order_anticipo_vencido_stock`.
 * - Devolver: `/api/web-orders/[id]/anticipo-devolver` (la base registra la devolución con la
 *   sesión; el servidor avisa al cliente).
 */
import { supabase } from '@/lib/supabase/config';
import { anticipoPagadoVencido, type LineaStockAnticipo, type MedioDevolucion } from '@/lib/pos/pedidosWeb/anticipoVencido';

export interface PedidoAnticipoVencidoFila {
  id: string;
  order_number: string;
  customer_name: string | null;
  advance_amount: number | null;
  advance_due_at: string | null;
  advance_gateway: string | null;
  status: string;
  payment_status: string | null;
  advance_status: string | null;
  sale_id: string | null;
  updated_at: string | null;
}

export async function listarAnticiposVencidos(organizationId: number, branchId?: number | null): Promise<PedidoAnticipoVencidoFila[]> {
  let q = supabase
    .from('web_orders')
    .select('id, order_number, customer_name, advance_amount, advance_due_at, advance_gateway, status, payment_status, advance_status, sale_id, updated_at')
    .eq('organization_id', organizationId)
    .eq('status', 'expired')
    .eq('advance_status', 'paid')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as PedidoAnticipoVencidoFila[]).filter(anticipoPagadoVencido);
}

export async function stockPedidoVencido(orderId: string): Promise<LineaStockAnticipo[]> {
  const { data, error } = await supabase.rpc('fn_web_order_anticipo_vencido_stock', { p_order_id: orderId });
  if (error || !Array.isArray(data)) return [];
  return data as LineaStockAnticipo[];
}

export class DevolverAnticipoError extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
    this.name = 'DevolverAnticipoError';
  }
}

export async function devolverAnticipo(
  orderId: string,
  datos: { medio: MedioDevolucion; referencia: string; motivo: string | null; monto: number; avisar: boolean; cuentaBancaria?: number | null },
): Promise<{ yaRegistrado: boolean; aviso: { email: string | null; whatsapp: string | null } | null }> {
  const r = await fetch(`/api/web-orders/${encodeURIComponent(orderId)}/anticipo-devolver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  const cuerpo = (await r.json().catch(() => null)) as { error?: string; ya_registrado?: boolean; aviso?: { email: string | null; whatsapp: string | null } | null } | null;
  if (!r.ok) throw new DevolverAnticipoError(cuerpo?.error ?? 'desconocido');
  return { yaRegistrado: cuerpo?.ya_registrado === true, aviso: cuerpo?.aviso ?? null };
}
