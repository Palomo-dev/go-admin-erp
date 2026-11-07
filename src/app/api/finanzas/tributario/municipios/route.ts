/**
 * GET /api/finanzas/tributario/municipios?q= — municipios (DIVIPOLA) para el ICA
 * del perfil tributario. Dato público de referencia; igual exige sesión,
 * organización y `finance.view`. Hasta 20 resultados, mínimo 2 letras.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { buscarMunicipios, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/municipios';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const q = new URL(req.url).searchParams.get('q') ?? '';
    return NextResponse.json({ municipios: await buscarMunicipios(ctx, q) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
