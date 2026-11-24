/**
 * Contraentrega y código de entrega (logística Fase 1). Puro.
 *
 * Regla única de «¿el pedido web es contraentrega?»: NO está pagado y NO es de pasarela. Es la
 * misma clasificación del cobro en caja (`pedidoEsDePasarela`, metodosCaja.ts, espejo de
 * `fn_pedido_web_es_pasarela`): un pedido de pasarela sin pagar es un pago fallido o pendiente en
 * línea, no un cobro en la puerta. El monto a recaudar es el total del pedido (incluye domicilio y
 * propina), menos el anticipo PAGADO en línea si lo hay (contraentrega con condiciones).
 *
 * En la venta POS la contraentrega la calcula la base (saldo de la venta) en
 * `logistica_crear_envio_venta_pos`: nunca un monto del navegador.
 */
import { pedidoEsDePasarela } from '@/lib/pos/pedidosWeb/metodosCaja';
import { cobroEnPuerta } from '@/lib/contraentrega/reglaContraentrega';

export const MEDIOS_COBRO_CONTRAENTREGA = ['cash', 'card', 'transfer', 'qr'] as const;
export type MedioCobroContraentrega = (typeof MEDIOS_COBRO_CONTRAENTREGA)[number];

export interface PedidoParaContraentrega {
  total?: number | string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  /** Contraentrega con anticipo (20261124230000): solo el anticipo PAGADO se descuenta. */
  advance_amount?: number | string | null;
  advance_status?: string | null;
}

export interface Contraentrega {
  cod_amount: number;
  cod_status: 'pending' | null;
}

/** Redondeo a centavos sin arrastre binario. */
function aCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function contraentregaDePedidoWeb(pedido: PedidoParaContraentrega): Contraentrega {
  const total = Number(pedido.total) || 0;
  if (pedido.payment_status === 'paid' || total <= 0 || pedidoEsDePasarela(pedido)) {
    return { cod_amount: 0, cod_status: null };
  }
  // Con anticipo pagado en línea, la puerta cobra total − anticipo (`cobroEnPuerta`, módulo puro
  // compartido con la tienda). Sin anticipo (o pendiente/vencido) es el total, como siempre.
  const enPuerta = cobroEnPuerta(total, { monto: pedido.advance_amount, estado: pedido.advance_status });
  if (enPuerta <= 0) {
    return { cod_amount: 0, cod_status: null };
  }
  return { cod_amount: aCentavos(enPuerta), cod_status: 'pending' };
}

/** Formato del código de entrega (4 dígitos, CHECK de shipment_delivery_codes). */
export function esCodigoEntregaValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && /^[0-9]{4}$/.test(codigo.trim());
}

export function esMedioCobroContraentrega(valor: unknown): valor is MedioCobroContraentrega {
  return typeof valor === 'string' && (MEDIOS_COBRO_CONTRAENTREGA as readonly string[]).includes(valor);
}

/** Intentos con código errado antes de bloquear (c_max_intentos en logistica_marcar_entregado). */
export const MAX_INTENTOS_CODIGO = 5;
