/**
 * Marcación › PIN y carnés de las personas (plan de Marcación D11, M1).
 * GET ?sede= → personas con su PIN (sin el PIN), carnés y autorización de foto
 *   (hr.attendance.view).
 * POST { accion: 'pin' | 'carne' | 'revocar' | 'desbloquear', … } → hr.attendance.manage.
 *   El PIN nuevo y el código del carné QR se devuelven UNA vez.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { accionCredencial, credenciales } from '@/lib/services/hrm/kioscoGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json(await credenciales(ctx, sedeDeQuery(new URL(req.url).searchParams.get('sede'))), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:credenciales');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/credenciales' });
    return NextResponse.json(await accionCredencial(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:credencial-accion');
  }
});
