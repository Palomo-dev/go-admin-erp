import { supabase } from '@/lib/supabase/config';
import { getCurrentUserId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { PropinasService } from '@/components/pos/propinas/propinasService';
import { deliveryIntegrationService } from './deliveryIntegrationService';
import { generateInvoiceNumber } from '@/lib/utils/invoiceUtils';
import { HORA_DEL_SERVIDOR } from '@/lib/pos/reloj/horaOficial';
import type { WebOrder } from './webOrdersService';
import {
  avisarSiNoCuadra,
  facturaWebConImpuestoIncluido,
  lineasFacturaWebConImpuesto,
  lineasVentaPedidoWeb,
  repartirTotalesPedidoWeb,
} from './webOrderTotals';
import {
  agregarPedidoALaMesa,
  confirmacionCompletaActiva,
  confirmarPedidoWebCompleto,
  erroresDeStock,
  esFuncionAusente,
  vaALaCuentaDeLaMesa,
  type ResultadoConfirmacionCompleta,
} from './webOrderConfirmacionCompleta';
import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { metodoDeCobroEnCaja } from '@/lib/pos/pedidosWeb/metodosCaja';
import { resolveLineTax } from './taxResolver';
import { resolveOrgCurrency } from './monedaOrganizacion';
import { redimirCuponPedidoWeb } from './cuponPedidoWeb';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

/**
 * Sub-métodos de Wompi (pasarela de pago del website).
 * Ver webOrderServerConfirmation.ts para detalles del mapeo.
 */
const WOMPI_SUB_METHODS = new Set([
  'nequi', 'card', 'pse', 'bancolombia_transfer',
  'bancolombia_collect', 'daviplata', 'wompi', 'wompi_co',
]);

function mapWebPaymentMethodToInvoice(method: string | null | undefined): string {
  if (!method) return 'wompi';
  if (WOMPI_SUB_METHODS.has(method)) return 'wompi';
  return method;
}

export interface ConfirmOrderResult {
  saleId: string;
  /** Sin comanda cuando el pedido ya estaba confirmado por otro camino. */
  kitchenTicketId?: number;
  /** El pedido ya tenía venta (p. ej. la creó el webhook de la pasarela): no se creó nada. */
  yaConfirmado?: boolean;
  tipId?: string;
  shipmentId?: string;
  couponRedemptionId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  accountReceivableId?: string;
  paymentId?: string;
  /**
   * Líneas cuyo stock (o insumos de la receta) no se pudo descontar. La
   * confirmación sigue; la UI las muestra para decidir (rechazar con motivo o
   * ajustar inventario). Antes solo quedaban en `console.warn`.
   */
  stockErrors?: string[];
  /** «Comer aquí» agregado a la cuenta de su mesa (POS › Mesas). */
  tableSessionId?: string;
  /** La confirmación completó pasos que faltaban de un intento anterior (pedido huérfano). */
  completadoAhora?: boolean;
  /** «Marcar como pagado» al confirmar, con E4: el cobro quedó en la caja de la sede. */
  cobro?: CobroEnCajaResult;
  /**
   * «Marcar como pagado» al confirmar, con E4, pero el cobro no se pudo hacer
   * (p. ej. NO_OPEN_CASH_SESSION → «Abre la caja de la sede»). El pedido queda
   * confirmado SIN cobrar; se cobra después con «Cobrar».
   */
  cobroPendiente?: ErrorCobroEnCaja;
}

export interface CobroEnCajaResult {
  invoiceId: string;
  invoiceNumber: string | null;
  paymentId: string;
  cashSessionId: number;
  /** El pedido ya estaba cobrado: no se creó otro pago. */
  yaCobrado: boolean;
}

/** Errores de `fn_cobrar_pedido_web_en_caja` que la UI traduce. */
export type ErrorCobroEnCaja =
  | 'NO_OPEN_CASH_SESSION'
  | 'PEDIDO_SIN_CONFIRMAR'
  | 'COBRAR_EN_LA_MESA'
  | 'METODO_INVALIDO'
  | 'FUNCION_AUSENTE'
  | 'OTRO';

export class CobroEnCajaError extends Error {
  constructor(public readonly codigo: ErrorCobroEnCaja, mensaje: string) {
    super(mensaje);
    this.name = 'CobroEnCajaError';
  }
}

/** Código estable del error de la RPC de cobro, a partir de su mensaje. */
export function codigoErrorCobro(error: unknown): ErrorCobroEnCaja {
  if (esFuncionAusente(error)) return 'FUNCION_AUSENTE';
  const m = String((error as { message?: string } | null)?.message ?? '');
  for (const c of ['NO_OPEN_CASH_SESSION', 'PEDIDO_SIN_CONFIRMAR', 'COBRAR_EN_LA_MESA', 'METODO_INVALIDO'] as const) {
    if (m.includes(c)) return c;
  }
  return 'OTRO';
}

/** Clave i18n (`pedidoWeb.cobro.*`) del aviso para un cobro que no se pudo hacer. */
export function claveAvisoCobro(codigo: ErrorCobroEnCaja): 'sinCaja' | 'sinConfirmar' | 'deMesa' | 'metodoInvalido' | 'error' {
  switch (codigo) {
    case 'NO_OPEN_CASH_SESSION':
      return 'sinCaja';
    case 'PEDIDO_SIN_CONFIRMAR':
      return 'sinConfirmar';
    case 'COBRAR_EN_LA_MESA':
      return 'deMesa';
    case 'METODO_INVALIDO':
      return 'metodoInvalido';
    default:
      return 'error';
  }
}

/** Resultado del cobro en lote: qué pedidos se cobraron y por qué no los demás. */
export interface ResumenCobroLote {
  cobrados: string[];
  /** Marcados como pagados con el respaldo sin caja (E4 sin aplicar). */
  respaldo: string[];
  /** Pedidos sin cobrar, por motivo. */
  pendientes: Partial<Record<ErrorCobroEnCaja, string[]>>;
}

/**
 * Servicio de confirmación de pedidos online.
 * Al confirmar un pedido web, crea automáticamente:
 * 1. sale + sale_items (venta POS)
 * 2. kitchen_ticket + kitchen_ticket_items (comanda cocina)
 * 3. tips (si tip_amount > 0)
 * 4. coupon_redemption (si coupon_code existe)
 * 5. Vincula web_orders.sale_id con la venta creada
 */
class WebOrderConfirmationService {

  /**
   * Confirmar un pedido online completo:
   * - Crea sale + sale_items
   * - Genera kitchen_ticket + kitchen_ticket_items
   * - Registra tip si aplica
   * - Redime cupón si aplica
   * - Actualiza web_orders con sale_id, status, timestamps
   */
  async confirmOrder(
    order: WebOrder,
    options: {
      prepMs: number;
      transitMs?: number;
      markAsPaid?: boolean;
    }
  ): Promise<ConfirmOrderResult> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No se pudo obtener el usuario actual');

    // Confirmación en una sola transacción (E2/E3) detrás del interruptor de
    // despliegue. Si la base aún no tiene la función, sigue el camino de siempre.
    if (confirmacionCompletaActiva()) {
      const completo = await this.confirmarCompleto(order, options, userId);
      if (completo) return completo;
    } else {
      // Interruptor apagado: camino de siempre (abajo), sin cambios.
    }

    const now = new Date().toISOString();
    const estimatedReadyAt = new Date(Date.now() + options.prepMs).toISOString();

    // Si se marca como pagado, sobrescribir payment_status del pedido. Con E4
    // en la base (que exige E2 antes), el cobro va a la caja de la sede después
    // de confirmar sin pagar; sin E4, el comportamiento de siempre.
    const cobrarEnCajaTrasConfirmar =
      (options.markAsPaid ?? false) && order.payment_status !== 'paid' && (await this.cobroEnCajaDisponible());
    let markAsPaid: boolean;
    if (cobrarEnCajaTrasConfirmar) {
      markAsPaid = false;
    } else {
      markAsPaid = options.markAsPaid ?? false;
    }
    const effectivePaymentStatus = markAsPaid ? 'paid' : order.payment_status;
    const orderForSale = markAsPaid ? { ...order, payment_status: 'paid' as const } : order;

    // 1. Crear la venta, una sola vez por pedido (ADR-CC-011). Si el webhook
    //    de la pasarela ya la creó, se devuelve esa venta y no se crea nada más.
    const { saleId, creada } = await this.createSale(orderForSale, userId);
    if (!creada) {
      return { saleId, yaConfirmado: true };
    }

    // 2. Crear sale_items y obtener los IDs insertados
    const insertedSaleItems = await this.createSaleItems(order, saleId);

    // 2a. Membresías (docs/design/MEMBRESIAS-FASE-1-2.md §4, «Tienda web»): las crea y activa la
    //     base, en el servidor (la RPC no está abierta al navegador). No bloquea la confirmación:
    //     si falla (p. ej. pedido sin cliente) queda en el log y se puede reintentar (idempotente).
    await this.activarMembresias(order.id);

    const stockErrors: string[] = [];

    // 2b. Stock: descuento con receta, liberar la reserva y vender seriales en una sola RPC
    //     (inventario B9, fn_pedido_web_confirmar_stock), la misma que usa la confirmación del
    //     servidor. Antes esta copia no vendía los seriales reservados. No bloquea la confirmación.
    try {
      const { data: stockRes, error: stockRpcError } = await supabase.rpc('fn_pedido_web_confirmar_stock', {
        p_order_id: order.id,
        p_sale_id: saleId,
        p_user_id: userId,
      });
      if (stockRpcError) throw stockRpcError;
      const errores = ((stockRes ?? {}) as { errores?: string[] }).errores ?? [];
      if (errores.length > 0) console.warn('⚠️ Algunos items no descontaron stock:', errores);
      stockErrors.push(...errores.map(String));
    } catch (stockError) {
      console.warn('⚠️ Error descontando stock (no bloquea la confirmación):', stockError);
      stockErrors.push(`Stock del pedido: ${(stockError as { message?: string })?.message ?? 'error'}`);
    }

    // 3. Crear kitchen_ticket + kitchen_ticket_items
    const kitchenTicketId = await this.createKitchenTicket(
      order,
      saleId,
      insertedSaleItems,
      Math.round(options.prepMs / 60000)
    );

    // 4. Crear tip si tip_amount > 0
    let tipId: string | undefined;
    if (order.tip_amount && order.tip_amount > 0) {
      tipId = await this.createTip(order, saleId, userId);
    }

    // 5. Redimir cupón si coupon_code existe
    let couponRedemptionId: string | undefined;
    if (order.coupon_code) {
      couponRedemptionId = await this.redeemCoupon(order, saleId);
    }

    // 6. Crear shipment automático para pedidos con delivery (propio o tercero)
    let shipmentId: string | undefined;
    if (order.delivery_type === 'delivery_own' || order.delivery_type === 'delivery_third_party') {
      shipmentId = await this.createShipment(order);
    }

    // 7. Crear factura de venta (invoice_sales) + invoice_items si el pedido está pagado
    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let accountReceivableId: string | undefined;
    let paymentId: string | undefined;

    if (effectivePaymentStatus === 'paid') {
      const invoiceResult = await this.createInvoice(order, saleId, userId);
      invoiceId = invoiceResult.invoiceId;
      invoiceNumber = invoiceResult.invoiceNumber;

      // 8. Crear registro de pago (payments) asociado a la factura
      if (invoiceId) {
        paymentId = await this.createPayment(order, invoiceId, userId, invoiceResult.invoiceCurrency);
      }

      // 9. Crear cuenta por cobrar si hay cliente y balance pendiente
      // (la cuenta por cobrar también la crea un trigger al insertar la factura,
      //  pero la creamos explícitamente para garantizar consistencia con customer_id)
      if (order.customer_id && invoiceId) {
        accountReceivableId = await this.createAccountReceivable(order, saleId);
      }
    }

    // 10. Calcular estimated_delivery_at para pedidos delivery
    //     = Listo aprox + tiempo de traslado (definido por el operario)
    const estimatedDeliveryAt = order.delivery_type !== 'pickup' && options.transitMs && options.transitMs > 0
      ? new Date(Date.now() + options.prepMs + options.transitMs).toISOString()
      : undefined;

    // 11. Actualizar web_orders: sale_id + status + timestamps
    const { error: updateError } = await supabase
      .from('web_orders')
      .update({
        sale_id: saleId,
        status: 'confirmed',
        payment_status: effectivePaymentStatus,
        confirmed_at: now,
        confirmed_by: userId,
        estimated_ready_at: estimatedReadyAt,
        ...(estimatedDeliveryAt ? { estimated_delivery_at: estimatedDeliveryAt } : {}),
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Error actualizando web_order:', updateError);
      throw new Error(`Error vinculando pedido con venta: ${updateError.message}`);
    }

    if (cobrarEnCajaTrasConfirmar) {
      try {
        const cobro = await this.cobrarEnCaja(
          { ...order, sale_id: saleId },
          { metodo: metodoDeCobroEnCaja(order.payment_method), referencia: order.payment_reference ?? null },
        );
        return {
          saleId, kitchenTicketId, tipId, shipmentId, couponRedemptionId, accountReceivableId, stockErrors,
          cobro, paymentId: cobro.paymentId, invoiceId: cobro.invoiceId, invoiceNumber: cobro.invoiceNumber ?? undefined,
        };
      } catch (err) {
        console.warn('[webOrderConfirmation] Pedido confirmado sin cobrar:', err);
        return {
          saleId, kitchenTicketId, tipId, shipmentId, couponRedemptionId, stockErrors,
          cobroPendiente: err instanceof CobroEnCajaError ? err.codigo : 'OTRO',
        };
      }
    } else {
      // Camino de siempre.
    }

    return { saleId, kitchenTicketId, tipId, shipmentId, couponRedemptionId, invoiceId, invoiceNumber, accountReceivableId, paymentId, stockErrors };
  }

  /**
   * Camino E2/E3: venta, líneas, stock, comanda y estado en una transacción
   * (`fn_confirmar_pedido_web_completo`), o el pedido «Comer aquí» a la cuenta
   * de su mesa (`pos_mesa_agregar_pedido_web`). Reintentar completa lo que
   * falte. Después, los pasos tolerantes a fallos (y ahora idempotentes):
   * membresías, propina, cupón, envío y, si está pagado, factura y pago.
   * `null` = la base aún no tiene la función: quien llama sigue el camino viejo.
   */
  private async confirmarCompleto(
    order: WebOrder,
    options: { prepMs: number; transitMs?: number; markAsPaid?: boolean },
    userId: string,
  ): Promise<ConfirmOrderResult | null> {
    // «Marcar como pagado» sobre un pedido sin pagar: con E4 en la base, el
    // cobro va a la caja de la sede (fn_cobrar_pedido_web_en_caja) DESPUÉS de
    // confirmar sin pagar. Antes se creaban factura y pago desde el navegador,
    // con la venta fuera de caja y sin exigir caja abierta.
    const cobrarEnCajaTrasConfirmar =
      (options.markAsPaid ?? false) && order.payment_status !== 'paid' && (await this.cobroEnCajaDisponible());
    let markAsPaid: boolean;
    if (cobrarEnCajaTrasConfirmar) {
      markAsPaid = false;
    } else {
      // Sin E4 (o pedido ya pagado): el comportamiento de siempre.
      markAsPaid = options.markAsPaid ?? false;
    }
    const effectivePaymentStatus = markAsPaid ? 'paid' : order.payment_status;
    const pagado = effectivePaymentStatus === 'paid';
    const orderForSale = markAsPaid ? { ...order, payment_status: 'paid' as const } : order;
    const prepMin = Math.round(options.prepMs / 60000);
    const transitMin = esDomicilio(order.delivery_type) && options.transitMs && options.transitMs > 0
      ? Math.round(options.transitMs / 60000)
      : null;
    const reparto = repartirTotalesPedidoWeb(order);
    avisarSiNoCuadra(reparto, order);

    // «Comer aquí» sin pagar en línea: a la cuenta de la mesa (E3).
    if (vaALaCuentaDeLaMesa(orderForSale)) {
      const mesa = await agregarPedidoALaMesa(supabase, order, { prepMin, userId, reparto });
      if (mesa) {
        return {
          saleId: mesa.sale_id ?? '',
          kitchenTicketId: mesa.kitchen_ticket_id ?? undefined,
          tableSessionId: mesa.table_session_id ?? undefined,
          yaConfirmado: mesa.ya_completo,
          stockErrors: [],
          // Lo de la mesa se cobra al cerrar la cuenta de la mesa, no aquí.
          ...(cobrarEnCajaTrasConfirmar ? { cobroPendiente: 'COBRAR_EN_LA_MESA' as const } : {}),
        };
      } else {
        // E3 sin aplicar: el pedido se confirma con venta propia (abajo).
      }
    }

    const r: ResultadoConfirmacionCompleta | null = await confirmarPedidoWebCompleto(supabase, order, {
      prepMin,
      transitMin,
      pagado,
      customerId: order.customer_id ?? null,
      userId,
      // Pagado: la factura va antes del estado (así trg_auto_journal_web_order no crea otra).
      marcarConfirmado: !pagado,
      reparto,
    });
    if (!r) return null;

    const stockErrors = erroresDeStock(r.stock);
    if (r.table_session_id) {
      return { saleId: r.sale_id ?? '', yaConfirmado: true, tableSessionId: r.table_session_id, stockErrors };
    }
    if (!r.sale_id) throw new Error(`El pedido ${order.order_number} no devolvió venta`);
    const saleId = r.sale_id;
    if (r.ya_completo) return { saleId, yaConfirmado: true, stockErrors };

    if (r.items_creados > 0) await this.activarMembresias(order.id);

    let tipId: string | undefined;
    if (order.tip_amount && order.tip_amount > 0) tipId = await this.createTip(order, saleId, userId);

    let couponRedemptionId: string | undefined;
    if (order.coupon_code) couponRedemptionId = await this.redeemCoupon(order, saleId);

    let shipmentId: string | undefined;
    if (esDomicilio(order.delivery_type)) shipmentId = await this.createShipment(order);

    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let accountReceivableId: string | undefined;
    let paymentId: string | undefined;

    if (pagado) {
      const existente = await this.facturaDeLaVenta(order.organization_id, saleId);
      const factura = existente ?? (await this.createInvoice(order, saleId, userId));
      invoiceId = factura.invoiceId || undefined;
      invoiceNumber = factura.invoiceNumber || undefined;
      if (invoiceId) paymentId = await this.createPayment(order, invoiceId, userId, factura.invoiceCurrency);
      if (order.customer_id && invoiceId) accountReceivableId = await this.createAccountReceivable(order, saleId);

      // El estado va después de la factura. Solo si sigue pendiente: un
      // reintento nunca retrocede un pedido que ya avanzó.
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('web_orders')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          confirmed_at: now,
          confirmed_by: userId,
          estimated_ready_at: new Date(Date.now() + options.prepMs).toISOString(),
          ...(transitMin
            ? { estimated_delivery_at: new Date(Date.now() + options.prepMs + (options.transitMs ?? 0)).toISOString() }
            : {}),
        })
        .eq('id', order.id)
        .eq('status', 'pending');
      if (updateError) throw new Error(`Error confirmando el pedido: ${updateError.message}`);
    } else {
      // Sin pagar: la RPC ya dejó el pedido confirmado. El cobro va por «Cobrar y entregar».
    }

    // «Marcar como pagado» con E4: el cobro, en la caja abierta de la sede. Si
    // no se puede (sin caja, método inválido…), el pedido queda confirmado sin
    // cobrar y la UI avisa; nunca se marca pagado fuera de la caja.
    let cobro: CobroEnCajaResult | undefined;
    let cobroPendiente: ErrorCobroEnCaja | undefined;
    if (cobrarEnCajaTrasConfirmar) {
      try {
        cobro = await this.cobrarEnCaja(
          { ...order, sale_id: saleId },
          { metodo: metodoDeCobroEnCaja(order.payment_method), referencia: order.payment_reference ?? null },
        );
      } catch (err) {
        cobroPendiente = err instanceof CobroEnCajaError ? err.codigo : 'OTRO';
        console.warn('[webOrderConfirmation] Pedido confirmado sin cobrar:', err);
      }
    } else {
      // Sin «Marcar como pagado», o sin E4: nada más que hacer aquí.
    }

    return {
      saleId,

      kitchenTicketId: r.kitchen_ticket_id ?? undefined,
      tipId,
      shipmentId,
      couponRedemptionId,
      invoiceId,
      invoiceNumber,
      accountReceivableId,
      paymentId,
      stockErrors,
      completadoAhora: !r.venta_creada,
      ...(cobro ? { cobro, paymentId: cobro.paymentId, invoiceId: cobro.invoiceId, invoiceNumber: cobro.invoiceNumber ?? undefined } : {}),
      ...(cobroPendiente ? { cobroPendiente } : {}),
    };
  }

  /**
   * ¿La base ya tiene `fn_cobrar_pedido_web_en_caja` (E4)? Sonda sin efectos:
   * la llamada con un pedido inexistente responde WEB_ORDER_NOT_FOUND si la
   * función existe y PGRST202/42883 si no. Se recuerda por sesión de página.
   */
  private cobroEnCajaExiste: boolean | null = null;

  async cobroEnCajaDisponible(): Promise<boolean> {
    if (this.cobroEnCajaExiste !== null) return this.cobroEnCajaExiste;
    const { error } = await supabase.rpc('fn_cobrar_pedido_web_en_caja', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_metodo: 'cash',
      p_factura: null,
      p_referencia: null,
      p_monto: null,
    });
    this.cobroEnCajaExiste = !(error && esFuncionAusente(error));
    return this.cobroEnCajaExiste;
  }

  /** Factura vigente de la venta (reintento: no se crea otra ni se consume otro consecutivo). */
  private async facturaDeLaVenta(
    organizationId: number,
    saleId: string,
  ): Promise<{ invoiceId: string; invoiceNumber: string; invoiceCurrency: string | null } | null> {
    const { data } = await supabase
      .from('invoice_sales')
      .select('id, number, currency')
      .eq('organization_id', organizationId)
      .eq('sale_id', saleId)
      .neq('status', 'void')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ? { invoiceId: data.id, invoiceNumber: data.number ?? '', invoiceCurrency: data.currency ?? null } : null;
  }

  /**
   * «Cobrar y entregar» (E4): cobra en la caja abierta de la sede un pedido
   * pagado en el local. Factura (la de la venta o una nueva con las líneas de
   * webOrderTotals), pago del cajero y venta dentro de caja, en una sola RPC
   * idempotente. Lanza `CobroEnCajaError` con el código para la UI
   * (NO_OPEN_CASH_SESSION → «Abre la caja de la sede»).
   */
  async cobrarEnCaja(
    order: WebOrder,
    opciones: { metodo: string; referencia?: string | null },
  ): Promise<CobroEnCajaResult> {
    const { data: existente } = order.sale_id
      ? await supabase
          .from('invoice_sales')
          .select('id')
          .eq('organization_id', order.organization_id)
          .eq('sale_id', order.sale_id)
          .neq('status', 'void')
          .limit(1)
          .maybeSingle()
      : { data: null };

    // Factura nueva solo si la venta no tiene: número y líneas de la regla única.
    let factura: Record<string, unknown> | null = null;
    if (!existente) {
      const reparto = repartirTotalesPedidoWeb(order);
      const numero = await generateInvoiceNumber(order.organization_id, 'FACT');
      const lineas = await lineasFacturaWebConImpuesto(order, '', resolveLineTax, reparto);
      factura = {
        number: numero,
        subtotal: Number(order.subtotal) || 0,
        tax_total: Number(order.tax_total) || 0,
        total: Number(order.total) || 0,
        tax_included: facturaWebConImpuestoIncluido(reparto),
        lineas: lineas.map((l) =>
          Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'invoice_id' && k !== 'invoice_sales_id')),
        ),
      };
    }

    const { data, error } = await supabase.rpc('fn_cobrar_pedido_web_en_caja', {
      p_order_id: order.id,
      p_metodo: opciones.metodo,
      p_factura: factura,
      p_referencia: opciones.referencia ?? null,
      p_monto: null,
    });
    if (error) {
      throw new CobroEnCajaError(codigoErrorCobro(error), error.message || 'No se pudo cobrar el pedido');
    }
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      invoiceId: String(r.invoice_id ?? ''),
      invoiceNumber: (r.invoice_number as string) ?? null,
      paymentId: String(r.payment_id ?? ''),
      cashSessionId: Number(r.cash_session_id ?? 0),
      yaCobrado: r.ya_cobrado === true,
    };
  }

  /**
   * Cobro en lote («Marcar como pagados» de la lista): cada pedido se cobra en
   * la caja de su sede. Un pedido que no se puede cobrar (sin caja, sin
   * confirmar, de mesa, método inválido…) NO corta el lote: se anota con su
   * motivo y se sigue con el resto. Antes el primer error dejaba la mitad del
   * lote cobrada y la otra mitad sin cobrar, con un error genérico.
   */
  async cobrarVariosEnCaja(
    pedidos: readonly WebOrder[],
    cargar: (id: string) => Promise<WebOrder | null>,
  ): Promise<ResumenCobroLote> {
    const resumen: ResumenCobroLote = { cobrados: [], respaldo: [], pendientes: {} };
    const anotar = (codigo: ErrorCobroEnCaja, numero: string) => {
      (resumen.pendientes[codigo] ??= []).push(numero);
    };
    for (const o of pedidos) {
      let completo: WebOrder = o;
      try {
        completo = (await cargar(o.id)) ?? o;
        await this.cobrarEnCaja(completo, {
          metodo: metodoDeCobroEnCaja(completo.payment_method),
          referencia: completo.payment_reference ?? null,
        });
        resumen.cobrados.push(completo.order_number);
      } catch (err) {
        const codigo: ErrorCobroEnCaja = err instanceof CobroEnCajaError ? err.codigo : 'OTRO';
        if (codigo === 'FUNCION_AUSENTE') {
          // Migración E4 pendiente: el comportamiento anterior.
          try {
            await this.marcarPagadoSinCaja(completo);
            resumen.respaldo.push(completo.order_number);
          } catch (respaldoErr) {
            console.error('[cobro en lote] Respaldo sin caja falló:', respaldoErr);
            anotar('OTRO', completo.order_number);
          }
        } else {
          anotar(codigo, completo.order_number);
        }
      }
    }
    return resumen;
  }

  /**
   * Respaldo SOLO mientras `fn_cobrar_pedido_web_en_caja` no exista en la base
   * (migración E4 pendiente): el comportamiento anterior de «Marcar como
   * pagado» desde la lista y el detalle. Con la casilla «Marcar como pagado»
   * del diálogo de confirmación hay un segundo respaldo, en `confirmOrder` y
   * `confirmarCompleto`, que solo se usa sin E4 (`cobroEnCajaDisponible`).
   * guardrails.test.ts vigila que ningún otro archivo del navegador escriba
   * `payment_status: 'paid'` en web_orders.
   */
  async marcarPagadoSinCaja(order: WebOrder): Promise<{ sinFactura: boolean }> {
    const organizationId = order.organization_id;
    const { error } = await supabase
      .from('web_orders')
      .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('organization_id', organizationId);
    if (error) throw error;

    // Con venta vinculada el cobro se registra como PAGO (los disparadores
    // recalculan factura y cartera), nunca escribiendo el saldo a mano.
    if (!order.sale_id) return { sinFactura: false };
    const { data: invoice } = await supabase
      .from('invoice_sales')
      .select('id, balance, currency, branch_id')
      .eq('sale_id', order.sale_id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!invoice) return { sinFactura: true };
    if (Number(invoice.balance) > 0) {
      const userId = await getCurrentUserId();
      const { error: paymentError } = await supabase.from('payments').insert({
        organization_id: organizationId,
        branch_id: invoice.branch_id ?? order.branch_id,
        amount: Number(invoice.balance),
        method: order.payment_method || 'cash',
        currency:
          normalizarCodigoMoneda(invoice.currency) ?? (await resolveOrgCurrency(supabase, organizationId)).code,
        status: 'completed',
        reference: order.payment_reference || null,
        source: 'invoice_sales',
        source_id: String(invoice.id),
        created_by: userId ?? null,
      });
      if (paymentError) throw paymentError;
    }
    return { sinFactura: false };
  }

  /**
   * Crear venta web a partir de un web_order
   * source='web' e include_in_cash_register=false para que no aparezca en caja POS.
   * sale_date usa la fecha original del pedido, no la fecha de confirmación.
   */
  private async createSale(
    order: WebOrder,
    userId: string
  ): Promise<{ saleId: string; creada: boolean }> {
    // fn_confirmar_pedido_web toma el pedido con FOR UPDATE: si otro camino ya
    // creó la venta, la devuelve con creada=false. El usuario lo toma la base de
    // la sesión; aquí solo se pasa para el caso sin sesión.
    const { data, error } = await supabase.rpc('fn_confirmar_pedido_web', {
      p_order_id: order.id,
      p_customer_id: order.customer_id || null,
      p_user_id: userId,
      p_pagado: order.payment_status === 'paid',
    });

    if (error) {
      console.error('Error creando sale:', error);
      throw new Error(`Error al crear venta: ${error.message}`);
    }

    const { sale_id: saleId, creada } = (data ?? {}) as { sale_id?: string; creada?: boolean };
    if (!saleId) throw new Error(`El pedido ${order.order_number} no devolvió venta`);
    return { saleId, creada: creada === true };
  }

  /** Activa las membresías de las líneas del pedido vía `POST /api/web-orders/[id]/membresias`. */
  private async activarMembresias(orderId: string): Promise<void> {
    try {
      const org = getOrganizationId();
      const r = await fetch(`/api/web-orders/${encodeURIComponent(orderId)}/membresias`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: '{}',
      });
      if (!r.ok) console.error('[webOrderConfirmation] membresías del pedido sin activar', { orderId, estado: r.status });
    } catch (err) {
      console.error('[webOrderConfirmation] membresías del pedido sin activar', { orderId, err });
    }
  }

  /**
   * Crear sale_items a partir de web_order_items
   */
  private async createSaleItems(
    order: WebOrder,
    saleId: string
  ): Promise<{ id: string; product_id: number | null }[]> {
    if (!order.items || order.items.length === 0) {
      return [];
    }

    // El descuento de pedido (cupón/promoción del sitio web) se prorratea en
    // las líneas, igual que en el POS. Ver `webOrderTotals.ts`.
    const reparto = repartirTotalesPedidoWeb(order);
    avisarSiNoCuadra(reparto, order);

    const saleItems = lineasVentaPedidoWeb(order, reparto).map((l) => ({ sale_id: saleId, ...l }));

    const { data: insertedItems, error } = await supabase
      .from('sale_items')
      .insert(saleItems)
      .select('id, product_id');

    if (error) {
      console.error('Error creando sale_items:', error);
      throw new Error(`Error al crear ítems de venta: ${error.message}`);
    }

    return insertedItems || [];
  }

  /**
   * Crear kitchen_ticket + kitchen_ticket_items para enviar a cocina
   */
  private async createKitchenTicket(
    order: WebOrder,
    saleId: string,
    saleItems: { id: string; product_id: number | null }[],
    estimatedMinutes: number
  ): Promise<number> {
    if (saleItems.length === 0) {
      throw new Error('No hay ítems para crear comanda de cocina');
    }

    // Crear ticket principal
    const { data: ticket, error: ticketError } = await supabase
      .from('kitchen_tickets')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        sale_id: saleId,
        table_session_id: null,
        status: 'new',
        priority: order.is_scheduled ? 0 : 1,
        estimated_time: estimatedMinutes,
        // Origen visible en Comandas («Web W-xxxx»): kitchen_tickets.source es
        // text sin CHECK (default 'mesas').
        source: 'web',
      })
      .select('id')
      .single();

    if (ticketError) {
      console.error('Error creando kitchen_ticket:', ticketError);
      throw new Error(`Error al crear comanda: ${ticketError.message}`);
    }

    // Estación efectiva de cada producto (propia → del padre → de la categoría).
    // Si la consulta falla, la comanda sale igual sin estación (como antes).
    const estacionPorProducto = new Map<number, string | null>();
    const productIds = Array.from(new Set(saleItems.map(i => i.product_id).filter((id): id is number => id !== null)));
    if (productIds.length > 0) {
      const { data: estaciones, error: estacionesError } = await supabase.rpc('fn_estaciones_efectivas', {
        p_organization_id: order.organization_id,
        p_product_ids: productIds,
      });
      if (estacionesError) {
        console.warn('No se pudo resolver la estación de cocina de los productos:', estacionesError);
      }
      for (const e of (estaciones ?? []) as Array<{ product_id: number; station: string | null }>) {
        estacionPorProducto.set(Number(e.product_id), e.station || null);
      }
    }

    // Crear items del ticket, con la nota del cliente, el nombre y la cantidad
    // de cada línea (las líneas se insertaron en el orden de order.items).
    const lineas = order.items ?? [];
    const ticketItems = saleItems.map((item, i) => {
      const linea = lineas[i];
      const mismaLinea = linea && linea.product_id === item.product_id;
      return {
        organization_id: order.organization_id,
        kitchen_ticket_id: ticket.id,
        sale_item_id: item.id,
        station: item.product_id !== null ? estacionPorProducto.get(item.product_id) ?? null : null,
        notes: mismaLinea && linea.notes ? linea.notes : null,
        status: 'pending',
        ...(mismaLinea ? { product_name: linea.product_name, quantity: linea.quantity } : {}),
      };
    });

    const { error: itemsError } = await supabase
      .from('kitchen_ticket_items')
      .insert(ticketItems);

    if (itemsError) {
      console.error('Error creando kitchen_ticket_items:', itemsError);
      throw new Error(`Error al crear ítems de comanda: ${itemsError.message}`);
    }

    return ticket.id;
  }

  /**
   * Redimir cupón: la regla compartida con la confirmación por pasarela
   * (`redimirCuponPedidoWeb`, idempotente por venta). El sitio ya no inserta
   * la redención al crear el pedido: `coupon_redemptions.sale_id` es FK a
   * `sales` y el uuid del pedido web la violaba.
   */
  private async redeemCoupon(order: WebOrder, saleId: string): Promise<string> {
    return redimirCuponPedidoWeb(supabase, order, saleId);
  }

  /**
   * Crear shipment automático para pedidos con delivery (propio o tercero)
   */
  private async createShipment(order: WebOrder): Promise<string> {
    try {
      const shipment = await deliveryIntegrationService.createShipmentFromWebOrder(order);
      return shipment.id;
    } catch (error) {
      console.error('Error creando shipment automático:', error);
      // No bloquear la confirmación si falla el shipment
      return '';
    }
  }

  /**
   * Crear factura de venta (invoice_sales + invoice_items) a partir de un web_order pagado.
   * Sigue el mismo patrón que POSService.checkout para mantener consistencia contable.
   */
  private async createInvoice(
    order: WebOrder,
    saleId: string,
    userId: string
  ): Promise<{ invoiceId: string; invoiceNumber: string; invoiceCurrency: string | null }> {
    try {
      const invoiceNumber = await generateInvoiceNumber(order.organization_id, 'FACT');

      // Calcular totales incluyendo delivery_fee
      const subtotal = Number(order.subtotal) || 0;
      const taxTotal = Number(order.tax_total) || 0;
      const discountTotal = Number(order.discount_total) || 0;
      const deliveryFee = Number(order.delivery_fee) || 0;
      const total = Number(order.total) || (subtotal + taxTotal - discountTotal + deliveryFee);
      const reparto = repartirTotalesPedidoWeb(order);

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          customer_id: order.customer_id || null,
          sale_id: saleId,
          number: invoiceNumber,
          // Emisión y vencimiento: hora del servidor, nunca el reloj del equipo.
          issue_date: HORA_DEL_SERVIDOR,
          due_date: HORA_DEL_SERVIDOR,
          // Sin moneda: el pedido web no la trae y el trigger
          // trg_00_moneda_base_por_defecto pone la base de la organización.
          currency: null,
          subtotal,
          tax_total: taxTotal,
          total,
          balance: 0, // Pedido pagado → balance 0
          status: 'paid',
          payment_method: mapWebPaymentMethodToInvoice(order.payment_method),
          payment_terms: 0,
          // El trigger fn_recalc_invoice_totals deriva la base con el modo de la
          // cabecera: tiene que ser el mismo de las líneas (F-42).
          tax_included: facturaWebConImpuestoIncluido(reparto),
          created_by: userId,
          notes: `Factura generada automáticamente desde pedido web ${order.order_number}`,
        })
        .select('id, number, currency')
        .single();

      if (invoiceError) {
        console.error('Error creando invoice_sales:', invoiceError);
        return { invoiceId: '', invoiceNumber: '', invoiceCurrency: null };
      }

      // Líneas de la factura. El trigger fn_recalc_invoice_totals pisa
      // invoice_sales.total con SUM(total_line): las líneas deben reproducir
      // order.total (descuento de pedido prorrateado, envío y propina como
      // líneas). Ver `webOrderTotals.ts`. Tarifa, código y modo de cada línea
      // salen del resolver único (F-42).
      const invoiceItems = await lineasFacturaWebConImpuesto(order, invoice.id, resolveLineTax, reparto);

      if (invoiceItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error creando invoice_items:', itemsError);
        }
      }

      console.log(`📄 Factura creada: ${invoice.number} para pedido web ${order.order_number}`);
      return { invoiceId: invoice.id, invoiceNumber: invoice.number, invoiceCurrency: invoice.currency ?? null };
    } catch (error) {
      console.error('Error en createInvoice:', error);
      return { invoiceId: '', invoiceNumber: '', invoiceCurrency: null };
    }
  }

  /**
   * Crear registro de pago (payments) asociado a la factura.
   * Si ya existe un pago creado por el webhook de la pasarela, no duplicar.
   */
  private async createPayment(
    order: WebOrder,
    invoiceId: string,
    userId: string,
    invoiceCurrency: string | null = null
  ): Promise<string> {
    try {
      // Verificar si ya existe un pago para este web_order (creado por webhook/website).
      // El website inserta el payment con status='paid', mientras que el ERP usa
      // 'completed'. Aceptar ambos para evitar duplicar el pago (y la notificación
      // que dispara el trigger trg_notify_payment_registered).
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('source', 'web_order')
        .eq('source_id', order.id)
        .in('status', ['paid', 'completed'])
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        // Ya existe pago del webhook/website — vincularlo a la factura.
        // Mapear el submétodo (nequi, daviplata, pse, card) a la pasarela real
        // (wompi) para que la notificación muestre el método correcto.
        // Normalizar status a 'completed': el website inserta el payment con
        // status='paid', pero fn_invoice_sales_paid (usada por los triggers
        // fn_recalc_invoice_totals / fn_recalc_invoice_balance_from_payments)
        // SOLO cuenta pagos con status='completed'. Sin esta normalización la
        // factura queda con balance=total aunque el pago exista, y se crea una
        // cuenta por cobrar fantasma con saldo.
        const mappedMethod = mapWebPaymentMethodToInvoice(order.payment_method);
        await supabase
          .from('payments')
          .update({
            source: 'invoice_sales',
            source_id: invoiceId,
            method: mappedMethod,
            status: 'completed',
          })
          .eq('id', existingPayment.id);

        // El trigger trg_notify_payment_registered ya creó una notificación con
        // el submétodo (ej: "Método: nequi") al insertarse el payment del website.
        // Corregir el contenido para que muestre la pasarela real (wompi).
        await this.fixPaymentNotificationMethod(
          order.organization_id,
          existingPayment.id,
          mappedMethod,
        );

        return existingPayment.id;
      }

      // Crear pago nuevo asociado a la factura
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          source: 'invoice_sales',
          source_id: invoiceId,
          amount: Number(order.total) || 0,
          method: mapWebPaymentMethodToInvoice(order.payment_method),
          // payments.currency es NOT NULL y no tiene trigger: la moneda de la
          // factura que se paga y, si no la trae, la base de la organización.
          currency:
            normalizarCodigoMoneda(invoiceCurrency) ??
            (await resolveOrgCurrency(supabase, order.organization_id)).code,
          status: 'completed',
          created_by: userId,
        })
        .select('id')
        .single();

      if (paymentError) {
        console.error('Error creando payment:', paymentError);
        return '';
      }

      return payment.id;
    } catch (error) {
      console.error('Error en createPayment:', error);
      return '';
    }
  }

  /**
   * Corrige el contenido de la notificación de "pago registrado" que creó el
   * trigger trg_notify_payment_registered al insertarse el payment del website.
   * El trigger usa NEW.method (el submétodo: nequi, daviplata, etc.), pero el
   * método real es la pasarela (wompi). Actualiza el payload de la notificación
   * existente para que muestre el método correcto.
   */
  private async fixPaymentNotificationMethod(
    organizationId: number,
    paymentId: string,
    correctMethod: string,
  ): Promise<void> {
    try {
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .select('id, payload')
        .eq('organization_id', organizationId)
        .eq('payload->>payment_id', paymentId)
        .eq('payload->>type', 'payment_registered')
        .limit(1)
        .maybeSingle();

      if (notifError || !notif) return;

      const currentPayload = notif.payload as Record<string, unknown>;
      const amount = currentPayload.amount as string | undefined;
      const updatedContent = `Se registró un pago de $${amount ?? '0'} — Método: ${correctMethod}`;

      await supabase
        .from('notifications')
        .update({
          payload: { ...currentPayload, content: updatedContent },
          updated_at: new Date().toISOString(),
        })
        .eq('id', notif.id);
    } catch (err) {
      // No fallar la confirmación si la corrección de notificación falla
      console.warn('No se pudo corregir la notificación de pago:', err);
    }
  }

  /**
   * Crear cuenta por cobrar (accounts_receivable) para el cliente.
   * Aunque el pedido esté pagado (balance 0), se crea el registro para trazabilidad.
   */
  private async createAccountReceivable(
    order: WebOrder,
    saleId: string
  ): Promise<string> {
    try {
      // Verificar si ya existe una cuenta por cobrar para esta venta
      const { data: existingAR } = await supabase
        .from('accounts_receivable')
        .select('id')
        .eq('sale_id', saleId)
        .maybeSingle();

      if (existingAR) return existingAR.id;

      const total = Number(order.total) || 0;
      const { data: ar, error: arError } = await supabase
        .from('accounts_receivable')
        .insert({
          organization_id: order.organization_id,
          customer_id: order.customer_id!,
          sale_id: saleId,
          amount: total,
          balance: 0, // Pedido pagado → balance 0
          due_date: new Date().toISOString(),
          status: 'paid',
        })
        .select('id')
        .single();

      if (arError) {
        console.error('Error creando accounts_receivable:', arError);
        return '';
      }

      return ar.id;
    } catch (error) {
      console.error('Error en createAccountReceivable:', error);
      return '';
    }
  }

  /**
   * Vincular propina online: buscar tip existente (creado por website) y actualizar
   * con sale_id + server_id reales. Si no existe, crear nuevo (fallback).
   * Website crea tip con sale_id=null, server_id='00000...', notes='Propina online - Pedido #WO-...'
   */
  private async createTip(
    order: WebOrder,
    saleId: string,
    userId: string
  ): Promise<string> {
    try {
      // Buscar tip existente creado por el website
      const { data: existingTip } = await supabase
        .from('tips')
        .select('id')
        .eq('organization_id', order.organization_id)
        .eq('branch_id', order.branch_id)
        .eq('tip_type', 'online')
        .ilike('notes', `%${order.order_number}%`)
        .is('voided_at', null)
        .limit(1)
        .maybeSingle();

      if (existingTip) {
        // UPDATE: completar con sale_id y server_id reales
        const { error: updateError } = await supabase
          .from('tips')
          .update({ sale_id: saleId, server_id: userId })
          .eq('id', existingTip.id)
          .eq('organization_id', order.organization_id);
        if (updateError) throw updateError;

        console.log(`✅ Tip online actualizado con sale_id: ${saleId}, server_id: ${userId}`);
        return existingTip.id;
      }

      // FALLBACK: website no creó tip → crear nuevo, en la sucursal del
      // pedido (no en la sucursal activa de quien confirma).
      const tip = await PropinasService.create({
        sale_id: saleId,
        server_id: userId,
        amount: order.tip_amount,
        tip_type: 'online',
        notes: `Propina online - Pedido ${order.order_number}`,
        branch_id: order.branch_id,
      });
      return tip.id;
    } catch (error) {
      console.error('Error vinculando tip online:', error);
      return '';
    }
  }
}

export const webOrderConfirmationService = new WebOrderConfirmationService();
