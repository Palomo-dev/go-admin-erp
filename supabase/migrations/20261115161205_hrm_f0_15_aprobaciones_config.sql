-- HRM fase 0 · paso 15: lo que necesita la configuración de aprobaciones
-- (diseño 10.RH.2) y las decisiones del dueño del 2026-11-15:
-- - Sin reglas, la solicitud va al jefe directo y, si no tiene, a RR. HH.
-- - Nadie aprueba lo propio, y un paso sin persona va a RR. HH. «RR. HH.» son
--   quienes tienen el permiso «Aprobar solicitudes de RR. HH.» (hr.requests.approve).
-- - Aprobadores nuevos: «RR. HH.» y «Cargo» (p. ej. Gerente general).
-- - Condiciones nuevas: cargo, horas y % de aumento, y comparaciones estrictas
--   («mayor que», «menor que»).
-- - Casos especiales por regla, delegaciones por varios tipos y con motivo.
-- - «Probar una regla» sin crear nada; reglas recomendadas; reordenar.
-- - Al aprobar vacaciones de alguien que aprueba, se le sugiere un reemplazo
--   (fn_hr_sugerir_reemplazo; no obliga).

-- 1. Esquema -------------------------------------------------------------------------
alter table public.hr_approval_rule_steps add column if not exists approver_position_id uuid references public.job_positions(id);
alter table public.hr_approval_rule_steps drop constraint if exists hr_approval_rule_steps_approver_type_check;
alter table public.hr_approval_rule_steps add constraint hr_approval_rule_steps_approver_type_check
  check (approver_type in ('jefe_directo','jefe_area','rrhh','cargo','rol','persona'));
alter table public.hr_approval_rule_steps drop constraint if exists hr_approval_rule_steps_ref_chk;
alter table public.hr_approval_rule_steps add constraint hr_approval_rule_steps_ref_chk check (
  (approver_type = 'rol' and approver_role_id is not null) or
  (approver_type = 'persona' and approver_user_id is not null) or
  (approver_type = 'cargo' and approver_position_id is not null) or
  (approver_type in ('jefe_directo','jefe_area','rrhh')));

alter table public.hr_approval_rules add column if not exists on_self text not null default 'siguiente_paso';
alter table public.hr_approval_rules add column if not exists on_missing text not null default 'rrhh';
alter table public.hr_approval_rules drop constraint if exists hr_approval_rules_on_self_chk;
alter table public.hr_approval_rules add constraint hr_approval_rules_on_self_chk check (on_self in ('siguiente_paso','rrhh'));
alter table public.hr_approval_rules drop constraint if exists hr_approval_rules_on_missing_chk;
alter table public.hr_approval_rules add constraint hr_approval_rules_on_missing_chk check (on_missing in ('rrhh','siguiente_paso'));
comment on column public.hr_approval_rules.on_self is 'Si el aprobador del paso es quien pidió: pasa al siguiente paso o va a RR. HH. Nadie aprueba lo suyo.';
comment on column public.hr_approval_rules.on_missing is 'Si el paso no tiene a quién llegar (p. ej. sin jefe directo): va a RR. HH. o pasa al siguiente.';

alter table public.hr_approval_delegations add column if not exists request_types text[];
alter table public.hr_approval_delegations add column if not exists motivo text not null default 'otro';
alter table public.hr_approval_delegations drop constraint if exists hr_approval_delegations_motivo_chk;
alter table public.hr_approval_delegations add constraint hr_approval_delegations_motivo_chk
  check (motivo in ('vacaciones','licencia','incapacidad','capacitacion','viaje','otro'));

-- Paso de regla: el cargo debe ser de la organización.
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
  if new.approver_position_id is not null and not exists (
       select 1 from public.job_positions j where j.id = new.approver_position_id and j.organization_id = new.organization_id) then
    raise exception 'hr: el cargo no es de la organización' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_regla_paso_validar() from public, anon, authenticated;

-- 2. Condiciones -----------------------------------------------------------------------
-- Claves: branch_ids, department_ids, position_ids (cualquiera de); monto, dias,
-- horas, aumento_pct con _min/_max (incluyentes) o _gt/_lt (estrictas).
create or replace function public.fn_hr_regla_aplica(p_cond jsonb, p_ctx jsonb)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  k text;
  v numeric;
  lim numeric;
begin
  if jsonb_typeof(p_cond->'branch_ids') = 'array' and jsonb_array_length(p_cond->'branch_ids') > 0
     and not coalesce((p_cond->'branch_ids') @> to_jsonb(nullif(p_ctx->>'branch_id', '')::integer), false) then
    return false;
  end if;
  if jsonb_typeof(p_cond->'department_ids') = 'array' and jsonb_array_length(p_cond->'department_ids') > 0
     and not coalesce((p_cond->'department_ids') @> to_jsonb(nullif(p_ctx->>'department_id', '')), false) then
    return false;
  end if;
  if jsonb_typeof(p_cond->'position_ids') = 'array' and jsonb_array_length(p_cond->'position_ids') > 0
     and not coalesce((p_cond->'position_ids') @> to_jsonb(nullif(p_ctx->>'position_id', '')), false) then
    return false;
  end if;
  foreach k in array array['monto','dias','horas','aumento_pct'] loop
    v := nullif(p_ctx->>k, '')::numeric;
    if p_cond ? (k || '_min') then
      lim := (p_cond->>(k || '_min'))::numeric;
      if v is null or v < lim then return false; end if;
    end if;
    if p_cond ? (k || '_max') then
      lim := (p_cond->>(k || '_max'))::numeric;
      if v is null or v > lim then return false; end if;
    end if;
    if p_cond ? (k || '_gt') then
      lim := (p_cond->>(k || '_gt'))::numeric;
      if v is null or v <= lim then return false; end if;
    end if;
    if p_cond ? (k || '_lt') then
      lim := (p_cond->>(k || '_lt'))::numeric;
      if v is null or v >= lim then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

-- 3. Aprobadores ----------------------------------------------------------------------
-- «RR. HH.»: miembros activos con hr.requests.approve.
create or replace function public.fn_hr_rrhh_aprobadores(p_org integer)
returns uuid[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct om.user_id), '{}')
    from public.organization_members om
   where om.organization_id = p_org and om.is_active
     and coalesce(public.check_user_permission(om.user_id, p_org, 'hr.requests.approve'), false);
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
  elsif p_step.approver_type = 'rrhh' then
    v := public.fn_hr_rrhh_aprobadores(p_org);
  elsif p_step.approver_type = 'cargo' then
    select array_agg(distinct u) into v from (
      select om.user_id as u from public.organization_members om
       where om.organization_id = p_org and om.is_active and om.job_position_id = p_step.approver_position_id
      union
      select public.fn_hr_usuario_de_empleo(e.id) from public.employments e
       where e.organization_id = p_org and e.position_id = p_step.approver_position_id and e.status in ('active','probation')) x
     where u is not null;
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

-- ¿La delegación cubre este tipo de solicitud?
create or replace function public.fn_hr_delegacion_cubre(p_tipo_unico text, p_tipos text[], p_tipo text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select (p_tipo_unico is null and (p_tipos is null or cardinality(p_tipos) = 0))
      or p_tipo_unico = p_tipo
      or p_tipo = any (coalesce(p_tipos, '{}'));
$$;

-- 4. Iniciar: regla, o por defecto jefe directo → RR. HH. ---------------------------
-- Devuelve el plan de pasos SIN crear nada (lo usan iniciar y «Probar una regla»).
create or replace function public.fn_hr_aprobacion_plan(
  p_org integer, p_tipo text, p_employment uuid, p_solicitante uuid, p_contexto jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_regla public.hr_approval_rules;
  v_paso public.hr_approval_rule_steps;
  v_rrhh uuid[] := array_remove(public.fn_hr_rrhh_aprobadores(p_org), p_solicitante);
  v_aprob uuid[];
  v_crudo uuid[];
  v_pasos jsonb := '[]'::jsonb;
  v_otras jsonb;
  v_on_self text := 'siguiente_paso';
  v_on_missing text := 'rrhh';
  v_n integer := 0;
  v_respaldo boolean;
begin
  select r.* into v_regla
    from public.hr_approval_rules r
   where r.organization_id = p_org and r.request_type = p_tipo and r.is_active
     and public.fn_hr_regla_aplica(r.conditions, coalesce(p_contexto, '{}'::jsonb))
     and exists (select 1 from public.hr_approval_rule_steps s where s.rule_id = r.id)
   order by r.priority, r.created_at
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.name, 'orden', r.priority) order by r.priority, r.created_at), '[]'::jsonb)
    into v_otras
    from public.hr_approval_rules r
   where r.organization_id = p_org and r.request_type = p_tipo and r.is_active
     and public.fn_hr_regla_aplica(r.conditions, coalesce(p_contexto, '{}'::jsonb))
     and (v_regla.id is null or r.id <> v_regla.id);

  if v_regla.id is not null then
    v_on_self := v_regla.on_self;
    v_on_missing := v_regla.on_missing;
    for v_paso in select * from public.hr_approval_rule_steps s where s.rule_id = v_regla.id order by s.step_order loop
      v_crudo := public.fn_hr_resolver_aprobadores(p_org, v_paso, p_employment);
      v_aprob := array_remove(v_crudo, p_solicitante);
      v_respaldo := false;
      if cardinality(v_aprob) = 0 and p_solicitante = any (v_crudo) and v_on_self = 'siguiente_paso' then
        continue;
      end if;
      if cardinality(v_aprob) = 0 then
        if v_on_missing = 'siguiente_paso' and not (p_solicitante = any (v_crudo)) then
          continue;
        end if;
        v_aprob := v_rrhh;
        v_respaldo := true;
      end if;
      if cardinality(v_aprob) = 0 then
        return jsonb_build_object('regla', jsonb_build_object('id', v_regla.id, 'nombre', v_regla.name, 'orden', v_regla.priority),
                                  'otras', v_otras, 'pasos', v_pasos, 'sin_aprobador', v_paso.step_order);
      end if;
      v_n := v_n + 1;
      v_pasos := v_pasos || jsonb_build_object('orden', v_n, 'tipo', v_paso.approver_type, 'aprobadores', to_jsonb(v_aprob),
                                               'respaldo', v_respaldo, 'cargo', v_paso.approver_position_id);
    end loop;
    if v_n = 0 and cardinality(v_rrhh) > 0 then
      v_pasos := jsonb_build_array(jsonb_build_object('orden', 1, 'tipo', 'rrhh', 'aprobadores', to_jsonb(v_rrhh), 'respaldo', true, 'cargo', null));
    end if;
    return jsonb_build_object('regla', jsonb_build_object('id', v_regla.id, 'nombre', v_regla.name, 'orden', v_regla.priority),
                              'otras', v_otras, 'pasos', v_pasos, 'sin_aprobador', case when jsonb_array_length(v_pasos) = 0 then 1 end);
  end if;

  -- Sin regla: jefe directo y, si no tiene (o es quien pide), RR. HH.
  select array_remove(array[public.fn_hr_usuario_de_empleo(e.manager_id)], null) into v_crudo
    from public.employments e where e.id = p_employment;
  v_aprob := array_remove(coalesce(v_crudo, '{}'), p_solicitante);
  if cardinality(v_aprob) > 0 then
    v_pasos := jsonb_build_array(jsonb_build_object('orden', 1, 'tipo', 'jefe_directo', 'aprobadores', to_jsonb(v_aprob), 'respaldo', false, 'cargo', null));
  elsif cardinality(v_rrhh) > 0 then
    v_pasos := jsonb_build_array(jsonb_build_object('orden', 1, 'tipo', 'rrhh', 'aprobadores', to_jsonb(v_rrhh), 'respaldo', true, 'cargo', null));
  end if;
  return jsonb_build_object('regla', null, 'otras', '[]'::jsonb, 'pasos', v_pasos, 'por_defecto', true,
                            'sin_aprobador', case when jsonb_array_length(v_pasos) = 0 then 1 end);
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
  v_plan jsonb := public.fn_hr_aprobacion_plan(p_org, p_tipo, p_employment, p_solicitante, p_contexto);
  v_inst uuid;
  v_paso jsonb;
begin
  if jsonb_array_length(v_plan->'pasos') = 0 then
    if v_plan->'regla' is not null and jsonb_typeof(v_plan->'regla') = 'object' then
      raise exception 'aprobacion_sin_aprobador: la regla «%» no tiene a quién llegar y no hay nadie con «Aprobar solicitudes de RR. HH.»', v_plan->'regla'->>'nombre'
        using errcode = '22023';
    end if;
    return null;  -- sin regla y sin nadie: decide quien llama
  end if;
  insert into public.hr_approval_instances
    (organization_id, request_type, subject_table, subject_id, employment_id, requested_by, rule_id, context)
  values (p_org, p_tipo, p_tabla, p_registro, p_employment, p_solicitante,
          nullif(v_plan->'regla'->>'id', '')::uuid, coalesce(p_contexto, '{}'::jsonb))
  returning id into v_inst;
  for v_paso in select * from jsonb_array_elements(v_plan->'pasos') loop
    insert into public.hr_approval_steps (organization_id, instance_id, step_order, approver_type, approver_user_ids, is_fallback)
    values (p_org, v_inst, (v_paso->>'orden')::smallint, v_paso->>'tipo',
            array(select jsonb_array_elements_text(v_paso->'aprobadores'))::uuid[], coalesce((v_paso->>'respaldo')::boolean, false));
  end loop;
  return v_inst;
end;
$$;

-- 5. Decidir y pendientes con delegaciones por varios tipos -------------------------
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
  if not found or not exists (select 1 from public.organization_members om
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
       and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, v_inst.request_type)
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
    update public.hr_approval_steps set status = 'cancelado' where instance_id = v_inst.id and status = 'pendiente';
  else
    select min(step_order) into v_siguiente from public.hr_approval_steps where instance_id = v_inst.id and status = 'pendiente';
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
  return jsonb_build_object('id', v_inst.id, 'status', v_inst.status, 'current_step', v_inst.current_step, 'en_nombre_de', v_en_nombre);
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
         and public.fn_hr_delegacion_cubre(dd.request_type, dd.request_types, i.request_type)
       limit 1) d on true
   where i.organization_id = p_org
     and i.status = 'pendiente'
     and i.requested_by is distinct from auth.uid()
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active)
     and (auth.uid() = any (s.approver_user_ids) or d.delegator_user_id is not null)
   order by i.created_at;
$$;

-- 6. «Probar una regla» (no crea nada ni avisa a nadie) -----------------------------
create or replace function public.fn_hr_aprobacion_probar(p_org integer, p_tipo text, p_employment uuid, p_contexto jsonb, p_fecha date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_e public.employments;
  v_ctx jsonb;
  v_plan jsonb;
  v_paso jsonb;
  v_pasos jsonb := '[]'::jsonb;
  v_fecha date := coalesce(p_fecha, public.fn_today_for(p_org, null));
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.approvals.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into v_e from public.employments where id = p_employment and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  v_ctx := jsonb_build_object('branch_id', v_e.branch_id, 'department_id', v_e.department_id, 'position_id', v_e.position_id)
           || coalesce(p_contexto, '{}'::jsonb);
  v_plan := public.fn_hr_aprobacion_plan(p_org, p_tipo, p_employment, public.fn_hr_usuario_de_empleo(p_employment), v_ctx);
  for v_paso in select * from jsonb_array_elements(v_plan->'pasos') loop
    v_pasos := v_pasos || (v_paso || jsonb_build_object(
      'personas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', u, 'nombre', public.fn_hr_nombre_usuario(u),
                     'reemplazo', (select jsonb_build_object('id', d.delegate_user_id, 'nombre', public.fn_hr_nombre_usuario(d.delegate_user_id),
                                                             'desde', d.starts_on, 'hasta', d.ends_on, 'motivo', d.motivo)
                                     from public.hr_approval_delegations d
                                    where d.organization_id = p_org and d.delegator_user_id = u and d.is_active
                                      and v_fecha between d.starts_on and d.ends_on
                                      and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, p_tipo)
                                    order by d.created_at limit 1))), '[]'::jsonb)
                   from jsonb_array_elements_text(v_paso->'aprobadores') a(u_txt), lateral (select a.u_txt::uuid as u) x),
      'cargo_nombre', (select j.name from public.job_positions j where j.id = nullif(v_paso->>'cargo', '')::uuid)));
  end loop;
  return jsonb_set(v_plan, '{pasos}', v_pasos);
end;
$$;

-- 7. Guardar una regla con su cadena (transaccional) --------------------------------
create or replace function public.fn_hr_regla_guardar(p_org integer, p_regla jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_regla->>'id', '')::uuid;
  v_paso jsonb;
  v_n smallint := 0;
  v_prioridad integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.approvals.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if coalesce(btrim(p_regla->>'nombre'), '') = '' then
    raise exception 'hr: la regla necesita un nombre' using errcode = '22023';
  end if;
  if jsonb_typeof(p_regla->'pasos') <> 'array' or jsonb_array_length(p_regla->'pasos') = 0 then
    raise exception 'hr: la regla necesita al menos un aprobador' using errcode = '22023';
  end if;
  if v_id is null then
    select coalesce(max(priority), 0) + 1 into v_prioridad from public.hr_approval_rules
     where organization_id = p_org and request_type = p_regla->>'tipo';
    insert into public.hr_approval_rules (organization_id, request_type, name, priority, conditions, is_active, on_self, on_missing, created_by)
    values (p_org, p_regla->>'tipo', btrim(p_regla->>'nombre'), coalesce((p_regla->>'prioridad')::integer, v_prioridad),
            coalesce(p_regla->'condiciones', '{}'::jsonb), coalesce((p_regla->>'activa')::boolean, true),
            coalesce(p_regla->>'si_es_quien_pide', 'siguiente_paso'), coalesce(p_regla->>'si_no_hay', 'rrhh'), auth.uid())
    returning id into v_id;
  else
    update public.hr_approval_rules set
      request_type = coalesce(p_regla->>'tipo', request_type),
      name = btrim(p_regla->>'nombre'),
      conditions = coalesce(p_regla->'condiciones', '{}'::jsonb),
      is_active = coalesce((p_regla->>'activa')::boolean, is_active),
      on_self = coalesce(p_regla->>'si_es_quien_pide', on_self),
      on_missing = coalesce(p_regla->>'si_no_hay', on_missing),
      updated_at = now()
     where id = v_id and organization_id = p_org;
    if not found then
      raise exception 'hr: la regla no existe' using errcode = 'P0002';
    end if;
    delete from public.hr_approval_rule_steps where rule_id = v_id;
  end if;
  for v_paso in select * from jsonb_array_elements(p_regla->'pasos') loop
    v_n := v_n + 1;
    insert into public.hr_approval_rule_steps (organization_id, rule_id, step_order, approver_type, approver_role_id, approver_user_id, approver_position_id)
    values (p_org, v_id, v_n, v_paso->>'tipo', nullif(v_paso->>'rol', '')::integer, nullif(v_paso->>'persona', '')::uuid, nullif(v_paso->>'cargo', '')::uuid);
  end loop;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.fn_hr_reglas_reordenar(p_org integer, p_tipo text, p_ids uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  i integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.approvals.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  for i in 1 .. coalesce(cardinality(p_ids), 0) loop
    update public.hr_approval_rules set priority = i, updated_at = now()
     where id = p_ids[i] and organization_id = p_org and request_type = p_tipo;
  end loop;
end;
$$;

-- Reglas recomendadas (solo si la organización no tiene ninguna).
create or replace function public.fn_hr_aprobaciones_recomendadas(p_org integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  n integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.approvals.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if exists (select 1 from public.hr_approval_rules where organization_id = p_org) then
    return 0;
  end if;
  for r in select * from jsonb_array_elements('[
    {"tipo":"ausencia","nombre":"Ausencias de más de 3 días","prioridad":1,"condiciones":{"dias_gt":3},"pasos":[{"tipo":"jefe_directo"},{"tipo":"rrhh"}]},
    {"tipo":"ausencia","nombre":"Por defecto","prioridad":2,"condiciones":{},"pasos":[{"tipo":"jefe_directo"}]},
    {"tipo":"horas_extra","nombre":"Más de 8 horas extra en la semana","prioridad":1,"condiciones":{"horas_gt":8},"pasos":[{"tipo":"jefe_directo"},{"tipo":"rrhh"}]},
    {"tipo":"horas_extra","nombre":"Por defecto","prioridad":2,"condiciones":{},"pasos":[{"tipo":"jefe_directo"}]},
    {"tipo":"cambio_salario","nombre":"Aumentos de más del 10 %","prioridad":1,"condiciones":{"aumento_pct_gt":10},"pasos":[{"tipo":"jefe_area"},{"tipo":"rrhh"}]},
    {"tipo":"cambio_salario","nombre":"Por defecto","prioridad":2,"condiciones":{},"pasos":[{"tipo":"rrhh"}]},
    {"tipo":"prestamo","nombre":"Préstamos de más de $ 2.000.000","prioridad":1,"condiciones":{"monto_gt":2000000},"pasos":[{"tipo":"jefe_directo"},{"tipo":"rrhh"}]},
    {"tipo":"prestamo","nombre":"Por defecto","prioridad":2,"condiciones":{},"pasos":[{"tipo":"rrhh"}]},
    {"tipo":"novedad_nomina","nombre":"Por defecto","prioridad":1,"condiciones":{},"pasos":[{"tipo":"rrhh"}]},
    {"tipo":"vacante","nombre":"Por defecto","prioridad":1,"condiciones":{},"pasos":[{"tipo":"jefe_area"},{"tipo":"rrhh"}]},
    {"tipo":"oferta","nombre":"Por defecto","prioridad":1,"condiciones":{},"pasos":[{"tipo":"rrhh"}]},
    {"tipo":"liquidacion","nombre":"Por defecto","prioridad":1,"condiciones":{},"pasos":[{"tipo":"rrhh"}]}
  ]'::jsonb) loop
    perform public.fn_hr_regla_guardar(p_org, r);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Sugerencia de reemplazo al aprobar vacaciones de alguien que aprueba (no obliga).
create or replace function public.fn_hr_sugerir_reemplazo(p_org integer, p_employment uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_es boolean;
  v_pendientes integer;
  v_tiene boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  select public.fn_hr_usuario_de_empleo(e.id) into v_user from public.employments e where e.id = p_employment and e.organization_id = p_org;
  if v_user is null then
    return jsonb_build_object('sugerir', false);
  end if;
  v_es := exists (select 1 from public.employments e where e.manager_id = p_employment)
       or exists (select 1 from public.departments d where d.manager_employment_id = p_employment)
       or exists (select 1 from public.hr_approval_rule_steps s where s.organization_id = p_org and s.approver_user_id = v_user)
       or v_user = any (public.fn_hr_rrhh_aprobadores(p_org));
  select count(*) into v_pendientes from public.hr_approval_steps s join public.hr_approval_instances i on i.id = s.instance_id
   where i.organization_id = p_org and i.status = 'pendiente' and s.status = 'pendiente' and v_user = any (s.approver_user_ids);
  v_tiene := exists (select 1 from public.hr_approval_delegations d
                      where d.organization_id = p_org and d.delegator_user_id = v_user and d.is_active
                        and d.starts_on <= p_desde and d.ends_on >= p_hasta);
  return jsonb_build_object('sugerir', v_es and not v_tiene, 'es_aprobador', v_es, 'pendientes', v_pendientes, 'ya_tiene_reemplazo', v_tiene);
end;
$$;

-- 8. registrar_cambio: el % de aumento entra al contexto de las reglas ---------------
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
  v_pct numeric;
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
  if p_campo = 'salario' and jsonb_typeof(v_anterior) = 'number' and (v_anterior #>> '{}')::numeric > 0 then
    v_pct := round(((v_valor #>> '{}')::numeric / (v_anterior #>> '{}')::numeric - 1) * 100, 2);
  end if;

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
              jsonb_build_object('branch_id', v_e.branch_id, 'department_id', v_e.department_id, 'position_id', v_e.position_id,
                                 'campo', p_campo,
                                 'monto', case when p_campo = 'salario' then v_valor else null end,
                                 'aumento_pct', v_pct));

  if v_inst is not null then
    update public.hr_employment_events set approval_instance_id = v_inst where id = v_ev;
    v_status := 'pendiente';
  elsif v_edita then
    -- Sin regla y sin nadie más que apruebe (ni jefe ni otra persona de RR. HH.):
    -- queda aprobado por quien tiene permiso de edición, y trazado.
    update public.hr_employment_events set status = 'aprobado', approved_by = v_uid, approved_at = now() where id = v_ev;
    perform public.fn_hr_aplicar_evento(v_ev);
    v_status := 'aprobado';
  else
    raise exception 'requiere_regla_de_aprobacion: no hay a quién enviar la solicitud de %', v_tipo using errcode = '42501';
  end if;

  if v_grupo = 'salario_pago' then
    perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id, 'salario_pago', 'editar',
      p_contexto->>'ip', p_contexto->>'user_agent', coalesce(p_contexto->>'ruta', 'rpc:fn_hr_registrar_cambio'),
      jsonb_build_object('campos', jsonb_build_array(p_campo), 'evento', v_ev));
  else
    perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id, 'basico', 'editar',
      p_contexto->>'ip', p_contexto->>'user_agent', coalesce(p_contexto->>'ruta', 'rpc:fn_hr_registrar_cambio'),
      jsonb_build_object('campos', jsonb_build_array(p_campo), 'evento', v_ev));
  end if;
  return jsonb_build_object('id', v_ev, 'status', v_status, 'approval_instance_id', v_inst);
end;
$$;

revoke execute on function public.fn_hr_regla_aplica(jsonb, jsonb) from public, anon;
revoke execute on function public.fn_hr_rrhh_aprobadores(integer) from public, anon, authenticated;
revoke execute on function public.fn_hr_resolver_aprobadores(integer, public.hr_approval_rule_steps, uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_delegacion_cubre(text, text[], text) from public, anon;
revoke execute on function public.fn_hr_aprobacion_plan(integer, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_iniciar(integer, text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_decidir(uuid, text, text) from public, anon;
revoke execute on function public.fn_hr_mis_aprobaciones_pendientes(integer) from public, anon;
revoke execute on function public.fn_hr_aprobacion_probar(integer, text, uuid, jsonb, date) from public, anon;
revoke execute on function public.fn_hr_regla_guardar(integer, jsonb) from public, anon;
revoke execute on function public.fn_hr_reglas_reordenar(integer, text, uuid[]) from public, anon;
revoke execute on function public.fn_hr_aprobaciones_recomendadas(integer) from public, anon;
revoke execute on function public.fn_hr_sugerir_reemplazo(integer, uuid, date, date) from public, anon;
revoke execute on function public.fn_hr_registrar_cambio(uuid, text, date, jsonb, text, jsonb) from public, anon;
grant execute on function public.fn_hr_regla_aplica(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.fn_hr_delegacion_cubre(text, text[], text) to authenticated, service_role;
grant execute on function public.fn_hr_aprobacion_iniciar(integer, text, text, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.fn_hr_aprobacion_decidir(uuid, text, text) to authenticated;
grant execute on function public.fn_hr_mis_aprobaciones_pendientes(integer) to authenticated;
grant execute on function public.fn_hr_aprobacion_probar(integer, text, uuid, jsonb, date) to authenticated;
grant execute on function public.fn_hr_regla_guardar(integer, jsonb) to authenticated;
grant execute on function public.fn_hr_reglas_reordenar(integer, text, uuid[]) to authenticated;
grant execute on function public.fn_hr_aprobaciones_recomendadas(integer) to authenticated;
grant execute on function public.fn_hr_sugerir_reemplazo(integer, uuid, date, date) to authenticated;
grant execute on function public.fn_hr_registrar_cambio(uuid, text, date, jsonb, text, jsonb) to authenticated;
