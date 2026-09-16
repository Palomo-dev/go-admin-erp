/**
 * Criterio de "administrador de la organización" — módulo hoja, sin
 * dependencias.
 *
 * Vivía dentro de `orgContext.ts`, que arrastra `webhookSignatures` → `svix`
 * (ESM puro). Cualquier módulo ligero que solo necesitara saber si alguien es
 * admin acababa cargando todo eso, y en Jest (CJS) reventaba al parsear svix.
 *
 * Se extrae aquí para que la regla siga teniendo UNA sola definición:
 * `orgContext.ts` la re-exporta y nadie la reimplementa.
 *
 * Regla dura 6 (CLAUDE.md): los permisos se resuelven en el servidor y NUNCA a
 * partir del nombre de un rol. Hasta F0-SEC r1 aquí también contaba el nombre
 * (`'Super Admin' | 'Admin de organización'`): un rol personalizado con ese
 * nombre y `role_id` 99 obtenía admin. Ahora la decisión síncrona es solo por
 * `organization_members.is_super_admin` o por `role_id` ∈ `ORG_ADMIN_ROLE_IDS`
 * (verificados en `roles` el 2026-09-15: 1 = Super Admin, 2 = Admin de
 * organización), igual que `src/lib/utils/rbac.ts`.
 *
 * Los cargos (`job_positions`) con permiso también cuentan, pero eso requiere
 * consultar la base (`check_user_permission`): lo hace
 * `hasOrgAdminOrPermission` / `requireOrgAdminOrPermission` en `orgContext.ts`,
 * con `ORG_ADMIN_PERMISSION_CODE` como permiso equivalente a admin.
 */

export const ORG_ADMIN_ROLE_IDS = [1, 2];

/**
 * Permiso que equivale a "administrador de la organización" cuando lo concede
 * un cargo o un rol distinto de 1/2 (`permissions.code`, módulo `admin`).
 */
export const ORG_ADMIN_PERMISSION_CODE = 'admin.full_access';

export interface OrgAdminShape {
  isSuperAdmin: boolean;
  roleId: number;
  /** Se acepta por compatibilidad de tipos; NO participa en la decisión. */
  roleName?: string;
}

export function isOrgAdminLike(member: OrgAdminShape): boolean {
  return member.isSuperAdmin === true || ORG_ADMIN_ROLE_IDS.includes(member.roleId);
}
