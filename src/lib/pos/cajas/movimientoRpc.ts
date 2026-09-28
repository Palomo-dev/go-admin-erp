/**
 * Registrar un movimiento de caja: UNA llamada a `pos_caja_registrar_movimiento`
 * (migración 20260928100000). La usan los tres escritores que había —
 * `CajasService` (POS), `cashSync` (outbox del Desktop) y `movimientosService`
 * (Finanzas) — para que la escritura directa en `cash_movements` pueda cerrarse
 * en la fase 2 (docs/implementacion/CAJAS-VENTAS-PLAN.md §7).
 *
 * La RPC exige caja ABIERTA de la organización con acceso a su sucursal, pone
 * como autor a quien llama y es idempotente por `uuid`. Módulo hoja.
 */

export const RPC_MOVIMIENTO_CAJA = 'pos_caja_registrar_movimiento';

export interface DatosMovimientoCaja {
  type: 'in' | 'out';
  amount: number;
  concept: string;
  concept_code?: string | null;
  reference?: string | null;
  notes?: string | null;
}

/** Parámetros de la RPC. `uuid`: el del cliente (reintentos y outbox); `creadoEn`: hora sin red. */
export function parametrosMovimiento(
  sessionId: number,
  datos: DatosMovimientoCaja,
  opciones: { uuid?: string | null; creadoEn?: string | null } = {},
) {
  return {
    p_session_id: sessionId,
    p_tipo: datos.type,
    p_monto: datos.amount,
    p_concepto: datos.concept,
    p_concept_code: datos.concept_code ?? null,
    p_referencia: datos.reference ?? null,
    p_notas: datos.notes ?? null,
    p_uuid: opciones.uuid ?? null,
    p_creado_en: opciones.creadoEn ?? null,
  };
}

/** Error de la RPC → código estable de `cajas.errores` (`caja_ya_cerrada`, `sin_permiso`…). */
export function codigoErrorMovimiento(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  const m = e.message ?? '';
  if (m.includes('caja_cerrada') || e.code === '55000') return 'caja_ya_cerrada';
  if (m.includes('caja_no_encontrada') || e.code === 'P0002') return 'caja_no_encontrada';
  if (m.includes('no_autenticado')) return 'no_autenticado';
  if (e.code === '42501') return 'sin_permiso';
  if (e.code === '22023') return 'datos_movimiento_invalidos';
  return 'movimiento_fallido';
}

/** Respuesta de la RPC → fila de `cash_movements` (sin la marca de reintento). */
export function movimientoDeRpc<T>(data: unknown): T & { ya_registrado: boolean } {
  const fila = (data ?? {}) as Record<string, unknown>;
  return { ...fila, ya_registrado: fila.ya_registrado === true } as T & { ya_registrado: boolean };
}
