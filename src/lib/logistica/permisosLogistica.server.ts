/**
 * Permisos de logística resueltos en el servidor (regla dura 6). Solo servidor.
 *
 * FASE1-CIMIENTOS §Permisos: aún no hay códigos `logistica.*` en `permissions`. Mientras el dueño
 * no pida roles finos, escribir zonas, tarifas y reglas —y cambiar el cargo de domicilio que llenó
 * la zona en el POS o en el pedido manual— exige lo mismo que la RLS de `shipping_zones`:
 * `fn_caja_puede(org, 'organization_settings')` (administradores, super admin, el código
 * `organization_settings` o `admin.full_access`). Un fallo de la consulta cuenta como «no».
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';

export const PERMISO_ZONAS_Y_CARGO = 'organization_settings';

export async function puedeEditarCargoDomicilio(ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>): Promise<boolean> {
  try {
    const { data, error } = await ctx.supabase.rpc('fn_caja_puede', { p_org: ctx.organizationId, p_code: PERMISO_ZONAS_Y_CARGO });
    if (error) {
      console.warn('[logistica] fn_caja_puede falló; se deniega', { organizationId: ctx.organizationId, message: error.message });
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[logistica] fn_caja_puede lanzó; se deniega', { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
