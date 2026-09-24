import { contextoImportacion } from '@/lib/services/productosImportService';
import { puedeImportarProductos } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

/**
 * POST /api/inventario/productos/importar/contexto
 * Body: { skus: string[], nombres?: string[] }
 *
 * Lo que el asistente necesita para validar fila a fila antes de importar:
 * qué SKU ya existen (para decidir crear / actualizar / omitir), coincidencias
 * por nombre (solo la importación web), categorías e impuestos de la
 * organización. La organización es la de la sesión; se lee con RLS.
 */
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ skus?: unknown; nombres?: unknown }>(ctx, request, { route: 'inventario/productos/importar/contexto' });
  if (!(await puedeImportarProductos(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para importar productos');
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
  try {
    const contexto = await contextoImportacion(ctx.supabase, ctx.organizationId, { skus: lista(body.skus, 20000), nombres: lista(body.nombres, 5000) });
    return Response.json(contexto);
  } catch (err) {
    console.error('[importar/contexto]', err);
    return jsonError(500, 'INTERNAL', 'No se pudo preparar la validación');
  }
});
