/**
 * POST /api/integrations/desarrolladores/webhooks/[id]/probar — envía DE VERDAD un evento `prueba`
 * firmado al endpoint (HTTPS público, sin redirecciones, 8 s máx.) y devuelve el código HTTP.
 * Antes la prueba era simulada (`integrationsService.testWebhookEndpoint`).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { probarWebhookSaliente } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/webhooks/[id]/probar';

export const POST = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return responder(RUTA, () => probarWebhookSaliente(getServiceClient(), ctx.organizationId, id));
}, { admin: true });
