/**
 * GET /api/hrm/personas/[id]/ficha — ficha única del empleado (Figma 20.3):
 * datos básicos, vínculo, jefe, laboral vigente, afiliaciones, historial (el
 * salario sin valores), alertas, expediente, certificaciones y qué puede hacer
 * el usuario de la sesión. Los grupos sensibles van por sus propias rutas.
 *
 * Enlaces viejos (`/app/hrm/empleados/<id del vínculo>`: timeline, cargos,
 * áreas): si el id no es una persona pero sí un vínculo de la organización, se
 * responde la ficha de su persona y la pantalla corrige la URL.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { leerFicha } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, esUuid } from '@/lib/services/hrm/tipos';
import { getServiceClient } from '@/lib/supabase/server-service';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    try {
      return NextResponse.json(await leerFicha(ctx, id), { headers: SIN_CACHE });
    } catch (err) {
      if (!(err instanceof HrmError) || err.status !== 404 || !esUuid(id)) throw err;
      const { data } = await getServiceClient()
        .from('employments')
        .select('person_id')
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (!data?.person_id) throw err;
      return NextResponse.json(await leerFicha(ctx, data.person_id as string), { headers: SIN_CACHE });
    }
  } catch (err) {
    return responderError(err, 'ficha:leer');
  }
});
