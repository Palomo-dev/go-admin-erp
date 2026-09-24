/**
 * Permisos de cajas del POS resueltos en el servidor (regla dura 6).
 *
 * Una sola definición para la pantalla (`GET /api/pos/cajas/permisos`,
 * `GET /api/pos/cajas/[id]/resumen`) y para la escritura
 * (`POST /api/pos/cajas/[id]/cerrar`): la UI no ofrece lo que el servidor va a
 * negar, y el servidor no confía en lo que diga la UI. La base aplica la misma
 * regla en `fn_caja_puede` (pos_caja_cerrar, pos_caja_registrar_arqueo).
 *
 * Códigos propios de caja (migración 20260926130000), por defecto para los
 * roles Admin de organización y Manager y asignables a cargos:
 * - `pos.cajas.cerrar_ajenas`: cerrar la caja que abrió otra persona.
 * - `pos.cajas.ver_esperado`: ver el esperado y las diferencias con cierre ciego.
 * Además cuentan super admin, rol 1/2 y `admin.full_access` (por rol o cargo).
 */
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';

export const PERMISO_CERRAR_AJENAS = 'pos.cajas.cerrar_ajenas';
export const PERMISO_VER_ESPERADO = 'pos.cajas.ver_esperado';

export interface PermisosCaja {
  /** Cerrar la caja que abrió otra persona. */
  cerrarCajasAjenas: boolean;
  /** Ver el esperado y la diferencia aunque la organización use cierre ciego. */
  verEsperadoEnCierreCiego: boolean;
}

type SujetoPermiso = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/** El código propio o `admin.full_access`. Un fallo de la consulta cuenta como «no» (fail-closed). */
async function tiene(ctx: SujetoPermiso, codigo: string): Promise<boolean> {
  if (await hasOrgAdminOrPermission(ctx, codigo)) return true;
  return hasOrgAdminOrPermission(ctx);
}

export async function resolverPermisosCaja(ctx: SujetoPermiso): Promise<PermisosCaja> {
  const [cerrarCajasAjenas, verEsperadoEnCierreCiego] = await Promise.all([
    tiene(ctx, PERMISO_CERRAR_AJENAS),
    tiene(ctx, PERMISO_VER_ESPERADO),
  ]);
  return { cerrarCajasAjenas, verEsperadoEnCierreCiego };
}

/** ¿La organización usa cierre ciego? (`organization_settings.pos_blind_cash_count`). Falla → sí (fail-closed). */
export async function organizacionUsaCierreCiego(ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('organization_settings')
    .select('settings')
    .eq('organization_id', ctx.organizationId)
    .eq('key', 'pos_blind_cash_count')
    .maybeSingle();
  if (error) {
    console.warn('[permisosCaja] no se pudo leer el cierre ciego; se oculta', { organizationId: ctx.organizationId, message: error.message });
    return true;
  }
  return (data as { settings?: { blind_cash_count?: unknown } } | null)?.settings?.blind_cash_count === true;
}
