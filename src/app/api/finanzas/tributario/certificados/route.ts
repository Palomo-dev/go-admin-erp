/**
 * GET /api/finanzas/tributario/certificados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD —
 * certificados de retención por tercero (Finanzas R4-A, Figma 2335:138003).
 *
 * No crea nada: cruza las retenciones practicadas del periodo
 * (`fn_reporte_retenciones_practicadas`, el mismo cálculo del reporte) con los
 * certificados ya expedidos (`withholding_certificates`). Expedir sigue siendo
 * `POST /api/proveedores/[id]/certificado-retenciones` y el PDF, el motor de
 * documentos. Permiso `finance.view`. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { esDiaValido } from '@/lib/finanzas/tributario/periodos';
import { leerCertificados, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/certificados';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const params = new URL(req.url).searchParams;
    const desde = params.get('desde') ?? '';
    const hasta = params.get('hasta') ?? '';
    if (!esDiaValido(desde) || !esDiaValido(hasta) || hasta < desde || desde.slice(0, 4) !== hasta.slice(0, 4)) {
      return NextResponse.json({ error: 'periodo_invalido', codigo: 'periodo_invalido' }, { status: 400, headers: SIN_CACHE });
    }
    return NextResponse.json(await leerCertificados(ctx, desde, hasta), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
