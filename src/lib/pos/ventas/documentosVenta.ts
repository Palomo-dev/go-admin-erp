/**
 * Documentos y pagos de una venta del POS (V-d y V-e de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Módulo hoja: lo usan la lectura
 * del servidor (`GET /api/pos/ventas/[id]`), el listado y las pruebas.
 *
 * Una venta puede tener varios `invoice_sales` con el mismo `sale_id`: la
 * factura y, si se anuló o devolvió, su nota crédito (`document_type =
 * 'credit_note'`, `related_invoice_id` = la factura). Antes el detalle hacía
 * `.maybeSingle()` sobre `sale_id` y con dos documentos no mostraba ninguno
 * (V3). En la base: `document_type` ∈ invoice · credit_note · NULL (NULL es
 * una factura de las que se crearon antes de la columna).
 */

export interface DocumentoVenta {
  id: string;
  number: string | null;
  document_type: string | null;
  status: string | null;
  related_invoice_id?: string | null;
  total?: number | string | null;
  balance?: number | string | null;
  issue_date?: string | null;
  created_at?: string | null;
}

export function esNotaCredito(d: Pick<DocumentoVenta, 'document_type'>): boolean {
  return d.document_type === 'credit_note';
}

function anulado(status: string | null | undefined): boolean {
  return status === 'void' || status === 'voided' || status === 'cancelled';
}

/**
 * La factura de la venta: la que no es nota crédito, prefiriendo la vigente
 * sobre la anulada y, entre iguales, la más reciente.
 */
export function facturaDeVenta<T extends DocumentoVenta>(documentos: readonly T[] | null | undefined): T | null {
  const facturas = (documentos ?? []).filter((d) => !esNotaCredito(d));
  if (facturas.length === 0) return null;
  const orden = [...facturas].sort((a, b) => {
    const va = anulado(a.status) ? 1 : 0;
    const vb = anulado(b.status) ? 1 : 0;
    if (va !== vb) return va - vb;
    return String(b.created_at ?? b.issue_date ?? '').localeCompare(String(a.created_at ?? a.issue_date ?? ''));
  });
  return orden[0];
}

/** Notas crédito de la venta (de su factura o con el mismo `sale_id`). */
export function notasCreditoDeVenta<T extends DocumentoVenta>(documentos: readonly T[] | null | undefined): T[] {
  return (documentos ?? []).filter(esNotaCredito);
}

export type NumeroVenta =
  | { tipo: 'factura'; numero: string }
  | { tipo: 'pedido'; numero: string }
  | { tipo: 'sin_numero' };

/**
 * Número visible: el de la factura (nunca el de la nota crédito); si la venta
 * nació de un pedido web y no tiene factura, el del pedido; si no, «Sin número».
 * `sales` no tiene consecutivo propio: el consecutivo es `invoice_sales.number`.
 */
export function numeroVenta(documentos: readonly DocumentoVenta[] | null | undefined, numeroPedido?: string | null): NumeroVenta {
  const factura = facturaDeVenta(documentos);
  if (factura?.number) return { tipo: 'factura', numero: factura.number };
  if (numeroPedido) return { tipo: 'pedido', numero: numeroPedido };
  return { tipo: 'sin_numero' };
}

export interface PagoVenta {
  id: string | number;
  source: string | null;
  source_id: string | null;
  amount: number | string;
  status?: string | null;
  method?: string | null;
  created_at?: string | null;
  payment_date?: string | null;
}

/**
 * Pagos aplicados a la venta. El cobro del POS (`pos_checkout_v1`) y los
 * pagos de Finanzas escriben `source = 'invoice_sales'` con el id de la
 * FACTURA; los abonos de cartera, `account_receivable` con el id de la CxC; las
 * ventas antiguas, `sale` con el id de la venta. Antes el detalle solo leía
 * `sale` y casi todas las ventas salían «sin pagos» (V2). Los pagos de la nota
 * crédito (`credit_note`) no son cobros de la venta.
 */
export function pagosDeVenta<T extends PagoVenta>(
  pagos: readonly T[] | null | undefined,
  ids: { venta: string; facturas: readonly string[]; cuentasPorCobrar?: readonly string[] },
): T[] {
  const facturas = new Set(ids.facturas.map(String));
  const cxc = new Set((ids.cuentasPorCobrar ?? []).map(String));
  const vistos = new Set<string>();
  return (pagos ?? [])
    .filter((p) => {
      const sid = String(p.source_id ?? '');
      if (p.source === 'invoice_sales') return facturas.has(sid);
      if (p.source === 'account_receivable') return cxc.has(sid);
      if (p.source === 'sale') return sid === ids.venta;
      return false;
    })
    .filter((p) => {
      const k = String(p.id);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .sort((a, b) => String(a.payment_date ?? a.created_at ?? '').localeCompare(String(b.payment_date ?? b.created_at ?? '')));
}

/** Σ de los pagos completados (los cancelados o fallidos no cuentan). */
export function totalPagado(pagos: readonly PagoVenta[]): number {
  const t = pagos.filter((p) => !p.status || p.status === 'completed').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.round(t * 100) / 100;
}
