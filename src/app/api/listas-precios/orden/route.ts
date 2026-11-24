/**
 * /api/listas-precios/orden
 *
 * POST `{ ids: [...] }` — nuevo orden de las listas (arrastrando en el listado). Cuando un cliente
 * está en dos grupos con lista, gana la que está primero (decisión 2 del dueño).
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { esUuid, listasServidor, responder, respuestaError, sinClavesDeOrganizacion } from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

const ordenSchema = z.object({ ids: z.array(z.string().refine(esUuid)).min(1).max(500) });

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/listas-precios/orden' });
  const datos = ordenSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'POST /api/listas-precios/orden', () => listasServidor.ordenar(ctx, datos.data.ids));
});
