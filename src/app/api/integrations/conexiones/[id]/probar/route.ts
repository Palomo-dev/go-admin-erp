/**
 * POST /api/integrations/conexiones/[id]/probar — prueba REAL contra el proveedor (lee las llaves
 * en sus dos formas: en claro o en la bóveda). Deja un evento y la hora de la prueba; nunca cambia
 * el estado de la conexión. Proveedor sin prueba automática → `resultado: 'sin_prueba'`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { probarConexion } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/[id]/probar';

export const POST = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return responder(RUTA, () => probarConexion(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id));
}, { admin: true });
