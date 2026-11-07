/**
 * GET /api/integrations/desarrolladores/webhooks — webhooks salientes de la organización con el
 * resultado del último envío real; el secreto de firma solo como `··xxxx`. Administración.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { listarWebhooks } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/webhooks';

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  return responder(RUTA, async () => ({ webhooks: await listarWebhooks(getServiceClient(), ctx.organizationId) }));
}, { admin: true });
