/**
 * GET /api/hrm/nomina/personas
 *
 * Nombre, cargo y área de cada vínculo para las tablas de nómina. `hr.payroll.view` y,
 * además, el acceso que ya exige la lista de Empleados (`fn_hr_empleados_listar`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { personasNomina } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json({ personas: await personasNomina(ctx, contextoDePeticion(req)) }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:personas');
  }
});
