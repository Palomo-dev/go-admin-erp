/**
 * GET /api/integrations/logistica/conexiones/[id] → formulario y estado de la conexión: esquema de
 * campos, ajustes no secretos, secretos guardados (solo prefijo y fecha), faltantes y última prueba.
 * Conexión de otra organización: 404.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { estadoConexionLogistica } from '@/lib/services/transporte/conexionesLogistica.server';
import { fallo, idConexion, responder } from '@/lib/services/transporte/respuestaLogistica';

export const dynamic = 'force-dynamic';

const RUTA = '/api/integrations/logistica/conexiones/[id]';

export const GET = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  const id = await idConexion(routeParams);
  if (!id) return fallo(404, 'CONEXION', 'Conexión no encontrada.');
  return responder(RUTA, () => estadoConexionLogistica(getServiceClient(), ctx.organizationId, id));
}, { admin: true });
