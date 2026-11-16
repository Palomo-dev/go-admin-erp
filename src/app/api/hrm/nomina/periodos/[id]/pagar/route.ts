/**
 * POST /api/hrm/nomina/periodos/[id]/pagar — { cuenta_bancaria_id, fecha, referencia? }
 *
 * Registra el egreso en Tesorería y marca las colillas pagadas; los asientos los hacen los triggers. `hr.payroll.pay`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { pagar } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/pagar' });
    return NextResponse.json(await pagar(ctx, await parametroDeRuta(rp, 'id'), body ?? {}), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/pagar');
  }
});
