-- Reversión de 20261117011440_hrm_m0_03_marcacion_pantallas.
-- Aplicar ANTES de revertir 20261117011254_hrm_m0_02 y 20261117010041_hrm_m0_01.
-- Restaura fn_hr_asistencia_hoy de la fase 2 («Cómo» sin el método exacto) y quita
-- las funciones de En vivo, métodos por sede, puntos, pantalla del QR y excepciones.
-- No toca datos.

drop function if exists public.fn_hr_excepciones(uuid, integer, uuid);
drop function if exists public.fn_hr_excepcion_revocar(uuid, integer, uuid);
drop function if exists public.fn_hr_excepcion_crear(uuid, integer, jsonb);
drop function if exists public.fn_hr_pantalla_qr_usos(uuid, integer, uuid, bigint);
drop function if exists public.fn_hr_pantalla_qr(uuid, integer, uuid);
drop function if exists public.fn_hr_dispositivo_activar(uuid, integer, uuid, boolean);
drop function if exists public.fn_hr_dispositivo_regenerar(uuid, integer, uuid);
drop function if exists public.fn_hr_dispositivo_crear(uuid, integer, jsonb);
drop function if exists public.fn_hr_dispositivos(uuid, integer, integer);
drop function if exists public.fn_hr_metodos_sede_guardar(uuid, integer, integer, jsonb);
drop function if exists public.fn_hr_metodos_sede_leer(uuid, integer, integer);
drop function if exists public.fn_hr_marcacion_en_vivo(uuid, integer, integer);

create or replace function public.fn_hr_asistencia_hoy(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_hoy date := public.fn_today_for(p_org, p_branch);
  v_tol numeric;
  v_filas jsonb;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  -- La tolerancia es de la empresa (libre); sin valor vigente, cualquier minuto cuenta como tarde.
  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy);
  exception when others then
    v_tol := 0;
  end;

  with vis as (
    select e.* from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and coalesce(e.status, 'active') = 'active'
  ),
  turno as (
    select distinct on (s.employment_id) s.*, st.name as plantilla
      from public.shift_assignments s
      join vis on vis.id = s.employment_id
      left join public.shift_templates st on st.id = s.shift_template_id
     where s.work_date = v_hoy and not s.is_draft
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     order by s.employment_id, s.is_rest_day, s.start_at
  ),
  ev as (
    select a.employment_id,
           min(a.event_at) filter (where a.event_type = 'check_in') as entrada,
           max(a.event_at) filter (where a.event_type = 'check_out') as salida,
           (array_agg(a.event_type order by a.event_at desc, a.created_at desc))[1] as ultimo,
           (array_agg(a.source order by a.event_at) filter (where a.event_type = 'check_in'))[1] as fuente,
           (array_agg(a.geo is not null order by a.event_at) filter (where a.event_type = 'check_in'))[1] as con_ubicacion,
           bool_or(a.work_mode = 'remoto') as remoto
      from public.attendance_events a
      join vis on vis.id = a.employment_id
     where a.work_date = v_hoy
     group by a.employment_id
  ),
  aus as (
    select distinct on (l.employment_id) l.employment_id, lt.data_group, lt.legal_class, lt.name,
           public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id) as propio
      from public.leave_requests l
      join public.leave_types lt on lt.id = l.leave_type_id
      join vis on vis.id = l.employment_id
     where l.status in ('approved', 'taken') and v_hoy between l.start_date and l.end_date
     order by l.employment_id, l.start_date
  ),
  filas as (
    select vis.id, vis.branch_id, t.employment_id is not null and not t.is_rest_day as con_turno,
           t.plantilla, t.start_at, t.end_at, ev.entrada, ev.salida, ev.ultimo, ev.fuente, ev.con_ubicacion,
           coalesce(ev.remoto, false) as remoto,
           aus.employment_id is not null as ausente, aus.data_group, aus.legal_class, aus.name as ausencia_nombre, aus.propio
      from vis
      left join turno t on t.employment_id = vis.id
      left join ev on ev.employment_id = vis.id
      left join aus on aus.employment_id = vis.id
     where (t.employment_id is not null and not t.is_rest_day) or ev.employment_id is not null or aus.employment_id is not null
  )
  select coalesce(jsonb_agg(
           public.fn_hr_asistencia_persona(f.id) || jsonb_build_object(
             'turno', case when f.con_turno then jsonb_build_object('nombre', f.plantilla, 'inicio', f.start_at, 'fin', f.end_at) end,
             'entrada', f.entrada, 'salida', f.salida,
             'como', case when f.entrada is null then null
                          when f.remoto then 'remoto'
                          when f.fuente = 'qr' then 'qr'
                          when f.fuente = 'manual' then 'manual'
                          when f.con_ubicacion then 'ubicacion'
                          else 'app' end,
             'tarde_minutos', case when f.entrada is not null and f.start_at is not null
                                        and f.entrada > f.start_at + make_interval(mins => v_tol::integer)
                                   then floor(extract(epoch from (f.entrada - f.start_at)) / 60)::integer end,
             'estado', case
                 when f.ausente and f.entrada is null then 'ausencia'
                 when f.ultimo = 'break_start' then 'descanso'
                 when f.entrada is not null and f.ultimo = 'check_out' then 'salio'
                 when f.entrada is not null and f.start_at is not null
                      and f.entrada > f.start_at + make_interval(mins => v_tol::integer) then 'tarde'
                 when f.entrada is not null then 'presente'
                 when f.con_turno and f.start_at <= now() then 'falta'
                 else 'por_llegar' end,
             'remoto', f.remoto,
             -- Salud: el tipo solo con el grupo en toda la organización (o lo propio).
             'ausencia', case when not f.ausente then null
                 when f.data_group = 'salud' and not ((v_amb = 'organizacion' and v_salud) or f.propio)
                   then jsonb_build_object('clase', case when v_amb = 'organizacion' then 'incapacidad' else 'justificada' end)
                 else jsonb_build_object('clase', coalesce(f.legal_class, 'licencia'), 'nombre', f.ausencia_nombre) end)
         ), '[]'::jsonb)
    into v_filas
    from filas f
   where p_branch is null or f.branch_id = p_branch;

  return jsonb_build_object(
    'fecha', v_hoy, 'ahora', now(), 'zona', public.fn_timezone_for(p_org, p_branch), 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'festivo', (select h.name from public.hr_holidays h where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = v_hoy limit 1),
    'tolerancia_minutos', v_tol,
    'filas', v_filas);
end;
$function$;
