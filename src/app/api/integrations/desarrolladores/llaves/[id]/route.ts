/** DELETE /api/integrations/desarrolladores/llaves/[id] — revoca la llave (no la borra). Administración. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { revocarLlave } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/llaves/[id]';

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `DELETE ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
  return responder(RUTA, async () => {
    await revocarLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId, memberId: ctx.memberId }, id);
    return { revocada: true };
  });
}, { admin: true });
