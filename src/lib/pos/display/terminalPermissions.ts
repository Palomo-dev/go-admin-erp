/**
 * Permiso síncrono para gestionar terminales del POS (renombrar / activar /
 * desactivar). Vive fuera del route porque Next solo admite exportar
 * handlers y opciones de segmento desde `route.ts` (TS2344 en el build).
 */
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';

/**
 * `roles.id` del rol «Manager» (verificado en la tabla `roles` el
 * 2026-09-21: 1 Super Admin, 2 Admin de organización, 3 Cliente, 4 Empleado,
 * 5 Manager; `roles` es global, sin organización). Regla dura 6: la decisión
 * es por id, NUNCA por el nombre del rol.
 */
export const POS_MANAGER_ROLE_ID = 5;

/**
 * ¿Puede renombrar / activar / desactivar terminales? PLAN §7: Admin/manager.
 * Criterio síncrono: super admin, rol 1/2 (`isOrgAdminLike`) o rol Manager.
 * Los cargos con `admin.full_access` también pasan (`hasOrgAdminOrPermission`,
 * consulta `check_user_permission` en la base), pero eso lo decide el handler.
 */
export function canManagePosTerminalsSync(ctx: { isSuperAdmin: boolean; roleId: number }): boolean {
  return isOrgAdminLike(ctx) || ctx.roleId === POS_MANAGER_ROLE_ID;
}
