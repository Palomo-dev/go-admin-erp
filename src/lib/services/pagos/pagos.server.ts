/**
 * Pago único — servicio de servidor. Solo llama a las RPC (`fn_registrar_pago`,
 * `fn_anular_pago`) y lee el contexto que el diálogo necesita. Nunca escribe
 * saldos: los recalculan los disparadores.
 *
 * Siempre con el cliente de la SESIÓN (`ctx.supabase`): la RPC toma el autor de
 * `auth.uid()` y comprueba organización, sucursal y permiso en la base.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorPago,
  type DireccionPago,
  type DocumentoPago,
  type ErrorPago,
  type ResultadoPago,
  type SolicitudPago,
} from '@/lib/finanzas/pagos/contrato';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorPagoServidor extends Error {
  constructor(
    public readonly codigo: ErrorPago,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

export async function registrarPago(ctx: Ctx, s: SolicitudPago): Promise<ResultadoPago> {
  const { data, error } = await ctx.supabase.rpc('fn_registrar_pago', {
    p_direccion: s.direccion,
    p_aplicaciones: s.aplicaciones.map((a) => ({
      documento: a.documento,
      id: a.id,
      cuota_id: a.cuota_id ?? null,
      monto: a.monto,
    })),
    p_metodo: s.metodo,
    p_moneda: s.moneda,
    p_fecha: s.fecha,
    p_referencia: s.referencia ?? null,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_recibido: s.recibido ?? null,
    p_anticipo: s.anticipo ?? 0,
    p_clave_idempotencia: s.clave_idempotencia,
    p_notas: s.notas ?? null,
    p_origen: s.origen,
    p_organization_id: ctx.organizationId,
  });
  if (error) {
    const codigo = codigoErrorPago(error.message);
    if (codigo === 'error_desconocido') {
      console.error('[pagos] fn_registrar_pago', { organizationId: ctx.organizationId, message: error.message });
    }
    throw new ErrorPagoServidor(codigo, detalleJson((error as { details?: unknown }).details));
  }
  return data as ResultadoPago;
}

export interface ResultadoAnulacion {
  payment_id: string;
  source: string;
  source_id: string;
  asiento_revertido: number | null;
  contra_asiento: number | null;
  saldo_nuevo: number | null;
}

export async function anularPago(ctx: Ctx, paymentId: string, motivo: string): Promise<ResultadoAnulacion> {
  const { data, error } = await ctx.supabase.rpc('fn_anular_pago', { p_payment_id: paymentId, p_motivo: motivo });
  if (error) {
    const codigo = codigoErrorPago(error.message);
    if (codigo === 'error_desconocido') {
      console.error('[pagos] fn_anular_pago', { organizationId: ctx.organizationId, message: error.message });
    }
    throw new ErrorPagoServidor(codigo);
  }
  return data as ResultadoAnulacion;
}

// ─── Contexto del diálogo ────────────────────────────────────────────────────

export interface DocumentoAbiertoPago {
  documento: DocumentoPago;
  /** id del documento con el que se abrió (factura o cuenta). */
  id: string;
  cuenta_id: string;
  numero: string | null;
  saldo: number;
  total: number;
  moneda: string;
  vencimiento: string | null;
  emision: string | null;
  branch_id: number | null;
  cuotas: { id: string; numero: number; vencimiento: string; saldo: number; estado: string }[];
}

export interface ContextoPago {
  direccion: DireccionPago;
  tercero: { id: string; nombre: string | null } | null;
  documentos: DocumentoAbiertoPago[];
  metodos: { code: string; name: string; requires_reference: boolean }[];
  cuentasBancarias: { id: number; name: string; bank_name: string | null; ultimos: string | null; currency: string | null }[];
  caja: { abierta: boolean; id: number | null };
  hoy: string;
  branch_id: number | null;
}

interface FilaCartera {
  id: string;
  invoice_id: string | null;
  customer_id: string | null;
  balance: number | string | null;
  amount: number | string | null;
  due_date: string | null;
  created_at: string | null;
  branch_id: number | null;
  status: string | null;
  invoice_sales: {
    id: string;
    number: string | null;
    currency: string | null;
    balance: number | string | null;
    total: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    branch_id: number | null;
    status: string | null;
    document_type: string | null;
  } | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function monedaBase(ctx: Ctx): Promise<string> {
  // Sin moneda base no se inventa una: la cartera sin factura no se puede cobrar.
  const { data, error } = await ctx.supabase.rpc('fn_moneda_base_organizacion', { p_org: ctx.organizationId });
  if (error || typeof data !== 'string' || !data.trim()) throw new ErrorPagoServidor('error_desconocido');
  return data.trim().toUpperCase();
}

/**
 * Documentos abiertos para el diálogo de cobro. `id` de factura o de cuenta, o
 * `customerId` (todas las cuentas abiertas del cliente, para el reparto FIFO).
 */
async function documentosCobro(
  ctx: Ctx,
  filtro: { documento?: 'invoice_sales' | 'account_receivable'; id?: string; customerId?: string },
): Promise<{ docs: DocumentoAbiertoPago[]; customerId: string | null }> {
  let q = ctx.supabase
    .from('accounts_receivable')
    .select(
      'id, invoice_id, customer_id, balance, amount, due_date, created_at, branch_id, status, ' +
        'invoice_sales:invoice_id (id, number, currency, balance, total, issue_date, due_date, branch_id, status, document_type)',
    )
    .eq('organization_id', ctx.organizationId);
  if (filtro.documento === 'invoice_sales' && filtro.id) q = q.eq('invoice_id', filtro.id);
  else if (filtro.documento === 'account_receivable' && filtro.id) q = q.eq('id', filtro.id);
  else if (filtro.customerId) q = q.eq('customer_id', filtro.customerId).gt('balance', 0);
  else return { docs: [], customerId: null };

  const { data, error } = await q.order('due_date', { ascending: true }).limit(500);
  if (error) throw new ErrorPagoServidor('error_desconocido');
  const filas = (data ?? []) as unknown as FilaCartera[];
  const base = await monedaBase(ctx);

  const abiertas = filas.filter((f) => {
    const inv = f.invoice_sales;
    if (f.status === 'cancelled') return false;
    if (inv && (inv.status === 'draft' || inv.status === 'void' || inv.status === 'voided' || (inv.document_type ?? 'invoice') !== 'invoice')) {
      return false;
    }
    return true;
  });

  const ids = abiertas.map((f) => f.id);
  const cuotasPorCuenta = new Map<string, DocumentoAbiertoPago['cuotas']>();
  if (ids.length > 0) {
    const { data: cuotas } = await ctx.supabase
      .from('ar_installments')
      .select('id, account_receivable_id, installment_number, due_date, balance, status')
      .in('account_receivable_id', ids)
      .order('installment_number', { ascending: true });
    for (const c of (cuotas ?? []) as { id: string; account_receivable_id: string; installment_number: number; due_date: string; balance: number | string; status: string }[]) {
      if (c.status === 'paid' || c.status === 'written_off') continue;
      const lista = cuotasPorCuenta.get(c.account_receivable_id) ?? [];
      lista.push({ id: c.id, numero: c.installment_number, vencimiento: c.due_date, saldo: num(c.balance), estado: c.status });
      cuotasPorCuenta.set(c.account_receivable_id, lista);
    }
  }

  const docs = abiertas.map<DocumentoAbiertoPago>((f) => {
    const inv = f.invoice_sales;
    return {
      documento: filtro.documento === 'invoice_sales' ? 'invoice_sales' : 'account_receivable',
      id: filtro.documento === 'invoice_sales' && inv ? inv.id : f.id,
      cuenta_id: f.id,
      numero: inv?.number ?? null,
      saldo: inv ? num(inv.balance) : num(f.balance),
      total: inv ? num(inv.total) : num(f.amount),
      moneda: (inv?.currency ?? base).toUpperCase(),
      vencimiento: inv?.due_date ?? f.due_date,
      emision: inv?.issue_date ?? f.created_at,
      branch_id: inv?.branch_id ?? f.branch_id,
      cuotas: cuotasPorCuenta.get(f.id) ?? [],
    };
  });
  return { docs, customerId: filas[0]?.customer_id ?? filtro.customerId ?? null };
}

export async function contextoPago(
  ctx: Ctx,
  entrada: { direccion: DireccionPago; documento?: DocumentoPago; id?: string; customerId?: string },
): Promise<ContextoPago> {
  if (entrada.direccion !== 'cobro') {
    // El contexto de pago a proveedor lo arma la sesión de compras/CxP con este
    // mismo contrato; mientras tanto el diálogo recibe los documentos por props.
    throw new ErrorPagoServidor('documento_invalido');
  }
  const { docs, customerId } = await documentosCobro(ctx, {
    documento: entrada.documento === 'invoice_sales' || entrada.documento === 'account_receivable' ? entrada.documento : undefined,
    id: entrada.id,
    customerId: entrada.customerId,
  });
  if ((entrada.id || entrada.customerId) && docs.length === 0 && entrada.id) {
    throw new ErrorPagoServidor('documento_no_encontrado');
  }
  const branchId = docs[0]?.branch_id ?? null;

  const [metodosRes, cuentasRes, cajaRes, hoyRes, clienteRes] = await Promise.all([
    ctx.supabase
      .from('organization_payment_methods')
      .select('payment_method_code, is_active, payment_methods:payment_method_code (code, name, requires_reference, is_active)')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true),
    ctx.supabase
      .from('bank_accounts')
      .select('id, name, bank_name, account_number, currency, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('name'),
    ctx.supabase.rpc('fn_caja_abierta_para', { p_org: ctx.organizationId, p_branch: branchId, p_user: ctx.userId }),
    ctx.supabase.rpc('fn_today_for', { p_organization_id: ctx.organizationId, p_branch_id: branchId }),
    customerId
      ? ctx.supabase.from('customers').select('id, full_name').eq('id', customerId).eq('organization_id', ctx.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type FilaMetodo = { payment_method_code: string; payment_methods: { code: string; name: string; requires_reference: boolean | null; is_active: boolean | null } | null };
  const metodos = ((metodosRes.data ?? []) as unknown as FilaMetodo[])
    .map((m) => m.payment_methods)
    .filter((m): m is NonNullable<FilaMetodo['payment_methods']> => !!m && m.is_active !== false && m.code !== 'credit')
    .map((m) => ({ code: m.code, name: m.name, requires_reference: m.requires_reference === true }));

  type FilaCuenta = { id: number; name: string; bank_name: string | null; account_number: string | null; currency: string | null };
  const cuentasBancarias = ((cuentasRes.data ?? []) as FilaCuenta[]).map((c) => ({
    id: c.id,
    name: c.name,
    bank_name: c.bank_name,
    ultimos: c.account_number ? c.account_number.slice(-4) : null,
    currency: c.currency ? c.currency.trim().toUpperCase() : null,
  }));

  const cajaId = typeof cajaRes.data === 'number' ? cajaRes.data : null;
  const cliente = (clienteRes as { data: { id: string; full_name: string | null } | null }).data;

  return {
    direccion: 'cobro',
    tercero: cliente ? { id: cliente.id, nombre: cliente.full_name } : customerId ? { id: customerId, nombre: null } : null,
    documentos: docs,
    metodos,
    cuentasBancarias,
    caja: { abierta: cajaId !== null, id: cajaId },
    hoy: typeof hoyRes.data === 'string' ? hoyRes.data : String(hoyRes.data ?? ''),
    branch_id: branchId,
  };
}
