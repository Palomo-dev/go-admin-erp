/**
 * POST /api/integrations/desarrolladores/webhooks/[id]/secreto — genera un secreto de firma nuevo
 * (`crypto.randomBytes`); el anterior deja de valer al instante. Se devuelve completo UNA vez.
 * Administración.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { regenerarSecretoWebhook } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/webhooks/[id]/secreto';

export const POST = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return responder(RUTA, () => regenerarSecretoWebhook(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id));
}, { admin: true });
