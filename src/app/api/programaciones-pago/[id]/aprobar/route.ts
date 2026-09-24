/**
 * POST /api/programaciones-pago/[id]/aprobar — aprueba un pago programado
 * (`fn_aprobar_pago_programado`). Quien lo programó no lo aprueba salvo que sea
 * el único aprobador de la organización (D7; la respuesta trae
 * `aviso: 'unico_aprobador'`). El pago se registra con el pago único y la
 * referencia ORIGINAL; el comentario queda en `decision_comment`.
 *
 * Body `{ comentario? }`. Permiso `finance.approve`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { decisionProgramacionSchema } from '@/lib/services/compras/contrato';
import { aprobarProgramacion } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/programaciones-pago/[id]/aprobar';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const { comentario } = await leerCuerpo(ctx, req, decisionProgramacionSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.approve'], RUTA);
    await exigirDeLaOrg(ctx, 'ap_payment_schedules', id);
    const resultado = await aprobarProgramacion(ctx, id, comentario ?? null);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
