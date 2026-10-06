/**
 * GET — cargos de la organización con lo que cada uno SUMA al rol, las personas que lo tienen en
 * su membresía (lo que de verdad da permisos) y los contratos de RR. HH. que no coinciden.
 * Requiere roles.view o hr.positions.edit. Los cargos se crean en RR. HH.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { listarCargos } from '@/lib/services/roles/rolesServidor.server';
import { responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/cargos' });
  return responder(() => listarCargos(ctx));
});
