-- Revierte HRM fase 0 · paso 15. Devuelve las funciones a su versión anterior
-- (copiada de la migración que la creó).
-- ADVERTENCIA: borra los pasos de regla «RR. HH.» y «Cargo» (el modelo anterior no los admite). Las solicitudes en curso conservan sus pasos.

create or replace function public.fn_hr_regla_aplica(p_cond jsonb, p_ctx jsonb)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  v_monto numeric := nullif(p_ctx->>'monto', '')::numeric;
  v_dias  numeric := nullif(p_ctx->>'dias', '')::numeric;
begin
  if jsonb_typeof(p_cond->'branch_ids') = 'array' and jsonb_array_length(p_cond->'branch_ids') > 0
     and not coalesce((p_cond->'branch_ids') @> to_jsonb(nullif(p_ctx->>'branch_id', '')::integer), false) then
    return false;
  end if;
  if jsonb_typeof(p_cond->'department_ids') = 'array' and jsonb_array_length(p_cond->'department_ids') > 0
     and not coalesce((p_cond->'department_ids') @> to_jsonb(nullif(p_ctx->>'department_id', '')), false) then
    return false;
  end if;
  if p_cond ? 'monto_min' and (v_monto is null or v_monto < (p_cond->>'monto_min')::numeric) then return false; end if;
  if p_cond ? 'monto_max' and (v_monto is null or v_monto > (p_cond->>'monto_max')::numeric) then return false; end if;
  if p_cond ? 'dias_min'  and (v_dias  is null or v_dias  < (p_cond->>'dias_min')::numeric)  then return false; end if;
  if p_cond ? 'dias_max'  and (v_dias  is null or v_dias  > (p_cond->>'dias_max')::numeric)  then return false; end if;
  return true;
end;
$$;

create or replace function public.fn_hr_resolver_aprobadores(p_org integer, p_step public.hr_approval_rule_steps, p_employment uuid)
returns uuid[]
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v uuid[];
begin
  if p_step.approver_type = 'jefe_directo' then
    select array_remove(array[public.fn_hr_usuario_de_empleo(e.manager_id)], null) into v
      from public.employments e where e.id = p_employment and e.manager_id is not null;
  elsif p_step.approver_type = 'jefe_area' then
    select array_remove(array[public.fn_hr_usuario_de_empleo(d.manager_employment_id)], null) into v
      from public.employments e join public.departments d on d.id = e.department_id
     where e.id = p_employment and d.manager_employment_id is not null;
  elsif p_step.approver_type = 'rol' then
    select array_agg(distinct om.user_id) into v from public.organization_members om
     where om.organization_id = p_org and om.is_active and om.role_id = p_step.approver_role_id;
  elsif p_step.approver_type = 'persona' then
    select array_agg(om.user_id) into v from public.organization_members om
     where om.organization_id = p_org and om.is_active and om.user_id = p_step.approver_user_id;
  end if;
  return coalesce(v, '{}');
end;
$$;

create or replace function public.fn_hr_aprobacion_iniciar(
  p_org integer, p_tipo text, p_tabla text, p_registro uuid, p_employment uuid,
  p_solicitante uuid, p_contexto jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_regla public.hr_approval_rules;
  v_paso public.hr_approval_rule_steps;
  v_inst uuid;
  v_aprob uuid[];
  v_respaldo uuid[];
  v_n integer := 0;
begin
  select r.* into v_regla
    from public.hr_approval_rules r
   where r.organization_id = p_org and r.request_type = p_tipo and r.is_active
     and public.fn_hr_regla_aplica(r.conditions, coalesce(p_contexto, '{}'::jsonb))
     and exists (select 1 from public.hr_approval_rule_steps s where s.rule_id = r.id)
   order by r.priority, r.created_at
   limit 1;
  if not found then
    return null;
  end if;

  insert into public.hr_approval_instances
    (organization_id, request_type, subject_table, subject_id, employment_id, requested_by, rule_id, context)
  values (p_org, p_tipo, p_tabla, p_registro, p_employment, p_solicitante, v_regla.id, coalesce(p_contexto, '{}'::jsonb))
  returning id into v_inst;

  select coalesce(array_agg(om.user_id), '{}') into v_respaldo
    from public.organization_members om
   where om.organization_id = p_org and om.is_active and om.user_id is distinct from p_solicitante
     and coalesce(public.check_user_permission(om.user_id, p_org, 'hr.approvals.manage'), false);

  for v_paso in select * from public.hr_approval_rule_steps s where s.rule_id = v_regla.id order by s.step_order loop
    v_n := v_n + 1;
    v_aprob := array_remove(public.fn_hr_resolver_aprobadores(p_org, v_paso, p_employment), p_solicitante);
    if cardinality(v_aprob) = 0 then
      if cardinality(v_respaldo) = 0 then
        raise exception 'aprobacion_sin_aprobador: el paso % de la regla «%» no tiene a quién llegar', v_paso.step_order, v_regla.name
          using errcode = '22023';
      end if;
      insert into public.hr_approval_steps (organization_id, instance_id, step_order, approver_type, approver_user_ids, is_fallback)
      values (p_org, v_inst, v_n, v_paso.approver_type, v_respaldo, true);
    else
      insert into public.hr_approval_steps (organization_id, instance_id, step_order, approver_type, approver_user_ids)
      values (p_org, v_inst, v_n, v_paso.approver_type, v_aprob);
    end if;
  end loop;
  return v_inst;
end;
$$;

create or replace function public.fn_hr_aprobacion_decidir(p_instancia uuid, p_decision text, p_comentario text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inst public.hr_approval_instances;
  v_paso public.hr_approval_steps;
  v_en_nombre uuid;
  v_hoy date;
  v_siguiente smallint;
begin
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  if p_decision not in ('aprobar','rechazar') then
    raise exception 'hr: decisión inválida' using errcode = '22023';
  end if;

  select * into v_inst from public.hr_approval_instances where id = p_instancia for update;
  if not found then
    raise exception 'hr: la solicitud no existe' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organization_members om
                  where om.user_id = v_uid and om.organization_id = v_inst.organization_id and om.is_active) then
    raise exception 'hr: la solicitud no existe' using errcode = 'P0002';
  end if;
  if v_inst.status <> 'pendiente' then
    raise exception 'hr: la solicitud ya está %', v_inst.status using errcode = '55000';
  end if;
  if v_inst.requested_by = v_uid then
    raise exception 'no_puede_aprobar_lo_propio' using errcode = '42501';
  end if;

  select * into v_paso from public.hr_approval_steps
   where instance_id = v_inst.id and step_order = v_inst.current_step and status = 'pendiente'
   for update;
  if not found then
    raise exception 'hr: la solicitud no tiene un paso pendiente' using errcode = '55000';
  end if;

  if not (v_uid = any (v_paso.approver_user_ids)) then
    v_hoy := public.fn_today_for(v_inst.organization_id, null);
    select d.delegator_user_id into v_en_nombre
      from public.hr_approval_delegations d
     where d.organization_id = v_inst.organization_id
       and d.delegate_user_id = v_uid
       and d.delegator_user_id = any (v_paso.approver_user_ids)
       and d.delegator_user_id is distinct from v_inst.requested_by
       and d.is_active
       and v_hoy between d.starts_on and d.ends_on
       and (d.request_type is null or d.request_type = v_inst.request_type)
     order by d.created_at
     limit 1;
    if v_en_nombre is null then
      raise exception 'no_eres_aprobador' using errcode = '42501';
    end if;
  end if;

  insert into public.hr_approval_decisions (organization_id, instance_id, step_id, actor_user_id, on_behalf_of, decision, comment)
  values (v_inst.organization_id, v_inst.id, v_paso.id, v_uid, v_en_nombre, p_decision, left(p_comentario, 2000));

  update public.hr_approval_steps
     set status = case when p_decision = 'aprobar' then 'aprobado' else 'rechazado' end,
         decided_by = v_uid, decided_on_behalf_of = v_en_nombre, decided_at = now(), comment = left(p_comentario, 2000)
   where id = v_paso.id;

  if p_decision = 'rechazar' then
    update public.hr_approval_instances set status = 'rechazada', decided_at = now() where id = v_inst.id;
    update public.hr_approval_steps set status = 'cancelado'
     where instance_id = v_inst.id and status = 'pendiente';
  else
    select min(step_order) into v_siguiente from public.hr_approval_steps
     where instance_id = v_inst.id and status = 'pendiente';
    if v_siguiente is null then
      update public.hr_approval_instances set status = 'aprobada', decided_at = now() where id = v_inst.id;
    else
      update public.hr_approval_instances set current_step = v_siguiente where id = v_inst.id;
    end if;
  end if;

  select * into v_inst from public.hr_approval_instances where id = p_instancia;
  if v_inst.status <> 'pendiente' then
    perform public.fn_hr_aprobacion_al_cerrar(v_inst.id);
  end if;

  return jsonb_build_object('id', v_inst.id, 'status', v_inst.status, 'current_step', v_inst.current_step,
                            'en_nombre_de', v_en_nombre);
end;
$$;

create or replace function public.fn_hr_mis_aprobaciones_pendientes(p_org integer)
returns table (instance_id uuid, request_type text, subject_table text, subject_id uuid, employment_id uuid,
               requested_by uuid, step_order smallint, en_nombre_de uuid, context jsonb, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id, i.request_type, i.subject_table, i.subject_id, i.employment_id, i.requested_by,
         s.step_order, d.delegator_user_id, i.context, i.created_at
    from public.hr_approval_instances i
    join public.hr_approval_steps s on s.instance_id = i.id and s.step_order = i.current_step and s.status = 'pendiente'
    left join lateral (
      select dd.delegator_user_id from public.hr_approval_delegations dd
       where dd.organization_id = i.organization_id and dd.delegate_user_id = auth.uid()
         and dd.delegator_user_id = any (s.approver_user_ids) and dd.is_active
         and public.fn_today_for(i.organization_id, null) between dd.starts_on and dd.ends_on
         and (dd.request_type is null or dd.request_type = i.request_type)
       limit 1) d on true
   where i.organization_id = p_org
     and i.status = 'pendiente'
     and i.requested_by is distinct from auth.uid()
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active)
     and (auth.uid() = any (s.approver_user_ids) or d.delegator_user_id is not null)
   order by i.created_at;
$$;

create or replace function public.fn_hr_regla_paso_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.hr_approval_rules r where r.id = new.rule_id and r.organization_id = new.organization_id) then
    raise exception 'hr: la regla es de otra organización' using errcode = '42501';
  end if;
  if new.approver_role_id is not null and not exists (
       select 1 from public.roles r where r.id = new.approver_role_id
          and (r.organization_id is null or r.organization_id = new.organization_id)) then
    raise exception 'hr: el rol no existe en la organización' using errcode = '22023';
  end if;
  if new.approver_user_id is not null and not exists (
       select 1 from public.organization_members om where om.user_id = new.approver_user_id
          and om.organization_id = new.organization_id and om.is_active) then
    raise exception 'hr: la persona aprobadora no es miembro activo' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.fn_hr_registrar_cambio(
  p_employment uuid, p_campo text, p_efectivo date, p_valor jsonb, p_motivo text, p_contexto jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_e public.employments;
  v_grupo text := public.fn_hr_grupo_de_campo(p_campo);
  v_edita boolean;
  v_valor jsonb;
  v_anterior jsonb;
  v_ev uuid;
  v_inst uuid;
  v_tipo text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  select * into v_e from public.employments where id = p_employment for update;
  if not found or not exists (select 1 from public.organization_members om
                               where om.user_id = v_uid and om.organization_id = v_e.organization_id and om.is_active) then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if p_efectivo is null then
    raise exception 'hr: la fecha de efecto es obligatoria' using errcode = '22023';
  end if;

  v_edita := public.fn_hr_actor_puede_empleo(v_uid, p_employment, v_grupo, 'editar');
  if not v_edita and not (p_employment in (select public.fn_hr_equipo_empleos_actor(v_uid,
                            case when v_grupo = 'basico' then 'hr.employees.view_team' else 'hr.data.' || v_grupo || '.view_team' end))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  v_valor := public.fn_hr_validar_valor(v_e.organization_id, p_employment, p_campo, p_valor);
  v_anterior := public.fn_hr_valor_vigente_interno(p_employment, p_campo, p_efectivo);

  insert into public.hr_employment_events
    (organization_id, employment_id, field, effective_from, old_value, new_value, reason, requested_by)
  values (v_e.organization_id, p_employment, p_campo, p_efectivo, v_anterior, v_valor, btrim(p_motivo), v_uid)
  returning id into v_ev;

  v_tipo := case p_campo
              when 'salario' then 'cambio_salario' when 'periodo_salario' then 'cambio_salario'
              when 'cargo' then 'cambio_cargo' when 'sede' then 'cambio_sede'
              when 'area' then 'cambio_area' when 'centro_costo' then 'cambio_area'
              when 'jefe' then 'cambio_jefe' when 'jornada_horas_semana' then 'cambio_jornada'
              else 'cambio_contrato' end;

  v_inst := public.fn_hr_aprobacion_iniciar(v_e.organization_id, v_tipo, 'hr_employment_events', v_ev, p_employment, v_uid,
              jsonb_build_object('branch_id', v_e.branch_id, 'department_id', v_e.department_id,
                                 'campo', p_campo,
                                 'monto', case when p_campo = 'salario' then v_valor else null end));

  if v_inst is not null then
    update public.hr_employment_events set approval_instance_id = v_inst where id = v_ev;
    v_status := 'pendiente';
  elsif v_edita then
    update public.hr_employment_events set status = 'aprobado', approved_by = v_uid, approved_at = now() where id = v_ev;
    perform public.fn_hr_aplicar_evento(v_ev);
    v_status := 'aprobado';
  else
    raise exception 'requiere_regla_de_aprobacion: un jefe sin permiso de edición solo propone cambios cuando hay una regla de %', v_tipo
      using errcode = '42501';
  end if;

  if v_grupo = 'salario_pago' then
    perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id, 'salario_pago', 'editar',
      p_contexto->>'ip', p_contexto->>'user_agent', coalesce(p_contexto->>'ruta', 'rpc:fn_hr_registrar_cambio'),
      jsonb_build_object('campos', jsonb_build_array(p_campo), 'evento', v_ev));
  end if;

  return jsonb_build_object('id', v_ev, 'status', v_status, 'approval_instance_id', v_inst);
end;
$$;

drop function if exists public.fn_hr_sugerir_reemplazo(integer, uuid, date, date);
drop function if exists public.fn_hr_aprobaciones_recomendadas(integer);
drop function if exists public.fn_hr_reglas_reordenar(integer, text, uuid[]);
drop function if exists public.fn_hr_regla_guardar(integer, jsonb);
drop function if exists public.fn_hr_aprobacion_probar(integer, text, uuid, jsonb, date);
drop function if exists public.fn_hr_aprobacion_plan(integer, text, uuid, uuid, jsonb);
drop function if exists public.fn_hr_delegacion_cubre(text, text[], text);
drop function if exists public.fn_hr_rrhh_aprobadores(integer);

delete from public.hr_approval_rule_steps where approver_type in ('rrhh','cargo');
alter table public.hr_approval_rule_steps drop constraint if exists hr_approval_rule_steps_ref_chk;
alter table public.hr_approval_rule_steps drop constraint if exists hr_approval_rule_steps_approver_type_check;
alter table public.hr_approval_rule_steps add constraint hr_approval_rule_steps_approver_type_check check (approver_type in ('jefe_directo','jefe_area','rol','persona'));
alter table public.hr_approval_rule_steps add constraint hr_approval_rule_steps_ref_chk check (
  (approver_type = 'rol' and approver_role_id is not null) or (approver_type = 'persona' and approver_user_id is not null) or (approver_type in ('jefe_directo','jefe_area')));
alter table public.hr_approval_rule_steps drop column if exists approver_position_id;
alter table public.hr_approval_rules drop constraint if exists hr_approval_rules_on_self_chk;
alter table public.hr_approval_rules drop constraint if exists hr_approval_rules_on_missing_chk;
alter table public.hr_approval_rules drop column if exists on_self;
alter table public.hr_approval_rules drop column if exists on_missing;
alter table public.hr_approval_delegations drop constraint if exists hr_approval_delegations_motivo_chk;
alter table public.hr_approval_delegations drop column if exists motivo;
alter table public.hr_approval_delegations drop column if exists request_types;
