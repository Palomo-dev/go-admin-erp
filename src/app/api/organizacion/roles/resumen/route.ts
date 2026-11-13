/**
 * GET — pestañas de Organización › Equipo (Figma sección 91): qué pestañas de Roles y permisos
 * ve la persona (`verRoles`, `verCargos`), si puede abrir «¿Qué puede hacer?» de otra persona
 * (`verPersonas`) y los contadores de roles y cargos. Las reglas son las de `GET /roles`,
 * `GET /roles/cargos` y `GET /roles/miembros/[id]`; sin permiso no responde 403 sino `false`.
 * La organización sale de la sesión (`withOrg`).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { resumenEquipo } from '@/lib/services/roles/rolesServidor.server';
import { responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/resumen' });
  return responder(() => resumenEquipo(ctx));
});
