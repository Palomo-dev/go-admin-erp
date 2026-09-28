/**
 * Detalle de una venta armado EN EL SERVIDOR en una sola respuesta
 * (`GET /api/pos/ventas/[id]`, paso 14 de docs/implementacion/CAJAS-VENTAS-PLAN.md):
 * venta, líneas, documentos (factura y notas crédito), pagos, cartera,
 * devoluciones, asientos, mesa, pedido web, comisión y permisos.
 *
 * Arregla lo que el detalle leía mal desde el navegador:
 * - V2: pagos por `invoice_sales` (el cobro del POS), `account_receivable` y `sale`
 *   (`pagosDeVenta`), no solo `sale`.
 * - V3: factura + nota crédito con el mismo `sale_id` (`facturaDeVenta`), no `.maybeSingle()`.
 * - V5: asientos con `source` `sales` / `invoice_sales` (lo que escriben los disparadores).
 * - La venta se lee con la organización de la sesión (antes sin filtro de organización).
 *
 * Con el cliente de la sesión: la RLS aplica. Los permisos de las acciones se
 * resuelven aquí (`resolverPermisosVentas`), nunca en el navegador.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { resolverPermisosVentas, type PermisosVentas } from './permisosVentas';
import { estadoVenta, origenVenta, type EstadoVenta, type OrigenVenta } from './estadoVenta';
import { facturaDeVenta, notasCreditoDeVenta, numeroVenta, pagosDeVenta, totalPagado, type NumeroVenta } from './documentosVenta';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId' | 'roleId' | 'isSuperAdmin'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export class ErrorDetalleVenta extends Error {
  constructor(readonly codigo: 'venta_no_encontrada' | 'venta_invalida' | 'lectura_fallida', readonly status: number, mensaje: string) {
    super(mensaje);
  }
}

export interface LineaDetalle {
  id: string;
  product_id: number | null;
  nombre: string | null;
  sku: string | null;
  cantidad: number;
  precio: number;
  descuento: number;
  impuesto: number;
  tasa: number | null;
  total: number;
  nota: string | null;
}

export interface DocumentoDetalle {
  id: string;
  numero: string | null;
  tipo: 'factura' | 'nota_credito';
  estado: string | null;
  total: number;
  saldo: number;
  emitida: string | null;
  vence: string | null;
  estado_fe: string | null;
}

export interface PagoDetalle {
  id: string;
  metodo: string | null;
  monto: number;
  vuelto: number;
  fecha: string | null;
  estado: string | null;
  origen: string | null;
  referencia: string | null;
  moneda: string | null;
}

export interface DevolucionDetalle {
  id: number;
  total: number;
  estado: string | null;
  metodo: string | null;
  motivo: string | null;
  fecha: string | null;
  nota_credito_id: string | null;
}

export interface AsientoDetalle {
  id: number;
  fecha: string | null;
  memo: string | null;
  origen: string | null;
  publicado: boolean;
}

export interface DetalleVenta {
  id: string;
  fecha: string;
  creada: string;
  estado: EstadoVenta;
  origen: OrigenVenta;
  numero: NumeroVenta;
  status: string;
  payment_status: string | null;
  subtotal: number;
  impuestos: number;
  descuentos: number;
  envio: number;
  propina: number;
  total: number;
  saldo: number;
  pagado: number;
  devuelto: number;
  impuestos_incluidos: boolean;
  desglose_impuestos: Array<{ name?: string; amount?: number; rate?: number }> | null;
  notas: string | null;
  sucursal: { id: number; nombre: string | null };
  cliente: { id: string; nombre: string | null; documento: string | null; email: string | null; telefono: string | null } | null;
  cajero: { id: string; nombre: string | null };
  vendedor: { id: string; nombre: string | null } | null;
  lineas: LineaDetalle[];
  factura: DocumentoDetalle | null;
  notas_credito: DocumentoDetalle[];
  pagos: PagoDetalle[];
  cxc: { id: string; monto: number; saldo: number; vence: string | null; estado: string | null } | null;
  devoluciones: DevolucionDetalle[];
  asientos: AsientoDetalle[];
  comision: { monto: number; estado: string | null; beneficiario: string | null } | null;
  mesa: { nombre: string | null; mesero: string | null; comensales: number | null; abierta: string | null; cerrada: string | null } | null;
  pedido: { id: string; numero: string | null; entrega: string | null; direccion: string | null; cupon: string | null } | null;
  incluida_en_caja: boolean;
  permisos: PermisosVentas;
}

async function nombresPerfiles(ctx: Ctx, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data } = await ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', unicos);
  return new Map(
    ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || '',
    ]),
  );
}

function direccionTexto(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  const o = v as Record<string, unknown>;
  const partes = [o.address, o.formatted, o.street, o.city].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return partes.length ? partes.join(', ') : null;
}

export async function detalleVenta(ctx: Ctx, id: string): Promise<DetalleVenta> {
  if (!UUID.test(id)) throw new ErrorDetalleVenta('venta_invalida', 400, 'Identificador de venta inválido');
  const { data: venta, error } = await ctx.supabase
    .from('sales')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw new ErrorDetalleVenta('lectura_fallida', 500, error.message);
  if (!venta) throw new ErrorDetalleVenta('venta_no_encontrada', 404, 'La venta no existe');
  const s = venta as Record<string, unknown> & { id: string; branch_id: number; customer_id: string | null; user_id: string };

  const [itemsRes, docsRes, devRes, mesaRes, pedidoRes, comRes, clienteRes, ramaRes, permisos] = await Promise.all([
    ctx.supabase
      .from('sale_items')
      .select('id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, products(name, sku)')
      .eq('sale_id', id),
    ctx.supabase
      .from('invoice_sales')
      .select('id, number, document_type, status, total, balance, issue_date, due_date, created_at, related_invoice_id, einvoice_status')
      .eq('sale_id', id)
      .eq('organization_id', ctx.organizationId),
    ctx.supabase
      .from('returns')
      .select('id, total_refund, status, refund_method, reason, created_at, return_date, credit_note_invoice_id')
      .eq('sale_id', id)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: true }),
    s.table_session_id
      ? ctx.supabase.from('table_sessions').select('server_id, customers, opened_at, closed_at, restaurant_tables(name)').eq('id', s.table_session_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    s.web_order_id
      ? ctx.supabase.from('web_orders').select('id, order_number, delivery_type, delivery_address, coupon_code').eq('id', s.web_order_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase.from('commissions').select('commission_amount, status, payee_name').eq('source_type', 'sale').eq('source_id', id).eq('organization_id', ctx.organizationId).limit(1),
    s.customer_id
      ? ctx.supabase.from('customers').select('id, full_name, identification_number, doc_number, email, phone').eq('id', s.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase.from('branches').select('name').eq('id', s.branch_id).maybeSingle(),
    resolverPermisosVentas(ctx),
  ]);
  if (itemsRes.error) throw new ErrorDetalleVenta('lectura_fallida', 500, itemsRes.error.message);
  if (docsRes.error) throw new ErrorDetalleVenta('lectura_fallida', 500, docsRes.error.message);

  type Doc = { id: string; number: string | null; document_type: string | null; status: string | null; total: number | string | null; balance: number | string | null; issue_date: string | null; due_date: string | null; created_at: string | null; einvoice_status: string | null };
  const docs = (docsRes.data ?? []) as Doc[];
  const factura = facturaDeVenta(docs);
  const ncs = notasCreditoDeVenta(docs);
  const idsFacturas = docs.filter((d) => d.document_type !== 'credit_note').map((d) => d.id);

  const cxcRes = await ctx.supabase
    .from('accounts_receivable')
    .select('id, amount, balance, due_date, status, created_at')
    .eq('organization_id', ctx.organizationId)
    .or(`sale_id.eq.${id}${idsFacturas.length ? `,invoice_id.in.(${idsFacturas.join(',')})` : ''}`)
    .order('created_at', { ascending: false });
  const cxcFilas = (cxcRes.data ?? []) as Array<{ id: string; amount: number | string | null; balance: number | string | null; due_date: string | null; status: string | null }>;

  const fuentes = [id, ...idsFacturas, ...cxcFilas.map((c) => c.id)];
  const [pagosRes, asientosRes] = await Promise.all([
    ctx.supabase
      .from('payments')
      .select('id, source, source_id, method, amount, change_amount, status, payment_date, created_at, reference, currency')
      .eq('organization_id', ctx.organizationId)
      .in('source', ['sale', 'invoice_sales', 'account_receivable'])
      .in('source_id', fuentes),
    ctx.supabase
      .from('journal_entries')
      .select('id, entry_date, memo, source, posted')
      .eq('organization_id', ctx.organizationId)
      .in('source', ['sales', 'sale', 'invoice_sales'])
      .in('source_id', [id, ...idsFacturas])
      .order('entry_date', { ascending: true }),
  ]);
  type Pago = { id: string; source: string; source_id: string; method: string | null; amount: number | string; change_amount: number | string | null; status: string | null; payment_date: string | null; created_at: string | null; reference: string | null; currency: string | null };
  const pagos = pagosDeVenta((pagosRes.data ?? []) as Pago[], { venta: id, facturas: idsFacturas, cuentasPorCobrar: cxcFilas.map((c) => c.id) });

  const mesa = mesaRes.data as { server_id: string | null; customers: number | null; opened_at: string | null; closed_at: string | null; restaurant_tables: { name?: string } | { name?: string }[] | null } | null;
  const gente = await nombresPerfiles(ctx, [s.user_id, s.salesperson_id as string | null, mesa?.server_id]);
  const cliente = clienteRes.data as { id: string; full_name: string | null; identification_number: string | null; doc_number: string | null; email: string | null; phone: string | null } | null;
  const pedido = pedidoRes.data as { id: string; order_number: string | null; delivery_type: string | null; delivery_address: unknown; coupon_code: string | null } | null;
  const com = ((comRes.data ?? []) as Array<{ commission_amount: number | string | null; status: string | null; payee_name: string | null }>)[0];
  const devoluciones = ((devRes.data ?? []) as Array<{ id: number; total_refund: number | string; status: string | null; refund_method: string | null; reason: string | null; created_at: string | null; return_date: string | null; credit_note_invoice_id: string | null }>);
  const devuelto = devoluciones.filter((r) => r.status === 'processed').reduce((a, r) => a + n(r.total_refund), 0);
  const aDoc = (d: Doc, tipo: DocumentoDetalle['tipo']): DocumentoDetalle => ({
    id: d.id,
    numero: d.number,
    tipo,
    estado: d.status,
    total: n(d.total),
    saldo: n(d.balance),
    emitida: d.issue_date ?? d.created_at,
    vence: d.due_date,
    estado_fe: d.einvoice_status,
  });
  const mesaNombre = mesa ? (Array.isArray(mesa.restaurant_tables) ? mesa.restaurant_tables[0]?.name : mesa.restaurant_tables?.name) ?? null : null;
  const cxc = cxcFilas[0];
  const origen = origenVenta({ source: s.source as string, web_order_id: s.web_order_id as string | null, table_session_id: s.table_session_id as string | null });

  return {
    id,
    fecha: (s.sale_date as string) ?? (s.created_at as string),
    creada: s.created_at as string,
    estado: estadoVenta({ status: s.status as string, payment_status: s.payment_status as string | null, total: s.total as number, devuelto }),
    origen,
    numero: numeroVenta(docs, pedido?.order_number ?? null),
    status: s.status as string,
    payment_status: (s.payment_status as string | null) ?? null,
    subtotal: n(s.subtotal),
    impuestos: n(s.tax_total),
    descuentos: n(s.discount_total),
    envio: n(s.delivery_fee),
    propina: n(s.tip_amount),
    total: n(s.total),
    saldo: factura ? n(factura.balance) : n(s.balance),
    pagado: totalPagado(pagos),
    devuelto: Math.round(devuelto * 100) / 100,
    impuestos_incluidos: s.tax_included === true,
    desglose_impuestos: Array.isArray(s.tax_breakdown) ? (s.tax_breakdown as DetalleVenta['desglose_impuestos']) : null,
    notas: (s.notes as string | null) ?? null,
    sucursal: { id: s.branch_id, nombre: (ramaRes.data as { name?: string } | null)?.name ?? null },
    cliente: cliente
      ? { id: cliente.id, nombre: cliente.full_name, documento: cliente.identification_number || cliente.doc_number, email: cliente.email, telefono: cliente.phone }
      : null,
    cajero: { id: s.user_id, nombre: gente.get(s.user_id) ?? null },
    vendedor: s.salesperson_id ? { id: s.salesperson_id as string, nombre: gente.get(s.salesperson_id as string) ?? null } : null,
    lineas: ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map((l) => {
      const prod = (Array.isArray(l.products) ? l.products[0] : l.products) as { name?: string; sku?: string } | null;
      const notas = l.notes as Record<string, unknown> | null;
      return {
        id: l.id as string,
        product_id: (l.product_id as number | null) ?? null,
        nombre: prod?.name ?? (typeof notas?.product_name === 'string' ? notas.product_name : null),
        sku: prod?.sku ?? null,
        cantidad: n(l.quantity),
        precio: n(l.unit_price),
        descuento: n(l.discount_amount),
        impuesto: n(l.tax_amount),
        tasa: l.tax_rate === null || l.tax_rate === undefined ? null : n(l.tax_rate),
        total: n(l.total),
        nota: typeof notas?.note === 'string' ? notas.note : typeof notas?.nota === 'string' ? notas.nota : null,
      };
    }),
    factura: factura ? aDoc(factura, 'factura') : null,
    notas_credito: ncs.map((d) => aDoc(d, 'nota_credito')),
    pagos: pagos.map((p) => ({
      id: String(p.id),
      metodo: p.method ?? null,
      monto: n(p.amount),
      vuelto: n(p.change_amount),
      fecha: p.payment_date ?? p.created_at ?? null,
      estado: p.status ?? null,
      origen: p.source,
      referencia: p.reference ?? null,
      moneda: p.currency ?? null,
    })),
    cxc: cxc ? { id: cxc.id, monto: n(cxc.amount), saldo: n(cxc.balance), vence: cxc.due_date, estado: cxc.status } : null,
    devoluciones: devoluciones.map((r) => ({
      id: r.id,
      total: n(r.total_refund),
      estado: r.status,
      metodo: r.refund_method,
      motivo: r.reason,
      fecha: r.return_date ?? r.created_at,
      nota_credito_id: r.credit_note_invoice_id,
    })),
    asientos: ((asientosRes.data ?? []) as Array<{ id: number; entry_date: string | null; memo: string | null; source: string | null; posted: boolean | null }>).map((a) => ({
      id: a.id,
      fecha: a.entry_date,
      memo: a.memo,
      origen: a.source,
      publicado: a.posted === true,
    })),
    comision: com ? { monto: n(com.commission_amount), estado: com.status, beneficiario: com.payee_name } : null,
    mesa: mesa
      ? { nombre: mesaNombre, mesero: mesa.server_id ? gente.get(mesa.server_id) ?? null : null, comensales: mesa.customers, abierta: mesa.opened_at, cerrada: mesa.closed_at }
      : null,
    pedido: pedido
      ? { id: pedido.id, numero: pedido.order_number, entrega: pedido.delivery_type, direccion: direccionTexto(pedido.delivery_address), cupon: pedido.coupon_code }
      : null,
    incluida_en_caja: s.include_in_cash_register === true,
    permisos,
  };
}
