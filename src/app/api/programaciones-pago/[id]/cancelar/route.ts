/**
 * POST /api/programaciones-pago/[id]/cancelar — retira un pago programado
 * pendiente (`fn_cancelar_pago_programado`): quien lo pidió con
 * `finance.create`, u otra persona con `finance.approve` (la base lo comprueba).
 *
 * Body `{ comentario? }`. Permiso mínimo `finance.create`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { decisionProgramacionSchema } from '@/lib/services/compras/contrato';
import { cancelarProgramacion } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/programaciones-pago/[id]/cancelar';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const { comentario } = await leerCuerpo(ctx, req, decisionProgramacionSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'ap_payment_schedules', id);
    await cancelarProgramacion(ctx, id, comentario ?? null);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
