/**
 * Anticipos a proveedores — servicio de servidor. Solo llama a las RPC y lee lo
 * que la pantalla necesita con el cliente de la SESIÓN (RLS por pertenencia);
 * nunca escribe tablas ni saldos.
 *
 * Mientras la migración 20261108120000 no esté aplicada, las lecturas devuelven
 * `pendiente: true` y las escrituras `pendiente_de_activar` (501): la pantalla
 * lo dice, nunca muestra cero.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorAnticipo,
  esPendienteDeActivar,
  estadoAnticipo,
  estadoHttpErrorAnticipo,
  type ErrorAnticipoProveedor,
  type FilaAnticipoProveedor,
  type RespuestaListadoAnticipos,
  type ResultadoCrearAnticipo,
  type SolicitudAplicarAnticipo,
  type SolicitudCrearAnticipo,
  type SolicitudDevolverAnticipo,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import type { ContextoSaldoFavor, FacturaAbiertaSaldo } from '@/lib/finanzas/saldosAFavor/contrato';
import { contextoSaldo, ErrorSaldoFavorServidor } from '@/lib/services/saldosAFavor/saldosAFavor.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export class ErrorAnticipoServidor extends Error {
  constructor(
    public readonly codigo: ErrorAnticipoProveedor,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

export function respuestaErrorAnticipo(codigo: ErrorAnticipoProveedor, detalle: unknown = null): NextResponse {
  return NextResponse.json({ error: codigo, codigo, detalle }, { status: estadoHttpErrorAnticipo(codigo), headers: SIN_CACHE });
}

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function errorDeRpc(rpc: string, ctx: Ctx, error: { message: string; code?: string; details?: unknown }): ErrorAnticipoServidor {
  if (esPendienteDeActivar(error)) return new ErrorAnticipoServidor('pendiente_de_activar');
  const codigo = codigoErrorAnticipo(error.message);
  if (codigo === 'error_desconocido') {
    console.error(`[anticipos-proveedor] ${rpc}`, { organizationId: ctx.organizationId, message: error.message });
  }
  return new ErrorAnticipoServidor(codigo, detalleJson(error.details));
}

const num = (v: unknown) => Number(v ?? 0) || 0;

type FilaBase = {
  id: string;
  supplier_id: number;
  amount: number | string;
  balance: number | string;
  status: string;
  created_at: string;
  branch_id: number | null;
  notes: string | null;
  account_code: string;
  suppliers: { name: string | null; nit: string | null } | null;
  payment_groups: { receipt_number: string | null } | null;
};

/**
 * Listado de la organización de la sesión, con lo aplicado de cada anticipo.
 * La lista es corta (una fila por anticipo); el filtro y la búsqueda van en el
 * navegador. Sin la migración: `pendiente`.
 */
export async function listarAnticipos(ctx: Ctx): Promise<RespuestaListadoAnticipos> {
  const { data, error } = await ctx.supabase
    .from('supplier_advances')
    .select('id, supplier_id, amount, balance, status, created_at, branch_id, notes, account_code, suppliers:supplier_id (name, nit), payment_groups:payment_group_id (receipt_number)')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    if (esPendienteDeActivar(error)) return { pendiente: true, filas: [], cuenta: null };
    throw errorDeRpc('supplier_advances', ctx, error);
  }
  const filasBase = (data ?? []) as unknown as FilaBase[];

  const aplicadoPorAnticipo = new Map<string, number>();
  if (filasBase.length > 0) {
    const { data: apps, error: errApps } = await ctx.supabase
      .from('supplier_advance_applications')
      .select('advance_id, amount')
      .eq('organization_id', ctx.organizationId)
      .in('advance_id', filasBase.map((f) => f.id));
    if (errApps) throw errorDeRpc('supplier_advance_applications', ctx, errApps);
    for (const a of (apps ?? []) as { advance_id: string; amount: number | string }[]) {
      aplicadoPorAnticipo.set(a.advance_id, (aplicadoPorAnticipo.get(a.advance_id) ?? 0) + num(a.amount));
    }
  }

  const filas: FilaAnticipoProveedor[] = filasBase.map((f) => {
    const valor = num(f.amount);
    const saldo = f.status === 'cancelled' ? 0 : num(f.balance);
    const aplicado = aplicadoPorAnticipo.get(f.id) ?? 0;
    return {
      id: f.id,
      proveedorId: String(f.supplier_id),
      proveedor: f.suppliers?.name ?? '',
      proveedorNit: f.suppliers?.nit ?? null,
      fecha: f.created_at,
      valor,
      aplicado,
      devuelto: f.status === 'cancelled' ? 0 : Math.max(0, Math.round((valor - saldo - aplicado) * 100) / 100),
      saldo,
      estado: estadoAnticipo(f.status, saldo),
      recibo: f.payment_groups?.receipt_number ?? null,
      sucursalId: f.branch_id,
      notas: f.notes,
    };
  });

  const { data: cuenta } = await ctx.supabase.rpc('fn_cuenta_anticipo_proveedor', { p_org: ctx.organizationId, p_branch: null });
  return { pendiente: false, filas, cuenta: typeof cuenta === 'string' ? cuenta : null };
}

/**
 * Métodos de la organización, cuentas bancarias y caja abierta de la sucursal
 * (la misma lectura del saldo a favor y del diálogo único de pago) y, con
 * proveedor, sus cuentas por pagar abiertas (confirmadas, con saldo).
 */
export async function contextoAnticipo(ctx: Ctx, entrada: { branchId: number | null; supplierId?: number | null }): Promise<ContextoSaldoFavor> {
  let base: ContextoSaldoFavor;
  try {
    base = await contextoSaldo(ctx, { branchId: entrada.branchId });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) throw new ErrorAnticipoServidor('error_desconocido');
    throw err;
  }
  if (!entrada.supplierId) return { ...base, facturas: [] };

  const { data, error } = await ctx.supabase
    .from('accounts_payable')
    .select('id, amount, balance, status, created_at, invoice_id, invoice_purchase:invoice_id (number_ext, status, issue_date, total)')
    .eq('organization_id', ctx.organizationId)
    .eq('supplier_id', entrada.supplierId)
    .gt('balance', 0)
    .not('status', 'in', '(paid,cancelled,void)')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw errorDeRpc('accounts_payable', ctx, error);
  type Fila = {
    id: string;
    amount: number | string | null;
    balance: number | string | null;
    created_at: string | null;
    invoice_id: string | null;
    invoice_purchase: { number_ext: string | null; status: string | null; issue_date: string | null; total: number | string | null } | null;
  };
  const facturas: FacturaAbiertaSaldo[] = ((data ?? []) as unknown as Fila[])
    // Un borrador no es una deuda (D2 de compras); una anulada tampoco.
    .filter((f) => !f.invoice_purchase || !['draft', 'void', 'voided', 'cancelled'].includes(f.invoice_purchase.status ?? ''))
    .map((f) => ({
      id: f.id,
      number: f.invoice_purchase?.number_ext ?? '',
      total: num(f.invoice_purchase?.total ?? f.amount),
      balance: num(f.balance),
      issue_date: f.invoice_purchase?.issue_date ?? f.created_at,
    }));
  return { ...base, facturas };
}

export async function crearAnticipo(ctx: Ctx, s: SolicitudCrearAnticipo): Promise<ResultadoCrearAnticipo> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_crear', {
    p_supplier: s.proveedor_id,
    p_branch: s.sucursal_id,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
    p_notas: s.notas ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_crear', ctx, error);
  return data as ResultadoCrearAnticipo;
}

export async function aplicarAnticipo(ctx: Ctx, anticipoId: string, s: SolicitudAplicarAnticipo): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_aplicar', {
    p_anticipo: anticipoId,
    p_cuenta_por_pagar: s.cuenta_id,
    p_monto: s.monto,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_aplicar', ctx, error);
  return data;
}

export async function devolverAnticipo(ctx: Ctx, anticipoId: string, s: SolicitudDevolverAnticipo): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_devolver', {
    p_anticipo: anticipoId,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_motivo: s.motivo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_devolver', ctx, error);
  return data;
}

export async function anularAnticipo(ctx: Ctx, anticipoId: string, motivo: string): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_anticipo_proveedor_anular', {
    p_anticipo: anticipoId,
    p_motivo: motivo,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_anticipo_proveedor_anular', ctx, error);
  return data;
}
