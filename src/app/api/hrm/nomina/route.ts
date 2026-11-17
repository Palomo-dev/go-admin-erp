/**
 * GET /api/hrm/nomina
 *
 * Períodos de nómina, estado de la bandera `hr_payroll_enabled` y permisos de quien
 * consulta (Figma 20.16, 20.20, 20.25). `hr.payroll.view`; lo resuelve la base.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { resumenNomina } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await resumenNomina(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina');
  }
});
