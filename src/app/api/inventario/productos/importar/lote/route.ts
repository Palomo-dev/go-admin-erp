import { ErrorLote, importarLote, validarCuerpoLote } from '@/lib/services/productosImportService';
import { puedeImportarProductos } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

// Un lote de 50 filas con imágenes por URL puede tardar; el resto es una sola RPC.
export const maxDuration = 60;

/**
 * POST /api/inventario/productos/importar/lote
 * Body: { modo, branch_id, opciones: { stock_existentes, importar_imagenes, origen, fuente_url? }, filas: FilaRpc[] }
 *
 * Un lote (≤ 200 filas) en UNA RPC transaccional (`fn_importar_productos_lote`)
 * con la sesión del usuario: la RPC comprueba la pertenencia a la organización
 * y que la sucursal sea suya. La organización sale de la sesión; si el body
 * trae otra → 403 y registro. Permiso resuelto en el servidor.
 */
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<unknown>(ctx, request, { route: 'inventario/productos/importar/lote' });
  if (!(await puedeImportarProductos(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para importar productos');
  try {
    const cuerpo = validarCuerpoLote(body);
    const resultado = await importarLote(ctx.supabase, ctx.organizationId, cuerpo);
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof ErrorLote) return jsonError(err.status, err.code, err.message);
    console.error('[importar/lote]', err);
    return jsonError(500, 'INTERNAL', 'No se pudo importar el lote');
  }
});
