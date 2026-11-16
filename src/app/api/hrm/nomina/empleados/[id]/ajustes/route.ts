/**
 * PUT /api/hrm/nomina/empleados/[id]/ajustes — { desde, integral?, procedimiento?, porcentaje_fijo?, dependientes?, ... }
 *
 * Datos de nómina del vínculo con fecha de efecto (salario integral y retención). Grupo salario_pago.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { guardarAjustesEmpleado } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const PUT = withOrg(async (ctx, req, rp) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/empleados/ajustes' });
    return NextResponse.json(await guardarAjustesEmpleado(ctx, await parametroDeRuta(rp, 'id'), body ?? {}, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:empleados/[id]/ajustes');
  }
});
