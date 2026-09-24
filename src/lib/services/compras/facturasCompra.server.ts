/**
 * Facturas de compra y cuentas por pagar — servicio de servidor (plan
 * FACTURAS-COMPRA-CXP F2). Solo llama a las RPC de la base: guardar, confirmar,
 * recepcionar, anular, eliminar borrador, factura desde OC, programar y decidir
 * pagos, plan de cuotas y estado de cuenta. Nunca escribe tablas ni saldos.
 *
 * Siempre con el cliente de la SESIÓN (`ctx.supabase`): las RPC toman el autor
 * de `auth.uid()` y vuelven a comprobar organización, sucursal y permiso. La
 * organización de guardar y de los listados es la de la sesión, nunca la del
 * body (regla dura 5).
 *
 * Los pagos NO pasan por aquí: los registra el pago único (`/api/pagos`,
 * `fn_registrar_pago`) con dirección `pago` y origen `factura_compra` o `cxp`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorCompra,
  type CuotaEntrada,
  type ErrorCompra,
  type EstadoCuentaProveedor,
  type GuardarFacturaCompra,
  type ProgramarPago,
  type ResultadoConfirmar,
  type ResultadoGuardar,
  type ResultadoRecepcion,
} from './contrato';

export type { CuotaEntrada, EstadoCuentaProveedor, ProgramarPago, ResultadoConfirmar, ResultadoGuardar, ResultadoRecepcion };

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorCompraServidor extends Error {
  constructor(
    public readonly codigo: ErrorCompra,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

async function llamar<T>(ctx: Ctx, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) {
    const codigo = codigoErrorCompra(error.message);
    if (codigo === 'error_desconocido') {
      console.error(`[compras] ${fn}`, { organizationId: ctx.organizationId, message: error.message });
    }
    throw new ErrorCompraServidor(codigo, (error as { details?: unknown }).details ?? null);
  }
  return data as T;
}

// ─── Factura de compra ───────────────────────────────────────────────────────

export function guardarFacturaCompra(ctx: Ctx, datos: GuardarFacturaCompra): Promise<ResultadoGuardar> {
  return llamar<ResultadoGuardar>(ctx, 'fn_factura_compra_guardar', { p_org: ctx.organizationId, p_payload: datos });
}

export function confirmarFacturaCompra(ctx: Ctx, id: string, recepcionar: boolean, generarDs: boolean): Promise<ResultadoConfirmar> {
  return llamar<ResultadoConfirmar>(ctx, 'fn_factura_compra_confirmar', {
    p_id: id,
    p_recepcionar: recepcionar,
    p_generar_ds: generarDs,
  });
}

export function recepcionarFacturaCompra(ctx: Ctx, id: string): Promise<ResultadoRecepcion> {
  return llamar<ResultadoRecepcion>(ctx, 'fn_factura_compra_recepcionar', { p_id: id });
}

export async function anularFacturaCompra(ctx: Ctx, id: string, motivo: string): Promise<void> {
  await llamar<null>(ctx, 'fn_void_purchase_invoice', { p_invoice_id: id, p_reason: motivo, p_user: ctx.userId });
}

export async function eliminarBorradorCompra(ctx: Ctx, id: string): Promise<void> {
  await llamar<null>(ctx, 'fn_factura_compra_eliminar_borrador', { p_id: id });
}

export function facturaDesdeOrden(
  ctx: Ctx,
  ordenUuid: string,
): Promise<{ invoice_id: string; number_ext?: string; ya_existia: boolean; accounts_payable_id?: string | null }> {
  return llamar(ctx, 'fn_factura_compra_desde_oc', { p_po_uuid: ordenUuid });
}

export function siguienteNumeroCompra(ctx: Ctx): Promise<string> {
  return llamar<string>(ctx, 'fn_siguiente_numero_compra', { p_org: ctx.organizationId });
}

// ─── Cuentas por pagar ──────────────────────────────────────────────────────

export function programarPago(ctx: Ctx, cuentaId: string, p: ProgramarPago): Promise<string> {
  return llamar<string>(ctx, 'fn_programar_pago', {
    p_ap_id: cuentaId,
    p_amount: p.amount,
    p_scheduled_date: p.scheduled_date,
    p_method: p.method,
    p_bank_account_id: p.bank_account_id ?? null,
    p_reference: p.reference ?? null,
    p_notes: p.notes ?? null,
    p_installment_id: p.installment_id ?? null,
  });
}

export function aprobarProgramacion(
  ctx: Ctx,
  id: string,
  comentario: string | null,
): Promise<{ payment_id: string; recibo: string | null; aviso: 'unico_aprobador' | null }> {
  return llamar(ctx, 'fn_aprobar_pago_programado', { p_id: id, p_comentario: comentario });
}

export async function rechazarProgramacion(ctx: Ctx, id: string, comentario: string): Promise<void> {
  await llamar<null>(ctx, 'fn_rechazar_pago_programado', { p_id: id, p_comentario: comentario });
}

export async function cancelarProgramacion(ctx: Ctx, id: string, comentario: string | null): Promise<void> {
  await llamar<null>(ctx, 'fn_cancelar_pago_programado', { p_id: id, p_comentario: comentario });
}

export function crearPlanCuotas(ctx: Ctx, cuentaId: string, cuotas: readonly CuotaEntrada[]): Promise<number> {
  return llamar<number>(ctx, 'fn_cxp_crear_plan_cuotas', { p_ap_id: cuentaId, p_cuotas: cuotas });
}

export function eliminarPlanCuotas(ctx: Ctx, cuentaId: string): Promise<number> {
  return llamar<number>(ctx, 'fn_cxp_eliminar_plan_cuotas', { p_ap_id: cuentaId });
}

export function estadoCuentaProveedor(
  ctx: Ctx,
  proveedorId: number,
  desde: string | null,
  hasta: string | null,
): Promise<EstadoCuentaProveedor> {
  return llamar<EstadoCuentaProveedor>(ctx, 'fn_estado_cuenta_proveedor', {
    p_org: ctx.organizationId,
    p_supplier: proveedorId,
    p_desde: desde,
    p_hasta: hasta,
  });
}
