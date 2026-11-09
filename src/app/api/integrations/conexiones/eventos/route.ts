/**
 * GET /api/integrations/conexiones/eventos
 *   ?conexion=<uuid>&errores=1&estado=received|processed|error&sentido=inbound|outbound&webhooks=1&pruebas=1
 *   &desde=<iso>&hasta=<iso>&q=<texto>&pagina=1&tamano=50   (o `limite=` sin paginar, como antes)
 * Actividad (`integration_events`) de las conexiones de la organización de la sesión; sin payload
 * (solo tipo, sentido, estado, error y referencia de negocio). Devuelve `total` para paginar.
 * Permiso `integrations.view`.
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

const fechaIso = (v: string | null): string | null => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const entero = (v: string | null): number | undefined => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
};

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const q = new URL(request.url).searchParams;
  const conexion = q.get('conexion');
  const sentido = q.get('sentido');
  return responder(RUTA, () =>
    listarEventos(getServiceClient(), ctx.organizationId, {
      conexionId: conexion && UUID.test(conexion) ? conexion : null,
      soloErrores: q.get('errores') === '1',
      estado: q.get('estado'),
      sentido: sentido === 'inbound' || sentido === 'outbound' ? sentido : null,
      soloWebhooks: q.get('webhooks') === '1',
      soloPruebas: q.get('pruebas') === '1',
      desde: fechaIso(q.get('desde')),
      hasta: fechaIso(q.get('hasta')),
      texto: q.get('q'),
      pagina: entero(q.get('pagina')),
      tamano: entero(q.get('tamano')),
      limite: entero(q.get('limite')) ?? 100,
    }),
  );
});
