/**
 * /api/listas-precios
 *
 * GET  — listas de la organización con su estado, clientes, productos y los KPI de la pantalla
 *        (`price_lists_overview`). Miembro activo.
 * POST — crea una lista con sus excepciones y precios fijos en una transacción
 *        (`price_list_save`). Permiso pos.listas_precios.gestionar (resuelto en la base).
 *
 * La organización sale de la sesión; una organización ajena en la query o el cuerpo → 403.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { datosListaSchema, listasServidor, responder, respuestaError, sinClavesDeOrganizacion } from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/listas-precios' });
  return responder(ctx, 'GET /api/listas-precios', () => listasServidor.resumen(ctx));
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/listas-precios' });
  const datos = datosListaSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'POST /api/listas-precios', () => listasServidor.guardar(ctx, null, datos.data), 201);
});
