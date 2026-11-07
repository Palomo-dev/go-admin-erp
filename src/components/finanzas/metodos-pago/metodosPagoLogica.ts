/**
 * Lógica de presentación de Métodos de pago (Finanzas ronda 2, A11 y A12).
 * Sin React ni Supabase.
 */

// ─── A12 · Quitar un método ──────────────────────────────────────────────────

export type AccionQuitarMetodo = 'eliminar' | 'desactivar' | 'ninguna';

/**
 * Qué hace «Quitar» con un método de la organización:
 * - del sistema (efectivo, tarjeta…): nada; se desactiva con el interruptor;
 * - con pagos registrados (`payments.method` = código): se DESACTIVA, nunca
 *   se borra, porque los pagos y sus informes lo siguen nombrando;
 * - sin pagos: se puede eliminar el vínculo de la organización.
 * Mientras no se sabe cuántos pagos tiene (`null`), se trata como «con pagos».
 */
export function accionQuitarMetodo(m: { esSistema: boolean; pagos: number | null; activo: boolean }): AccionQuitarMetodo {
  if (m.esSistema) return 'ninguna';
  if (m.pagos === null || m.pagos > 0) return m.activo ? 'desactivar' : 'ninguna';
  return 'eliminar';
}

// ─── A11 · Cobros QR ─────────────────────────────────────────────────────────

export type EstadoSesionQr = 'pending' | 'paid' | 'rejected' | 'expired' | 'cancelled';
export const ESTADOS_SESION_QR: readonly EstadoSesionQr[] = ['pending', 'paid', 'expired', 'rejected', 'cancelled'];

/** Columnas de `payment_qr_sessions` que usa la pestaña. */
export interface SesionQr {
  id: string;
  branch_id: number | null;
  provider_code: string | null;
  reference: string | null;
  amount: number | string | null;
  currency: string | null;
  source: string | null;
  source_id: string | null;
  status: EstadoSesionQr | string;
  paid_at: string | null;
  created_at: string;
}

export function filtrarSesionesQr(sesiones: readonly SesionQr[], filtro: { estado: EstadoSesionQr | null; texto: string }): SesionQr[] {
  const texto = filtro.texto.trim().toLowerCase();
  return sesiones.filter((s) => {
    if (filtro.estado && s.status !== filtro.estado) return false;
    if (texto && !(s.reference ?? '').toLowerCase().includes(texto)) return false;
    return true;
  });
}

/** Proveedores con nombre propio; si no, el código tal cual. */
const PROVEEDORES_QR: Record<string, string> = {
  bancolombia: 'Bancolombia',
  redeban: 'Redeban',
  breb: 'Bre-B',
  wompi: 'Wompi',
  bold: 'Bold',
};

export function nombreProveedorQr(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  return PROVEEDORES_QR[codigo] ?? codigo;
}

/** Orígenes con texto traducido (`metodos.qr.origenes.<clave>`); el resto se muestra tal cual. */
export const ORIGENES_QR = ['pos', 'folio', 'web_order'] as const;
export type OrigenQr = (typeof ORIGENES_QR)[number];

export function esOrigenQrConocido(origen: string | null | undefined): origen is OrigenQr {
  return Boolean(origen) && (ORIGENES_QR as readonly string[]).includes(origen as string);
}

export function esEstadoQrConocido(estado: string): estado is EstadoSesionQr {
  return (ESTADOS_SESION_QR as readonly string[]).includes(estado);
}

/** Estado de la pestaña: un error de carga NO es «no hay sesiones». */
export function estadoTablaQr(m: { cargando: boolean; error: string | null; total: number; visibles: number }) {
  if (m.error) return 'error' as const;
  if (m.cargando) return 'cargando' as const;
  if (m.total === 0) return 'vacio' as const;
  if (m.visibles === 0) return 'sinResultados' as const;
  return 'listo' as const;
}
