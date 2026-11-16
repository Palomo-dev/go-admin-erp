-- Reversión de 20261116071722_hrm_f2_06_asistencia_novedades_vistas: quita las lecturas de
-- Asistencia y Novedades, el ajuste de marca con aprobación y el job, y devuelve
-- fn_hr_aprobacion_al_cerrar y fn_hr_jornada_lista_nomina a sus cuerpos anteriores.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-aplicar-ajustes') then
    perform cron.unschedule('hrm-aplicar-ajustes');
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
  v_nov public.hr_attendance_novelties;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  v_estado := case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end;
  select s.decided_by into v_ultimo from public.hr_approval_steps s
   where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
   order by s.step_order desc limit 1;
  if v_inst.subject_table = 'hr_employment_events' then
    -- Todos los eventos de la solicitud (cargo + salario enlazados): juntos.
    update public.hr_employment_events ev
       set status = v_estado,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      for v_ev in select ev.id from public.hr_employment_events ev where ev.approval_instance_id = p_inst order by ev.created_at loop
        perform public.fn_hr_aplicar_evento(v_ev);
      end loop;
    end if;
  elsif v_inst.subject_table = 'hr_bank_account_requests' then
    update public.hr_bank_account_requests set status = v_estado
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_banco_aplicar_solicitud(v_inst.subject_id);
    end if;
  elsif v_inst.subject_table = 'hr_attendance_novelties' then
    -- ADR-002 §4: horas extra se pagan; tardanza, salida o ausencia quedan justificadas; el cambio de turno se aplica.
    update public.hr_attendance_novelties n
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where n.id = v_inst.subject_id and n.approval_instance_id = p_inst and n.status = 'pendiente'
     returning * into v_nov;
    if v_nov.id is not null and v_nov.kind = 'cambio_turno' and v_inst.status = 'aprobada' then
      perform public.fn_hr_cambio_turno_aplicar(v_nov.id, v_ultimo);
    end if;
  elsif v_inst.subject_table = 'leave_requests' then
    -- ADR-002 §5 y §6: vacaciones, licencias e incapacidades.
    update public.leave_requests
       set status = case v_inst.status when 'aprobada' then 'approved' when 'rechazada' then 'rejected' else 'cancelled' end,
           reviewed_by = v_ultimo, reviewed_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'requested';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_jornada_lista_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date, p_employments uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.timesheets;
  v_listas integer := 0;
  v_pend jsonb := '[]'::jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido: el rango va de 1 a 63 días' using errcode = '22023';
  end if;
  for r in
    select t.* from public.timesheets t
     where t.organization_id = p_org and t.work_date between p_desde and p_hasta
       and t.status in ('open', 'submitted')
       and (p_employments is null or t.employment_id = any (p_employments))
     order by t.work_date
     for update
  loop
    if coalesce((r.metadata->>'marcacion_abierta')::boolean, false) then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'marcacion_abierta');
    elsif r.classified_version is distinct from r.input_version then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'sin_clasificar');
    elsif exists (select 1 from public.hr_attendance_novelties x
                   where x.timesheet_id = r.id and x.status in ('pendiente', 'esperando_contraparte')) then
      v_pend := v_pend || jsonb_build_object('timesheet_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date, 'motivo', 'novedades_pendientes');
    else
      update public.timesheets
         set status = 'approved', approved_by = p_actor, approved_at = now(),
             payroll_ready_at = now(), payroll_ready_by = p_actor, updated_at = now()
       where id = r.id;
      v_listas := v_listas + 1;
    end if;
  end loop;
  return jsonb_build_object('listas', v_listas, 'pendientes', v_pend);
end;
$function$;

drop function if exists public.fn_hr_ajustes_aplicar_pendientes();
drop function if exists public.fn_hr_ajustes_aplicar(uuid, integer);
drop function if exists public.fn_hr_ajustes_aplicar_interno(integer);
drop function if exists public.fn_hr_ajuste_solicitar(uuid, integer, jsonb);
drop function if exists public.fn_hr_ajuste_aprobador(uuid, integer, uuid);
drop function if exists public.fn_hr_asistencia_novedades(uuid, integer, date, date, integer);
drop function if exists public.fn_hr_actor_decide_instancia(uuid, uuid);
drop function if exists public.fn_hr_asistencia_topes(uuid, integer, date, date, integer);
drop function if exists public.fn_hr_asistencia_hoja(uuid, integer, uuid, date, date);
drop function if exists public.fn_hr_asistencia_hojas(uuid, integer, date, date, integer);
drop function if exists public.fn_hr_asistencia_hoy(uuid, integer, integer);
drop function if exists public.fn_hr_asistencia_persona(uuid);
drop function if exists public.fn_hr_asistencia_vinculos(uuid, integer);
drop function if exists public.fn_hr_asistencia_ambito(uuid, integer);

-- Columnas nuevas de timesheet_adjustments (la tabla estaba vacía al agregarlas).
drop index if exists public.timesheet_adjustments_aplicar_idx;
drop index if exists public.timesheet_adjustments_timesheet_idx;
alter table public.timesheet_adjustments
  drop constraint if exists timesheet_adjustments_note_chk,
  drop constraint if exists timesheet_adjustments_event_type_chk,
  drop column if exists applied_at,
  drop column if exists applied_event_id,
  drop column if exists note,
  drop column if exists event_at,
  drop column if exists event_type,
  drop column if exists approval_instance_id;
