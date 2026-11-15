-- HRM fase 0 · paso 3: motor de aprobaciones genérico. ADR-001 §8.
--
-- Reglas por tipo de solicitud con condiciones (sede, área, monto, días) y
-- cadena de aprobadores (jefe directo, jefe del área, rol, persona); delegaciones
-- con fechas; instancias con pasos y decisiones de solo inserción.
-- Las decisiones van SOLO por fn_hr_aprobacion_decidir (transaccional, FOR UPDATE).
-- Ninguna tabla de instancias admite escritura directa.

-- 1. Reglas ------------------------------------------------------------------------
create table if not exists public.hr_approval_rules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  request_type     text not null check (request_type ~ '^[a-z][a-z_]{2,40}$'),
  name             text not null,
  priority         integer not null default 100,
  conditions       jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  is_active        boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists hr_approval_rules_org_tipo_idx on public.hr_approval_rules (organization_id, request_type) where is_active;
comment on column public.hr_approval_rules.conditions is
  'Claves opcionales: branch_ids[], department_ids[], monto_min, monto_max, dias_min, dias_max. Vacío = aplica siempre.';

create table if not exists public.hr_approval_rule_steps (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  rule_id          uuid not null references public.hr_approval_rules(id) on delete cascade,
  step_order       smallint not null check (step_order between 1 and 20),
  approver_type    text not null check (approver_type in ('jefe_directo','jefe_area','rol','persona')),
  approver_role_id integer references public.roles(id),
  approver_user_id uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  constraint hr_approval_rule_steps_orden_uq unique (rule_id, step_order),
  constraint hr_approval_rule_steps_ref_chk check (
    (approver_type = 'rol' and approver_role_id is not null) or
    (approver_type = 'persona' and approver_user_id is not null) or
    (approver_type in ('jefe_directo','jefe_area')))
);

-- 2. Delegaciones --------------------------------------------------------------------
create table if not exists public.hr_approval_delegations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   integer not null references public.organizations(id) on delete cascade,
  delegator_user_id uuid not null references auth.users(id),
  delegate_user_id  uuid not null references auth.users(id),
  request_type      text check (request_type ~ '^[a-z][a-z_]{2,40}$'),
  starts_on         date not null,
  ends_on           date not null,
  reason            text,
  is_active         boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint hr_approval_delegations_fechas_chk check (ends_on >= starts_on),
  constraint hr_approval_delegations_distintos_chk check (delegator_user_id <> delegate_user_id)
);
create index if not exists hr_approval_delegations_delegado_idx on public.hr_approval_delegations (delegate_user_id) where is_active;

-- 3. Instancias, pasos y decisiones --------------------------------------------------
create table if not exists public.hr_approval_instances (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  request_type     text not null,
  subject_table    text not null,
  subject_id       uuid not null,
  employment_id    uuid references public.employments(id),
  requested_by     uuid,
  rule_id          uuid references public.hr_approval_rules(id),
  status           text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada','cancelada')),
  current_step     smallint not null default 1,
  context          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
create index if not exists hr_approval_instances_org_estado_idx on public.hr_approval_instances (organization_id, status);
create index if not exists hr_approval_instances_sujeto_idx on public.hr_approval_instances (subject_table, subject_id);

create table if not exists public.hr_approval_steps (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    integer not null references public.organizations(id) on delete cascade,
  instance_id        uuid not null references public.hr_approval_instances(id),
  step_order         smallint not null,
  approver_type      text not null,
  approver_user_ids  uuid[] not null,
  is_fallback        boolean not null default false,
  status             text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado','cancelado')),
  decided_by         uuid,
  decided_on_behalf_of uuid,
  decided_at         timestamptz,
  comment            text,
  constraint hr_approval_steps_orden_uq unique (instance_id, step_order),
  constraint hr_approval_steps_aprobadores_chk check (cardinality(approver_user_ids) > 0)
);
create index if not exists hr_approval_steps_aprobadores_idx on public.hr_approval_steps using gin (approver_user_ids);

create table if not exists public.hr_approval_decisions (
  id               bigint generated always as identity primary key,
  organization_id  integer not null references public.organizations(id) on delete cascade,
  instance_id      uuid not null references public.hr_approval_instances(id),
  step_id          uuid references public.hr_approval_steps(id),
  actor_user_id    uuid not null,
  on_behalf_of     uuid,
  decision         text not null check (decision in ('aprobar','rechazar','cancelar')),
  comment          text,
  decided_at       timestamptz not null default now()
);
create index if not exists hr_approval_decisions_instancia_idx on public.hr_approval_decisions (instance_id);

create or replace function public.fn_hr_solo_insercion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'hr: % es de solo inserción', tg_table_name using errcode = '42501';
end;
$$;
revoke execute on function public.fn_hr_solo_insercion() from public, anon, authenticated;
drop trigger if exists trg_hr_approval_decisions_inmutable on public.hr_approval_decisions;
create trigger trg_hr_approval_decisions_inmutable before update or delete on public.hr_approval_decisions
  for each row execute function public.fn_hr_solo_insercion();

-- 4. RLS ---------------------------------------------------------------------------
alter table public.hr_approval_rules enable row level security;
alter table public.hr_approval_rule_steps enable row level security;
alter table public.hr_approval_delegations enable row level security;
alter table public.hr_approval_instances enable row level security;
alter table public.hr_approval_steps enable row level security;
alter table public.hr_approval_decisions enable row level security;
revoke all on public.hr_approval_rules, public.hr_approval_rule_steps, public.hr_approval_delegations,
              public.hr_approval_instances, public.hr_approval_steps, public.hr_approval_decisions from anon, public;
revoke insert, update, delete, truncate on public.hr_approval_instances, public.hr_approval_steps, public.hr_approval_decisions from authenticated;
grant select on public.hr_approval_instances, public.hr_approval_steps, public.hr_approval_decisions to authenticated;
grant select, insert, update, delete on public.hr_approval_rules, public.hr_approval_rule_steps to authenticated;
grant select, insert, update on public.hr_approval_delegations to authenticated;

drop policy if exists hr_approval_rules_select on public.hr_approval_rules;
create policy hr_approval_rules_select on public.hr_approval_rules for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_approval_rules_write on public.hr_approval_rules;
create policy hr_approval_rules_write on public.hr_approval_rules for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')));

drop policy if exists hr_approval_rule_steps_select on public.hr_approval_rule_steps;
create policy hr_approval_rule_steps_select on public.hr_approval_rule_steps for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_approval_rule_steps_write on public.hr_approval_rule_steps;
create policy hr_approval_rule_steps_write on public.hr_approval_rule_steps for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage'))
              and rule_id in (select r.id from public.hr_approval_rules r
                               where r.organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage'))));

drop policy if exists hr_approval_delegations_select on public.hr_approval_delegations;
create policy hr_approval_delegations_select on public.hr_approval_delegations for select to authenticated
  using (delegator_user_id = (select auth.uid()) or delegate_user_id = (select auth.uid())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')));
drop policy if exists hr_approval_delegations_insert on public.hr_approval_delegations;
create policy hr_approval_delegations_insert on public.hr_approval_delegations for insert to authenticated
  with check (
    organization_id in (select om.organization_id from public.organization_members om
                         where om.user_id = (select auth.uid()) and om.is_active)
    and (delegator_user_id = (select auth.uid())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage'))));
drop policy if exists hr_approval_delegations_update on public.hr_approval_delegations;
create policy hr_approval_delegations_update on public.hr_approval_delegations for update to authenticated
  using (delegator_user_id = (select auth.uid())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')))
  with check (delegator_user_id = (select auth.uid())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage')));

-- La delegada debe ser miembro activo de la misma organización.
create or replace function public.fn_hr_delegacion_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.organization_members om
                  where om.user_id = new.delegate_user_id and om.organization_id = new.organization_id and om.is_active)
     or not exists (select 1 from public.organization_members om
                  where om.user_id = new.delegator_user_id and om.organization_id = new.organization_id and om.is_active) then
    raise exception 'hr: quien delega y la persona delegada deben ser miembros activos de la organización' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.delegator_user_id <> old.delegator_user_id) then
    raise exception 'hr: una delegación no cambia de dueño' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_delegacion_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_approval_delegations_validar on public.hr_approval_delegations;
create trigger trg_hr_approval_delegations_validar before insert or update on public.hr_approval_delegations
  for each row execute function public.fn_hr_delegacion_validar();

-- Pasos de regla: la regla, el rol y la persona deben ser de la organización.
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
revoke execute on function public.fn_hr_regla_paso_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_approval_rule_steps_validar on public.hr_approval_rule_steps;
create trigger trg_hr_approval_rule_steps_validar before insert or update on public.hr_approval_rule_steps
  for each row execute function public.fn_hr_regla_paso_validar();

-- Instancias visibles para la sesión: quien solicitó, cualquier aprobador, su
-- delegado activo o el gestor. Función DEFINER para que las tres políticas no
-- se llamen entre sí (evita la recursión de RLS entre instancias y pasos).
create or replace function public.fn_hr_instancias_visibles()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id from public.hr_approval_instances i
   where i.requested_by = auth.uid()
  union
  select s.instance_id from public.hr_approval_steps s
   where auth.uid() = any (s.approver_user_ids)
  union
  select s.instance_id from public.hr_approval_steps s
    join public.hr_approval_delegations d
      on d.organization_id = s.organization_id and d.delegator_user_id = any (s.approver_user_ids)
   where d.delegate_user_id = auth.uid() and d.is_active
  union
  select i.id from public.hr_approval_instances i
   where i.organization_id in (select public.fn_hr_orgs_con_permiso('hr.approvals.manage'));
$$;
revoke execute on function public.fn_hr_instancias_visibles() from public, anon;
grant execute on function public.fn_hr_instancias_visibles() to authenticated, service_role;

drop policy if exists hr_approval_instances_select on public.hr_approval_instances;
create policy hr_approval_instances_select on public.hr_approval_instances for select to authenticated
  using (id in (select public.fn_hr_instancias_visibles()));

drop policy if exists hr_approval_steps_select on public.hr_approval_steps;
create policy hr_approval_steps_select on public.hr_approval_steps for select to authenticated
  using (instance_id in (select public.fn_hr_instancias_visibles()));

drop policy if exists hr_approval_decisions_select on public.hr_approval_decisions;
create policy hr_approval_decisions_select on public.hr_approval_decisions for select to authenticated
  using (instance_id in (select public.fn_hr_instancias_visibles()));

-- 5. Funciones ----------------------------------------------------------------------
-- ¿Aplica la regla al contexto? Condiciones ausentes = no restringen.
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

-- Usuario (cuenta) de un vínculo laboral, si tiene y sigue activo.
create or replace function public.fn_hr_usuario_de_empleo(p_employment uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select om.user_id from public.employments e join public.organization_members om on om.id = e.organization_member_id
      where e.id = p_employment and om.is_active),
    (select p.user_id from public.employments e join public.hr_people p on p.id = e.person_id
       join public.organization_members om on om.user_id = p.user_id and om.organization_id = e.organization_id and om.is_active
      where e.id = p_employment));
$$;

-- Aprobadores de un paso de regla para un vínculo.
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

-- Inicia una instancia. Sin regla aplicable devuelve NULL (decide quien llama).
-- Un paso sin aprobador cae en quienes tienen hr.approvals.manage; si tampoco
-- hay, falla: nunca se aprueba por omisión. El solicitante nunca es aprobador.
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

-- Consecuencia de cerrar una instancia, según la tabla del sujeto.
-- (El paso 4 la reemplaza para el historial; aquí queda el despacho base.)
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return;
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

create or replace function public.fn_hr_aprobacion_cancelar(p_instancia uuid, p_motivo text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inst public.hr_approval_instances;
begin
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  select * into v_inst from public.hr_approval_instances where id = p_instancia for update;
  if not found or not exists (select 1 from public.organization_members om
                  where om.user_id = v_uid and om.organization_id = v_inst.organization_id and om.is_active) then
    raise exception 'hr: la solicitud no existe' using errcode = 'P0002';
  end if;
  if v_inst.status <> 'pendiente' then
    raise exception 'hr: la solicitud ya está %', v_inst.status using errcode = '55000';
  end if;
  if v_inst.requested_by is distinct from v_uid and not public.fn_hr_puede(v_inst.organization_id, 'hr.approvals.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  insert into public.hr_approval_decisions (organization_id, instance_id, actor_user_id, decision, comment)
  values (v_inst.organization_id, v_inst.id, v_uid, 'cancelar', left(p_motivo, 2000));
  update public.hr_approval_steps set status = 'cancelado' where instance_id = v_inst.id and status = 'pendiente';
  update public.hr_approval_instances set status = 'cancelada', decided_at = now() where id = v_inst.id;
  perform public.fn_hr_aprobacion_al_cerrar(v_inst.id);
  return jsonb_build_object('id', v_inst.id, 'status', 'cancelada');
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

revoke execute on function public.fn_hr_regla_aplica(jsonb, jsonb) from public, anon;
revoke execute on function public.fn_hr_usuario_de_empleo(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_resolver_aprobadores(integer, public.hr_approval_rule_steps, uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_iniciar(integer, text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_decidir(uuid, text, text) from public, anon;
revoke execute on function public.fn_hr_aprobacion_cancelar(uuid, text) from public, anon;
revoke execute on function public.fn_hr_mis_aprobaciones_pendientes(integer) from public, anon;
grant execute on function public.fn_hr_regla_aplica(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.fn_hr_aprobacion_iniciar(integer, text, text, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.fn_hr_aprobacion_decidir(uuid, text, text) to authenticated;
grant execute on function public.fn_hr_aprobacion_cancelar(uuid, text) to authenticated;
grant execute on function public.fn_hr_mis_aprobaciones_pendientes(integer) to authenticated;
