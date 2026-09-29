/**
 * POST /api/inventario/seriales/estado — cambia el estado de uno o varios
 * seriales («Marcar como dañado», volver a stock…) con las transiciones de
 * `fn_producto_serial_cambiar_estado` (que deja el evento en la historia).
 * No mueve stock. Body `{ ids, estado, nota? }`. Permisos de `fn_producto_serial_cambiar_estado`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cambiarEstadoSerialesSchema, type ResultadoCambioEstado } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirCambiarEstado, leerCuerpo, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/inventario/seriales/estado';

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, cambiarEstadoSerialesSchema, RUTA);
    await exigirCambiarEstado(ctx, RUTA);
    const resultado = await rpc<ResultadoCambioEstado>(ctx, 'fn_producto_serial_cambiar_estado', {
      p_organization_id: ctx.organizationId,
      p_serial_ids: cuerpo.ids,
      p_estado: cuerpo.estado,
      p_nota: cuerpo.nota ?? null,
    });
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
