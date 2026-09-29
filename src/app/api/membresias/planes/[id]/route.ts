/** GET /api/membresias/planes/[id] — detalle del plan ligado a su producto (B2). Otra organización → 404. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { detallePlan, exigir } from '@/lib/services/membresias/membresias.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/planes/[id]' });
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'membresia_no_encontrada');
  return responder(async () => {
    await exigir(ctx, 'ver');
    return detallePlan(ctx, id);
  });
});
