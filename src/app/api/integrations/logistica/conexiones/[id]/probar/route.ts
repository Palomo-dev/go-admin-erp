/**
 * POST /api/integrations/logistica/conexiones/[id]/probar — prueba real contra el proveedor.
 * Es el único camino a `connected`. Si el adaptador no está disponible responde ok:false con el
 * motivo (NOT_CONFIGURED) y la conexión sigue en `draft`. Cada prueba queda en integration_events.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { probarConexionLogistica } from '@/lib/services/transporte/conexionesLogistica.server';
import { fallo, idConexion, responder } from '@/lib/services/transporte/respuestaLogistica';

export const dynamic = 'force-dynamic';

const RUTA = '/api/integrations/logistica/conexiones/[id]/probar';

export const POST = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
  const id = await idConexion(routeParams);
  if (!id) return fallo(404, 'CONEXION', 'Conexión no encontrada.');
  return responder(RUTA, () => probarConexionLogistica(getServiceClient(), ctx.organizationId, id));
}, { admin: true });
