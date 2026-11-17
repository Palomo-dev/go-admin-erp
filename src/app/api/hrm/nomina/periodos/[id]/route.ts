/**
 * GET    /api/hrm/nomina/periodos/[id]
 * DELETE /api/hrm/nomina/periodos/[id] — solo un período abierto que nunca se calculó (Figma 20.16.5).
 *
 * Período con sus versiones de cálculo, colillas, ítems y novedades. `hr.payroll.view`;
 * cada colilla leída queda en el registro de accesos (grupo salario_pago).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { leerPeriodo } from '@/lib/services/hrm/nomina/nominaService.server';
import { eliminarPeriodo } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, rp) => {
  try {
    return NextResponse.json(await leerPeriodo(ctx, await parametroDeRuta(rp, 'id'), contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]');
  }
});

export const DELETE = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/periodos/eliminar' });
    return NextResponse.json(await eliminarPeriodo(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]:delete');
  }
});
