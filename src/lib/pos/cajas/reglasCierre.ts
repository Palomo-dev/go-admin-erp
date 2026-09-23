/**
 * Quién puede cerrar una caja del POS. Módulo hoja, sin dependencias: lo usan
 * el route handler que cierra (`POST /api/pos/cajas/[id]/cerrar`) y la
 * pantalla de cajas para no ofrecer lo que el servidor va a negar.
 *
 * Regla dura 6 (CLAUDE.md): `cerrarAjenas` sale del servidor
 * (`GET /api/pos/cajas/permisos` → `hasOrgAdminOrPermission`: super admin,
 * rol 1/2 o `admin.full_access` por rol o cargo). Nunca del nombre del rol.
 */
export interface CajaParaCerrar {
  opened_by: string;
  status: 'open' | 'closed' | string;
}

/** Quien abrió la caja la cierra; cualquier otra persona necesita el permiso. */
export function puedeCerrarCaja(caja: CajaParaCerrar, userId: string | null | undefined, cerrarAjenas: boolean): boolean {
  if (caja.status !== 'open' || !userId) return false;
  return caja.opened_by === userId || cerrarAjenas;
}

export const MOTIVO_NO_PUEDE_CERRAR = 'Solo el cajero que abrió la caja o un administrador puede cerrarla';
