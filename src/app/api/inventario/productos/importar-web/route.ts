import { analizarPagina, detallarProducto, ErrorWeb, saldoParaWeb } from '@/lib/services/productosWebService';
import { detectarCatalogo, ErrorCatalogo, leerFichasProducto, leerTandaCatalogo } from '@/lib/services/catalogoWebService';
import { puedeImportarProductos } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

// El análisis de un catálogo grande (paginación de Shopify/VTEX o IA por partes) tarda.
export const maxDuration = 180;

/**
 * GET  /api/inventario/productos/importar-web → saldo de créditos y costos (antes de analizar).
 * POST /api/inventario/productos/importar-web
 *   { accion: 'analizar', url }   → productos de la página (cobra si usó IA)
 *   { accion: 'detallar', url }   → ficha completa de un producto (cobra si usó IA)
 *   Catálogo completo por la API pública de la tienda (sin IA, sin costo):
 *   { accion: 'detectar', url, clave? }                     → plataforma, totales y cursor
 *   { accion: 'catalogo', origen, plataforma, cursor, clave? } → una tanda + cursor siguiente
 *   { accion: 'fichas', origen, urls }                      → fichas por JSON-LD (tiendas sin API)
 *   `clave` (solo PrestaShop) se usa en esa llamada y no se guarda ni se registra.
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
  const body = await readOrgBody<{ accion?: string; url?: unknown; origen?: unknown; plataforma?: unknown; cursor?: unknown; clave?: unknown; urls?: unknown }>(ctx, request, {
    route: 'inventario/productos/importar-web',
  });
  if (!(await puedeImportarProductos(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para importar productos');
  try {
    if (body.accion === 'analizar') return Response.json(await analizarPagina(ctx.organizationId, ctx.userId, body.url));
    if (body.accion === 'detallar') return Response.json(await detallarProducto(ctx.organizationId, ctx.userId, body.url));
    if (body.accion === 'detectar') return Response.json(await detectarCatalogo(body.url, body.clave));
    if (body.accion === 'catalogo') return Response.json(await leerTandaCatalogo(body.origen, body.plataforma, body.cursor, body.clave));
    if (body.accion === 'fichas') return Response.json(await leerFichasProducto(body.origen, body.urls));
    return jsonError(400, 'INVALID_ACTION', 'Acción no válida');
  } catch (err) {
    if (err instanceof ErrorWeb || err instanceof ErrorCatalogo) return jsonError(err.status, err.code, err.message);
    // Sin el cuerpo: puede traer la clave del webservice.
    console.error('[importar-web]', body.accion, err instanceof Error ? err.message : err);
    return jsonError(500, 'INTERNAL', 'No se pudo leer la página');
  }
});
