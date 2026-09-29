/**
 * POST /api/inventario/distribucion — distribución: varios traslados desde un
 * origen (uno por sucursal destino), con la orden de producción opcional, en
 * una sola transacción (fn_distribucion_crear; `trasladar`). Con `despachar`
 * salen del origen en el mismo paso. Tope: lo disponible en el origen y lo que
 * falta distribuir de la orden. La misma `clave` no crea dos veces.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { crearDistribucionSchema, type ResultadoDistribucion } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, leerCuerpo, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const RUTA = 'POST /api/inventario/distribucion';
  try {
    const datos = await leerCuerpo(ctx, req, crearDistribucionSchema, RUTA);
    const { clave, ...resto } = datos;
    const r = await rpc<ResultadoDistribucion>(ctx, 'fn_distribucion_crear', {
      p_org: ctx.organizationId,
      p_datos: { ...resto, production_order_id: resto.production_order_id ?? null, notas: resto.notas ?? null },
      p_clave: clave,
    });
    return NextResponse.json(r, { status: r.repetido ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
