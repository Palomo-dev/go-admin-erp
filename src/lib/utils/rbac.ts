import type { ServerOrgContext } from './orgContext';

/**
 * Ids de los roles administradores (verificados en `roles` el 2026-09-15:
 * 1 = Super Admin, 2 = Admin de organización). La resolución es por id y por
 * `organization_members.is_super_admin`, NUNCA por el nombre del rol
 * (CLAUDE.md regla 6; QA F0-REG r1 medio 15): un rol renombrado o creado con
 * ese nombre en otra organización no debe ganar privilegios.
 */
const ORG_ADMIN_ROLE_IDS = [1, 2];

export function isOrgAdmin(ctx: ServerOrgContext): boolean {
  return ctx.isSuperAdmin === true || ORG_ADMIN_ROLE_IDS.includes(ctx.roleId);
}

export function requireRole(ctx: ServerOrgContext, allowedRoleNames: string[]): void {
  if (!allowedRoleNames.includes(ctx.roleName)) {
    throw new Error(`Rol '${ctx.roleName}' no autorizado. Requerido: ${allowedRoleNames.join(', ')}`);
  }
}

export function canManageUsers(ctx: ServerOrgContext): boolean {
  return isOrgAdmin(ctx);
}

export function canManageProviders(ctx: ServerOrgContext): boolean {
  return isOrgAdmin(ctx);
}
