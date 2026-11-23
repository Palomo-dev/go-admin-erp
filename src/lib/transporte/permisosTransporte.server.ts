/**
 * Permisos de Transporte resueltos en el servidor (regla dura 6). Solo servidor.
 *
 * Códigos `transporte.*` (migración 20261123220000): `view`, `manage`, `despachar` y
 * `despacho.excepcion`. Los reciben CARGOS (Despachador de transporte, Supervisor de despacho),
 * nunca roles nuevos. `fn_caja_puede` acepta además administradores, super admin y
 * `admin.full_access`. Un fallo de la consulta cuenta como «no».
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';

export type PermisoTransporte = 'transporte.view' | 'transporte.manage' | 'transporte.despachar' | 'transporte.despacho.excepcion';

export async function puedeTransporte(ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>, codigo: PermisoTransporte): Promise<boolean> {
  try {
    const { data, error } = await ctx.supabase.rpc('fn_caja_puede', { p_org: ctx.organizationId, p_code: codigo });
    if (error) {
      console.warn('[transporte] fn_caja_puede falló; se deniega', { organizationId: ctx.organizationId, codigo, message: error.message });
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[transporte] fn_caja_puede lanzó; se deniega', { organizationId: ctx.organizationId, codigo, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
