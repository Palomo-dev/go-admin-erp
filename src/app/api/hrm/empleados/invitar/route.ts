/**
 * POST /api/hrm/empleados/invitar — { persona_ids: string[], origin } invita al
 * portal del empleado a una o varias personas sin usuario (Figma 20.2, menú de
 * la fila y selección masiva). Exige hr.employees.edit.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { invitarAlPortal } from '@/lib/services/hrm/invitacionPortal.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ persona_ids?: unknown; origin?: unknown }>(ctx, req, { route: 'hrm/empleados/invitar' });
    const origin = resolveSelfOrigin(req, typeof body?.origin === 'string' ? body.origin : '', 'Invitación al portal');
    return NextResponse.json(await invitarAlPortal(ctx, body?.persona_ids, origin, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:invitar');
  }
});
