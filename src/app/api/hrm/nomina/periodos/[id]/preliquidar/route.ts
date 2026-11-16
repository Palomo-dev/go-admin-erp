/**
 * POST /api/hrm/nomina/periodos/[id]/preliquidar
 *
 * Corre el motor (ADR-003 §3) y guarda una versión inmutable e idempotente. Con la
 * nómina apagada (`hr_payroll_enabled`) solo se puede llegar hasta aquí.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { preliquidar } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/preliquidar' });
    return NextResponse.json(await preliquidar(ctx, await parametroDeRuta(rp, 'id'), contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/preliquidar');
  }
});
