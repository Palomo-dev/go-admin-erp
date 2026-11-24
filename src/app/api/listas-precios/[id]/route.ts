/**
 * /api/listas-precios/[id]
 *
 * GET    — la lista con sus excepciones, precios fijos (con el precio normal), grupos y KPI del mes.
 * PUT    — guarda la lista completa (cabecera, excepciones y precios fijos) en una transacción.
 * POST   — `{ "accion": "duplicar", "nombre": "…" }`: copia la lista (inactiva, sin clientes).
 * DELETE — borra la lista (las ventas conservan sus precios; su price_list_id queda nulo).
 *
 * Escribir exige pos.listas_precios.gestionar, resuelto en la base (`price_list_*`).
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { datosListaSchema, idDeRuta, listasServidor, responder, respuestaError, sinClavesDeOrganizacion } from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/listas-precios/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  return responder(ctx, 'GET /api/listas-precios/[id]', () => listasServidor.detalle(ctx, id));
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'PUT /api/listas-precios/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const datos = datosListaSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'PUT /api/listas-precios/[id]', () => listasServidor.guardar(ctx, id, datos.data));
});

const accionSchema = z.object({ accion: z.literal('duplicar'), nombre: z.string().trim().min(1).max(120) });

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/listas-precios/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const datos = accionSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'POST /api/listas-precios/[id]', () => listasServidor.duplicar(ctx, id, datos.data.nombre), 201);
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'DELETE /api/listas-precios/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  return responder(ctx, 'DELETE /api/listas-precios/[id]', () => listasServidor.eliminar(ctx, id));
});
