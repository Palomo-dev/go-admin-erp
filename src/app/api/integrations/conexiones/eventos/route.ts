/**
 * GET /api/integrations/conexiones/eventos?conexion=<uuid>&errores=1&desde=<iso>&limite=100
 * Actividad (`integration_events`) de las conexiones de la organización de la sesión; sin payload
 * (solo tipo, sentido, estado, error y referencia de negocio). Permiso `integrations.view`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { listarEventos } from '@/lib/services/integrations/conexiones/conexiones.server';
import { responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/eventos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const q = new URL(request.url).searchParams;
  const conexion = q.get('conexion');
  const desde = q.get('desde');
  return responder(RUTA, () =>
    listarEventos(getServiceClient(), ctx.organizationId, {
      conexionId: conexion && UUID.test(conexion) ? conexion : null,
      soloErrores: q.get('errores') === '1',
      desde: desde && !Number.isNaN(Date.parse(desde)) ? new Date(desde).toISOString() : null,
      limite: Number(q.get('limite') ?? 100) || 100,
    }),
  );
});
