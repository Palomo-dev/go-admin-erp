/**
 * Salida anticipada («Cancelar estadía») de una reserva con check-in hecho.
 *
 * Distinta de la cancelación normal (que solo aplica a reservas sin check-in):
 *  - se cobran (o quedan como deuda) las noches usadas hasta hoy y los consumos del folio;
 *  - se anulan las noches no usadas: se reduce el cargo de hospedaje del folio y la reserva
 *    queda con salida = hoy y total = hospedaje usado;
 *  - si la reserva ya tenía factura, NO se borra nada: se emite nota crédito por el valor
 *    anulado (`fn_nota_credito_emitir` vía /api/facturas-venta/[id]/nota-credito);
 *  - el cierre usa el check-out normal (venta/factura, cierre de folio, habitación a limpieza
 *    y tarea de housekeeping).
 */
import { supabase } from '@/lib/supabase/config';
import CheckoutService from '@/lib/services/checkoutService';
import FoliosService from '@/lib/services/foliosService';
import { emitirNotaCreditoVenta } from '@/lib/finanzas/ventas/clienteFacturas';
import { calcularSalidaAnticipada, type ResumenSalidaAnticipada } from './salidaAnticipada.calculo';

export interface ContextoSalidaAnticipada {
  reservationId: string;
  checkin: string;
  checkoutPrevisto: string;
  hoy: string;
  folioId: string | null;
  itemsHospedaje: { id: string; amount: number; description: string | null }[];
  facturaId: string | null;
  resumen: ResumenSalidaAnticipada;
}

export const hoyLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en la zona del navegador

const esHospedaje = (it: { source: string | null; description: string | null }) =>
  it.source === 'room_charge' && !/noche\(?s?\)? extra/i.test(it.description || '');

export async function obtenerContextoSalidaAnticipada(reservationId: string): Promise<ContextoSalidaAnticipada> {
  const { data: res, error } = await supabase
    .from('reservations')
    .select('id, status, checkin, checkout, total_estimated')
    .eq('id', reservationId)
    .single();
  if (error || !res) throw new Error('Reserva no encontrada');
  if (res.status !== 'checked_in') throw new Error('Solo se puede cancelar la estadía de una reserva con check-in');

  const hoy = hoyLocal();
  const { data: folio } = await supabase
    .from('folios')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('status', 'open')
    .maybeSingle();

  let items: { id: string; amount: number; description: string | null; source: string | null }[] = [];
  let pagosFolio = 0;
  if (folio) {
    const { data: fi } = await supabase.from('folio_items').select('id, amount, description, source').eq('folio_id', folio.id);
    items = (fi || []).map((i: any) => ({ ...i, amount: Number(i.amount) || 0 }));
    const { data: pf } = await supabase
      .from('payments').select('amount').eq('source', 'folio').eq('source_id', folio.id).eq('status', 'completed');
    pagosFolio = (pf || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  }
  const { data: dep } = await supabase
    .from('payments').select('amount').eq('source', 'pms').eq('source_id', reservationId).eq('status', 'completed');
  const depositos = (dep || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const itemsHospedaje = items.filter(esHospedaje);
  const hospedajeFolio = itemsHospedaje.reduce((s, i) => s + i.amount, 0);
  const totalHospedaje = itemsHospedaje.length > 0 ? hospedajeFolio : Number(res.total_estimated) || 0;
  const consumos = items.filter((i) => !esHospedaje(i)).reduce((s, i) => s + i.amount, 0);

  // ¿Ya hay factura? (venta del check-out con la nota estándar)
  let facturaId: string | null = null;
  const { data: venta } = await supabase
    .from('sales').select('id')
    .or(`notes.eq."Checkout reserva ${reservationId}",notes.eq."Checkout reserva ${reservationId.slice(0, 8)}"`)
    .limit(1).maybeSingle();
  if (venta) {
    const { data: inv } = await supabase
      .from('invoice_sales').select('id, status').eq('sale_id', venta.id).neq('status', 'void').limit(1).maybeSingle();
    facturaId = inv?.id ?? null;
  }

  return {
    reservationId,
    checkin: res.checkin,
    checkoutPrevisto: res.checkout,
    hoy,
    folioId: folio?.id ?? null,
    itemsHospedaje: itemsHospedaje.map(({ id, amount, description }) => ({ id, amount, description })),
    facturaId,
    resumen: calcularSalidaAnticipada({
      checkin: res.checkin, checkout: res.checkout, hoy, totalHospedaje, consumos, pagos: pagosFolio + depositos,
    }),
  };
}

export interface OpcionesSalidaAnticipada {
  userId?: string;
  motivo: string;
  pago?: { method: string; amount: number } | null; // sin pago → el saldo queda como deuda
}

export async function ejecutarSalidaAnticipada(ctx: ContextoSalidaAnticipada, op: OpcionesSalidaAnticipada) {
  const r = ctx.resumen;
  const hoy = ctx.hoy;

  // 1) Anular noches no usadas en el folio (reducir el hospedaje, sin borrar líneas)
  if (ctx.folioId && r.hospedajeAnulado > 0 && ctx.itemsHospedaje.length > 0) {
    let porQuitar = r.hospedajeAnulado;
    for (const it of [...ctx.itemsHospedaje].reverse()) {
      if (porQuitar <= 0) break;
      const quita = Math.min(it.amount, porQuitar);
      const nuevo = Math.round((it.amount - quita) * 100) / 100;
      const { error } = await supabase
        .from('folio_items')
        .update({
          amount: nuevo,
          unit_price: nuevo,
          quantity: 1,
          description: `Hospedaje - ${r.nochesUsadas} noche(s) usadas (salida anticipada; ${r.nochesAnuladas} anulada(s))`,
        })
        .eq('id', it.id);
      if (error) throw new Error('No se pudo ajustar el hospedaje del folio: ' + error.message);
      porQuitar -= quita;
    }
    await FoliosService.recalculateFolioBalance(ctx.folioId);
  }

  // 2) Reserva: salida = hoy, total = hospedaje usado, rastro en metadata
  const { data: actual } = await supabase.from('reservations').select('metadata').eq('id', ctx.reservationId).single();
  const metadata = {
    ...((actual?.metadata as Record<string, unknown>) || {}),
    salida_anticipada: {
      fecha: hoy,
      checkout_original: ctx.checkoutPrevisto,
      noches_usadas: r.nochesUsadas,
      noches_anuladas: r.nochesAnuladas,
      monto_anulado: r.hospedajeAnulado,
      motivo: op.motivo,
      registrado_por: op.userId ?? null,
    },
  };
  const { error: errRes } = await supabase
    .from('reservations')
    .update({ checkout: hoy, end_date: hoy, total_estimated: r.hospedajeUsado, metadata })
    .eq('id', ctx.reservationId);
  if (errRes) throw new Error('No se pudo actualizar la reserva: ' + errRes.message);
  await supabase.from('reservation_spaces').update({ checkout: hoy }).eq('reservation_id', ctx.reservationId);

  // 3) Si ya existía factura: nota crédito por las noches anuladas (no se borra la factura)
  let notaCredito: unknown = null;
  if (ctx.facturaId && r.hospedajeAnulado > 0) {
    notaCredito = await emitirNotaCreditoVenta(ctx.facturaId, {
      modo: 'valor',
      valor: r.hospedajeAnulado,
      concepto: `Noches no usadas (${r.nochesAnuladas}) por salida anticipada`,
      motivo: `Salida anticipada: ${op.motivo}`,
      conceptoDian: '1',
      claveIdempotencia: `salida-anticipada-${ctx.reservationId}`,
    });
  }

  // 4) Check-out normal: venta/factura por lo usado + consumos, cierre de folio, habitación a limpieza
  const pago = op.pago && op.pago.amount > 0 ? op.pago : null;
  const resultado = await CheckoutService.performCheckout({
    reservationId: ctx.reservationId,
    userId: op.userId,
    notes: `Salida anticipada (${r.nochesAnuladas} noche(s) anulada(s)). ${op.motivo}`,
    generateInvoice: true, // idempotente: si ya hay venta/factura del check-out, se reutiliza
    generateReceipt: false,
    updateCheckoutDate: false,
    payments: pago ? [pago] : [],
    totalPaid: r.pagos + (pago?.amount ?? 0),
  });

  return { resultado, notaCredito };
}
