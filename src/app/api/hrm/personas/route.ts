/**
 * POST /api/hrm/personas — crea una persona-empleado, con su documento si viene
 * (ADR-001 §2). Exige hr.employees.create, y hr.data.identificacion.edit para
 * el documento; lo comprueba `fn_hr_persona_crear` con el actor de la sesión.
 * La organización sale de la sesión: un body con otra responde 403.
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
