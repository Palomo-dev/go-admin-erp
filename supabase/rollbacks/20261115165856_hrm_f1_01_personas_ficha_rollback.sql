-- Revierte HRM fase 1 · personas (20261115165856_hrm_f1_01_personas_ficha).
-- Devuelve fn_hr_validar_valor, fn_hr_aprobacion_al_cerrar y
-- create_employment_for_new_member a su versión anterior (copiadas de las
-- migraciones que las crearon).
-- ADVERTENCIA: borra certificaciones, documentos exigidos por cargo, solicitudes de
-- cambio de cuenta, avisos enviados y el catálogo de entidades. El historial es
-- inmutable: si ya tiene eventos de seguridad social (eps, afp, arl, ccf,
-- cesantias) o contratos de aprendizaje, la restricción anterior no se puede
-- restaurar y el rollback se detiene ahí (hay que conservarlos).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-avisar-vencimientos') then
    perform cron.unschedule('hrm-avisar-vencimientos');
  end if;
end $$;

drop function if exists public.fn_hr_avisar_vencimientos();
drop function if exists public.fn_hr_aprobacion_ver(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_aprobaciones_bandeja(uuid, integer, text, text, text, text);
drop function if exists public.fn_hr_aprobacion_resumen(uuid, integer, public.hr_approval_instances, text, text, text);
drop function if exists public.fn_hr_alta_empleado(uuid, integer, jsonb, text, text, text);
drop function if exists public.fn_hr_buscar_documento(uuid, integer, text, text, text, text, text);
drop function if exists public.fn_hr_ultimas_consultas(uuid, integer, uuid, integer);
drop function if exists public.fn_hr_banco_solicitar_cambio(uuid, integer, uuid, jsonb, text, text, text);
drop function if exists public.fn_hr_banco_leer(uuid, integer, uuid, boolean, text, text, text);
drop function if exists public.fn_hr_enmascarar_cuenta(text);
drop function if exists public.fn_hr_contactos_emergencia_leer(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_documentos_listar(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_ficha_leer(uuid, integer, uuid);
drop function if exists public.fn_hr_empleados_listar(uuid, integer, text, text, text);
drop function if exists public.fn_hr_registrar_cambios(uuid, date, jsonb, text, text, jsonb);
drop function if exists public.fn_hr_tipo_solicitud_campo(text);
drop function if exists public.fn_hr_alertas_persona(integer, uuid, uuid, date, integer, boolean);
drop function if exists public.fn_hr_periodo_cerrado(integer, date);
drop function if exists public.fn_hr_actor_ve_persona(uuid, integer, uuid);
drop function if exists public.fn_hr_nombre_valor(text, jsonb);
drop function if exists public.fn_hr_estado_vinculo(public.employments, date);
drop function if exists public.fn_hr_vinculo_actual(uuid);
drop function if exists public.fn_hr_documentos_exigidos(uuid);
drop function if exists public.fn_hr_dias_aviso(integer);

-- Cierre de aprobaciones: versión del paso 4 (un solo evento por solicitud).
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  if v_inst.subject_table = 'hr_employment_events' then
    select s.decided_by into v_ultimo from public.hr_approval_steps s
     where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
     order by s.step_order desc limit 1;
    update public.hr_employment_events ev
       set status = case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.id = v_inst.subject_id and ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_aplicar_evento(v_inst.subject_id);
    end if;
  end if;
end;
$fn$;
revoke execute on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
drop function if exists public.fn_hr_banco_aplicar_solicitud(uuid);

-- Alta automática de cada miembro como empleado: versión anterior.
create or replace function public.create_employment_for_new_member()
returns trigger
language plpgsql security definer
as $fn$
declare
  v_branch_id integer;
begin
  if not exists (select 1 from employments where organization_member_id = new.id) then
    select mb.branch_id into v_branch_id from member_branches mb
     where mb.organization_member_id = new.id order by mb.id asc limit 1;
    if v_branch_id is null then
      select b.id into v_branch_id from branches b
       where b.organization_id = new.organization_id and b.is_main = true and b.is_active = true limit 1;
    end if;
    insert into employments (organization_member_id, status, hire_date, employment_type, contract_type, work_location,
                             work_hours_per_week, currency_code, salary_period, branch_id)
    values (new.id, 'active', public.fn_today_for(new.organization_id, v_branch_id), 'employee', 'indefinite', 'onsite',
            48, public.fn_moneda_base_organizacion(new.organization_id), 'monthly', v_branch_id);
  end if;
  return new;
end;
$fn$;

-- Validación: versión del paso 4.
create or replace function public.fn_hr_validar_valor(p_org integer, p_employment uuid, p_campo text, p_valor jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_txt text := p_valor #>> '{}';
  v_num numeric;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    if p_campo in ('jefe','fin_contrato','centro_costo','area') then return 'null'::jsonb; end if;
    raise exception 'hr: el valor es obligatorio para %', p_campo using errcode = '22023';
  end if;
  case p_campo
    when 'salario' then
      v_num := v_txt::numeric;
      if v_num is null or v_num <= 0 then raise exception 'hr: el salario debe ser mayor que cero' using errcode = '22023'; end if;
      return to_jsonb(round(v_num, 2));
    when 'jornada_horas_semana' then
      v_num := v_txt::numeric;
      if v_num is null or v_num <= 0 or v_num > 48 then raise exception 'hr: la jornada debe estar entre 0 y 48 horas' using errcode = '22023'; end if;
      return to_jsonb(v_num);
    when 'periodo_salario' then
      if v_txt not in ('monthly','biweekly','weekly','daily','hourly') then raise exception 'hr: periodicidad inválida' using errcode = '22023'; end if;
    when 'tipo_contrato' then
      if v_txt not in ('indefinite','fixed_term','service','hourly','project') then raise exception 'hr: tipo de contrato inválido' using errcode = '22023'; end if;
    when 'tipo_vinculacion' then
      if v_txt not in ('employee','contractor','intern','temporary','part_time') then raise exception 'hr: tipo de vinculación inválido' using errcode = '22023'; end if;
    when 'fin_contrato' then
      perform v_txt::date;
    when 'cargo' then
      if not exists (select 1 from public.job_positions j where j.id = v_txt::uuid and j.organization_id = p_org) then
        raise exception 'hr: el cargo no es de la organización' using errcode = '22023'; end if;
    when 'sede' then
      if not exists (select 1 from public.branches b where b.id = v_txt::integer and b.organization_id = p_org) then
        raise exception 'hr: la sede no es de la organización' using errcode = '22023'; end if;
      return to_jsonb(v_txt::integer);
    when 'area' then
      if not exists (select 1 from public.departments d where d.id = v_txt::uuid and d.organization_id = p_org) then
        raise exception 'hr: el área no es de la organización' using errcode = '22023'; end if;
    when 'jefe' then
      if v_txt::uuid = p_employment or not exists (select 1 from public.employments e where e.id = v_txt::uuid and e.organization_id = p_org) then
        raise exception 'hr: el jefe debe ser otro vínculo de la organización' using errcode = '22023'; end if;
    when 'centro_costo' then
      if not exists (select 1 from public.cost_centers c where c.id = v_txt::uuid and c.organization_id = p_org) then
        raise exception 'hr: el centro de costo no es de la organización' using errcode = '22023'; end if;
    else
      raise exception 'hr: campo desconocido %', p_campo using errcode = '22023';
  end case;
  return to_jsonb(v_txt);
end;
$$;
revoke execute on function public.fn_hr_validar_valor(integer, uuid, text, jsonb) from public, anon, authenticated;

alter table public.employments drop constraint if exists employments_contract_type_check;
alter table public.employments add constraint employments_contract_type_check
  check (contract_type = any (array['indefinite','fixed_term','service','hourly','project']));
alter table public.hr_employment_events drop constraint if exists hr_employment_events_field_check;
alter table public.hr_employment_events add constraint hr_employment_events_field_check
  check (field in ('salario','periodo_salario','cargo','sede','area','jefe','jornada_horas_semana','tipo_contrato',
                   'fin_contrato','centro_costo','tipo_vinculacion'));

drop table if exists public.hr_expiry_notices;
delete from public.hr_org_parameters where code = 'aviso_vencimientos_dias';
delete from public.hr_legal_parameters where code = 'aviso_vencimientos_dias';
delete from public.hr_parameter_catalog where code = 'aviso_vencimientos_dias';
alter table public.invitations drop column if exists hr_person_id;
drop table if exists public.hr_bank_account_requests;
drop table if exists public.hr_position_required_documents;
drop table if exists public.hr_person_certifications;
drop table if exists public.hr_ss_entities;
