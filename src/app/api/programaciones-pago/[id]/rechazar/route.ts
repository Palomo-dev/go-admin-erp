/**
 * POST /api/programaciones-pago/[id]/rechazar — rechaza un pago programado con
 * motivo (`fn_rechazar_pago_programado`). Un rechazo no crea pago y ya no
 * bloquea la anulación de la factura.
 *
 * Body `{ comentario }` (3–500). Permiso `finance.approve`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { rechazoProgramacionSchema } from '@/lib/services/compras/contrato';
import { rechazarProgramacion } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/programaciones-pago/[id]/rechazar';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const { comentario } = await leerCuerpo(ctx, req, rechazoProgramacionSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.approve'], RUTA);
    await exigirDeLaOrg(ctx, 'ap_payment_schedules', id);
    await rechazarProgramacion(ctx, id, comentario);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
