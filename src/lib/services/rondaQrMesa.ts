/**
 * Ronda de la Carta QR que entra SOLA a la mesa (lámina «Conectado», «Ronda
 * directa a cocina»). Opción por sede `restaurant_booking_settings.
 * qr_rounds_auto_confirm` (apagada por defecto): si está encendida, la ronda
 * que el comensal envía desde el QR va directo a la cuenta de la mesa y a la
 * comanda, sin esperar a que alguien la confirme en POS › Pedidos online.
 *
 * No reimplementa nada: la decisión es pura (`decidirRondaQr`) y la entrada es
 * `agregarPedidoALaMesa` → `pos_mesa_agregar_pedido_web`, con el mismo reparto
 * de totales (`repartirTotalesPedidoWeb`) que la confirmación del equipo.
 *
 * Seguridad: solo entra si la mesa YA tiene una sesión abierta por el equipo
 * (active | bill_requested). Un QR fotografiado no puede mandar comandas desde
 * la casa a una mesa vacía: esa ronda se queda en Pedidos online para que el
 * equipo la confirme, como siempre.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder } from './webOrdersService';
import { avisarSiNoCuadra, repartirTotalesPedidoWeb } from './webOrderTotals';
import { resolverAjustesSede } from './restaurantBookingSettingsService';
import { agregarPedidoALaMesa, vaALaCuentaDeLaMesa } from './webOrderConfirmacionCompleta';

export type MotivoRondaQr =
  | 'no_es_de_mesa'
  | 'pagado_en_linea'
  | 'no_pendiente'
  | 'ya_en_la_mesa'
  | 'sede_no_lo_activa'
  | 'mesa_sin_sesion'
  | 'funcion_ausente';

export type DecisionRondaQr = { entra: true; sesionId: string; meseroId: string | null } | { entra: false; motivo: MotivoRondaQr };

export interface DatosDecisionRondaQr {
  pedido: Pick<WebOrder, 'delivery_type' | 'payment_status' | 'status'> & {
    restaurant_table_id?: string | null;
    table_session_id?: string | null;
  };
  /** `qr_rounds_auto_confirm` de la sede (null = sin fila o sin columna: apagado). */
  sedeLoActiva: boolean | null;
  /** Sesión abierta de la mesa (active | bill_requested), si la hay. */
  sesion: { id: string; server_id: string | null } | null;
}

/** Pura, para Jest: ¿la ronda entra sola a la mesa? */
export function decidirRondaQr({ pedido, sedeLoActiva, sesion }: DatosDecisionRondaQr): DecisionRondaQr {
  if (pedido.delivery_type !== 'dine_in' || !pedido.restaurant_table_id) return { entra: false, motivo: 'no_es_de_mesa' };
  if (!vaALaCuentaDeLaMesa(pedido)) return { entra: false, motivo: 'pagado_en_linea' };
  if (pedido.table_session_id) return { entra: false, motivo: 'ya_en_la_mesa' };
  if (pedido.status !== 'pending') return { entra: false, motivo: 'no_pendiente' };
  if (sedeLoActiva !== true) return { entra: false, motivo: 'sede_no_lo_activa' };
  if (!sesion) return { entra: false, motivo: 'mesa_sin_sesion' };
  return { entra: true, sesionId: sesion.id, meseroId: sesion.server_id };
}

/** Minutos de preparación por defecto de la comanda de restaurante (como la confirmación del equipo). */
const PREPARACION_RESTAURANTE_MIN = 30;

export interface ResultadoRondaQr {
  auto: boolean;
  motivo?: MotivoRondaQr | 'pedido_no_encontrado';
  table_session_id?: string;
  kitchen_ticket_id?: number | null;
}

/**
 * Intenta meter la ronda en la mesa. `client` es service role: la llamada viene
 * del sitio (servidor a servidor) y la organización sale del propio pedido,
 * nunca del body.
 */
export async function entrarRondaQrALaMesa(client: SupabaseClient, orderId: string): Promise<ResultadoRondaQr> {
  const { data: order, error } = await client.from('web_orders').select('*, items:web_order_items(*)').eq('id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return { auto: false, motivo: 'pedido_no_encontrado' };
  const pedido = order as WebOrder & { restaurant_table_id?: string | null; table_session_id?: string | null };

  let sedeLoActiva: boolean | null = null;
  let sesion: { id: string; server_id: string | null } | null = null;
  if (pedido.delivery_type === 'dine_in' && pedido.restaurant_table_id) {
    const [ajuste, abierta] = await Promise.all([
      client
        .from('restaurant_booking_settings')
        .select('branch_id, qr_rounds_auto_confirm')
        .eq('organization_id', pedido.organization_id)
        .or(`branch_id.eq.${Number(pedido.branch_id)},branch_id.is.null`),
      client
        .from('table_sessions')
        .select('id, server_id')
        .eq('organization_id', pedido.organization_id)
        .eq('restaurant_table_id', pedido.restaurant_table_id)
        .in('status', ['active', 'bill_requested'])
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // La sede gana y la organización respalda (`resolverAjustesSede`, la misma
    // regla de reservas). Sin la columna (migración sin aplicar): «apagado».
    sedeLoActiva = ajuste.error
      ? null
      : resolverAjustesSede((ajuste.data ?? []) as Record<string, unknown>[], Number(pedido.branch_id)).efectiva.qr_rounds_auto_confirm;
    if (abierta.error) throw new Error(abierta.error.message);
    sesion = (abierta.data as { id: string; server_id: string | null } | null) ?? null;
  }

  const decision = decidirRondaQr({ pedido, sedeLoActiva, sesion });
  if (!decision.entra) return { auto: false, motivo: decision.motivo };

  const reparto = repartirTotalesPedidoWeb(pedido);
  avisarSiNoCuadra(reparto, pedido);
  const r = await agregarPedidoALaMesa(client, pedido, {
    prepMin: PREPARACION_RESTAURANTE_MIN,
    userId: decision.meseroId,
    reparto,
  });
  if (!r) return { auto: false, motivo: 'funcion_ausente' };
  return { auto: true, table_session_id: r.table_session_id ?? decision.sesionId, kitchen_ticket_id: r.kitchen_ticket_id };
}
