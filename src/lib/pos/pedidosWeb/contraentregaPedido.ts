/**
 * Pedido web contraentrega y su anticipo (Figma «05 POS y ventas» 3014:194407, pantallas 04–07).
 * Puro (sin React ni Supabase): lo prueba __tests__/contraentregaPedido.test.ts.
 *
 * Un pedido es contraentrega si NO es de pasarela (`pedidoEsDePasarela`, la misma regla del cobro
 * en caja), su método es efectivo o contraentrega (o no tiene método: la tienda lo trata como
 * efectivo) y va a domicilio, propio o con transportadora. Lo que se cobra en la puerta es
 * `cobroEnPuerta` (total − anticipo PAGADO), del módulo compartido con la tienda.
 */
import { cobroEnPuerta } from '@/lib/contraentrega/reglaContraentrega';
import { pedidoEsDePasarela } from '@/lib/pos/pedidosWeb/metodosCaja';

export const METODOS_CONTRAENTREGA: ReadonlySet<string> = new Set([
  '', 'cash', 'efectivo', 'cash_on_delivery', 'contraentrega', 'contra_entrega',
]);

export interface PedidoContraentrega {
  status?: string | null;
  total?: number | string | null;
  delivery_type?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  advance_amount?: number | string | null;
  advance_status?: string | null;
  advance_due_at?: string | null;
}

export type EstadoAnticipo = 'sin_anticipo' | 'pendiente' | 'pagado' | 'vencido';

/** Estados en que el pedido ya no sale a la calle (o ya llegó). */
const CERRADOS: ReadonlySet<string> = new Set(['delivered', 'cancelled', 'rejected', 'refunded', 'expired']);

export function esPedidoContraentrega(o: PedidoContraentrega): boolean {
  if (o.delivery_type !== 'delivery_own' && o.delivery_type !== 'delivery_third_party') return false;
  if (pedidoEsDePasarela(o)) return false;
  return METODOS_CONTRAENTREGA.has((o.payment_method ?? '').trim().toLowerCase());
}

/** ¿Tiene anticipo? (monto > 0, cualquier estado). */
export function tieneAnticipo(o: PedidoContraentrega): boolean {
  return (Number(o.advance_amount) || 0) > 0;
}

export function estadoAnticipo(o: PedidoContraentrega): EstadoAnticipo {
  if (!tieneAnticipo(o)) return 'sin_anticipo';
  if (o.advance_status === 'paid') return 'pagado';
  if (o.advance_status === 'expired' || o.status === 'expired') return 'vencido';
  return 'pendiente';
}

/** Lo que cobra el domiciliario o la transportadora: total − anticipo pagado. */
export function cobrarAlEntregar(o: PedidoContraentrega): number {
  return cobroEnPuerta(o.total, { monto: o.advance_amount, estado: o.advance_status });
}

/** Minutos que faltan para que venza el anticipo (redondeo hacia arriba; nunca negativo). `null` sin hora. */
export function minutosParaVencer(dueAt: string | null | undefined, ahora: Date): number | null {
  const t = Date.parse(dueAt ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - ahora.getTime()) / 60_000));
}

/**
 * «Por cobrar al entregar»: lo que está en la calle de los pedidos contraentrega cargados
 * (no entregados ni cerrados, sin pagar del todo y con el anticipo, si lo piden, ya pagado).
 */
export function porCobrarAlEntregar(pedidos: readonly PedidoContraentrega[]): { monto: number; pedidos: number } {
  let monto = 0;
  let n = 0;
  for (const o of pedidos) {
    if (!esPedidoContraentrega(o)) continue;
    if (CERRADOS.has(o.status ?? '') || o.payment_status === 'paid') continue;
    if (estadoAnticipo(o) === 'pendiente' || estadoAnticipo(o) === 'vencido') continue;
    const valor = cobrarAlEntregar(o);
    if (valor <= 0) continue;
    monto += valor;
    n += 1;
  }
  return { monto: Math.round(monto * 100) / 100, pedidos: n };
}

/** ¿Se puede confirmar? Con anticipo pendiente, no: «Falta el anticipo». */
export function bloqueoConfirmarPorAnticipo(o: PedidoContraentrega): 'FALTA_ANTICIPO' | null {
  return estadoAnticipo(o) === 'pendiente' && o.status === 'pending' ? 'FALTA_ANTICIPO' : null;
}

/** Anticipo de un pedido en el cuadre del domiciliario (Figma 3014:194407 › 07). */
export interface AnticipoEnCuadre {
  numero: string;
  monto: number;
  pasarela: string | null;
}

/**
 * Anticipos YA PAGADOS de los pedidos de un cuadre: se ven aparte («Ya pagado en línea») para que
 * nadie los cobre dos veces. «Esperado» sigue siendo solo `cod_amount` (total − anticipo).
 */
export function anticiposDelCuadre(
  pedidos: readonly { order_number: string; advance_amount?: number | string | null; advance_status?: string | null; advance_gateway?: string | null }[],
): { total: number; items: AnticipoEnCuadre[] } {
  const items: AnticipoEnCuadre[] = [];
  for (const p of pedidos) {
    const monto = Number(p.advance_amount) || 0;
    if (p.advance_status !== 'paid' || monto <= 0) continue;
    items.push({ numero: p.order_number, monto: Math.round(monto * 100) / 100, pasarela: p.advance_gateway ?? null });
  }
  items.sort((a, b) => a.numero.localeCompare(b.numero));
  return { total: Math.round(items.reduce((s, i) => s + i.monto, 0) * 100) / 100, items };
}
