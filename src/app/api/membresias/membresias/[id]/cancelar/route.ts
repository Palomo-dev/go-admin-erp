/** POST /api/membresias/membresias/[id]/cancelar — { motivo } obligatorio (DialogoMotivo). Requiere memberships.cancel. */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { cancelarMembresia } from '@/lib/services/membresias/membresias.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

const esquema = z.object({ motivo: z.string().trim().min(3).max(500) });

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'membresia_no_encontrada');
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/membresias/[id]/cancelar' }));
  if (!cuerpo.success) return fallo(400, 'motivo_requerido');
  return responder(() => cancelarMembresia(ctx, id, cuerpo.data.motivo));
});
