/**
 * GET /api/integrations/conexiones/[id] — detalle: resumen, credenciales SOLO con su máscara
 * (prefijo/últimos 4), «usada por», últimos eventos y la URL de webhook real.
 * Conexión de otra organización → 404 sin distinguir. Permiso `integrations.view`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { detalleConexion } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/[id]';

export const GET = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return responder(RUTA, () => detalleConexion(getServiceClient(), ctx.organizationId, id));
});
