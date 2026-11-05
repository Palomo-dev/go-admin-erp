import { ErrorLote, importarLote, validarCuerpoLote } from '@/lib/services/productosImportService';
import { puedeImportarProductos } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { reportarSentryServidor } from '@/lib/monitoring/sentryServidor';

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
 *
 * Un fallo del servidor (500: RPC_ERROR o INTERNAL) se reporta a Sentry desde aquí, con la
 * organización, el bloque (header `x-import-bloque` que manda el asistente) y el código; sin filas
 * ni datos de productos. El asistente ya no reporta esos casos (no se duplican); los 4xx de
 * validación y los cortes de red los sigue reportando él.
 */
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<unknown>(ctx, request, { route: 'inventario/productos/importar/lote' });
  if (!(await puedeImportarProductos(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para importar productos');
  try {
    const cuerpo = validarCuerpoLote(body);
    const resultado = await importarLote(ctx.supabase, ctx.organizationId, cuerpo);
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof ErrorLote && err.status < 500) return jsonError(err.status, err.code, err.message);
    const codigo = err instanceof ErrorLote ? err.code : 'INTERNAL';
    console.error('[importar/lote]', err);
    await reportarSentryServidor({
      error: err,
      tags: {
        area: 'importar_lote',
        organization_id: ctx.organizationId,
        bloque: bloqueDe(request),
        codigo,
        status: 500,
      },
    });
    if (err instanceof ErrorLote) return jsonError(err.status, err.code, err.message);
    return jsonError(500, 'INTERNAL', 'No se pudo importar el lote');
  }
});

/** Número de bloque que manda el asistente (`x-import-bloque`); otro valor → sin bloque. */
function bloqueDe(request: Request): number | null {
  const v = request.headers.get('x-import-bloque');
  return v && /^\d{1,5}$/.test(v) ? Number(v) : null;
}
