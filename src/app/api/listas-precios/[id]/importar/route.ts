/**
 * /api/listas-precios/[id]/importar
 *
 * POST `{ filas: [{fila, sku, price, min_qty}], reemplazar, aplicar }` — el archivo (Excel o CSV)
 * se lee en el navegador; la validación (SKU de la organización, precio, cantidad, duplicados) y
 * la escritura son del servidor, en una sola transacción (`price_list_import`). Con
 * `aplicar = false` devuelve la vista previa («45 nuevos · 6 cambian · 1 con error») sin tocar nada.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { idDeRuta, importarSchema, listasServidor, responder, respuestaError, sinClavesDeOrganizacion } from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/listas-precios/[id]/importar' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const datos = importarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'archivo_invalido');
  return responder(ctx, 'POST /api/listas-precios/[id]/importar', () => listasServidor.importar(ctx, id, datos.data));
});
