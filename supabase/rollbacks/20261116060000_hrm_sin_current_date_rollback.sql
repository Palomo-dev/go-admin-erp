-- Reversión de 20261116060000_hrm_sin_current_date: vuelve a los cuerpos anteriores
-- (con CURRENT_DATE como prefiltro/respaldo).

create or replace function public.fn_hr_aplicar_eventos_vigentes()
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  n integer := 0;
begin
  for r in select ev.id from public.hr_employment_events ev
            where ev.status = 'aprobado' and ev.applied_at is null
              and ev.effective_from <= current_date + 1
            order by ev.effective_from, ev.approved_at loop
    if public.fn_hr_aplicar_evento(r.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$function$;

create or replace function public.fn_hr_detectar_ausencias(p_fecha date default null::date)
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_id uuid;
  n integer := 0;
begin
  for r in
    select s.id, s.organization_id, s.employment_id, s.work_date, s.planned_minutes
      from public.shift_assignments s
      join public.employments e on e.id = s.employment_id and e.status = 'active'
     where (case when p_fecha is null
                 then s.work_date between current_date - 2 and current_date
                      and s.work_date = public.fn_today_for(s.organization_id, s.branch_id) - 1
                 else s.work_date = p_fecha end)
       and not s.is_draft and not s.is_rest_day
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
       and not exists (select 1 from public.attendance_events a where a.employment_id = s.employment_id and a.work_date = s.work_date)
       and not exists (select 1 from public.leave_requests l
                        where l.employment_id = s.employment_id and l.status in ('requested', 'approved', 'taken')
                          and s.work_date between l.start_date and l.end_date)
       and not exists (select 1 from public.hr_attendance_novelties x
                        where x.employment_id = s.employment_id and x.work_date = s.work_date
                          and x.kind = 'ausencia' and x.status <> 'anulada')
       and not ('sin_marcacion' = any ((public.fn_hr_ajustes_asistencia(s.employment_id)).mecanismos))
  loop
    insert into public.hr_attendance_novelties (organization_id, employment_id, work_date, kind, minutes, origin, requested_by, detail)
    values (r.organization_id, r.employment_id, r.work_date, 'ausencia', r.planned_minutes, 'automatica',
            public.fn_hr_usuario_de_empleo(r.employment_id), jsonb_build_object('asignacion_id', r.id))
    returning id into v_id;
    perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
create or replace function public.fn_hr_cargo_salario_a_escala()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_min numeric := new.min_salary;
  v_max numeric := new.max_salary;
  v_dia date;
begin
  if v_min is null and v_max is null then
    return null;
  end if;
  -- Día de hoy en la zona de la organización. Nunca bloquea: al crear una organización
  -- (fn_create_default_org_structure) puede no existir aún el miembro que pide fn_timezone_for.
  begin
    v_dia := public.fn_today_for_org(new.organization_id);
  exception when others then
    v_dia := current_date;
  end;
  v_min := coalesce(v_min, v_max);
  v_max := coalesce(v_max, v_min);
  if v_min > 0 and v_min <= v_max
     and not exists (select 1 from public.hr_position_salary_scales s
                      where s.position_id = new.id and s.branch_id is null and s.effective_to is null) then
    insert into public.hr_position_salary_scales
      (organization_id, position_id, branch_id, min_amount, mid_amount, max_amount, effective_from, reason)
    values
      (new.organization_id, new.id, null, v_min, round((v_min + v_max) / 2, 2), v_max,
       v_dia, 'Escala inicial del cargo');
  end if;
  update public.job_positions set min_salary = null, max_salary = null where id = new.id;
  return null;
end;
$$;

revoke execute on function public.fn_hr_cargo_salario_a_escala() from public, anon, authenticated;
