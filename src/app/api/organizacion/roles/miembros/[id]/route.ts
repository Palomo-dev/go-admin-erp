/**
 * GET — «¿Qué puede hacer esta persona?»: sus permisos efectivos calculados por la base con
 * `get_user_permission_codes` (rol + cargo, precedencia del cargo) o «acceso total» por admin,
 * el origen de cada uno (rol / cargo / admin) y su alcance por sucursal. Requiere users.view o
 * ser la propia persona; la base vuelve a exigirlo.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { quePuedeHacer } from '@/lib/services/roles/rolesServidor.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/miembros/[id]' });
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'no_encontrado');
  return responder(() => quePuedeHacer(ctx, id));
});
