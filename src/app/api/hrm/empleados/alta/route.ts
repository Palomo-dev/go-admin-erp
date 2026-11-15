/**
 * POST /api/hrm/empleados/alta — crea un empleado (o registra el reingreso de
 * una persona retirada con `persona_id`) en una sola transacción
 * (`fn_hr_alta_empleado`): persona, identificación, vínculo, salario inicial
 * (solo con permiso de salario) y seguridad social. Sin permiso de salario
 * queda una tarea a quien lo tiene. Con `invitar: true` manda además la
 * invitación al portal del empleado.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { altaEmpleado } from '@/lib/services/hrm/personasService.server';
import { invitarAlPortal } from '@/lib/services/hrm/invitacionPortal.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/empleados/alta' });
    const peticion = contextoDePeticion(req);
    const r = await altaEmpleado(ctx, body ?? {}, peticion);
    let invitacion: string | null = null;
    if (body?.invitar === true) {
      try {
        const origin = resolveSelfOrigin(req, typeof body.origin === 'string' ? body.origin : '', 'Invitación al portal');
        const inv = await invitarAlPortal(ctx, [r.persona_id], origin, peticion);
        invitacion = inv.resultados[0]?.resultado ?? null;
      } catch {
        invitacion = 'error';
      }
    }
    return NextResponse.json({ ...r, invitacion }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:alta');
  }
});
