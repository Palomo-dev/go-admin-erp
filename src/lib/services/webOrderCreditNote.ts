import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceNumberWithClient } from '@/lib/utils/invoiceUtils';
import { resolveLineTaxWith } from '@/lib/services/taxResolverCore';
import type { WebOrder } from '@/lib/services/webOrdersService';
import {
  facturaWebConImpuestoIncluido,
  lineasFacturaWebConImpuesto,
  lineasNotaCreditoWeb,
  repartirTotalesPedidoWeb,
  type LineaFacturaOriginal,
} from '@/lib/services/webOrderTotals';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

/**
 * Nota crédito (invoice_sales document_type='credit_note') de un pedido web contra su
 * factura original. Extraída de POST /api/web-orders/[id]/refund (28-oct-2026) para
 * reutilizarla en los cambios de productos (web_order_changes) sin cancelar el pedido.
 * Comportamiento idéntico al de la ruta: los errores se registran y no se lanzan.
 */
export interface NotaCreditoPedidoWebOpts {
  isFullRefund: boolean;
  /** Monto del reembolso (el total del pedido si isFullRefund). */
  monto: number;
  motivo: string;
  itemsParciales?: Array<{ product_id: number; quantity: number }>;
  now?: string;
}

export interface NotaCreditoPedidoWebResultado {
  originalInvoice: { id: string; number: string; total: number; balance: number; status: string; tax_included: boolean; currency: string | null } | null;
  creditNoteId?: string;
  creditNoteNumber?: string;
}

export async function crearNotaCreditoPedidoWeb(
  supabase: SupabaseClient,
  order: WebOrder,
  opts: NotaCreditoPedidoWebOpts,
): Promise<NotaCreditoPedidoWebResultado> {
  const now = opts.now ?? new Date().toISOString();
  const isFullRefund = opts.isFullRefund;
  const orderTotal = Number(order.total) || 0;
  const effectiveRefundAmount = isFullRefund ? orderTotal : opts.monto;
  const partialItems = opts.itemsParciales ?? [];

  // 2. Buscar la factura original (invoice_sales con sale_id = order.sale_id)
  const { data: originalInvoice } = await supabase
    .from('invoice_sales')
    .select('id, number, total, balance, status, tax_included, currency')
    .eq('sale_id', order.sale_id)
    .eq('document_type', 'invoice')
    .limit(1)
    .maybeSingle();

  // 3. Crear nota crédito
  let creditNoteId: string | undefined;
  let creditNoteNumber: string | undefined;
  // Modo de impuesto de la nota: el de la factura que revierte. Si no hay
  // factura, el que habría tenido la del pedido (F-42).
  const creditNoteTaxIncluded: boolean = originalInvoice
    ? Boolean(originalInvoice.tax_included)
    : facturaWebConImpuestoIncluido(repartirTotalesPedidoWeb(order));
  const resolverImpuesto = (input: Parameters<typeof resolveLineTaxWith>[1]) => resolveLineTaxWith(supabase, input);

  try {
    creditNoteNumber = await generateInvoiceNumberWithClient(
      supabase,
      order.organization_id,
      'NC'
    );

    const creditNoteTotal = isFullRefund ? orderTotal : effectiveRefundAmount;
    const creditNoteSubtotal = isFullRefund
      ? Number(order.subtotal) || 0
      : effectiveRefundAmount - (Number(order.tax_total) || 0);
    const creditNoteTax = isFullRefund ? Number(order.tax_total) || 0 : 0;

    const { data: creditNote, error: cnError } = await supabase
      .from('invoice_sales')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        customer_id: order.customer_id || null,
        sale_id: order.sale_id,
        related_invoice_id: originalInvoice?.id || null,
        number: creditNoteNumber,
        issue_date: now,
        due_date: now,
        // La nota va en la moneda de la factura que revierte; sin factura,
        // null y el trigger trg_00_moneda_base_por_defecto pone la base.
        currency: normalizarCodigoMoneda(originalInvoice?.currency),
        subtotal: creditNoteSubtotal,
        tax_total: creditNoteTax,
        total: creditNoteTotal,
        balance: 0,
        status: 'paid',
        payment_method: order.payment_method || 'card',
        payment_terms: 0,
        tax_included: creditNoteTaxIncluded,
        document_type: 'credit_note',
        notes: opts.motivo,
      })
      .select('id, number')
      .single();

    if (cnError) {
      console.error('[Refund] Error creando nota crédito:', cnError);
    } else {
      creditNoteId = creditNote.id;
      creditNoteNumber = creditNote.number;

      // Crear invoice_items para la nota crédito.
      // F-42: la nota copia las líneas de la factura original (tarifa y código
      // definitivos, resolver para el total), así revierte exactamente lo
      // facturado. Si el pedido no tiene factura, se parte de las líneas que
      // la habrían formado. Antes estas líneas iban con invoice_type
      // 'credit_note', que la restricción de invoice_items rechaza: la nota
      // quedaba sin líneas. Ver `lineasNotaCreditoWeb`.
      let lineasOriginales: LineaFacturaOriginal[] = [];
      if (originalInvoice) {
        const { data: originalLines } = await supabase
          .from('invoice_items')
          .select('id, product_id, description, qty, unit_price, discount_amount, tax_rate, tax_code, total_line')
          .eq('invoice_sales_id', originalInvoice.id);
        lineasOriginales = (originalLines || []) as LineaFacturaOriginal[];
      }
      if (lineasOriginales.length === 0) {
        lineasOriginales = await lineasFacturaWebConImpuesto(order, creditNote.id, resolverImpuesto);
      }

      const creditNoteItems = await lineasNotaCreditoWeb(
        {
          creditNoteId: creditNote.id,
          organizationId: order.organization_id,
          orderNumber: order.order_number,
          lineasOriginales,
          taxIncluded: creditNoteTaxIncluded,
          itemsParciales: partialItems,
          montoParcial: !isFullRefund && partialItems.length === 0 ? effectiveRefundAmount : null,
        },
        resolverImpuesto,
      );

      if (creditNoteItems.length > 0) {
        const { error: cnItemsError } = await supabase.from('invoice_items').insert(creditNoteItems);
        if (cnItemsError) {
          console.error('[Refund] Error creando líneas de la nota crédito:', cnItemsError);
        }
      }
    }
  } catch (cnError) {
    console.error('[Refund] Error en creación de nota crédito:', cnError);
  }

  return { originalInvoice: (originalInvoice as NotaCreditoPedidoWebResultado['originalInvoice']) ?? null, creditNoteId, creditNoteNumber };
}
