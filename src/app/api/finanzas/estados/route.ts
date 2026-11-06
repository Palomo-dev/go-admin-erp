/**
 * GET /api/finanzas/estados?informe=flujo&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&comparar=1
 * Estados financieros de la organización de la sesión. Permiso `finance.view`
 * aquí y otra vez en cada función de la base.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { ErrorEstados, INFORMES, leerInforme, type IdInforme } from '@/lib/finanzas/estados/fuente.server';
import { rangoDe } from '@/lib/finanzas/estados/fechas';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const params = new URL(req.url).searchParams;
  const informe = params.get('informe') as IdInforme | null;
  const periodo = rangoDe(params.get('desde'), params.get('hasta'));
  if (!informe || !INFORMES.includes(informe) || !periodo) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  try {
    const datos = await leerInforme(ctx, informe, periodo.desde, periodo.hasta, params.get('comparar') === '1');
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof ErrorEstados) {
      return NextResponse.json({ codigo: error.codigo }, { status: error.estado, headers: SIN_CACHE });
    }
    throw error;
  }
});
