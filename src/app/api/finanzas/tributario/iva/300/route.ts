/**
 * GET /api/finanzas/tributario/iva/300?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — borrador
 * del formulario 300 por casillas oficiales (versión 2, `fn_tributario_borrador_iva_300`).
 * `{ estado: 'pendiente_activar' }` mientras la migración 20261108151000 no esté
 * aplicada; nunca ceros. Es un borrador conciliado con libros: nunca «aprobado
 * fiscalmente» y nada se presenta ante la DIAN.
 *
 * Permiso `finance.view` aquí y otra vez en la RPC. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { esDiaValido } from '@/lib/finanzas/tributario/periodos';
import { respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';
import { leerFormulario300Servidor } from '@/lib/services/tributario/iva300.server';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/finanzas/tributario/iva/300';

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
    const [lectura, puedeClasificar, puedeAprobar] = await Promise.all([
      leerFormulario300Servidor(ctx, desde, hasta),
      hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.CREAR),
      hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.APROBAR),
    ]);
    return NextResponse.json({ ...lectura, puedeClasificar, puedeAprobar }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
