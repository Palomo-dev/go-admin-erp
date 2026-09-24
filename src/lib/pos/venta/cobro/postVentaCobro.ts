/**
 * Después de cobrar (POS-PLAN §2.6, L51 y L52), movido LITERALMENTE de
 * `handleCheckout` en `CheckoutDialog.tsx`. Sin React: decisiones puras y, para
 * el ticket y el cajón, los servicios inyectados (el diálogo pasa
 * `PrintJobsService`, `CashDrawerService` y `toast`).
 *
 * Orden en el diálogo tras una venta (no cambia): recibo en pantalla →
 * pantalla del cliente a «Gracias» → háptica → ticket físico → cajón → envío
 * → factura electrónica.
 *
 * - Sin red (Desktop, `pending_sync`): la venta queda en el outbox con su
 *   número local `OFF-…`; la pantalla del cliente recibe `saleId` nulo (la
 *   calificación iría contra una fila que aún no existe); el envío a
 *   domicilio y la factura electrónica NO se hacen: se avisa que quedan para
 *   cuando la venta se sincronice.
 * - Ticket físico: solo con sucursal; si no hay impresora de caja se avisa y
 *   el recibo queda para impresión manual; nunca bloquea.
 * - Cajón: solo con un pago en efectivo > 0 y sucursal; un fallo solo se
 *   registra.
 */

import type { TipoEntrega } from './entregaCobro';
import { hayPagoEnEfectivo, type EntradaPago } from './pagosCobro';

/** Lo que el diálogo lee de la venta que devolvió el cobro. */
export interface VentaCobrada {
  id: string;
  pending_sync?: boolean;
  receipt_number_local?: string;
}

export interface EstadoPostVenta {
  /** Venta guardada en el outbox del Desktop, sin fila en `sales` todavía. */
  pendienteSincronizar: boolean;
  /** Número local `OFF-…` que se muestra y se imprime; null con red. */
  numeroLocal: string | null;
  /** `saleId` para «Gracias» en la pantalla del cliente: null sin red. */
  saleIdPantalla: string | null;
}

export function estadoPostVenta(sale: VentaCobrada): EstadoPostVenta {
  const pendienteSincronizar = sale.pending_sync === true;
  return {
    pendienteSincronizar,
    numeroLocal: pendienteSincronizar ? (sale.receipt_number_local ?? null) : null,
    saleIdPantalla: pendienteSincronizar ? null : sale.id,
  };
}

export type AccionDiferible = 'hacer' | 'avisar_sin_red' | 'nada';

export interface EntradaPlanPostVenta {
  sale: VentaCobrada;
  branchId: number | null | undefined;
  payments: EntradaPago[];
  deliveryType: TipoEntrega;
  deliveryAddress: string;
  sendToFactus: boolean;
}

export interface PlanPostVenta extends EstadoPostVenta {
  /** Encolar el ticket en la impresora de caja, o avisar que la venta no tiene sucursal. */
  ticket: 'encolar' | 'sin_sucursal';
  abrirCajon: boolean;
  /** Crear el envío (domicilio propio con dirección). */
  envio: AccionDiferible;
  /** Enviar la factura electrónica a DIAN (Factus). */
  factura: AccionDiferible;
}

/** Qué se hace tras la venta, en cada caso (el orden lo pone el diálogo). */
export function planPostVenta({ sale, branchId, payments, deliveryType, deliveryAddress, sendToFactus }: EntradaPlanPostVenta): PlanPostVenta {
  const estado = estadoPostVenta(sale);
  const pideEnvio = deliveryType === 'delivery_own' && !!deliveryAddress;
  return {
    ...estado,
    ticket: branchId ? 'encolar' : 'sin_sucursal',
    abrirCajon: hayPagoEnEfectivo(payments) && !!branchId,
    envio: pideEnvio ? (estado.pendienteSincronizar ? 'avisar_sin_red' : 'hacer') : 'nada',
    factura: sendToFactus ? (estado.pendienteSincronizar ? 'avisar_sin_red' : 'hacer') : 'nada',
  };
}

export const AVISO_SIN_IMPRESORA_CAJA =
  'No hay impresora de caja configurada para esta sucursal. El recibo quedó disponible para impresión manual.';
export const AVISO_VENTA_SIN_SUCURSAL = 'Esta venta no tiene sucursal asignada. No se encoló impresión física.';

export interface ServiciosTicketYCajon {
  /** `PrintJobsService.enqueueSaleTicket(branchId, …)` con los datos de la venta. */
  encolarTicket: () => Promise<{ enqueued: number }>;
  /** `CashDrawerService.open(branchId)`. */
  abrirCajon: () => Promise<unknown>;
  avisarAdvertencia: (mensaje: string) => void;
  avisarError: (mensaje: string) => void;
}

/** `err.message || err`, como estaba escrito en el diálogo, sin suponer la forma del error. */
function mensajeOError(err: unknown): unknown {
  const mensaje = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  return mensaje || err;
}

/**
 * Ticket físico y cajón, en ese orden y sin esperar a ninguno (best-effort):
 * lo que falle se avisa o se registra, nunca corta la venta.
 */
export function lanzarTicketYCajon(plan: Pick<PlanPostVenta, 'ticket' | 'abrirCajon'>, servicios: ServiciosTicketYCajon): void {
  // Impresión física automática del ticket de venta (best-effort):
  // sale por la(s) impresora(s) con estación 'Caja'. Si no hay impresora
  // o falla, no bloquea el flujo; queda el botón "Imprimir Recibo" (PDF).
  if (plan.ticket === 'encolar') {
    servicios.encolarTicket().then(({ enqueued }) => {
      if (enqueued === 0) {
        servicios.avisarAdvertencia(AVISO_SIN_IMPRESORA_CAJA);
      }
    }).catch((err: unknown) => {
      servicios.avisarError('No se pudo encolar la impresión física del recibo: ' + String(mensajeOError(err)));
    });
  } else {
    servicios.avisarAdvertencia(AVISO_VENTA_SIN_SUCURSAL);
  }

  // Abrir cajón de dinero si hay pagos en efectivo (best-effort, no bloquea)
  if (plan.abrirCajon) {
    servicios.abrirCajon().catch((err: unknown) => {
      console.warn('[cashDrawer] No se pudo abrir el cajón:', mensajeOError(err));
    });
  }
}
