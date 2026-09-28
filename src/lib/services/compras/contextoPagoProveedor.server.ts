/**
 * Contexto del diálogo único de pago para PAGAR a un proveedor (factura de
 * compra o cuenta por pagar). La sesión de ventas dejó el contrato
 * (`ContextoPago`, `@/lib/finanzas/pagos/contrato`) y el cobro; el lado del
 * proveedor lo arma compras con el mismo contrato (ver el comentario de
 * `contextoPago` en `src/lib/services/pagos/pagos.server.ts`).
 *
 * Solo lecturas con el cliente de la sesión (RLS: organización y sucursal) y
 * filtro explícito por la organización de la sesión. El pago lo registra
 * `fn_registrar_pago` (dirección `pago`) por `POST /api/pagos`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { ContextoPago, DocumentoAbiertoPago } from '@/lib/finanzas/pagos/contrato';
import { ErrorCompraServidor } from './facturasCompra.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

interface FilaCuenta {
  id: string;
  balance: number | string | null;
  amount: number | string | null;
  due_date: string | null;
  created_at: string | null;
  status: string | null;
  branch_id: number | null;
  supplier: { id: number; name: string | null } | Array<{ id: number; name: string | null }> | null;
  invoice: { id: string; number_ext: string | null; currency: string | null; issue_date: string | null; total: number | string | null; status: string } | null;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function contextoPagoProveedor(
  ctx: Ctx,
  entrada: { documento: 'invoice_purchase' | 'account_payable'; id: string },
): Promise<ContextoPago> {
  const sel = `id, balance, amount, due_date, created_at, status, branch_id,
    supplier:suppliers(id, name),
    invoice:invoice_purchase!accounts_payable_invoice_id_fkey(id, number_ext, currency, issue_date, total, status)`;
  let consulta = ctx.supabase.from('accounts_payable').select(sel).eq('organization_id', ctx.organizationId);
  consulta = entrada.documento === 'invoice_purchase' ? consulta.eq('invoice_id', entrada.id) : consulta.eq('id', entrada.id);
  const { data: cuentaRaw, error } = await consulta.maybeSingle();
  if (error) {
    console.error('[compras] contexto de pago', { organizationId: ctx.organizationId, message: error.message });
    throw new ErrorCompraServidor('error_desconocido');
  }
  const cuenta = cuentaRaw as unknown as FilaCuenta | null;
  if (!cuenta) throw new ErrorCompraServidor('no_encontrado');
  const factura = uno(cuenta.invoice);
  if (factura && (factura.status === 'draft' || factura.status === 'void')) throw new ErrorCompraServidor(factura.status === 'draft' ? 'no_confirmada' : 'anulada');
  if (cuenta.status === 'void') throw new ErrorCompraServidor('anulada');
  const proveedor = uno(cuenta.supplier);
  const branchId = cuenta.branch_id ?? null;

  const [monedaRes, cuotasRes, metodosRes, cuentasRes, cajaRes, hoyRes] = await Promise.all([
    factura?.currency ? Promise.resolve({ data: factura.currency }) : ctx.supabase.rpc('fn_moneda_base_organizacion', { p_org: ctx.organizationId }),
    ctx.supabase
      .from('ap_installments')
      .select('id, installment_number, due_date, balance, status')
      .eq('account_payable_id', cuenta.id)
      .order('installment_number'),
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
  ]);

  type FilaCuota = { id: string; installment_number: number; due_date: string; balance: number | string | null; status: string };
  const cuotas = ((cuotasRes.data ?? []) as FilaCuota[])
    .filter((c) => c.status !== 'paid' && c.status !== 'cancelled' && num(c.balance) > 0)
    .map((c) => ({ id: c.id, numero: c.installment_number, vencimiento: c.due_date, saldo: num(c.balance), estado: c.status }));

  const documento: DocumentoAbiertoPago = {
    documento: entrada.documento,
    id: entrada.id,
    cuenta_id: cuenta.id,
    numero: factura?.number_ext ?? null,
    saldo: num(cuenta.balance),
    total: factura ? num(factura.total) : num(cuenta.amount),
    moneda: String(monedaRes.data ?? '').trim().toUpperCase(),
    vencimiento: cuenta.due_date,
    emision: factura?.issue_date ?? cuenta.created_at,
    branch_id: branchId,
    cuotas,
  };

  type FilaMetodo = { payment_methods: { code: string; name: string; requires_reference: boolean | null; is_active: boolean | null } | null };
  const metodos = ((metodosRes.data ?? []) as unknown as FilaMetodo[])
    .map((m) => m.payment_methods)
    .filter((m): m is NonNullable<FilaMetodo['payment_methods']> => !!m && m.is_active !== false && m.code !== 'credit')
    .map((m) => ({ code: m.code, name: m.name, requires_reference: m.requires_reference === true }));

  type FilaBanco = { id: number; name: string; bank_name: string | null; account_number: string | null; currency: string | null };
  const cuentasBancarias = ((cuentasRes.data ?? []) as FilaBanco[]).map((c) => ({
    id: c.id,
    name: c.name,
    bank_name: c.bank_name,
    ultimos: c.account_number ? c.account_number.slice(-4) : null,
    currency: c.currency ? c.currency.trim().toUpperCase() : null,
  }));

  const cajaId = typeof cajaRes.data === 'number' ? cajaRes.data : null;
  return {
    direccion: 'pago',
    tercero: proveedor ? { id: String(proveedor.id), nombre: proveedor.name } : null,
    documentos: documento.saldo > 0 ? [documento] : [],
    metodos,
    cuentasBancarias,
    caja: { abierta: cajaId !== null, id: cajaId },
    hoy: typeof hoyRes.data === 'string' ? hoyRes.data : String(hoyRes.data ?? ''),
    branch_id: branchId,
  };
}
