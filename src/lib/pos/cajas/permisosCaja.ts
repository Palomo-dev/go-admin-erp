/**
 * Permisos de cajas del POS resueltos en el servidor (regla dura 6).
 *
 * Una sola definición para la pantalla (`GET /api/pos/cajas/permisos`) y
 * para la escritura (`POST /api/pos/cajas/[id]/cerrar`): la UI no ofrece lo
 * que el servidor va a negar, y el servidor no confía en lo que diga la UI.
 */
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';

export interface PermisosCaja {
  /** Cerrar la caja que abrió otra persona. */
  cerrarCajasAjenas: boolean;
  /** Ver el esperado y la diferencia aunque la organización use cierre ciego. */
  verEsperadoEnCierreCiego: boolean;
}

/**
 * Administración de la organización: super admin, rol 1/2 o el permiso
 * `admin.full_access` concedido por rol o por cargo (`check_user_permission`).
 * Un fallo de la consulta cuenta como «no» (fail-closed).
 */
export async function resolverPermisosCaja(ctx: ServerOrgContext): Promise<PermisosCaja> {
  const admin = await hasOrgAdminOrPermission(ctx);
  return { cerrarCajasAjenas: admin, verEsperadoEnCierreCiego: admin };
}
