import type { ServerOrgContext } from './orgContext';

const ORG_ADMIN_ROLE_IDS = [1, 2]; // Super Admin, Admin de organización
const ORG_ADMIN_ROLE_NAMES = ['Super Admin', 'Admin de organización'];

export function isOrgAdmin(ctx: ServerOrgContext): boolean {
  return ORG_ADMIN_ROLE_NAMES.includes(ctx.roleName) || ORG_ADMIN_ROLE_IDS.includes(ctx.roleId);
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
