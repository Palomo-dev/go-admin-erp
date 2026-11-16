/**
 * GET /api/hrm/catalogos — listas para el alta y «Registrar un cambio»: sedes,
 * áreas, cargos, centros de costo, posibles jefes y entidades de seguridad
 * social. Con la sesión del usuario (RLS): cada uno ve lo que su rol le deja.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    const org = ctx.organizationId;
    const [sedes, areas, cargos, centros, vinculos, entidades] = await Promise.all([
      ctx.supabase.from('branches').select('id, name, is_main').eq('organization_id', org).eq('is_active', true).order('name'),
      ctx.supabase.from('departments').select('id, name, parent_id, manager_employment_id, cost_center').eq('organization_id', org).eq('is_active', true).order('name'),
      ctx.supabase.from('job_positions').select('id, name, department_id').eq('organization_id', org).eq('is_active', true).order('name'),
      ctx.supabase.from('cost_centers').select('id, code, name, branch_id').eq('organization_id', org).eq('is_active', true).order('code'),
      ctx.supabase
        .from('employments')
        .select('id, person_id, position_id, branch_id, status, hr_people!inner(first_name, second_name, last_name, second_last_name)')
        .eq('organization_id', org)
        .not('status', 'in', '(terminated,retired)')
        .limit(1000),
      ctx.supabase.from('hr_ss_entities').select('id, subsystem, name').eq('is_active', true).order('name'),
    ]);
    const jefes = ((vinculos.data ?? []) as unknown as {
      id: string;
      person_id: string | null;
      position_id: string | null;
      branch_id: number | null;
      hr_people: { first_name: string; second_name: string | null; last_name: string | null; second_last_name: string | null } | null;
    }[])
      .map((v) => ({
        id: v.id,
        persona_id: v.person_id,
        cargo_id: v.position_id,
        sede_id: v.branch_id,
        nombre: [v.hr_people?.first_name, v.hr_people?.second_name, v.hr_people?.last_name, v.hr_people?.second_last_name]
          .filter(Boolean)
          .join(' '),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return NextResponse.json(
      {
        sedes: sedes.data ?? [],
        areas: areas.data ?? [],
        cargos: cargos.data ?? [],
        centros_costo: centros.data ?? [],
        jefes,
        entidades: entidades.data ?? [],
      },
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'catalogos');
  }
});
