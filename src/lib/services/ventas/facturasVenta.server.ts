/**
 * Facturas de venta — servicio de servidor. Lecturas con el cliente de la
 * SESIÓN (RLS) filtradas por la organización de la sesión; escrituras solo por
 * RPC (`fn_factura_venta_emitir`, `fn_factura_venta_anular`). Nunca escribe
 * saldos ni cartera: los disparadores mandan.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { COLUMNAS_CANTIDAD_PRODUCTO, cantidadLineaDeProducto } from '@/lib/services/documentos/cantidadLinea';
import {
  codigoErrorFactura,
  type DatosFactura,
  type DetalleFacturaVenta,
  type ErrorFactura,
  type FaltanteStock,
  type ResultadoGuardarFactura,
} from '@/lib/finanzas/ventas/contratoFacturas';
import type { ConsultaFacturas, RespuestaListadoFacturas } from '@/lib/finanzas/ventas/listadoFacturas';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorFacturaServidor extends Error {
  constructor(
    public readonly codigo: ErrorFactura,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function lanzar(etiqueta: string, ctx: Ctx, error: { message: string; details?: unknown }): never {
  const codigo = codigoErrorFactura(error.message);
  if (codigo === 'error_desconocido') {
    console.error(`[facturasVenta] ${etiqueta}`, { organizationId: ctx.organizationId, message: error.message });
  }
  throw new ErrorFacturaServidor(codigo, detalleJson(error.details));
}

/**
 * La factura es de la organización de la SESIÓN. Las RPC validan acceso y
 * permiso en la organización de la factura; esto cierra el caso del usuario
 * que pertenece a dos organizaciones y opera con la sesión en la otra.
 */
async function exigirFacturaDeLaSesion(ctx: Ctx, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('invoice_sales')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) throw new ErrorFacturaServidor('factura_no_encontrada');
}

export async function emitirFactura(ctx: Ctx, id: string): Promise<{ id: string; numero: string; stock_descontado: boolean }> {
  await exigirFacturaDeLaSesion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_factura_venta_emitir', { p_invoice_id: id });
  if (error) lanzar('fn_factura_venta_emitir', ctx, error);
  return data as { id: string; numero: string; stock_descontado: boolean };
}

/**
 * Crea (`id` null) o edita un BORRADOR en una transacción
 * (`fn_factura_venta_guardar`): venta ligada, cabecera, líneas, impuestos y
 * comisión. La organización es la de la sesión; los totales los calcula la base.
 */
export async function guardarFactura(ctx: Ctx, id: string | null, datos: DatosFactura): Promise<ResultadoGuardarFactura> {
  const { data, error } = await ctx.supabase.rpc('fn_factura_venta_guardar', {
    p_org: ctx.organizationId,
    p_invoice_id: id,
    p_datos: datos,
  });
  if (error) lanzar('fn_factura_venta_guardar', ctx, error);
  const r = (data ?? {}) as { id: string; numero: string | null; sale_id: string | null; total: number | string; faltantes?: FaltanteStock[] };
  return { id: r.id, numero: r.numero ?? null, saleId: r.sale_id ?? null, total: num(r.total), faltantes: r.faltantes ?? [] };
}

export function faltantesDe(err: ErrorFacturaServidor): FaltanteStock[] {
  return Array.isArray(err.detalle) ? (err.detalle as FaltanteStock[]) : [];
}

/**
 * Resultado de `fn_factura_venta_anular`. `comisiones_canceladas`: comisiones
 * devengadas de la factura (o de su venta) que la anulación canceló, con
 * contra-asiento. `avisos`: p. ej. `comision_ya_pagada` (no se tocó; revisar a mano).
 */
export interface ResultadoAnularFactura {
  id: string;
  productos_devueltos: number;
  comisiones_canceladas?: number;
  avisos?: string[];
}

export async function anularFactura(ctx: Ctx, id: string, motivo: string): Promise<ResultadoAnularFactura> {
  await exigirFacturaDeLaSesion(ctx, id);
  const { data, error } = await ctx.supabase.rpc('fn_factura_venta_anular', { p_invoice_id: id, p_motivo: motivo });
  if (error) lanzar('fn_factura_venta_anular', ctx, error);
  return data as ResultadoAnularFactura;
}

// ─── Detalle agregado ────────────────────────────────────────────────────────

interface FilaFactura {
  id: string;
  number: string | null;
  status: string;
  document_type: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  balance: number | string | null;
  notes: string | null;
  description: string | null;
  tax_included: boolean | null;
  payment_terms: number | null;
  payment_method: string | null;
  branch_id: number | null;
  salesperson_id: string | null;
  commission_rate: number | string | null;
  sale_id: string | null;
  related_invoice_id: string | null;
  einvoice_status: string | null;
  einvoice_number: string | null;
  einvoice_qr: string | null;
  created_at: string | null;
  customer_id: string | null;
  customers: {
    id: string;
    full_name: string | null;
    doc_type: string | null;
    doc_number: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  branches: { name: string | null } | null;
}

export async function detalleFactura(ctx: Ctx, id: string): Promise<DetalleFacturaVenta> {
  const db = ctx.supabase;
  const org = ctx.organizationId;

  const { data: f, error } = await db
    .from('invoice_sales')
    .select(
      'id, number, status, document_type, issue_date, due_date, currency, subtotal, tax_total, total, balance, notes, description, ' +
        'tax_included, payment_terms, payment_method, branch_id, salesperson_id, commission_rate, sale_id, related_invoice_id, ' +
        'einvoice_status, einvoice_number, einvoice_qr, created_at, customer_id, ' +
        'customers:customer_id (id, full_name, doc_type, doc_number, email, phone, address), branches:branch_id (name)',
    )
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    console.error('[facturasVenta] detalle', { organizationId: org, message: error.message });
    throw new ErrorFacturaServidor('error_desconocido');
  }
  if (!f) throw new ErrorFacturaServidor('factura_no_encontrada');
  const fac = f as unknown as FilaFactura;

  // `invoice_sales.sale_id` no tiene FK hacia `sales`: el canal se lee aparte.
  type FilaVentaOrigen = { source: string | null; web_order_id: string | null; web_orders: { order_number: string | null } | null };
  const ventaOrigenPromesa = fac.sale_id
    ? db
        .from('sales')
        .select('source, web_order_id, web_orders:web_order_id (order_number)')
        .eq('id', fac.sale_id)
        .eq('organization_id', org)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [itemsRes, carteraRes, ncRes, appsRes, jobRes, asientosRes, histRes, vendedorRes] = await Promise.all([
    db
      .from('invoice_items')
      .select(
        'id, product_id, description, qty, unit_price, discount_amount, tax_rate, tax_code, tax_included, total_line, serial_numbers, note, code_reference, ' +
          `products:product_id (name, sku, ${COLUMNAS_CANTIDAD_PRODUCTO}), tax_templates:tax_code (name)`,
      )
      // Líneas antiguas guardan la factura en `invoice_id` con `invoice_type = 'sale'`.
      .or(`invoice_sales_id.eq.${id},and(invoice_id.eq.${id},invoice_type.eq.sale)`)
      .order('created_at', { ascending: true }),
    db.from('accounts_receivable').select('id, balance, status, days_overdue').eq('invoice_id', id).eq('organization_id', org).limit(1),
    db
      .from('invoice_sales')
      .select('id, number, total, status, issue_date')
      .eq('organization_id', org)
      .eq('related_invoice_id', id)
      .eq('document_type', 'credit_note')
      .order('issue_date', { ascending: true }),
    db.from('credit_note_applications').select('amount').eq('organization_id', org).eq('invoice_id', id),
    db
      .from('electronic_invoicing_jobs')
      .select('id, status, hold_reason, error_message, cufe, updated_at')
      .eq('organization_id', org)
      .eq('invoice_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
    db
      .from('journal_entries')
      .select('id, fact_key, entry_date, source_id, journal_lines (debit)')
      .eq('organization_id', org)
      .eq('source', 'invoice_sales')
      .in('source_id', [id, `${id}:void`])
      .order('id', { ascending: true }),
    db
      .from('finance_audit_log')
      .select('action, timestamp, reason')
      .eq('organization_id', org)
      .eq('entity', 'invoice_sales')
      .eq('entity_id', id)
      .order('timestamp', { ascending: false })
      .limit(50),
    fac.salesperson_id
      ? db.from('profiles').select('first_name, last_name').eq('id', fac.salesperson_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cartera = ((carteraRes.data ?? []) as { id: string; balance: number | string | null; status: string | null; days_overdue: number | null }[])[0] ?? null;

  // Pagos: a la factura, a su venta y a su cartera (D2), vivos y anulados.
  const fuentes: string[] = [`and(source.eq.invoice_sales,source_id.eq.${id})`];
  if (fac.sale_id) fuentes.push(`and(source.eq.sale,source_id.eq.${fac.sale_id})`);
  if (cartera) fuentes.push(`and(source.eq.account_receivable,source_id.eq.${cartera.id})`);
  const { data: pagosData } = await db
    .from('payments')
    .select('id, payment_date, created_at, method, amount, change_amount, reference, status, source, voided_at, void_reason, receipt_number, payment_groups:payment_group_id (receipt_number), payment_methods:method (name)')
    .eq('organization_id', org)
    .or(fuentes.join(','))
    .order('payment_date', { ascending: true });

  type FilaItem = {
    id: string;
    product_id: number | null;
    description: string | null;
    qty: number | string | null;
    unit_price: number | string | null;
    discount_amount: number | string | null;
    tax_rate: number | string | null;
    tax_code: string | null;
    tax_included: boolean | null;
    total_line: number | string | null;
    serial_numbers: string[] | null;
    note: string | null;
    code_reference: string | null;
    products: { name: string | null; sku: string | null; sale_mode?: string | null; qty_decimals?: number | null; unit_code?: string | null } | null;
    tax_templates: { name: string | null } | null;
  };
  type FilaPago = {
    id: string;
    payment_date: string | null;
    created_at: string | null;
    method: string | null;
    amount: number | string | null;
    change_amount: number | string | null;
    reference: string | null;
    status: string | null;
    source: string | null;
    voided_at: string | null;
    void_reason: string | null;
    /** Consecutivo propio del pago suelto (RC-0001 / CE-0001); en un pago único manda el del grupo. */
    receipt_number: string | null;
    payment_groups: { receipt_number: string | null } | null;
    payment_methods: { name: string | null } | null;
  };
  type FilaAsiento = { id: number; fact_key: string | null; entry_date: string | null; source_id: string; journal_lines: { debit: number | string | null }[] | null };

  const asientosCrudos = (asientosRes.data ?? []) as FilaAsiento[];
  const idsAsiento = asientosCrudos.map((a) => a.id);
  let revertidos = new Set<string>();
  if (idsAsiento.length > 0) {
    const { data: rev } = await db
      .from('journal_entries')
      .select('fact_key')
      .eq('organization_id', org)
      .in('fact_key', idsAsiento.map((x) => `reversal:${x}`));
    revertidos = new Set(((rev ?? []) as { fact_key: string }[]).map((r) => r.fact_key));
  }

  const ventaOrigen = ((await ventaOrigenPromesa).data ?? null) as unknown as FilaVentaOrigen | null;
  const vendedor = (vendedorRes as { data: { first_name: string | null; last_name: string | null } | null }).data;
  const cliente = fac.customers;

  return {
    factura: {
      id: fac.id,
      numero: fac.number,
      estado: fac.status,
      tipoDocumento: fac.document_type ?? 'invoice',
      emision: fac.issue_date,
      vencimiento: fac.due_date,
      moneda: fac.currency ? fac.currency.trim() : null,
      subtotal: num(fac.subtotal),
      impuestos: num(fac.tax_total),
      total: num(fac.total),
      saldo: num(fac.balance),
      notas: fac.notes,
      descripcion: fac.description,
      impuestosIncluidos: fac.tax_included === true,
      terminos: fac.payment_terms,
      metodoPago: fac.payment_method,
      branchId: fac.branch_id,
      sucursal: fac.branches?.name ?? null,
      vendedor: vendedor ? `${vendedor.first_name ?? ''} ${vendedor.last_name ?? ''}`.trim() || null : null,
      comisionTasa: fac.commission_rate === null ? null : num(fac.commission_rate),
      cargos: [],
      saleId: fac.sale_id,
      origenVenta: ventaOrigen
        ? { canal: ventaOrigen.source, pedidoWebId: ventaOrigen.web_order_id, pedidoWebNumero: ventaOrigen.web_orders?.order_number ?? null }
        : null,
      facturaRelacionadaId: fac.related_invoice_id,
      fe: { estado: fac.einvoice_status, numero: fac.einvoice_number, qr: fac.einvoice_qr },
      creadaEn: fac.created_at,
    },
    cliente: cliente
      ? {
          id: cliente.id,
          nombre: cliente.full_name,
          documento: [cliente.doc_type, cliente.doc_number].filter(Boolean).join(' ') || null,
          email: cliente.email,
          telefono: cliente.phone,
          direccion: cliente.address,
        }
      : null,
    lineas: ((itemsRes.data ?? []) as unknown as FilaItem[]).map((l) => ({
      id: l.id,
      productId: l.product_id,
      descripcion: l.description || l.products?.name || '',
      sku: l.products?.sku ?? l.code_reference ?? null,
      cantidad: num(l.qty),
      // Peso o medida: «0,735 kg» y «$ 18.900 / kg» en el detalle.
      ...cantidadLineaDeProducto(l.products),
      precioUnitario: num(l.unit_price),
      descuento: num(l.discount_amount),
      tarifa: num(l.tax_rate),
      codigoImpuesto: l.tax_code,
      nombreImpuesto: l.tax_templates?.name ?? l.tax_code ?? null,
      incluido: l.tax_included === true,
      total: num(l.total_line),
      seriales: l.serial_numbers ?? [],
      nota: l.note,
    })),
    pagos: ((pagosData ?? []) as unknown as FilaPago[]).map((p) => ({
      id: p.id,
      fecha: p.payment_date ?? p.created_at,
      metodo: p.method,
      metodoNombre: p.payment_methods?.name ?? null,
      monto: num(p.amount),
      cambio: num(p.change_amount),
      referencia: p.reference,
      estado: p.status ?? 'completed',
      recibo: p.payment_groups?.receipt_number ?? p.receipt_number ?? null,
      origen: p.source,
      anuladoEn: p.voided_at,
      motivoAnulacion: p.void_reason,
    })),
    notasCredito: ((ncRes.data ?? []) as { id: string; number: string | null; total: number | string | null; status: string; issue_date: string | null }[]).map((n) => ({
      id: n.id,
      numero: n.number,
      total: Math.abs(num(n.total)),
      estado: n.status,
      fecha: n.issue_date,
    })),
    creditoAplicado: ((appsRes.data ?? []) as { amount: number | string | null }[]).reduce((s, a) => s + num(a.amount), 0),
    cartera: cartera ? { id: cartera.id, saldo: num(cartera.balance), estado: cartera.status, dias: cartera.days_overdue } : null,
    asientos: asientosCrudos.map((a) => ({
      id: a.id,
      clave: a.fact_key,
      fecha: a.entry_date,
      debito: (a.journal_lines ?? []).reduce((s, l) => s + num(l.debit), 0),
      revertido: revertidos.has(`reversal:${a.id}`),
    })),
    job: ((jobRes.data ?? []) as { id: string; status: string; hold_reason: string | null; error_message: string | null; cufe: string | null; updated_at: string | null }[])
      .map((j) => ({ id: j.id, estado: j.status, retenido: j.hold_reason, error: j.error_message, cufe: j.cufe, actualizado: j.updated_at }))[0] ?? null,
    historial: ((histRes.data ?? []) as { action: string; timestamp: string | null; reason: string | null }[]).map((h) => ({
      accion: h.action,
      fecha: h.timestamp,
      motivo: h.reason,
    })),
  };
}

// ─── Listado (fn_facturas_venta_listado) ─────────────────────────────────────

export async function listadoFacturas(ctx: Ctx, consulta: ConsultaFacturas): Promise<RespuestaListadoFacturas> {
  const { data, error } = await ctx.supabase.rpc('fn_facturas_venta_listado', {
    p_org: ctx.organizationId,
    p_filtros: consulta.filtros,
    p_orden: consulta.orden,
    p_pagina: consulta.pagina,
    p_tamano: consulta.tamano,
  });
  if (error) lanzar('fn_facturas_venta_listado', ctx, error);
  const r = (data ?? {}) as Partial<RespuestaListadoFacturas>;
  return {
    total: Number(r.total) || 0,
    filas: (r.filas ?? []).map((f) => ({ ...f, total: num(f.total), saldo: num(f.saldo), dias_vencida: num(f.dias_vencida) })),
    kpis: (r.kpis ?? []).map((k) => ({
      moneda: k.moneda,
      facturado: num(k.facturado),
      por_cobrar: num(k.por_cobrar),
      vencido: num(k.vencido),
      facturas_vencidas: num(k.facturas_vencidas),
      vence_15: num(k.vence_15),
      facturas_emitidas: num(k.facturas_emitidas),
      facturas_con_saldo: num(k.facturas_con_saldo),
      facturas_vence_15: num(k.facturas_vence_15),
    })),
  };
}