/**
 * /api/integrations/desarrolladores/webhooks — Administración.
 *   GET  → webhooks salientes de la organización con el resultado del último envío real; el
 *          secreto de firma solo como `··xxxx`.
 *   POST → { nombre, url, eventos[] } crea un webhook (HTTPS público, sin credenciales en la URL;
 *          secreto con `crypto.randomBytes`) y devuelve el secreto completo UNA vez.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { crearWebhook, listarWebhooks } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/webhooks';
const esquema = z.object({
  nombre: z.string().min(1).max(80),
  url: z.string().min(8).max(2048),
  eventos: z.array(z.string().max(60)).min(1).max(40),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  return responder(RUTA, async () => ({ webhooks: await listarWebhooks(getServiceClient(), ctx.organizationId) }));
}, { admin: true });

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () => crearWebhook(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, cuerpo.data));
}, { admin: true });
