/**
 * POST /api/hrm/empleados/alta — crea un empleado (o registra el reingreso de
 * una persona retirada con `persona_id`). Cada empleado nuevo nace con su
 * usuario de la app (revisión 2026-11-15): exige el correo de la invitación,
 * comprueba el cupo de usuarios del plan y crea en una transacción
 * (`fn_hr_alta_empleado`) el miembro inactivo, la persona, la identificación,
 * el vínculo, el salario inicial (solo con permiso de salario), la seguridad
 * social y la invitación pendiente. Luego manda el correo de la invitación.
 * Sin cupo responde 409 `sin_cupo`. Ver `altaConUsuario`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { altaConUsuario } from '@/lib/services/hrm/invitacionPortal.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/empleados/alta' });
    const origin = resolveSelfOrigin(req, typeof body?.origin === 'string' ? body.origin : '', 'Alta de empleado');
    const r = await altaConUsuario(ctx, body ?? {}, origin, contextoDePeticion(req));
    return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:alta');
  }
});
