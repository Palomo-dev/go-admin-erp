/**
 * Qué puede hacer la persona con las ventas del POS (D14 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md), resuelto EN EL SERVIDOR con los
 * códigos de permiso (`hasOrgAdminOrPermission`), nunca por el nombre del rol.
 * Lo usan el listado (`GET /api/pos/ventas/permisos`) y el detalle
 * (`GET /api/pos/ventas/[id]`). La barrera real sigue en cada RPC:
 * `pos_anular_venta_v1` (pos.void), `procesar_devolucion` (pos.refund),
 * `fn_registrar_pago` (pos.create en el origen `venta_pos`).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { SIN_PERMISOS_VENTAS, type PermisosVentas } from './accionesVenta';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId' | 'roleId' | 'isSuperAdmin'>;

export { SIN_PERMISOS_VENTAS, type PermisosVentas };

export async function resolverPermisosVentas(ctx: Ctx): Promise<PermisosVentas> {
  const [anular, devolver, vender, exportar] = await Promise.all([
    hasOrgAdminOrPermission(ctx, 'pos.void'),
    hasOrgAdminOrPermission(ctx, 'pos.refund'),
    hasOrgAdminOrPermission(ctx, 'pos.create'),
    hasOrgAdminOrPermission(ctx, 'reports.sales'),
  ]);
  return { anular, devolver, vender, exportar };
}
