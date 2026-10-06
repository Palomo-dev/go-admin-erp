/**
 * GET — personas activas de la organización con su rol y su cargo, para asignar un rol o abrir
 * «¿Qué puede hacer esta persona?». Requiere roles.assign o users.view.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { listarMiembros } from '@/lib/services/roles/rolesServidor.server';
import { responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/miembros' });
  return responder(() => listarMiembros(ctx));
});
