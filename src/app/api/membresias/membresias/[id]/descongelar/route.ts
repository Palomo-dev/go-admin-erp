/** POST /api/membresias/membresias/[id]/descongelar — termina (o cancela si es programado) el congelamiento. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { descongelarMembresia } from '@/lib/services/membresias/membresias.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'membresia_no_encontrada');
  await readOrgBody(ctx, req, { route: 'POST /api/membresias/membresias/[id]/descongelar' });
  return responder(() => descongelarMembresia(ctx, id));
});
