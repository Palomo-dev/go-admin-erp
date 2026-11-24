/**
 * /api/listas-precios/cliente/[customerId] — tarjeta «Lista de precios» de la ficha del cliente.
 *
 * GET — la lista que tiene (uno a uno, por grupo del CRM o «sin lista»), su resumen, el ahorro del
 *       mes y las listas activas para «Cambiar lista».
 * PUT — `{ price_list_id: uuid | null }`: null = «Sin lista» (paga el precio normal). Elegir otra
 *       la asigna uno a uno y gana sobre el grupo; aplica desde la próxima venta.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { esUuid, idDeRuta, listasServidor, responder, respuestaError, sinClavesDeOrganizacion } from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/listas-precios/cliente/[customerId]' });
  const id = await idDeRuta(routeParams, 'customerId');
  if (!id) return respuestaError(ctx, 'no_encontrado');
  return responder(ctx, 'GET /api/listas-precios/cliente/[customerId]', () => listasServidor.infoCliente(ctx, id));
});

const cambioSchema = z.object({ price_list_id: z.string().refine(esUuid).nullable() });

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'PUT /api/listas-precios/cliente/[customerId]' });
  const id = await idDeRuta(routeParams, 'customerId');
  if (!id) return respuestaError(ctx, 'no_encontrado');
  const datos = cambioSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'PUT /api/listas-precios/cliente/[customerId]', () => listasServidor.cambiarListaCliente(ctx, id, datos.data.price_list_id));
});
