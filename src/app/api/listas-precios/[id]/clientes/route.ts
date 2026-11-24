/**
 * /api/listas-precios/[id]/clientes
 *
 * GET    — clientes de la lista (uno a uno y por grupo del CRM), paginados: `?q=&pagina=&tamano=`.
 *          `?candidatos=clientes&q=` para «Agregar clientes» y `?candidatos=grupos` para la pestaña
 *          «Grupo del CRM» (cada uno con la lista que tiene hoy).
 * POST   — `{ customer_ids: [...] }` (uno a uno: gana sobre el grupo) o `{ segment_id }` (grupo).
 * DELETE — `{ customer_id }` o `{ segment_id }`. Quitar a un cliente que sigue en un grupo con lista
 *          lo deja «sin lista» (paga el precio normal); no lo saca del grupo del CRM.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  asignarSchema,
  idDeRuta,
  listasServidor,
  quitarSchema,
  responder,
  respuestaError,
  sinClavesDeOrganizacion,
} from '@/lib/listasPrecios/listasPrecios.server';

export const dynamic = 'force-dynamic';

const entero = (v: string | null, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : def;
};

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/listas-precios/[id]/clientes' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const params = new URL(req.url).searchParams;
  const q = params.get('q')?.trim().slice(0, 120) || null;
  const candidatos = params.get('candidatos');
  if (candidatos === 'clientes') {
    return responder(ctx, 'GET candidatos clientes', () => listasServidor.candidatosClientes(ctx, id, q));
  }
  if (candidatos === 'grupos') {
    return responder(ctx, 'GET candidatos grupos', () => listasServidor.candidatosGrupos(ctx, id));
  }
  const tamano = entero(params.get('tamano'), 20, 1, 100);
  const pagina = entero(params.get('pagina'), 1, 1, 100_000);
  return responder(ctx, 'GET /api/listas-precios/[id]/clientes', () => listasServidor.clientes(ctx, id, q, tamano, (pagina - 1) * tamano));
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/listas-precios/[id]/clientes' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const datos = asignarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'POST /api/listas-precios/[id]/clientes', () => listasServidor.asignar(ctx, id, datos.data));
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'DELETE /api/listas-precios/[id]/clientes' });
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaError(ctx, 'no_encontrada');
  const datos = quitarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!datos.success) return respuestaError(ctx, 'datos_invalidos');
  return responder(ctx, 'DELETE /api/listas-precios/[id]/clientes', () => listasServidor.quitar(ctx, id, datos.data));
});
