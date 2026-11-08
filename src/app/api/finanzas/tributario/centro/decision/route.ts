/**
 * POST /api/finanzas/tributario/centro/decision — cierra la alerta «cambio de
 * vigencia dentro del período» con una decisión sustentada (P8 del Contador,
 * ronda 2): decisión, fundamento, alcance y, si se identificó, la vigencia que
 * aplica. Queda quién y cuándo; nunca se edita ni se borra. Si después cambian
 * las vigencias del período, la alerta se reabre sola.
 *
 * Permiso `finance.approve` (o administrador) aquí y otra vez en la RPC.
 * Organización de la sesión (otra en el cuerpo → 403). Cuerpo por lista blanca.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { validarSolicitudDecision } from '@/lib/finanzas/tributario/vigenciasPeriodo';
import { registrarDecisionPeriodo, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/finanzas/tributario/centro/decision';

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    const s = validarSolicitudDecision(cuerpo);
    if (!s) return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
    return NextResponse.json(await registrarDecisionPeriodo(ctx, s), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
