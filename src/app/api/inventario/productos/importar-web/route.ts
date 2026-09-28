import { analizarPagina, detallarProducto, ErrorWeb, saldoParaWeb } from '@/lib/services/productosWebService';
import { puedeImportarProductos } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

// El análisis de un catálogo grande (paginación de Shopify/VTEX o IA por partes) tarda.
export const maxDuration = 180;

/**
 * GET  /api/inventario/productos/importar-web → saldo de créditos y costos (antes de analizar).
 * POST /api/inventario/productos/importar-web
 *   { accion: 'analizar', url }   → productos de la página (cobra si usó IA)
 *   { accion: 'detallar', url }   → ficha completa de un producto (cobra si usó IA)
 *
 * No importa nada: los productos elegidos pasan por la misma importación en
 * servidor que un archivo (`/api/inventario/productos/importar/lote`).
 * Organización de la sesión; permiso resuelto en el servidor.
 */
export const GET = withOrg(async (ctx, request) => {
  readOrgBody(ctx, {}, { route: 'inventario/productos/importar-web', request });
  return Response.json(await saldoParaWeb(ctx.organizationId));
});

export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ accion?: string; url?: unknown }>(ctx, request, { route: 'inventario/productos/importar-web' });
  if (!(await puedeImportarProductos(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para importar productos');
  try {
    if (body.accion === 'analizar') return Response.json(await analizarPagina(ctx.organizationId, ctx.userId, body.url));
    if (body.accion === 'detallar') return Response.json(await detallarProducto(ctx.organizationId, ctx.userId, body.url));
    return jsonError(400, 'INVALID_ACTION', 'Acción no válida');
  } catch (err) {
    if (err instanceof ErrorWeb) return jsonError(err.status, err.code, err.message);
    console.error('[importar-web]', err);
    return jsonError(500, 'INTERNAL', 'No se pudo leer la página');
  }
});
