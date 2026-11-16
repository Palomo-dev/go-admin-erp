-- Reversión de 20261116023833_hrm_f2_04_jornada_novedades.
-- Restaura fn_hr_aprobacion_al_cerrar de la fase 0 (sin la rama de novedades).
-- Advertencia: hr_timesheet_lines y hr_attendance_novelties se borran con sus filas
-- (clasificaciones y novedades no se restauran). Las instancias de aprobación que
-- apuntaban a novedades quedan huérfanas en hr_approval_instances (subject_table =
-- 'hr_attendance_novelties'); se cancelan aquí para que nadie las decida.

update public.hr_approval_steps s set status = 'cancelado'
  from public.hr_approval_instances i
 where s.instance_id = i.id and i.subject_table = 'hr_attendance_novelties' and s.status = 'pendiente';
update public.hr_approval_instances set status = 'cancelada', decided_at = now()
 where subject_table = 'hr_attendance_novelties' and status = 'pendiente';

drop function if exists public.fn_hr_jornada_reabrir(uuid, integer, uuid, text);
drop function if exists public.fn_hr_jornada_lista_nomina(uuid, integer, date, date, uuid[]);
drop function if exists public.fn_hr_novedad_registrar(uuid, integer, jsonb);

create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
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
  end if;
end;
$function$;

drop function if exists public.fn_hr_cambio_turno_aplicar(uuid, uuid);
drop function if exists public.fn_hr_jornada_guardar(uuid, integer, uuid, date, integer, jsonb);
drop function if exists public.fn_hr_jornada_insumos(uuid, integer, uuid, date);
drop function if exists public.fn_hr_novedad_sincronizar(uuid, text, integer);
drop function if exists public.fn_hr_novedad_iniciar_aprobacion(uuid);
drop function if exists public.fn_hr_aprobacion_anular_interna(uuid, text);
drop table if exists public.hr_attendance_novelties;
drop table if exists public.hr_timesheet_lines;
drop function if exists public.fn_hr_vinculo_es_del_actor(uuid, uuid);
