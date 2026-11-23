/**
 * Quién registra y activa domiciliarios (regla dura 6). Solo servidor.
 *
 * FASE1-CIMIENTOS §Permisos: aún no hay códigos `logistica.*`. Dar de alta o desactivar un
 * domiciliario lo hace quien despacha y recibe el cuadre: el mismo criterio de los cuadres,
 * `fn_caja_puede(org, 'pos.create')` (cajeros y administradores, super admin o
 * `admin.full_access`). Un fallo de la consulta cuenta como «no» (fail-closed).
 *
 * Se pregunta a `fn_logistica_gestiona(org)` (migración 20261123165617): la MISMA función que usa
 * la RLS de escritura de `driver_credentials`, así la ruta y la base no pueden divergir. Si el
 * dueño crea códigos `logistica.*`, se cambia solo esa función.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';

export const PERMISO_DOMICILIARIOS = 'pos.create';

export async function puedeGestionarDomiciliarios(ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>): Promise<boolean> {
  try {
    const { data, error } = await ctx.supabase.rpc('fn_logistica_gestiona', { p_org: ctx.organizationId });
    if (error) {
      console.warn('[logistica/domiciliarios] fn_logistica_gestiona falló; se deniega', { organizationId: ctx.organizationId, message: error.message });
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[logistica/domiciliarios] fn_logistica_gestiona lanzó; se deniega', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
