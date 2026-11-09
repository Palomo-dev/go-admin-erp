/**
 * /api/integrations/desarrolladores/webhooks/[id] — Administración.
 *   PATCH  → { nombre?, url?, eventos?[], activo?: boolean } edita o pausa/reactiva el webhook.
 *   DELETE → borra el webhook.
 * Probar: `POST …/[id]/probar`. Nuevo secreto: `POST …/[id]/secreto`.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { borrarWebhook, editarWebhook } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/webhooks/[id]';
const esquema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  url: z.string().min(8).max(2048).optional(),
  eventos: z.array(z.string().max(60)).min(1).max(40).optional(),
  activo: z.boolean().optional(),
});

export const PATCH = withOrg(async (ctx, request, routeParams) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `PATCH ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return responder(RUTA, async () => ({
    webhook: await editarWebhook(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id, cuerpo.data),
  }));
}, { admin: true });

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `DELETE ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return responder(RUTA, async () => {
    await borrarWebhook(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id);
    return { borrado: true };
  });
}, { admin: true });
