/**
 * POST { miembroIds } — asigna el rol a varias personas de ESTA organización (roles.assign) con
 * `fn_rol_asignar_miembros`: todo o nada. Si una no se puede cambiar (uno mismo, el dueño, un
 * super admin), no cambia ninguna y `detalle` dice cuál.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { asignarRol } from '@/lib/services/roles/rolesServidor.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

const esquema = z.object({ miembroIds: z.array(z.number().int().positive()).min(1).max(500) });

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/organizacion/roles/[id]/miembros' }));
  if (!id) return fallo(404, 'no_encontrado');
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => asignarRol(ctx, id, cuerpo.data.miembroIds));
});
