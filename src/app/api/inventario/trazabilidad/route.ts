/**
 * GET /api/inventario/trazabilidad?codigo=… — sigue un serial, un lote o un
 * documento (OC-, TR-, AJ-, GAR-, factura o pedido) de principio a fin
 * (`fn_trazabilidad`). `sucursal` acota existencias, ventas y movimientos;
 * `desde`/`limite` paginan las ventas de un lote. Permiso de ver inventario.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { consultaTrazabilidadSchema, type ResultadoTrazabilidad } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/trazabilidad';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = await leerQuery(ctx, req, consultaTrazabilidadSchema, RUTA);
    await exigirVer(ctx, RUTA);
    const resultado = await rpc<ResultadoTrazabilidad>(ctx, 'fn_trazabilidad', {
      p_org: ctx.organizationId,
      p_codigo: q.codigo,
      p_sucursal: q.sucursal ?? null,
      p_desde: q.desde ?? 0,
      p_limite: q.limite ?? 10,
    });
    return NextResponse.json(resultado, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
