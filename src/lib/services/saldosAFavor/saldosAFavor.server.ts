/**
 * Saldos a favor — servicio de servidor. Solo llama a las RPC y lee lo que las
 * pantallas necesitan; nunca escribe tablas ni saldos.
 *
 * Siempre con el cliente de la SESIÓN (`ctx.supabase`): la RPC toma el autor de
 * `auth.uid()` y comprueba organización, sucursal, permiso e idempotencia en la
 * base. La organización que se le pasa es la de la sesión (`ctx.organizationId`).
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import {
  codigoErrorSaldoFavor,
  estadoHttpErrorSaldoFavor,
  type ContextoSaldoFavor,
  type ErrorSaldoFavor,
  type ResultadoAnularSaldo,
  type ResultadoAplicarSaldo,
  type ResultadoCrearSaldo,
  type ResultadoDevolverSaldo,
  type SolicitudAplicarSaldo,
  type SolicitudCrearSaldo,
  type SolicitudDevolverSaldo,
} from '@/lib/finanzas/saldosAFavor/contrato';
import { contextoPago, ErrorPagoServidor } from '@/lib/services/pagos/pagos.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ErrorSaldoFavorServidor extends Error {
  constructor(
    public readonly codigo: ErrorSaldoFavor,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

/** El body ya revisado por `readOrgBody`, sin las claves de organización (no van a zod `.strict()`). */
export function sinClavesDeOrganizacion(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null
    ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
    : raw;
}

/** Respuesta de error con `codigo` estable (`saldosAFavor.errores.<codigo>`). */
export function respuestaError(codigo: ErrorSaldoFavor, detalle: unknown = null): NextResponse {
  return NextResponse.json(
    { error: codigo, codigo, detalle },
    { status: estadoHttpErrorSaldoFavor(codigo), headers: SIN_CACHE },
  );
}

function detalleJson(detail: unknown): unknown {
  if (typeof detail !== 'string' || !detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function errorDeRpc(rpc: string, ctx: Ctx, error: { message: string; details?: unknown }): ErrorSaldoFavorServidor {
  const codigo = codigoErrorSaldoFavor(error.message);
  if (codigo === 'error_desconocido') {
    console.error(`[saldos-a-favor] ${rpc}`, { organizationId: ctx.organizationId, message: error.message });
  }
  return new ErrorSaldoFavorServidor(codigo, detalleJson(error.details));
}

export async function aplicarSaldo(ctx: Ctx, creditId: string, s: SolicitudAplicarSaldo): Promise<ResultadoAplicarSaldo> {
  const { data, error } = await ctx.supabase.rpc('fn_apply_customer_credit', {
    p_credit_id: creditId,
    p_invoice_id: s.factura_id,
    p_amount: s.monto,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_apply_customer_credit', ctx, error);
  return data as ResultadoAplicarSaldo;
}

/**
 * Anticipo a mano (`fn_saldo_favor_crear`): recibo + payments + saldo + asiento en
 * una transacción; efectivo exige caja abierta. Cliente, sucursal y método se
 * validan en la base contra la organización de la sesión.
 */
export async function crearSaldo(ctx: Ctx, s: SolicitudCrearSaldo): Promise<ResultadoCrearSaldo> {
  const { data, error } = await ctx.supabase.rpc('fn_saldo_favor_crear', {
    p_customer: s.cliente_id,
    p_branch: s.sucursal_id,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
    p_vence: s.vence ?? null,
    p_notas: s.notas ?? null,
  });
  if (error) throw errorDeRpc('fn_saldo_favor_crear', ctx, error);
  return data as ResultadoCrearSaldo;
}

/**
 * Métodos de la organización, cuentas bancarias, caja abierta de la sucursal y
 * el día: la misma lectura del diálogo único de pago (`contextoPago`).
 */
export async function contextoSaldo(ctx: Ctx, branchId: number | null): Promise<ContextoSaldoFavor> {
  try {
    const c = await contextoPago(ctx, { direccion: 'cobro', branchId });
    return { metodos: c.metodos, cuentasBancarias: c.cuentasBancarias, caja: c.caja, hoy: c.hoy };
  } catch (err) {
    if (err instanceof ErrorPagoServidor) throw new ErrorSaldoFavorServidor('error_desconocido');
    throw err;
  }
}

/**
 * Anula un anticipo sin usar (`fn_saldo_favor_anular` → `fn_anular_pago`):
 * pago void, saldo cancelado y contra-asiento en una transacción. Si el saldo
 * ya se usó, la base responde `saldo_usado`.
 */
export async function anularSaldo(ctx: Ctx, creditId: string, motivo: string): Promise<ResultadoAnularSaldo> {
  const { data, error } = await ctx.supabase.rpc('fn_saldo_favor_anular', {
    p_credit_id: creditId,
    p_motivo: motivo,
    p_organization_id: ctx.organizationId,
  });
  if (error) throw errorDeRpc('fn_saldo_favor_anular', ctx, error);
  return data as ResultadoAnularSaldo;
}

/** Devuelve en dinero todo o parte del saldo (`fn_saldo_favor_devolver`). */
export async function devolverSaldo(ctx: Ctx, creditId: string, s: SolicitudDevolverSaldo): Promise<ResultadoDevolverSaldo> {
  const { data, error } = await ctx.supabase.rpc('fn_saldo_favor_devolver', {
    p_credit_id: creditId,
    p_monto: s.monto,
    p_metodo: s.metodo,
    p_motivo: s.motivo,
    p_clave_idempotencia: s.clave_idempotencia,
    p_organization_id: ctx.organizationId,
    p_cuenta_bancaria: s.cuenta_bancaria ?? null,
    p_referencia: s.referencia ?? null,
  });
  if (error) throw errorDeRpc('fn_saldo_favor_devolver', ctx, error);
  return data as ResultadoDevolverSaldo;
}
