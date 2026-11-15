/**
 * PATCH /api/hrm/personas/[id]/basico — nombres y contacto laboral de la
 * persona (datos básicos). Se editan directo, con auditoría (decisión 6): la
 * RLS exige hr.employees.edit y `hr_people.updated_by` queda con el actor.
 * Identificación, beneficiarios y contactos van por
 * PUT /api/hrm/personas/[id]/datos/identificacion.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, esUuid } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

const CAMPOS = ['first_name', 'second_name', 'last_name', 'second_last_name', 'preferred_name', 'work_email', 'work_phone'] as const;

export const PATCH = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    if (!esUuid(persona)) throw new HrmError(400, 'persona_invalida');
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/basico' });
    const cambio: Record<string, string | null> = {};
    for (const c of CAMPOS) {
      if (b?.[c] === undefined) continue;
      const v = typeof b[c] === 'string' ? (b[c] as string).trim().slice(0, 160) : '';
      cambio[c] = v === '' ? null : v;
    }
    if ('first_name' in cambio && !cambio.first_name) throw new HrmError(422, 'nombre_obligatorio');
    if (cambio.work_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cambio.work_email)) throw new HrmError(422, 'correo_invalido');
    if (Object.keys(cambio).length === 0) throw new HrmError(422, 'sin_campos');
    const { data, error } = await ctx.supabase
      .from('hr_people')
      .update({ ...cambio, updated_by: ctx.userId })
      .eq('id', persona)
      .eq('organization_id', ctx.organizationId)
      .select('id')
      .maybeSingle();
    if (error) throw new HrmError(error.code === '42501' ? 403 : 500, error.code === '42501' ? 'sin_permiso' : 'error_hrm');
    if (!data) throw new HrmError(403, 'sin_permiso');
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'personas:basico');
  }
});
