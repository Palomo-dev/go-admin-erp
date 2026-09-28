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
  type ErrorSaldoFavor,
  type ResultadoAplicarSaldo,
  type SolicitudAplicarSaldo,
} from '@/lib/finanzas/saldosAFavor/contrato';

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
