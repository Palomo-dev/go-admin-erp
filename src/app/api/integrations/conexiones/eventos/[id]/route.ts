/**
 * GET /api/integrations/conexiones/eventos/[id] — un evento con su cuerpo completo (lo que
 * mostraba la página vieja de detalle de Eventos). Evento de una conexión de otra organización
 * → 404 sin distinguir. Permiso `integrations.view`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { detalleEvento } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/eventos/[id]';

export const GET = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADO', 'Evento no encontrado.');
  return responder(RUTA, () => detalleEvento(getServiceClient(), ctx.organizationId, id));
});
