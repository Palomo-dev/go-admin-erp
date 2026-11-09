/**
 * DELETE /api/integrations/desarrolladores/llaves/[id]/borrar — borra la fila de la llave (la
 * página vieja lo ofrecía además de «Revocar»). Solo de la organización de la sesión. Administración.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { borrarLlave } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/llaves/[id]/borrar';

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `DELETE ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
  return responder(RUTA, async () => {
    await borrarLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id);
    return { borrada: true };
  });
}, { admin: true });
