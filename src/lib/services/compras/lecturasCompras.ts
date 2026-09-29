/**
 * Lecturas del navegador para facturas de compra y cuentas por pagar (plan F4,
 * F5, F8, F9). Todo con el cliente del navegador y la RLS de la sesión
 * (organización y sucursal): listados y resúmenes por RPC `SECURITY INVOKER`,
 * y el detalle por tablas. Ninguna escritura: las escrituras van por los route
 * handlers (`clienteCompras`) y el pago único (`clientePagos`).
 */
import { supabase } from '@/lib/supabase/config';
import type { ProductoModoVenta } from '@/lib/pos/peso/modoVenta';
import { COLUMNAS_CANTIDAD_PRODUCTO, cantidadLineaDeProducto } from '@/lib/services/documentos/cantidadLinea';

// ─── Listado de facturas de compra ──────────────────────────────────────────

export type EstadoPagoCompra = 'borrador' | 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'anulada';
export type RecepcionCompra = 'por_recibir' | 'recibido' | 'no_aplica';

export interface FilaFacturaCompra {
  id: string;
  number_ext: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  neto: number;
  balance: number;
  status: string;
  estado_pago: EstadoPagoCompra;
  recepcion: RecepcionCompra;
  dias_vencida: number | null;
  branch_id: number | null;
  po_id: number | null;
  supplier_id: number;
  supplier_name: string;
  supplier_nit: string | null;
  documento_soporte: { id: string; referencia: string; estado: string } | null;
}

export interface FiltrosFacturasCompra {
  busqueda?: string | null;
  estado?: string | null;
  recepcion?: string | null;
  proveedor?: number | null;
  desde?: string | null;
  hasta?: string | null;
  branch?: number | null;
  orden?: string;
  direccion?: 'asc' | 'desc';
  offset: number;
  limite: number;
}

export interface ResumenFacturasCompra {
  total_por_pagar: number;
  abiertas: number;
  vencidas_total: number;
  vencidas: number;
  criticas: number;
  proximas: number;
  por_recibir: number;
  borradores: number;
}

export async function listarFacturasCompra(org: number, f: FiltrosFacturasCompra): Promise<{ items: FilaFacturaCompra[]; total: number }> {
  const { data, error } = await supabase.rpc('fn_facturas_compra_listado', {
    p_org: org,
    p_busqueda: f.busqueda || null,
    p_estado: f.estado || null,
    p_recepcion: f.recepcion || null,
    p_proveedor: f.proveedor ?? null,
    p_desde: f.desde || null,
    p_hasta: f.hasta || null,
    p_branch: f.branch ?? null,
    p_orden: f.orden ?? 'fecha',
    p_direccion: f.direccion ?? 'desc',
    p_offset: f.offset,
    p_limite: f.limite,
  });
  if (error) throw error;
  const r = (data ?? { items: [], total: 0 }) as { items: FilaFacturaCompra[]; total: number };
  return { items: r.items ?? [], total: Number(r.total ?? 0) };
}

export async function resumenFacturasCompra(org: number, branch: number | null): Promise<ResumenFacturasCompra> {
  const { data, error } = await supabase.rpc('fn_facturas_compra_resumen', { p_org: org, p_branch: branch });
  if (error) throw error;
  return data as ResumenFacturasCompra;
}

// ─── Listado de cuentas por pagar ───────────────────────────────────────────

export type EstadoCxp = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'anulada';
export type TramoCxp = 'al_dia' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_mas';

export interface FilaCxp {
  id: string;
  amount: number;
  balance: number;
  due_date: string | null;
  status: string | null;
  estado: EstadoCxp;
  dias_vencida: number | null;
  tramo: TramoCxp | null;
  branch_id: number | null;
  supplier_id: number;
  supplier_name: string;
  supplier_nit: string | null;
  supplier_phone: string | null;
  supplier_email: string | null;
  invoice_id: string | null;
  number_ext: string | null;
  invoice_status: string | null;
  po_id: number | null;
  currency: string | null;
  cuotas: number;
  cuotas_pagadas: number;
  programado: number;
}

export interface FiltrosCxp {
  busqueda?: string | null;
  estado?: string | null;
  tramo?: string | null;
  proveedor?: number | null;
  branch?: number | null;
  incluirBorradores?: boolean;
  orden?: string;
  direccion?: 'asc' | 'desc';
  offset: number;
  limite: number;
}

export interface ResumenCxp {
  total_por_pagar: number;
  cuentas: number;
  al_dia: number;
  vencida: number;
  vencidas: number;
  proximo_vencimiento: string | null;
  tramos: Record<TramoCxp, number>;
  aprobaciones_pendientes: number;
}

export async function listarCxp(org: number, f: FiltrosCxp): Promise<{ items: FilaCxp[]; total: number }> {
  const { data, error } = await supabase.rpc('fn_cxp_listado', {
    p_org: org,
    p_busqueda: f.busqueda || null,
    p_estado: f.estado || null,
    p_tramo: f.tramo || null,
    p_proveedor: f.proveedor ?? null,
    p_branch: f.branch ?? null,
    p_incluir_borradores: f.incluirBorradores ?? false,
    p_orden: f.orden ?? 'vencimiento',
    p_direccion: f.direccion ?? 'asc',
    p_offset: f.offset,
    p_limite: f.limite,
  });
  if (error) throw error;
  const r = (data ?? { items: [], total: 0 }) as { items: FilaCxp[]; total: number };
  return { items: r.items ?? [], total: Number(r.total ?? 0) };
}

export async function resumenCxp(org: number, branch: number | null): Promise<ResumenCxp> {
  const { data, error } = await supabase.rpc('fn_cxp_resumen', { p_org: org, p_branch: branch });
  if (error) throw error;
  return data as ResumenCxp;
}

// ─── Detalle de factura de compra ───────────────────────────────────────────

export interface LineaCompra {
  id: string;
  product_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_code: string | null;
  total_line: number;
  serial_numbers: string[];
  note: string | null;
  sku: string | null;
  /** Producto por peso o medida: símbolo de la unidad («kg») y decimales de la cantidad; `null` por unidad. */
  unidad: string | null;
  decimalesCantidad: number | null;
}

export interface RetencionCompraLeida {
  id: string;
  concept: string;
  base: number;
  rate: number;
  amount: number;
  tax_code: string | null;
}

export interface PagoCompraLeido {
  id: string;
  source: string;
  method: string | null;
  amount: number;
  discount_amount: number;
  reference: string | null;
  payment_date: string | null;
  created_at: string | null;
  status: string | null;
  payment_group_id: string | null;
  installment_id: string | null;
}

export interface ProgramacionLeida {
  id: string;
  account_payable_id: string;
  installment_id: string | null;
  amount: number;
  scheduled_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  payment_id: string | null;
}

export interface DetalleFacturaCompra {
  id: string;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  po_id: number | null;
  number_ext: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  status: string;
  notes: string | null;
  payment_terms: number | null;
  payment_method: string | null;
  tax_included: boolean;
  stock_received_at: string | null;
  created_at: string | null;
  salesperson_id: string | null;
  commission_rate: number;
  commission_type: string | null;
  commission_method: string | null;
  commission_amount: number;
  proveedor: { id: number; uuid: string | null; name: string; nit: string | null; dv: string | null; email: string | null; phone: string | null; address: string | null } | null;
  sucursal: { id: number; name: string } | null;
  orden: { id: number; uuid: string } | null;
  lineas: LineaCompra[];
  retenciones: RetencionCompraLeida[];
  cuenta: { id: string; amount: number; balance: number; status: string | null; due_date: string | null } | null;
  pagos: PagoCompraLeido[];
  documentoSoporte: { id: string; referencia: string; estado: string } | null;
  asientos: Array<{ id: number; memo: string | null; entry_date: string | null }>;
  programaciones: ProgramacionLeida[];
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function pagosDeCompra(org: number, facturaId: string, cuentaId: string | null): Promise<PagoCompraLeido[]> {
  const filtros = [`and(source.eq.invoice_purchase,source_id.eq.${facturaId})`];
  if (cuentaId) filtros.push(`and(source.eq.account_payable,source_id.eq.${cuentaId})`);
  const { data, error } = await supabase
    .from('payments')
    .select('id, source, method, amount, discount_amount, reference, payment_date, created_at, status, payment_group_id, installment_id')
    .eq('organization_id', org)
    .or(filtros.join(','))
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    source: String(p.source),
    method: (p.method as string | null) ?? null,
    amount: num(p.amount),
    discount_amount: num(p.discount_amount),
    reference: (p.reference as string | null) ?? null,
    payment_date: (p.payment_date as string | null) ?? null,
    created_at: (p.created_at as string | null) ?? null,
    status: (p.status as string | null) ?? null,
    payment_group_id: (p.payment_group_id as string | null) ?? null,
    installment_id: (p.installment_id as string | null) ?? null,
  }));
}

export async function leerDetalleFacturaCompra(org: number, id: string): Promise<DetalleFacturaCompra | null> {
  const { data, error } = await supabase
    .from('invoice_purchase')
    .select(`id, organization_id, branch_id, supplier_id, po_id, number_ext, issue_date, due_date, currency, subtotal, tax_total,
      total, balance, status, notes, payment_terms, payment_method, tax_included, stock_received_at, created_at, salesperson_id,
      commission_rate, commission_type, commission_method, commission_amount,
      proveedor:suppliers(id, uuid, name, nit, dv, email, phone, address),
      sucursal:branches(id, name),
      orden:purchase_orders(id, uuid),
      lineas:invoice_items!invoice_items_invoice_purchase_id_fkey(id, product_id, description, qty, unit_price, discount_amount, tax_rate,
        tax_code, total_line, serial_numbers, note, created_at, producto:products(sku, ${COLUMNAS_CANTIDAD_PRODUCTO})),
      retenciones:invoice_purchase_withholdings(id, concept, base, rate, amount, tax_code),
      cuenta:accounts_payable!accounts_payable_invoice_id_fkey(id, amount, balance, status, due_date)`)
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const f = data as unknown as Record<string, unknown>;
  const cuenta = uno(f.cuenta as Record<string, unknown> | Record<string, unknown>[] | null);
  const cuentaId = cuenta ? String(cuenta.id) : null;

  const [pagos, ds, asientos, programaciones] = await Promise.all([
    pagosDeCompra(org, id, cuentaId),
    supabase
      .from('support_documents')
      .select('id, number, reference_code, status')
      .eq('organization_id', org)
      .eq('invoice_purchase_id', id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('journal_entries')
      .select('id, memo, entry_date')
      .eq('organization_id', org)
      .eq('source', 'invoice_purchase')
      .eq('source_id', id)
      .order('id'),
    cuentaId
      ? supabase.from('ap_payment_schedules').select('*').eq('account_payable_id', cuentaId).order('requested_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const lineas = ((f.lineas as Array<Record<string, unknown>>) ?? [])
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .map((l) => ({
      id: String(l.id),
      product_id: (l.product_id as number | null) ?? null,
      description: String(l.description ?? ''),
      qty: num(l.qty),
      unit_price: num(l.unit_price),
      discount_amount: num(l.discount_amount),
      tax_rate: num(l.tax_rate),
      tax_code: (l.tax_code as string | null) ?? null,
      total_line: num(l.total_line),
      serial_numbers: Array.isArray(l.serial_numbers) ? (l.serial_numbers as string[]) : [],
      note: (l.note as string | null) ?? null,
      sku: (uno(l.producto as { sku: string | null } | null) ?? { sku: null }).sku,
      ...cantidadLineaDeProducto(uno(l.producto as ProductoModoVenta | ProductoModoVenta[] | null)),
    }));

  const dsFila = ((ds as { data: Array<Record<string, unknown>> | null }).data ?? [])[0];
  const proveedor = uno(f.proveedor as DetalleFacturaCompra['proveedor'] | DetalleFacturaCompra['proveedor'][] | null);
  return {
    id: String(f.id),
    organization_id: Number(f.organization_id),
    branch_id: Number(f.branch_id),
    supplier_id: Number(f.supplier_id),
    po_id: (f.po_id as number | null) ?? null,
    number_ext: String(f.number_ext),
    issue_date: (f.issue_date as string | null) ?? null,
    due_date: (f.due_date as string | null) ?? null,
    currency: (f.currency as string | null)?.trim() || null,
    subtotal: num(f.subtotal),
    tax_total: num(f.tax_total),
    total: num(f.total),
    balance: num(f.balance),
    status: String(f.status),
    notes: (f.notes as string | null) ?? null,
    payment_terms: (f.payment_terms as number | null) ?? null,
    payment_method: (f.payment_method as string | null) ?? null,
    tax_included: f.tax_included === true,
    stock_received_at: (f.stock_received_at as string | null) ?? null,
    created_at: (f.created_at as string | null) ?? null,
    salesperson_id: (f.salesperson_id as string | null) ?? null,
    commission_rate: num(f.commission_rate),
    commission_type: (f.commission_type as string | null) ?? null,
    commission_method: (f.commission_method as string | null) ?? null,
    commission_amount: num(f.commission_amount),
    proveedor,
    sucursal: uno(f.sucursal as { id: number; name: string } | null),
    orden: uno(f.orden as { id: number; uuid: string } | null),
    lineas,
    retenciones: ((f.retenciones as Array<Record<string, unknown>>) ?? []).map((r) => ({
      id: String(r.id),
      concept: String(r.concept),
      base: num(r.base),
      rate: num(r.rate),
      amount: num(r.amount),
      tax_code: (r.tax_code as string | null) ?? null,
    })),
    cuenta: cuenta
      ? {
          id: String(cuenta.id),
          amount: num(cuenta.amount),
          balance: num(cuenta.balance),
          status: (cuenta.status as string | null) ?? null,
          due_date: (cuenta.due_date as string | null) ?? null,
        }
      : null,
    pagos,
    documentoSoporte: dsFila
      ? { id: String(dsFila.id), referencia: String(dsFila.number ?? dsFila.reference_code), estado: String(dsFila.status) }
      : null,
    asientos: ((asientos as { data: Array<{ id: number; memo: string | null; entry_date: string | null }> | null }).data ?? []),
    programaciones: ((programaciones as { data: ProgramacionLeida[] | null }).data ?? []).map((p) => ({ ...p, amount: num(p.amount) })),
  };
}

// ─── Detalle de cuenta por pagar ────────────────────────────────────────────

export interface CuotaLeida {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal: number | null;
  interest: number | null;
  balance: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
}

export interface DetalleCxp {
  id: string;
  organization_id: number;
  branch_id: number | null;
  amount: number;
  balance: number;
  status: string | null;
  due_date: string | null;
  created_at: string | null;
  proveedor: { id: number; uuid: string | null; name: string; nit: string | null; email: string | null; phone: string | null; contact: string | null } | null;
  factura: { id: string; number_ext: string; issue_date: string | null; currency: string | null; status: string; total: number; po_id: number | null } | null;
  cuotas: CuotaLeida[];
  pagos: PagoCompraLeido[];
  programaciones: ProgramacionLeida[];
}

export async function leerDetalleCxp(org: number, id: string): Promise<DetalleCxp | null> {
  const { data, error } = await supabase
    .from('accounts_payable')
    .select(`id, organization_id, branch_id, amount, balance, status, due_date, created_at,
      proveedor:suppliers(id, uuid, name, nit, email, phone, contact),
      factura:invoice_purchase!accounts_payable_invoice_id_fkey(id, number_ext, issue_date, currency, status, total, po_id),
      cuotas:ap_installments(id, installment_number, due_date, amount, principal, interest, balance, paid_amount, status, paid_at, notes)`)
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = data as unknown as Record<string, unknown>;
  const factura = uno<Record<string, unknown>>(c.factura as Record<string, unknown> | null);

  const filtros = [`and(source.eq.account_payable,source_id.eq.${id})`];
  if (factura) filtros.push(`and(source.eq.invoice_purchase,source_id.eq.${String(factura.id)})`);
  const [pagosRes, progRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id, source, method, amount, discount_amount, reference, payment_date, created_at, status, payment_group_id, installment_id')
      .eq('organization_id', org)
      .or(filtros.join(','))
      .order('payment_date', { ascending: false }),
    supabase.from('ap_payment_schedules').select('*').eq('account_payable_id', id).order('requested_at', { ascending: false }),
  ]);
  if (pagosRes.error) throw pagosRes.error;

  return {
    id: String(c.id),
    organization_id: Number(c.organization_id),
    branch_id: (c.branch_id as number | null) ?? null,
    amount: num(c.amount),
    balance: num(c.balance),
    status: (c.status as string | null) ?? null,
    due_date: (c.due_date as string | null) ?? null,
    created_at: (c.created_at as string | null) ?? null,
    proveedor: uno(c.proveedor as DetalleCxp['proveedor'] | null),
    factura: factura
      ? {
          id: String(factura.id),
          number_ext: String(factura.number_ext),
          issue_date: (factura.issue_date as string | null) ?? null,
          currency: (factura.currency as string | null)?.trim() || null,
          status: String(factura.status),
          total: num(factura.total),
          po_id: (factura.po_id as number | null) ?? null,
        }
      : null,
    cuotas: ((c.cuotas as Array<Record<string, unknown>>) ?? [])
      .map((q) => ({
        id: String(q.id),
        installment_number: Number(q.installment_number),
        due_date: String(q.due_date),
        amount: num(q.amount),
        principal: q.principal === null ? null : num(q.principal),
        interest: q.interest === null ? null : num(q.interest),
        balance: num(q.balance),
        paid_amount: num(q.paid_amount),
        status: String(q.status),
        paid_at: (q.paid_at as string | null) ?? null,
        notes: (q.notes as string | null) ?? null,
      }))
      .sort((a, b) => a.installment_number - b.installment_number),
    pagos: ((pagosRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      source: String(p.source),
      method: (p.method as string | null) ?? null,
      amount: num(p.amount),
      discount_amount: num(p.discount_amount),
      reference: (p.reference as string | null) ?? null,
      payment_date: (p.payment_date as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
      status: (p.status as string | null) ?? null,
      payment_group_id: (p.payment_group_id as string | null) ?? null,
      installment_id: (p.installment_id as string | null) ?? null,
    })),
    programaciones: ((progRes.data ?? []) as ProgramacionLeida[]).map((p) => ({ ...p, amount: num(p.amount) })),
  };
}

/** Programaciones pendientes de la organización (panel de aprobaciones). */
export async function listarProgramacionesPendientes(org: number): Promise<
  Array<ProgramacionLeida & { cuenta: { id: string; balance: number; proveedor: string | null; factura: string | null } | null }>
> {
  const { data, error } = await supabase
    .from('ap_payment_schedules')
    .select(`*, cuenta:accounts_payable(id, balance, supplier:suppliers(name), invoice:invoice_purchase!accounts_payable_invoice_id_fkey(number_ext))`)
    .eq('organization_id', org)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => {
    const cuenta = uno<Record<string, unknown>>(p.cuenta as Record<string, unknown> | null);
    return {
      ...(p as unknown as ProgramacionLeida),
      amount: num(p.amount),
      cuenta: cuenta
        ? {
            id: String(cuenta.id),
            balance: num(cuenta.balance),
            proveedor: (uno(cuenta.supplier as { name: string } | null) ?? { name: null }).name,
            factura: (uno(cuenta.invoice as { number_ext: string } | null) ?? { number_ext: null }).number_ext,
          }
        : null,
    };
  });
}

/** Proveedores para el `SupplierPicker` (búsqueda en el servidor, con saldo por pagar). */
export async function buscarProveedores(org: number, texto: string, senal?: AbortSignal) {
  let q = supabase
    .from('suppliers')
    .select('id, name, nit, dv, contact, phone, credit_days, is_active')
    .eq('organization_id', org)
    .order('name')
    .limit(20);
  const t = texto.trim();
  if (t) q = q.or(`name.ilike.%${t.replace(/[%,()]/g, ' ')}%,nit.ilike.%${t.replace(/[%,()]/g, ' ')}%`);
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<{ id: number; name: string; nit: string | null; dv: string | null; contact: string | null; phone: string | null; credit_days: number | null; is_active: boolean | null }>;
}
