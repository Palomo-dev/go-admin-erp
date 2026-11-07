/**
 * GET /api/finanzas/tributario/iva?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — borrador
 * del IVA (formulario 300) desde los libros (Finanzas R4-A, Figma 2335:137440).
 * `{ estado: 'pendiente_activar' }` mientras la migración 20261108101000 no esté
 * aplicada; nunca ceros. Es un borrador: nada se presenta ante la DIAN.
 *
 * Permiso `finance.view` aquí y otra vez en la RPC. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { esDiaValido } from '@/lib/finanzas/tributario/periodos';
import { leerBorrador, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/iva';

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
    return NextResponse.json(await leerBorrador(ctx, desde, hasta), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
