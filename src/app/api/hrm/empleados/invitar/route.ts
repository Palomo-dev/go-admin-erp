/**
 * POST /api/hrm/empleados/invitar — { persona_ids: string[], origin } reenvía la
 * invitación del alta a una o varias personas que todavía no entran a la app
 * (invitación pendiente o vencida; Figma 20.2 menú de la fila y selección
 * masiva, 20.3 cabecera de la ficha). Rota el código: el enlace anterior deja
 * de servir. Exige hr.employees.edit.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { reenviarInvitaciones } from '@/lib/services/hrm/invitacionPortal.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ persona_ids?: unknown; origin?: unknown }>(ctx, req, { route: 'hrm/empleados/invitar' });
    const origin = resolveSelfOrigin(req, typeof body?.origin === 'string' ? body.origin : '', 'Reenviar invitación');
    return NextResponse.json(await reenviarInvitaciones(ctx, body?.persona_ids, origin), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:invitar');
  }
});
