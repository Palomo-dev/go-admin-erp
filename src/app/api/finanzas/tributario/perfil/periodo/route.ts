/**
 * GET /api/finanzas/tributario/perfil/periodo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * — vigencias del perfil tributario que tocan el periodo (P8 del Contador). Lo
 * usa el borrador del IVA para señalar «cambio de vigencia dentro del período —
 * revisar procedencia» sin decidir solo cuál aplica.
 *
 * Permiso `finance.view`. Organización de la sesión (otra en la query → 403).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { esDiaValido } from '@/lib/finanzas/tributario/periodos';
import { leerVigenciasDelPeriodo, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/perfil/periodo';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const params = new URL(req.url).searchParams;
    const desde = params.get('desde') ?? '';
    const hasta = params.get('hasta') ?? '';
    if (!esDiaValido(desde) || !esDiaValido(hasta) || hasta < desde) {
      return NextResponse.json({ error: 'periodo_invalido', codigo: 'periodo_invalido' }, { status: 400, headers: SIN_CACHE });
    }
    return NextResponse.json(await leerVigenciasDelPeriodo(ctx, desde, hasta), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
