/**
 * POST /api/hrm/nomina/periodos — { tipo, frecuencia, desde, hasta, fecha_pago?, nombre? }
 *
 * Crea un período de nómina (ordinaria, prima o cesantías). `hr.payroll.process`; lo valida la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { crearPeriodo } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/periodos' });
    return NextResponse.json(await crearPeriodo(ctx, body ?? {}), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos');
  }
});
