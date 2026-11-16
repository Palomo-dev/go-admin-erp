-- Reversión de 20261116025305_hrm_f2_05_ausencias.
-- Devuelve fn_hr_aprobacion_al_cerrar a la versión de 20261116023833 (sin la rama de
-- leave_requests), el trigger de saldo y la política de lectura anteriores, y quita lo agregado.
-- Advertencia: hr_leave_health_details se borra con sus filas (diagnósticos) y se pierden
-- las columnas nuevas de leave_types y leave_requests. Los tipos de sistema sembrados
-- (is_system) se borran solo si ninguna solicitud los usa.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-detectar-ausencias') then
    perform cron.unschedule('hrm-detectar-ausencias');
  end if;
end;
$$;
drop function if exists public.fn_hr_detectar_ausencias(date);
drop function if exists public.fn_hr_jornada_para_nomina(uuid, integer, date, date);
drop function if exists public.fn_hr_ausencia_tramos_pago(integer, uuid);
drop function if exists public.fn_hr_ausencia_detalle_salud(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_ausencias_equipo(uuid, integer, date, date);

update public.hr_approval_steps s set status = 'cancelado'
  from public.hr_approval_instances i
 where s.instance_id = i.id and i.subject_table = 'leave_requests' and s.status = 'pendiente';
update public.hr_approval_instances set status = 'cancelada', decided_at = now()
 where subject_table = 'leave_requests' and status = 'pendiente';

create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  end if;
end;
$$;
revoke all on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_aprobacion_al_cerrar(uuid) to service_role;

drop function if exists public.fn_hr_ausencia_cancelar(uuid, integer, uuid, text);
drop function if exists public.fn_hr_ausencia_solicitar(uuid, integer, jsonb);
drop function if exists public.fn_hr_vacaciones_saldo(uuid, integer, uuid, date);
drop function if exists public.fn_hr_vacaciones_saldo_interno(uuid, date);
drop function if exists public.fn_hr_dias_habiles(integer, date, date, integer, smallint[]);
drop function if exists public.fn_hr_dias360(date, date);

delete from public.leave_types lt
 where lt.is_system and not exists (select 1 from public.leave_requests l where l.leave_type_id = lt.id);
drop function if exists public.fn_hr_tipos_ausencia_asegurar(integer);

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using ((employment_id in (select public.fn_hr_mis_empleos()))
         or (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.view')))
         or (organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve')))
         or (employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))));

drop trigger if exists trg_leave_request_balance on public.leave_requests;
create or replace function public.hrm_update_leave_balance_on_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_year int;
BEGIN
  v_year := EXTRACT(YEAR FROM NEW.start_date);
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO leave_balances (organization_id, employment_id, leave_type_id, year)
    VALUES (NEW.organization_id, NEW.employment_id, NEW.leave_type_id, v_year)
    ON CONFLICT (employment_id, leave_type_id, year) DO NOTHING;
    UPDATE leave_balances SET pending = pending + NEW.total_days, updated_at = now()
    WHERE employment_id = NEW.employment_id AND leave_type_id = NEW.leave_type_id AND year = v_year;
  END IF;
  IF NEW.status = 'taken' AND OLD.status = 'approved' THEN
    UPDATE leave_balances SET pending = pending - NEW.total_days, used = used + NEW.total_days, updated_at = now()
    WHERE employment_id = NEW.employment_id AND leave_type_id = NEW.leave_type_id AND year = v_year;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    UPDATE leave_balances SET pending = pending - NEW.total_days, updated_at = now()
    WHERE employment_id = NEW.employment_id AND leave_type_id = NEW.leave_type_id AND year = v_year;
  END IF;
  RETURN NEW;
END;
$function$;
create trigger trg_leave_request_balance after update on public.leave_requests
  for each row execute function public.hrm_update_leave_balance_on_request();

drop trigger if exists trg_leave_requests_01_validar on public.leave_requests;
drop trigger if exists trg_leave_requests_00_org on public.leave_requests;
drop function if exists public.fn_hr_ausencia_validar();
drop table if exists public.hr_leave_health_details;

drop index if exists public.leave_requests_org_fechas_idx;
drop index if exists public.leave_requests_vinculo_fechas_idx;
alter table public.leave_requests
  drop column if exists document_id,
  drop column if exists extends_leave_id,
  drop column if exists approval_instance_id;
comment on column public.leave_types.data_group is null;
alter table public.leave_types drop constraint if exists leave_types_counts_days_chk;
alter table public.leave_types drop constraint if exists leave_types_data_group_chk;
alter table public.leave_types drop constraint if exists leave_types_legal_class_chk;
alter table public.leave_types
  drop column if exists is_system,
  drop column if exists counts_days,
  drop column if exists data_group,
  drop column if exists legal_class;
