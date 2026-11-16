/**
 * POST /api/hrm/estructura/plazas/plan → vista previa de «Solicitar una plaza
 * nueva»: quién la aprueba y, con el permiso de salario, la escala del cargo en
 * la sede (esa lectura queda en el registro). No escribe nada.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { planPlaza } from '@/lib/services/hrm/estructuraService.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/plazas/plan' });
    return NextResponse.json(await planPlaza(ctx, b ?? {}, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:plazas:plan');
  }
});
