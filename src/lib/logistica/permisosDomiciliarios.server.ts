/**
 * Quién registra y activa domiciliarios (regla dura 6). Solo servidor.
 *
 * Dar de alta o desactivar un domiciliario lo hace quien despacha y recibe el cuadre: permiso
 * `logistica.manage` (migración 20261123195500). Lo trae el CARGO «Despachador»; el rol de esa
 * persona sigue siendo «Empleado» (decisión del dueño, 2026-11-23). También pueden los
 * administradores, el super admin y `admin.full_access`. Un fallo de la consulta cuenta como «no»
 * (fail-closed).
 *
 * Se pregunta a `fn_logistica_gestiona(org)` (migración 20261123165617): la MISMA función que usa
 * la RLS de escritura de `driver_credentials`, así la ruta y la base no pueden divergir.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';

export const PERMISO_DOMICILIARIOS = 'logistica.manage';

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
