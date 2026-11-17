/**
 * GET /api/hrm/nomina/cuentas-bancarias
 *
 * Cuentas bancarias activas para pagar la nómina (Figma 20.22). `hr.payroll.pay`; solo
 * salen los cuatro últimos dígitos.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { cuentasBancariasNomina } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await cuentasBancariasNomina(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:cuentas-bancarias');
  }
});
