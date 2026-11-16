/**
 * POST /api/hrm/personas — crea una persona-empleado, con su documento si viene
 * (ADR-001 §2). Exige hr.employees.create, y hr.data.identificacion.edit para
 * el documento; lo comprueba `fn_hr_persona_crear` con el actor de la sesión.
 * La organización sale de la sesión: un body con otra responde 403.
 *
 * Revisión 2026-11-15: una persona ya no se crea suelta. `fn_hr_persona_crear`
 * responde 409 `persona_sin_usuario`; el alta va por `POST /api/hrm/empleados/alta`,
 * que crea su usuario de la app y lo invita.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearPersona, type DatosPersonaNueva } from '@/lib/services/hrm/datosSensiblesService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<DatosPersonaNueva>(ctx, req, { route: 'hrm/personas' });
    const r = await crearPersona(ctx, body, contextoDePeticion(req));
    return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'personas:crear');
  }
});
