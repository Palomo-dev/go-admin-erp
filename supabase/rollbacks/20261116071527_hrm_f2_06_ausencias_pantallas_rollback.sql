-- Reversión de 20261116071527_hrm_f2_06_ausencias_pantallas: quita las funciones de las pantallas de
-- Ausencias y devuelve fn_hr_ausencias_equipo a la versión de hrm_f2_05 (el jefe veía «Ausente por
-- incapacidad»). No toca datos: la migración solo creó funciones.
drop function if exists public.fn_hr_ausencia_soporte(uuid, integer, uuid, uuid);
drop function if exists public.fn_hr_ausencia_interrumpir(uuid, integer, uuid, date, text);
drop function if exists public.fn_hr_ausencia_registrar(uuid, integer, jsonb);
drop function if exists public.fn_hr_ausencia_simular(uuid, integer, jsonb);
drop function if exists public.fn_hr_ausencia_ver(uuid, integer, uuid);
drop function if exists public.fn_hr_ausencias_listar(uuid, integer, text, date, date, boolean);
drop function if exists public.fn_hr_ausencia_aprobacion(uuid, integer, uuid);
drop function if exists public.fn_hr_ausencia_regreso(integer, uuid, date);
drop function if exists public.fn_hr_ausencia_seccion(text);

create or replace function public.fn_hr_ausencias_equipo(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_todo boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'desde', x->>'nombre')
      from (
        select jsonb_build_object(
                 'id', l.id, 'employment_id', l.employment_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                 'desde', l.start_date, 'hasta', l.end_date, 'estado', l.status,
                 -- Salud: fuera de quien tiene el grupo en toda la organización y del titular, solo «incapacidad».
                 'tipo', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then null else lt.code end,
                 'clase', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'incapacidad' else lt.legal_class end,
                 'etiqueta', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'Ausente por incapacidad' else lt.name end) as x
          from (select l0.*, public.fn_hr_vinculo_es_del_actor(p_actor, l0.employment_id) as propio from public.leave_requests l0
                 where l0.organization_id = p_org and l0.status in ('requested', 'approved', 'taken')
                   and l0.start_date <= p_hasta and l0.end_date >= p_desde) l
          join public.employments e on e.id = l.employment_id
          join public.leave_types lt on lt.id = l.leave_type_id
         where v_todo or l.propio
            or l.employment_id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))
      ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) to service_role;
