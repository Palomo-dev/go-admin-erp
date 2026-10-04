import { readOrgBody } from '@/lib/security/organizationBody';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, sinClavesDeOrganizacion, type CrmSesion } from '../crmRouteSupport';
import { readJson } from './http';
export function assertTemplateQuery(ctx: CrmSesion, request: Request) {
  readOrgBody(ctx, new URL(request.url).searchParams, { request });
}
export function requireTemplateRead(ctx: CrmSesion) {
  return exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar, CRM_PERMISOS.clientesVer, CRM_PERMISOS.oportunidadesVer], 'Leer plantillas');
}
export function requireTemplateWrite(ctx: CrmSesion) {
  return exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'Gestionar plantillas');
}
export function canManageTemplates(ctx: CrmSesion) {
  return hasOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
}
export async function readTemplateBody(ctx: CrmSesion, request: Request) {
  const body = await readJson<unknown>(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const { EmailError } = await import('./types');
    throw new EmailError('VALIDATION', 'El cuerpo debe ser un objeto', 400);
  }
  return sinClavesDeOrganizacion(readOrgBody(ctx, body as Record<string, unknown>, { request }));
}
