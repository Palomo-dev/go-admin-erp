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
 * La regla es la misma del resto del ERP (ver `src/lib/utils/rbac.ts` y
 * `branchService.ts`): `organization_members.is_super_admin`, o el rol
 * 'Super Admin' / 'Admin de organización' (role_id 1 / 2).
 */

export const ORG_ADMIN_ROLE_IDS = [1, 2];
export const ORG_ADMIN_ROLE_NAMES = ['Super Admin', 'Admin de organización'];

export interface OrgAdminShape {
  isSuperAdmin: boolean;
  roleName: string;
  roleId: number;
}

export function isOrgAdminLike(member: OrgAdminShape): boolean {
  return (
    member.isSuperAdmin === true ||
    ORG_ADMIN_ROLE_NAMES.includes(member.roleName) ||
    ORG_ADMIN_ROLE_IDS.includes(member.roleId)
  );
}
