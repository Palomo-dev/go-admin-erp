/**
 * GET /api/finanzas/tributario/centro?corte=YYYY-MM — Centro tributario
 * (Finanzas R4-A, Figma 2335:136794): obligaciones del último periodo cerrado
 * al mes de corte (por defecto, el mes anterior al de hoy en la zona de la
 * organización), derivadas del perfil vigente, con su vencimiento según el
 * calendario oficial cargado (nunca adivinado) y su valor estimado cuando sale
 * de los libros (borrador del IVA) o del reporte de retenciones practicadas.
 *
 * Permiso `finance.view`. Organización de la sesión (otra en la query → 403).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { leerCentro, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/centro';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const corte = new URL(req.url).searchParams.get('corte');
    return NextResponse.json(await leerCentro(ctx, corte), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
