/**
 * Consignar caja a banco (Tesorería v2, frame `1004:82448`): validación del
 * cuerpo que recibe `POST /api/tesoreria/consignaciones` y su paso a la RPC
 * `fn_consignacion_caja_banco` (migración 20261108010000, aplicada el
 * 2026-11-07 por el coordinador). La pantalla y el servidor usan las mismas reglas.
 */
import { codigoErrorTesoreria, type CodigoErrorTesoreria } from '@/lib/finanzas/movimientoBancario';

export interface CuerpoConsignacion {
  id: string;
  sesionId: number;
  cuentaBancoId: number;
  monto: number;
  comision: number;
  /** Día de la organización `YYYY-MM-DD`; vacío = hoy. */
  fecha: string | null;
  referencia: string | null;
}

export type ErrorConsignacion = 'datos_invalidos' | 'monto_invalido' | 'cuenta_requerida' | 'caja_requerida' | 'fecha_futura';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function entero(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function importe(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Lista blanca del cuerpo. `hoy` es el día de la organización (fecha futura = error). */
export function validarConsignacion(
  body: Record<string, unknown>,
  hoy?: string | null,
): { ok: true; datos: CuerpoConsignacion } | { ok: false; error: ErrorConsignacion } {
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null;
  if (!id) return { ok: false, error: 'datos_invalidos' };
  const sesionId = entero(body.sesionId);
  if (!sesionId) return { ok: false, error: 'caja_requerida' };
  const cuentaBancoId = entero(body.cuentaBancoId);
  if (!cuentaBancoId) return { ok: false, error: 'cuenta_requerida' };
  const monto = importe(body.monto);
  const comision = importe(body.comision) ?? 0;
  if (monto === null || monto <= 0 || monto > 1e12 || comision < 0 || comision > monto) return { ok: false, error: 'monto_invalido' };
  const fecha = typeof body.fecha === 'string' && FECHA.test(body.fecha) ? body.fecha : null;
  if (fecha && hoy && fecha > hoy) return { ok: false, error: 'fecha_futura' };
  const ref = typeof body.referencia === 'string' ? body.referencia.trim().slice(0, 120) : '';
  return { ok: true, datos: { id, sesionId, cuentaBancoId, monto, comision, fecha, referencia: ref || null } };
}

export function parametrosConsignacion(organizationId: number, d: CuerpoConsignacion) {
  return {
    p_id: d.id,
    p_organization_id: organizationId,
    p_sesion_id: d.sesionId,
    p_cuenta_banco: d.cuentaBancoId,
    p_monto: d.monto,
    p_comision: d.comision,
    p_fecha: d.fecha,
    p_referencia: d.referencia,
  };
}

export type CodigoErrorConsignacion = CodigoErrorTesoreria | 'caja_no_encontrada' | 'datos_invalidos';

/** Error de la RPC → código estable (nunca el texto crudo de Postgres). */
export function codigoErrorConsignacion(error: unknown): CodigoErrorConsignacion {
  const mensaje = ((error ?? {}) as { message?: string }).message ?? '';
  if (mensaje.includes('caja_no_encontrada')) return 'caja_no_encontrada';
  if (mensaje.includes('datos_invalidos')) return 'datos_invalidos';
  return codigoErrorTesoreria(error);
}

/** Total que sale de la caja: lo consignado más la comisión pagada con el mismo efectivo. */
export const totalSaleDeCaja = (monto: number | null, comision: number | null) =>
  Math.round(((monto ?? 0) + (comision ?? 0)) * 100) / 100;
