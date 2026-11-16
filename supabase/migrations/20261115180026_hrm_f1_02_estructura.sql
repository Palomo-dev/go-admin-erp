-- HRM fase 1 · Estructura (Figma 20.1): áreas, cargos y plazas.
-- Ver docs/hrm/ADR-001-modelo-fundaciones.md §15.
--
-- Aditiva. `departments` y `job_positions` se conservan con su nombre y su
-- comportamiento (Roles, el CRM y otros módulos las leen): solo ganan columnas
-- NULL-ables. Lo nuevo:
--   1. permiso «Solicitar plazas» (hr.headcount.request) para los roles 1 y 2;
--   2. perfil del cargo: nivel 1-5, a quién reporta, funciones, educación y
--      experiencia; centro de costos del área por id;
--   3. sedes donde opera cada área;
--   4. competencias del cargo con nivel esperado de 1 a 4;
--   5. escalas salariales por cargo, sede y vigencia (dato sensible del grupo
--      salario_pago: sin acceso directo, solo por RPC con permiso y registro);
--   6. presupuesto de plazas y solicitudes de plaza nueva, que pasan por el
--      motor de aprobaciones de la fase 0 (tipo `plaza_nueva`);
--   7. RPC de servidor (solo service_role, con p_actor): las pantallas leen y
--      escriben por aquí, y el permiso se resuelve en la base.

-- 1. Permiso nuevo -----------------------------------------------------------------
insert into public.permissions (code, name, description, module, category)
values ('hr.headcount.request', 'Solicitar plazas',
        'Pide plazas nuevas para el presupuesto de un área y una sede. La plaza se suma solo cuando se aprueba.', 'hr', 'hr')
on conflict (code) do update
  set name = excluded.name, description = excluded.description, module = excluded.module, category = excluded.category;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p cross join (values (1), (2)) r(role_id)
 where p.code = 'hr.headcount.request'
   and not exists (select 1 from public.role_permissions rp where rp.role_id = r.role_id and rp.permission_id = p.id);

-- 2. Columnas nuevas (NULL-ables) ----------------------------------------------------
alter table public.job_positions add column if not exists grade smallint;
alter table public.job_positions add column if not exists reports_to_position_id uuid;
alter table public.job_positions add column if not exists responsibilities text[];
alter table public.job_positions add column if not exists education text;
alter table public.job_positions add column if not exists experience text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_positions_grade_chk') then
    alter table public.job_positions add constraint job_positions_grade_chk check (grade is null or grade between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_positions_reports_to_fk') then
    alter table public.job_positions add constraint job_positions_reports_to_fk
      foreign key (reports_to_position_id) references public.job_positions(id) on delete set null;
  end if;
end $$;
comment on column public.job_positions.grade is 'HRM: nivel del cargo de 1 (operativo) a 5 (dirección). Sin valor, la UI lo deduce de `level`.';
comment on column public.job_positions.reports_to_position_id is 'HRM: cargo al que reporta.';
comment on column public.job_positions.responsibilities is 'HRM: funciones principales del cargo, en orden.';

alter table public.departments add column if not exists cost_center_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'departments_cost_center_fk') then
    alter table public.departments add constraint departments_cost_center_fk
      foreign key (cost_center_id) references public.cost_centers(id) on delete set null;
  end if;
end $$;
comment on column public.departments.cost_center_id is 'HRM: centro de costos del área. `cost_center` (texto) queda como legado.';

-- 3. Sedes donde opera cada área ----------------------------------------------------
create table if not exists public.hr_department_branches (
  department_id   uuid not null references public.departments(id) on delete cascade,
  branch_id       integer not null references public.branches(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (department_id, branch_id)
);
create index if not exists hr_department_branches_org_idx on public.hr_department_branches (organization_id);
comment on table public.hr_department_branches is 'HRM: sedes donde opera un área. Las sedes son las de la organización: aquí se eligen, no se crean.';
alter table public.hr_department_branches enable row level security;
revoke all on public.hr_department_branches from anon, public, authenticated;
grant select on public.hr_department_branches to authenticated;
drop policy if exists hr_department_branches_select on public.hr_department_branches;
create policy hr_department_branches_select on public.hr_department_branches for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

-- 4. Competencias del cargo ---------------------------------------------------------
create table if not exists public.hr_position_competencies (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  position_id     uuid not null references public.job_positions(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  kind            text not null default 'tecnica' check (kind in ('tecnica','comportamental')),
  expected_level  smallint not null check (expected_level between 1 and 4),
  sort_order      smallint not null default 0,
  created_at      timestamptz not null default now()
);
create unique index if not exists hr_position_competencies_uq on public.hr_position_competencies (position_id, lower(btrim(name)));
create index if not exists hr_position_competencies_org_idx on public.hr_position_competencies (organization_id);
comment on table public.hr_position_competencies is 'HRM: competencias de un cargo con su nivel esperado de 1 a 4 (se usan en desempeño).';
alter table public.hr_position_competencies enable row level security;
revoke all on public.hr_position_competencies from anon, public, authenticated;
grant select on public.hr_position_competencies to authenticated;
drop policy if exists hr_position_competencies_select on public.hr_position_competencies;
create policy hr_position_competencies_select on public.hr_position_competencies for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

-- 5. Escalas salariales (sensible: sin acceso directo) ------------------------------
create table if not exists public.hr_position_salary_scales (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  position_id     uuid not null references public.job_positions(id) on delete cascade,
  branch_id       integer references public.branches(id) on delete cascade,
  min_amount      numeric(14,2) not null,
  mid_amount      numeric(14,2) not null,
  max_amount      numeric(14,2) not null,
  effective_from  date not null,
  effective_to    date,
  reason          text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint hr_position_salary_scales_rango_chk check (min_amount > 0 and min_amount <= mid_amount and mid_amount <= max_amount),
  constraint hr_position_salary_scales_vigencia_chk check (effective_to is null or effective_to >= effective_from)
);
create index if not exists hr_position_salary_scales_pos_idx
  on public.hr_position_salary_scales (position_id, branch_id, effective_from desc);
create index if not exists hr_position_salary_scales_org_idx on public.hr_position_salary_scales (organization_id);
comment on table public.hr_position_salary_scales is
  'HRM: escala salarial (mínimo, medio, máximo) de un cargo por sede y vigencia. branch_id NULL = todas las sedes. Grupo salario_pago: solo por RPC con permiso y registro de accesos.';
alter table public.hr_position_salary_scales enable row level security;
revoke all on public.hr_position_salary_scales from anon, public, authenticated;

create or replace function public.fn_hr_escala_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.job_positions j where j.id = new.position_id and j.organization_id = new.organization_id) then
    raise exception 'hr: el cargo es de otra organización' using errcode = '42501';
  end if;
  if new.branch_id is not null and not exists (select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if exists (select 1 from public.hr_position_salary_scales s
              where s.position_id = new.position_id and s.branch_id is not distinct from new.branch_id and s.id <> new.id
                and daterange(s.effective_from, s.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]')) then
    raise exception 'escala_vigencias_cruzadas: ya hay una escala vigente en esas fechas para el cargo y la sede' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_escala_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_position_salary_scales_validar on public.hr_position_salary_scales;
create trigger trg_hr_position_salary_scales_validar before insert or update on public.hr_position_salary_scales
  for each row execute function public.fn_hr_escala_validar();

-- La escala heredada de job_positions (min_salary / max_salary) pasa a ser la
-- escala de «todas las sedes» desde la fecha en que se creó el cargo.
insert into public.hr_position_salary_scales
  (organization_id, position_id, branch_id, min_amount, mid_amount, max_amount, effective_from, reason)
select j.organization_id, j.id, null, j.min_salary, round((j.min_salary + j.max_salary) / 2, 2), j.max_salary,
       (coalesce(j.created_at, now()) at time zone public.fn_timezone_for(j.organization_id, null))::date,
       'Escala heredada del cargo'
  from public.job_positions j
 where j.min_salary > 0 and j.max_salary >= j.min_salary
   and not exists (select 1 from public.hr_position_salary_scales s where s.position_id = j.id);

-- 6. Plazas: solicitudes y presupuesto ----------------------------------------------
create table if not exists public.hr_headcount_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  department_id        uuid not null references public.departments(id),
  branch_id            integer not null references public.branches(id),
  position_id          uuid references public.job_positions(id) on delete set null,
  quantity             smallint not null check (quantity between 1 and 500),
  kind                 text not null check (kind in ('permanente','temporal')),
  needed_from          date not null,
  ends_on              date,
  justification        text not null check (char_length(btrim(justification)) between 5 and 500),
  status               text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada','cancelada')),
  approval_instance_id uuid references public.hr_approval_instances(id),
  requested_by         uuid not null,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  constraint hr_headcount_requests_tipo_chk check (
    (kind = 'permanente' and ends_on is null) or (kind = 'temporal' and ends_on is not null and ends_on >= needed_from))
);
create index if not exists hr_headcount_requests_org_idx on public.hr_headcount_requests (organization_id, created_at desc);
comment on table public.hr_headcount_requests is 'HRM: solicitud de plaza nueva. Pasa por el motor de aprobaciones (tipo plaza_nueva); al aprobarse se suma al presupuesto.';

create table if not exists public.hr_headcount_budget (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  department_id   uuid not null references public.departments(id),
  branch_id       integer not null references public.branches(id),
  position_id     uuid references public.job_positions(id) on delete set null,
  quantity        integer not null check (quantity > 0),
  kind            text not null default 'permanente' check (kind in ('permanente','temporal')),
  effective_from  date not null,
  effective_to    date,
  request_id      uuid references public.hr_headcount_requests(id),
  reason          text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint hr_headcount_budget_vigencia_chk check (effective_to is null or effective_to >= effective_from)
);
create index if not exists hr_headcount_budget_org_idx on public.hr_headcount_budget (organization_id, department_id, branch_id);
comment on table public.hr_headcount_budget is 'HRM: plazas aprobadas por área y sede (y cargo, si la solicitud lo dijo). Solo se escribe al aprobar una solicitud.';

alter table public.hr_headcount_requests enable row level security;
alter table public.hr_headcount_budget enable row level security;
revoke all on public.hr_headcount_requests from anon, public, authenticated;
revoke all on public.hr_headcount_budget from anon, public, authenticated;
grant select on public.hr_headcount_requests, public.hr_headcount_budget to authenticated;
drop policy if exists hr_headcount_requests_select on public.hr_headcount_requests;
create policy hr_headcount_requests_select on public.hr_headcount_requests for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.view')));
drop policy if exists hr_headcount_budget_select on public.hr_headcount_budget;
create policy hr_headcount_budget_select on public.hr_headcount_budget for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.view')));

-- Al cerrarse la aprobación: la solicitud toma el estado y, si se aprobó, la
-- plaza entra al presupuesto desde la fecha pedida. Va por trigger para no
-- reescribir fn_hr_aprobacion_al_cerrar (la comparten otros frentes).
create or replace function public.fn_hr_plaza_al_decidir()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.hr_headcount_requests;
begin
  select * into v_req from public.hr_headcount_requests
   where id = new.subject_id and approval_instance_id = new.id and status = 'pendiente'
   for update;
  if not found then return new; end if;
  update public.hr_headcount_requests
     set status = new.status, decided_at = coalesce(new.decided_at, now())
   where id = v_req.id;
  if new.status = 'aprobada' then
    insert into public.hr_headcount_budget
      (organization_id, department_id, branch_id, position_id, quantity, kind, effective_from, effective_to, request_id, reason, created_by)
    values (v_req.organization_id, v_req.department_id, v_req.branch_id, v_req.position_id, v_req.quantity, v_req.kind,
            v_req.needed_from, v_req.ends_on, v_req.id, v_req.justification, v_req.requested_by);
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_plaza_al_decidir() from public, anon, authenticated;
drop trigger if exists trg_hr_plaza_al_decidir on public.hr_approval_instances;
create trigger trg_hr_plaza_al_decidir after update of status on public.hr_approval_instances
  for each row when (old.status = 'pendiente' and new.status <> 'pendiente' and new.subject_table = 'hr_headcount_requests')
  execute function public.fn_hr_plaza_al_decidir();

-- 7. Funciones internas --------------------------------------------------------------
create or replace function public.fn_hr_estructura_exigir(p_actor uuid, p_org integer, p_code text)
returns void
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, p_code) then
    raise exception 'sin_permiso: %', p_code using errcode = '42501';
  end if;
end;
$$;

-- Nivel visible: el propio o el deducido del `level` heredado.
create or replace function public.fn_hr_nivel_cargo(p_grade smallint, p_level text)
returns smallint
language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_grade, case p_level when 'junior' then 1 when 'mid' then 2 when 'senior' then 3 when 'executive' then 5 end)::smallint;
$$;

create or replace function public.fn_hr_nombre_persona(p_person uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(concat_ws(' ', coalesce(nullif(p.preferred_name, ''), p.first_name), p.last_name)), '')
    from public.hr_people p where p.id = p_person;
$$;

create or replace function public.fn_hr_nombre_usuario(p_user uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.email)
    from public.profiles pr where pr.id = p_user;
$$;

-- Personas activas (y por ingresar) por área, sede y cargo.
create or replace function public.fn_hr_ocupacion(p_org integer, p_hoy date)
returns table (department_id uuid, branch_id integer, position_id uuid, n integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.department_id, e.branch_id, e.position_id, count(*)::integer
    from public.employments e
   where e.organization_id = p_org and e.status = 'active'
     and (e.termination_date is null or e.termination_date >= p_hoy)
   group by 1, 2, 3;
$$;

-- Plazas aprobadas vigentes por área, sede y cargo.
create or replace function public.fn_hr_presupuesto(p_org integer, p_hoy date)
returns table (department_id uuid, branch_id integer, position_id uuid, n integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select b.department_id, b.branch_id, b.position_id, sum(b.quantity)::integer
    from public.hr_headcount_budget b
   where b.organization_id = p_org and b.effective_from <= p_hoy and (b.effective_to is null or b.effective_to >= p_hoy)
   group by 1, 2, 3;
$$;

-- Salario vigente de un vínculo (último evento aprobado con fecha de efecto ≤ día).
create or replace function public.fn_hr_salario_en(p_employment uuid, p_dia date)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case jsonb_typeof(ev.new_value) when 'number' then (ev.new_value #>> '{}')::numeric
                                         when 'string' then nullif(ev.new_value #>> '{}', '')::numeric end
    from public.hr_employment_events ev
   where ev.employment_id = p_employment and ev.field = 'salario' and ev.status = 'aprobado' and ev.effective_from <= p_dia
   order by ev.effective_from desc, ev.created_at desc
   limit 1;
$$;

-- Escala que aplica a un cargo en una sede y un día: la de la sede y, si no hay, la de todas las sedes.
create or replace function public.fn_hr_escala_aplicable(p_position uuid, p_branch integer, p_dia date)
returns public.hr_position_salary_scales
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.* from public.hr_position_salary_scales s
   where s.position_id = p_position
     and (s.branch_id = p_branch or s.branch_id is null)
     and s.effective_from <= p_dia and (s.effective_to is null or s.effective_to >= p_dia)
   order by (s.branch_id is null), s.effective_from desc
   limit 1;
$$;

create or replace function public.fn_hr_escala_json(s public.hr_position_salary_scales)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'sede_id', s.branch_id, 'minimo', s.min_amount, 'medio', s.mid_amount, 'maximo', s.max_amount,
    'desde', s.effective_from, 'hasta', s.effective_to, 'motivo', s.reason) end;
$$;

-- 8. Áreas ----------------------------------------------------------------------------
create or replace function public.fn_hr_estructura_areas(p_actor uuid, p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.positions.view');
  return jsonb_build_object(
    'hoy', v_hoy,
    'permisos', jsonb_build_object(
      'gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.departments.manage'),
      'solicitar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.headcount.request')),
    'sedes', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) order by b.is_main desc, b.name), '[]'::jsonb)
                from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)),
    'centros', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.code, 'nombre', c.name) order by c.code), '[]'::jsonb)
                  from public.cost_centers c where c.organization_id = p_org and c.is_active),
    'responsables', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                                                                  'cargo', j.name) order by public.fn_hr_nombre_persona(e.person_id)), '[]'::jsonb)
                       from public.employments e left join public.job_positions j on j.id = e.position_id
                      where e.organization_id = p_org and e.status = 'active'
                        and (e.termination_date is null or e.termination_date >= v_hoy)),
    'areas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'parent_id', d.parent_id, 'nombre', d.name, 'codigo', d.code, 'descripcion', d.description,
        'centro_costo', case when c.id is not null then jsonb_build_object('id', c.id, 'codigo', c.code, 'nombre', c.name)
                             when nullif(d.cost_center, '') is not null then jsonb_build_object('id', null, 'codigo', d.cost_center, 'nombre', null) end,
        'responsable', case when m.id is not null then jsonb_build_object('id', m.id, 'nombre', public.fn_hr_nombre_persona(m.person_id), 'cargo', mj.name) end,
        'personas', coalesce((select sum(o.n) from public.fn_hr_ocupacion(p_org, v_hoy) o where o.department_id = d.id), 0),
        'sedes', coalesce((select jsonb_agg(db.branch_id order by db.branch_id) from public.hr_department_branches db where db.department_id = d.id), '[]'::jsonb),
        'plazas', coalesce((
          select jsonb_agg(jsonb_build_object('sede_id', x.branch_id, 'aprobadas', x.aprobadas, 'ocupadas', x.ocupadas) order by x.branch_id)
            from (select coalesce(pr.branch_id, oc.branch_id) branch_id, coalesce(pr.n, 0) aprobadas, coalesce(oc.n, 0) ocupadas
                    from (select p.branch_id, sum(p.n)::integer n from public.fn_hr_presupuesto(p_org, v_hoy) p where p.department_id = d.id group by 1) pr
                    full join (select o.branch_id, sum(o.n)::integer n from public.fn_hr_ocupacion(p_org, v_hoy) o
                                where o.department_id = d.id and o.branch_id is not null group by 1) oc on oc.branch_id = pr.branch_id) x), '[]'::jsonb),
        'cargos', coalesce((
          select jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.name,
                   'personas', coalesce((select sum(o.n) from public.fn_hr_ocupacion(p_org, v_hoy) o where o.position_id = j.id and o.department_id = d.id), 0))
                   order by j.name)
            from public.job_positions j where j.department_id = d.id and coalesce(j.is_active, true)), '[]'::jsonb),
        'actualizado', d.updated_at
      ) order by d.name), '[]'::jsonb)
        from public.departments d
        left join public.cost_centers c on c.id = d.cost_center_id
        left join public.employments m on m.id = d.manager_employment_id
        left join public.job_positions mj on mj.id = m.position_id
       where d.organization_id = p_org and coalesce(d.is_active, true))
  );
end;
$$;

create or replace function public.fn_hr_area_guardar(p_actor uuid, p_org integer, p_id uuid, p_datos jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
  v_nombre text := btrim(coalesce(p_datos->>'nombre', ''));
  v_padre uuid := nullif(p_datos->>'parent_id', '')::uuid;
  v_resp uuid := nullif(p_datos->>'responsable_id', '')::uuid;
  v_cc uuid := nullif(p_datos->>'centro_costo_id', '')::uuid;
  v_desc text := nullif(btrim(coalesce(p_datos->>'descripcion', '')), '');
  v_sede integer;
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.departments.manage');
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if char_length(coalesce(v_desc, '')) > 500 then
    raise exception 'descripcion_larga' using errcode = '22023';
  end if;
  if v_id is not null and not exists (select 1 from public.departments d where d.id = v_id and d.organization_id = p_org) then
    raise exception 'hr: el área no existe' using errcode = 'P0002';
  end if;
  if v_padre is not null then
    if not exists (select 1 from public.departments d where d.id = v_padre and d.organization_id = p_org and coalesce(d.is_active, true)) then
      raise exception 'area_superior_invalida' using errcode = '22023';
    end if;
    if v_id is not null and exists (
      with recursive sub as (select d.id from public.departments d where d.id = v_id
                             union select d.id from public.departments d join sub on d.parent_id = sub.id)
      select 1 from sub where sub.id = v_padre) then
      raise exception 'area_superior_ciclo' using errcode = '22023';
    end if;
  end if;
  if v_resp is not null and not exists (select 1 from public.employments e where e.id = v_resp and e.organization_id = p_org) then
    raise exception 'responsable_invalido' using errcode = '22023';
  end if;
  if v_cc is not null and not exists (select 1 from public.cost_centers c where c.id = v_cc and c.organization_id = p_org) then
    raise exception 'centro_costo_invalido' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.departments (organization_id, parent_id, name, description, manager_employment_id, cost_center_id, is_active)
    values (p_org, v_padre, v_nombre, v_desc, v_resp, v_cc, true)
    returning id into v_id;
  else
    update public.departments
       set parent_id = v_padre, name = v_nombre, description = v_desc, manager_employment_id = v_resp,
           cost_center_id = v_cc, updated_at = now()
     where id = v_id;
  end if;

  if jsonb_typeof(p_datos->'sedes') = 'array' then
    delete from public.hr_department_branches where department_id = v_id;
    for v_sede in select distinct (x #>> '{}')::integer from jsonb_array_elements(p_datos->'sedes') x loop
      if not exists (select 1 from public.branches b where b.id = v_sede and b.organization_id = p_org) then
        raise exception 'sede_invalida' using errcode = '22023';
      end if;
      insert into public.hr_department_branches (department_id, branch_id, organization_id) values (v_id, v_sede, p_org);
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.fn_hr_area_archivar(p_actor uuid, p_org integer, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.departments.manage');
  if not exists (select 1 from public.departments d where d.id = p_id and d.organization_id = p_org and coalesce(d.is_active, true)) then
    raise exception 'hr: el área no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.fn_hr_ocupacion(p_org, v_hoy) o where o.department_id = p_id) then
    raise exception 'area_con_personas' using errcode = '55000';
  end if;
  if exists (select 1 from public.fn_hr_presupuesto(p_org, v_hoy) p where p.department_id = p_id) then
    raise exception 'area_con_plazas' using errcode = '55000';
  end if;
  if exists (select 1 from public.departments d where d.parent_id = p_id and coalesce(d.is_active, true)) then
    raise exception 'area_con_hijas' using errcode = '55000';
  end if;
  update public.departments set is_active = false, updated_at = now() where id = p_id;
end;
$$;

-- 9. Cargos ---------------------------------------------------------------------------
create or replace function public.fn_hr_estructura_cargos(
  p_actor uuid, p_org integer, p_sede integer, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_salario boolean;
  v_res jsonb;
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.positions.view');
  v_salario := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view');
  if p_sede is not null and not exists (select 1 from public.branches b where b.id = p_sede and b.organization_id = p_org) then
    p_sede := null;
  end if;
  select jsonb_build_object(
    'hoy', v_hoy,
    'sede_id', p_sede,
    'permisos', jsonb_build_object(
      'crear', public.fn_hr_puede_actor(p_actor, p_org, 'hr.positions.create'),
      'editar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.positions.edit'),
      'salario', v_salario),
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.name) order by d.name), '[]'::jsonb)
                from public.departments d where d.organization_id = p_org and coalesce(d.is_active, true)),
    'cargos', coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'nombre', j.name, 'codigo', j.code,
        'area_id', j.department_id, 'area', d.name,
        'nivel', public.fn_hr_nivel_cargo(j.grade, j.level),
        'reporta_a', case when r.id is not null then jsonb_build_object('id', r.id, 'nombre', r.name) end,
        'personas', coalesce((select sum(o.n) from public.fn_hr_ocupacion(p_org, v_hoy) o where o.position_id = j.id), 0),
        'plazas', (select sum(p.n) from public.fn_hr_presupuesto(p_org, v_hoy) p where p.position_id = j.id),
        'documentos', cardinality(public.fn_hr_documentos_exigidos(j.id)),
        'escala', case when v_salario then public.fn_hr_escala_json(public.fn_hr_escala_aplicable(j.id, p_sede, v_hoy)) end
      ) order by j.name), '[]'::jsonb))
    into v_res
    from public.job_positions j
    left join public.departments d on d.id = j.department_id
    left join public.job_positions r on r.id = j.reports_to_position_id
   where j.organization_id = p_org and coalesce(j.is_active, true);
  if v_salario then
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
      jsonb_build_object('vista', 'escalas_cargos', 'sede', p_sede));
  end if;
  return v_res;
end;
$$;

create or replace function public.fn_hr_cargo_detalle(
  p_actor uuid, p_org integer, p_id uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_salario boolean;
  v_j public.job_positions;
  v_cargo jsonb := null;
  v_escalas jsonb := null;
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.positions.view');
  v_salario := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view');
  if p_id is not null then
    select * into v_j from public.job_positions j where j.id = p_id and j.organization_id = p_org;
    if not found then
      raise exception 'hr: el cargo no existe' using errcode = 'P0002';
    end if;
    v_cargo := jsonb_build_object(
      'id', v_j.id, 'nombre', v_j.name, 'codigo', v_j.code, 'activo', coalesce(v_j.is_active, true),
      'area_id', v_j.department_id, 'area', (select d.name from public.departments d where d.id = v_j.department_id),
      'nivel', public.fn_hr_nivel_cargo(v_j.grade, v_j.level),
      'reporta_a', (select jsonb_build_object('id', r.id, 'nombre', r.name) from public.job_positions r where r.id = v_j.reports_to_position_id),
      'proposito', v_j.description,
      'funciones', to_jsonb(coalesce(v_j.responsibilities, '{}'::text[])),
      'educacion', v_j.education, 'experiencia', v_j.experience,
      'clase_arl', (select a.risk_class from public.hr_arl_assignments a
                     where a.organization_id = p_org and a.position_id = v_j.id and a.branch_id is null),
      'personas', coalesce((select sum(o.n) from public.fn_hr_ocupacion(p_org, v_hoy) o where o.position_id = v_j.id), 0),
      'competencias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'tipo', c.kind, 'nivel', c.expected_level)
                                                 order by c.sort_order, c.created_at)
                                  from public.hr_position_competencies c where c.position_id = v_j.id), '[]'::jsonb),
      'documentos', to_jsonb(public.fn_hr_documentos_exigidos(v_j.id)),
      'documentos_propios', exists (select 1 from public.hr_position_required_documents r where r.position_id = v_j.id),
      'plazas', coalesce((
        select jsonb_agg(jsonb_build_object('sede_id', x.branch_id, 'aprobadas', x.aprobadas, 'ocupadas', x.ocupadas) order by x.branch_id)
          from (select coalesce(pr.branch_id, oc.branch_id) branch_id, pr.n aprobadas, coalesce(oc.n, 0) ocupadas
                  from (select p.branch_id, sum(p.n)::integer n from public.fn_hr_presupuesto(p_org, v_hoy) p where p.position_id = v_j.id group by 1) pr
                  full join (select o.branch_id, sum(o.n)::integer n from public.fn_hr_ocupacion(p_org, v_hoy) o
                              where o.position_id = v_j.id and o.branch_id is not null group by 1) oc on oc.branch_id = pr.branch_id) x), '[]'::jsonb),
      'actualizado', v_j.updated_at);

    if v_salario then
      v_escalas := jsonb_build_object(
        'vigentes', coalesce((
          select jsonb_agg(public.fn_hr_escala_json(s) || jsonb_build_object(
                   'personas', st.personas, 'debajo', st.debajo, 'encima', st.encima)
                   order by (s.branch_id is not null), s.branch_id)
            from public.hr_position_salary_scales s
            cross join lateral (
              select count(*)::integer personas,
                     count(*) filter (where sal < s.min_amount)::integer debajo,
                     count(*) filter (where sal > s.max_amount)::integer encima
                from (select public.fn_hr_salario_en(e.id, v_hoy) sal
                        from public.employments e
                       where e.organization_id = p_org and e.position_id = v_j.id and e.status = 'active'
                         and (e.termination_date is null or e.termination_date >= v_hoy)
                         and (s.branch_id is null and not exists (select 1 from public.hr_position_salary_scales s2
                                                                   where s2.position_id = v_j.id and s2.branch_id = e.branch_id
                                                                     and s2.effective_from <= v_hoy and (s2.effective_to is null or s2.effective_to >= v_hoy))
                              or e.branch_id = s.branch_id)) z) st
           where s.position_id = v_j.id and s.effective_from <= v_hoy and (s.effective_to is null or s.effective_to >= v_hoy)), '[]'::jsonb),
        'programadas', coalesce((
          select jsonb_agg(public.fn_hr_escala_json(s) order by s.effective_from, s.branch_id)
            from public.hr_position_salary_scales s where s.position_id = v_j.id and s.effective_from > v_hoy), '[]'::jsonb),
        'historial', coalesce((
          select jsonb_agg(public.fn_hr_escala_json(h) || jsonb_build_object('por', public.fn_hr_nombre_usuario(h.created_by), 'creado', h.created_at)
                           order by h.created_at desc)
            from (select * from public.hr_position_salary_scales s where s.position_id = v_j.id order by s.created_at desc limit 10) h), '[]'::jsonb));
      perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
        jsonb_build_object('vista', 'escala_cargo', 'cargo', v_j.id));
    end if;
  end if;

  return jsonb_build_object(
    'hoy', v_hoy,
    'cargo', v_cargo,
    'escalas', v_escalas,
    'permisos', jsonb_build_object(
      'crear', public.fn_hr_puede_actor(p_actor, p_org, 'hr.positions.create'),
      'editar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.positions.edit'),
      'salario', v_salario,
      'salario_editar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.edit'),
      'arl', public.fn_hr_puede_actor(p_actor, p_org, 'hr.parameters.manage')),
    'sedes', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) order by b.is_main desc, b.name), '[]'::jsonb)
                from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)),
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.name) order by d.name), '[]'::jsonb)
                from public.departments d where d.organization_id = p_org and coalesce(d.is_active, true)),
    'cargos', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.name) order by j.name), '[]'::jsonb)
                 from public.job_positions j where j.organization_id = p_org and coalesce(j.is_active, true)
                  and (p_id is null or j.id <> p_id))
  );
end;
$$;

create or replace function public.fn_hr_cargo_guardar(
  p_actor uuid, p_org integer, p_id uuid, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
  v_hoy date := public.fn_today_for(p_org, null);
  v_nombre text := btrim(coalesce(p_datos->>'nombre', ''));
  v_area uuid := nullif(p_datos->>'area_id', '')::uuid;
  v_nivel smallint := nullif(p_datos->>'nivel', '')::smallint;
  v_reporta uuid := nullif(p_datos->>'reporta_a_id', '')::uuid;
  v_prop text := nullif(btrim(coalesce(p_datos->>'proposito', '')), '');
  v_edu text := nullif(btrim(coalesce(p_datos->>'educacion', '')), '');
  v_exp text := nullif(btrim(coalesce(p_datos->>'experiencia', '')), '');
  v_funciones text[];
  v_item jsonb;
  v_orden smallint := 0;
  v_desde date;
  v_motivo text;
  v_sede integer;
  v_min numeric; v_med numeric; v_max numeric;
  v_vig public.hr_position_salary_scales;
  v_n integer := 0;
  v_cat text;
  v_clase smallint;
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, case when v_id is null then 'hr.positions.create' else 'hr.positions.edit' end);
  if v_id is not null and not exists (select 1 from public.job_positions j where j.id = v_id and j.organization_id = p_org) then
    raise exception 'hr: el cargo no existe' using errcode = 'P0002';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if v_area is null or not exists (select 1 from public.departments d where d.id = v_area and d.organization_id = p_org) then
    raise exception 'area_invalida' using errcode = '22023';
  end if;
  if v_nivel is null or v_nivel not between 1 and 5 then
    raise exception 'nivel_invalido' using errcode = '22023';
  end if;
  if v_reporta is not null then
    if v_reporta = v_id or not exists (select 1 from public.job_positions j where j.id = v_reporta and j.organization_id = p_org) then
      raise exception 'reporta_a_invalido' using errcode = '22023';
    end if;
    if v_id is not null and exists (
      with recursive arriba as (select j.reports_to_position_id id from public.job_positions j where j.id = v_reporta
                                union select j.reports_to_position_id from public.job_positions j join arriba on j.id = arriba.id
                                 where arriba.id is not null)
      select 1 from arriba where arriba.id = v_id) then
      raise exception 'reporta_a_ciclo' using errcode = '22023';
    end if;
  end if;
  if char_length(coalesce(v_prop, '')) > 1000 or char_length(coalesce(v_edu, '')) > 300 or char_length(coalesce(v_exp, '')) > 300 then
    raise exception 'texto_largo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_datos->'funciones') = 'array' then
    select coalesce(array_agg(left(btrim(x #>> '{}'), 300) order by o), '{}')
      into v_funciones
      from jsonb_array_elements(p_datos->'funciones') with ordinality t(x, o)
     where btrim(coalesce(x #>> '{}', '')) <> '';
    if cardinality(v_funciones) > 20 then
      raise exception 'demasiadas_funciones' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.job_positions (organization_id, department_id, name, description, grade, reports_to_position_id,
                                      responsibilities, education, experience, is_active)
    values (p_org, v_area, v_nombre, v_prop, v_nivel, v_reporta, coalesce(v_funciones, '{}'), v_edu, v_exp, true)
    returning id into v_id;
  else
    update public.job_positions
       set name = v_nombre, department_id = v_area, description = v_prop, grade = v_nivel,
           reports_to_position_id = v_reporta,
           responsibilities = case when v_funciones is null then responsibilities else v_funciones end,
           education = v_edu, experience = v_exp, updated_at = now()
     where id = v_id;
  end if;

  -- Competencias: se reemplazan si llegan.
  if jsonb_typeof(p_datos->'competencias') = 'array' then
    if jsonb_array_length(p_datos->'competencias') > 30 then
      raise exception 'demasiadas_competencias' using errcode = '22023';
    end if;
    delete from public.hr_position_competencies where position_id = v_id;
    for v_item in select x from jsonb_array_elements(p_datos->'competencias') x loop
      v_orden := v_orden + 1;
      if coalesce(v_item->>'tipo', '') not in ('tecnica','comportamental')
         or coalesce(nullif(v_item->>'nivel', '')::smallint, 0) not between 1 and 4
         or char_length(btrim(coalesce(v_item->>'nombre', ''))) not between 2 and 120 then
        raise exception 'competencia_invalida' using errcode = '22023';
      end if;
      insert into public.hr_position_competencies (organization_id, position_id, name, kind, expected_level, sort_order)
      values (p_org, v_id, btrim(v_item->>'nombre'), v_item->>'tipo', (v_item->>'nivel')::smallint, v_orden);
    end loop;
  end if;

  -- Documentos que exige: se reemplazan si llegan.
  if jsonb_typeof(p_datos->'documentos') = 'array' then
    delete from public.hr_position_required_documents where position_id = v_id;
    for v_cat in select distinct x #>> '{}' from jsonb_array_elements(p_datos->'documentos') x loop
      if v_cat !~ '^[a-z][a-z0-9_]{2,40}$' then
        raise exception 'documento_invalido' using errcode = '22023';
      end if;
      insert into public.hr_position_required_documents (organization_id, position_id, category, created_by)
      values (p_org, v_id, v_cat, p_actor);
    end loop;
  end if;

  -- Clase de riesgo ARL del cargo (todas las sedes): es un parámetro de la empresa.
  if p_datos ? 'clase_arl' then
    v_clase := nullif(p_datos->>'clase_arl', '')::smallint;
    if v_clase is distinct from (select a.risk_class from public.hr_arl_assignments a
                                  where a.organization_id = p_org and a.position_id = v_id and a.branch_id is null) then
      perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.parameters.manage');
      if v_clase is null then
        delete from public.hr_arl_assignments where organization_id = p_org and position_id = v_id and branch_id is null;
      elsif v_clase not between 1 and 5 then
        raise exception 'clase_arl_invalida' using errcode = '22023';
      elsif exists (select 1 from public.hr_arl_assignments a where a.organization_id = p_org and a.position_id = v_id and a.branch_id is null) then
        update public.hr_arl_assignments set risk_class = v_clase where organization_id = p_org and position_id = v_id and branch_id is null;
      else
        insert into public.hr_arl_assignments (organization_id, branch_id, position_id, risk_class, created_by)
        values (p_org, null, v_id, v_clase, p_actor);
      end if;
    end if;
  end if;

  -- Escala salarial: dato sensible, con su propio permiso y registro.
  if jsonb_typeof(p_datos->'escala') = 'object' then
    if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.edit') then
      perform public.fn_hr_registrar_intento(p_actor, p_org, null, null, 'salario_pago', p_ip, p_ua, p_ruta,
        jsonb_build_object('vista', 'escala_cargo', 'cargo', v_id));
      raise exception 'sin_permiso: hr.data.salario_pago.edit' using errcode = '42501';
    end if;
    v_desde := nullif(p_datos->'escala'->>'desde', '')::date;
    v_motivo := nullif(btrim(coalesce(p_datos->'escala'->>'motivo', '')), '');
    if v_desde is null then raise exception 'escala_sin_fecha' using errcode = '22023'; end if;
    if v_motivo is null or char_length(v_motivo) > 200 then raise exception 'escala_sin_motivo' using errcode = '22023'; end if;
    for v_item in select x from jsonb_array_elements(coalesce(p_datos->'escala'->'filas', '[]'::jsonb)) x loop
      v_sede := nullif(v_item->>'sede_id', '')::integer;
      v_min := nullif(v_item->>'minimo', '')::numeric;
      v_med := nullif(v_item->>'medio', '')::numeric;
      v_max := nullif(v_item->>'maximo', '')::numeric;
      if v_min is null or v_med is null or v_max is null or v_min <= 0 or v_min > v_med or v_med > v_max then
        raise exception 'escala_invalida' using errcode = '22023';
      end if;
      if exists (select 1 from public.hr_position_salary_scales s
                  where s.position_id = v_id and s.branch_id is not distinct from v_sede and s.effective_from >= v_desde) then
        raise exception 'escala_fecha_anterior: ya hay una escala desde esa fecha o una posterior' using errcode = '22023';
      end if;
      select * into v_vig from public.hr_position_salary_scales s
       where s.position_id = v_id and s.branch_id is not distinct from v_sede and s.effective_to is null
       for update;
      if found then
        update public.hr_position_salary_scales set effective_to = v_desde - 1 where id = v_vig.id;
      end if;
      insert into public.hr_position_salary_scales
        (organization_id, position_id, branch_id, min_amount, mid_amount, max_amount, effective_from, reason, created_by)
      values (p_org, v_id, v_sede, round(v_min, 2), round(v_med, 2), round(v_max, 2), v_desde, v_motivo, p_actor);
      v_n := v_n + 1;
    end loop;
    if v_n > 0 then
      perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'editar', p_ip, p_ua, p_ruta,
        jsonb_build_object('vista', 'escala_cargo', 'cargo', v_id, 'campos', jsonb_build_array('escala'), 'sedes', v_n));
    end if;
  end if;
  return v_id;
end;
$$;

-- 10. Plazas --------------------------------------------------------------------------
create or replace function public.fn_hr_estructura_plazas(p_actor uuid, p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.positions.view');
  return jsonb_build_object(
    'hoy', v_hoy,
    'permisos', jsonb_build_object('solicitar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.headcount.request')),
    'sedes', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) order by b.is_main desc, b.name), '[]'::jsonb)
                from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)),
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.name, 'parent_id', d.parent_id) order by d.name), '[]'::jsonb)
                from public.departments d where d.organization_id = p_org and coalesce(d.is_active, true)),
    'cargos', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.name, 'area_id', j.department_id) order by j.name), '[]'::jsonb)
                 from public.job_positions j where j.organization_id = p_org and coalesce(j.is_active, true)),
    'filas', (
      select coalesce(jsonb_agg(jsonb_build_object('area_id', x.department_id, 'sede_id', x.branch_id,
                                                   'aprobadas', x.aprobadas, 'ocupadas', x.ocupadas)
                                order by x.department_id, x.branch_id), '[]'::jsonb)
        from (select coalesce(pr.department_id, oc.department_id) department_id, coalesce(pr.branch_id, oc.branch_id) branch_id,
                     coalesce(pr.n, 0) aprobadas, coalesce(oc.n, 0) ocupadas
                from (select p.department_id, p.branch_id, sum(p.n)::integer n from public.fn_hr_presupuesto(p_org, v_hoy) p group by 1, 2) pr
                full join (select o.department_id, o.branch_id, sum(o.n)::integer n from public.fn_hr_ocupacion(p_org, v_hoy) o
                            where o.department_id is not null and o.branch_id is not null group by 1, 2) oc
                  on oc.department_id = pr.department_id and oc.branch_id = pr.branch_id) x),
    'solicitudes', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'area_id', r.department_id, 'sede_id', r.branch_id, 'cargo_id', r.position_id,
          'cargo', (select j.name from public.job_positions j where j.id = r.position_id),
          'cantidad', r.quantity, 'tipo', r.kind, 'desde', r.needed_from, 'hasta', r.ends_on,
          'justificacion', r.justification, 'estado', r.status,
          'solicitado_por', public.fn_hr_nombre_usuario(r.requested_by), 'creado', r.created_at, 'decidido', r.decided_at,
          'decidido_por', (select public.fn_hr_nombre_usuario(s.decided_by) from public.hr_approval_steps s
                            where s.instance_id = r.approval_instance_id and s.status in ('aprobado','rechazado')
                            order by s.step_order desc limit 1),
          'comentario', (select s.comment from public.hr_approval_steps s
                          where s.instance_id = r.approval_instance_id and s.status = 'rechazado' limit 1),
          'aprobadores', (select coalesce(jsonb_agg(public.fn_hr_nombre_usuario(u)), '[]'::jsonb)
                            from public.hr_approval_instances i
                            join public.hr_approval_steps s on s.instance_id = i.id and s.step_order = i.current_step
                            cross join lateral unnest(s.approver_user_ids) u
                           where i.id = r.approval_instance_id and i.status = 'pendiente')
        ) order by r.created_at desc), '[]'::jsonb)
        from (select * from public.hr_headcount_requests q where q.organization_id = p_org order by q.created_at desc limit 20) r)
  );
end;
$$;

create or replace function public.fn_hr_plaza_validar_datos(p_org integer, p_datos jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_area uuid := nullif(p_datos->>'area_id', '')::uuid;
  v_sede integer := nullif(p_datos->>'sede_id', '')::integer;
  v_cargo uuid := nullif(p_datos->>'cargo_id', '')::uuid;
begin
  if v_area is null or not exists (select 1 from public.departments d where d.id = v_area and d.organization_id = p_org and coalesce(d.is_active, true)) then
    raise exception 'area_invalida' using errcode = '22023';
  end if;
  if v_sede is null or not exists (select 1 from public.branches b where b.id = v_sede and b.organization_id = p_org) then
    raise exception 'sede_invalida' using errcode = '22023';
  end if;
  if v_cargo is null or not exists (select 1 from public.job_positions j where j.id = v_cargo and j.organization_id = p_org and coalesce(j.is_active, true)) then
    raise exception 'cargo_invalido' using errcode = '22023';
  end if;
  return jsonb_build_object('branch_id', v_sede, 'department_id', v_area, 'position_id', v_cargo,
                            'cantidad', nullif(p_datos->>'cantidad', '')::integer);
end;
$$;

-- Vista previa del diálogo: quién aprueba y la escala del cargo en la sede.
create or replace function public.fn_hr_plaza_plan(
  p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx jsonb;
  v_plan jsonb;
  v_escala jsonb := null;
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.headcount.request');
  v_ctx := public.fn_hr_plaza_validar_datos(p_org, p_datos);
  v_plan := public.fn_hr_aprobacion_plan(p_org, 'plaza_nueva', null, p_actor, v_ctx);
  if public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view') then
    v_escala := public.fn_hr_escala_json(public.fn_hr_escala_aplicable((v_ctx->>'position_id')::uuid, (v_ctx->>'branch_id')::integer,
                                                                       public.fn_today_for(p_org, null)));
    if v_escala is not null then
      perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
        jsonb_build_object('vista', 'escala_solicitud_plaza', 'cargo', v_ctx->>'position_id', 'sede', v_ctx->'branch_id'));
    end if;
  end if;
  return jsonb_build_object(
    'regla', v_plan->'regla',
    'sin_aprobador', (v_plan->>'sin_aprobador') is not null,
    'aprobadores', coalesce((select jsonb_agg(jsonb_build_object('nombre', public.fn_hr_nombre_usuario(u::uuid),
                                                                 'cargo', (select j.name from public.employments e
                                                                             join public.organization_members om on om.id = e.organization_member_id
                                                                             left join public.job_positions j on j.id = e.position_id
                                                                            where om.user_id = u::uuid and om.organization_id = p_org
                                                                            order by e.hire_date desc nulls last limit 1)))
                               from jsonb_array_elements(v_plan->'pasos') pa
                               cross join lateral jsonb_array_elements_text(pa->'aprobadores') u
                              where (pa->>'orden')::integer = 1), '[]'::jsonb),
    'pasos', jsonb_array_length(coalesce(v_plan->'pasos', '[]'::jsonb)),
    'escala', v_escala);
end;
$$;

create or replace function public.fn_hr_plaza_solicitar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx jsonb;
  v_id uuid;
  v_inst uuid;
  v_cant integer := nullif(p_datos->>'cantidad', '')::integer;
  v_tipo text := coalesce(p_datos->>'tipo', 'permanente');
  v_desde date := nullif(p_datos->>'desde', '')::date;
  v_hasta date := nullif(p_datos->>'hasta', '')::date;
  v_just text := btrim(coalesce(p_datos->>'justificacion', ''));
begin
  perform public.fn_hr_estructura_exigir(p_actor, p_org, 'hr.headcount.request');
  v_ctx := public.fn_hr_plaza_validar_datos(p_org, p_datos);
  if v_cant is null or v_cant not between 1 and 500 then raise exception 'cantidad_invalida' using errcode = '22023'; end if;
  if v_tipo not in ('permanente','temporal') then raise exception 'tipo_invalido' using errcode = '22023'; end if;
  if v_desde is null then raise exception 'fecha_invalida' using errcode = '22023'; end if;
  if v_tipo = 'temporal' and (v_hasta is null or v_hasta < v_desde) then raise exception 'fecha_fin_invalida' using errcode = '22023'; end if;
  if char_length(v_just) < 5 or char_length(v_just) > 500 then raise exception 'justificacion_invalida' using errcode = '22023'; end if;

  insert into public.hr_headcount_requests
    (organization_id, department_id, branch_id, position_id, quantity, kind, needed_from, ends_on, justification, requested_by)
  values (p_org, (v_ctx->>'department_id')::uuid, (v_ctx->>'branch_id')::integer, (v_ctx->>'position_id')::uuid, v_cant, v_tipo,
          v_desde, case when v_tipo = 'temporal' then v_hasta end, v_just, p_actor)
  returning id into v_id;

  v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'plaza_nueva', 'hr_headcount_requests', v_id, null, p_actor,
                                            v_ctx || jsonb_build_object('cantidad', v_cant, 'tipo', v_tipo));
  if v_inst is null then
    -- Nadie se contrata contra una plaza sin aprobar: sin aprobador, no hay solicitud.
    raise exception 'aprobacion_sin_aprobador' using errcode = '22023';
  end if;
  update public.hr_headcount_requests set approval_instance_id = v_inst where id = v_id;
  return jsonb_build_object('id', v_id, 'instancia', v_inst);
end;
$$;

-- 11. Para la ficha, el alta y «Registrar un cambio» (agente de empleados) --------------
create or replace function public.fn_hr_escala_vigente(
  p_actor uuid, p_org integer, p_position uuid, p_branch integer, p_dia date, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_dia date := coalesce(p_dia, public.fn_today_for(p_org, null));
  v_res jsonb;
begin
  if not exists (select 1 from public.job_positions j where j.id = p_position and j.organization_id = p_org) then
    raise exception 'hr: el cargo no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view') then
    perform public.fn_hr_registrar_intento(p_actor, p_org, null, null, 'salario_pago', p_ip, p_ua, p_ruta,
      jsonb_build_object('vista', 'escala_vigente', 'cargo', p_position));
    raise exception 'sin_permiso: hr.data.salario_pago.view' using errcode = '42501';
  end if;
  v_res := public.fn_hr_escala_json(public.fn_hr_escala_aplicable(p_position, p_branch, v_dia));
  if v_res is not null then
    v_res := v_res || jsonb_build_object(
      'cargo', (select j.name from public.job_positions j where j.id = p_position),
      'sede', (select b.name from public.branches b where b.id = (v_res->>'sede_id')::integer));
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
      jsonb_build_object('vista', 'escala_vigente', 'cargo', p_position, 'sede', p_branch));
  end if;
  return v_res;
end;
$$;

create or replace function public.fn_hr_plaza_disponible(p_actor uuid, p_org integer, p_position uuid, p_branch integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_area uuid;
  v_aprob integer;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.positions.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.edit')) then
    raise exception 'sin_permiso: hr.positions.view' using errcode = '42501';
  end if;
  select j.department_id into v_area from public.job_positions j where j.id = p_position and j.organization_id = p_org;
  if v_area is null or p_branch is null then
    return null;
  end if;
  select sum(p.n)::integer into v_aprob from public.fn_hr_presupuesto(p_org, v_hoy) p
   where p.department_id = v_area and p.branch_id = p_branch;
  if v_aprob is null then
    return null;  -- el área no tiene presupuesto en esa sede: no hay contra qué comparar
  end if;
  return jsonb_build_object(
    'area_id', v_area, 'sede_id', p_branch, 'aprobadas', v_aprob,
    'ocupadas', coalesce((select sum(o.n)::integer from public.fn_hr_ocupacion(p_org, v_hoy) o
                           where o.department_id = v_area and o.branch_id = p_branch), 0));
end;
$$;

-- 12. Permisos de ejecución: todo cerrado salvo la service role ----------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.fn_hr_estructura_exigir(uuid, integer, text)',
    'public.fn_hr_nombre_persona(uuid)',
    'public.fn_hr_nombre_usuario(uuid)',
    'public.fn_hr_ocupacion(integer, date)',
    'public.fn_hr_presupuesto(integer, date)',
    'public.fn_hr_salario_en(uuid, date)',
    'public.fn_hr_escala_aplicable(uuid, integer, date)',
    'public.fn_hr_escala_json(public.hr_position_salary_scales)',
    'public.fn_hr_nivel_cargo(smallint, text)',
    'public.fn_hr_estructura_areas(uuid, integer)',
    'public.fn_hr_area_guardar(uuid, integer, uuid, jsonb)',
    'public.fn_hr_area_archivar(uuid, integer, uuid)',
    'public.fn_hr_estructura_cargos(uuid, integer, integer, text, text, text)',
    'public.fn_hr_cargo_detalle(uuid, integer, uuid, text, text, text)',
    'public.fn_hr_cargo_guardar(uuid, integer, uuid, jsonb, text, text, text)',
    'public.fn_hr_estructura_plazas(uuid, integer)',
    'public.fn_hr_plaza_validar_datos(integer, jsonb)',
    'public.fn_hr_plaza_plan(uuid, integer, jsonb, text, text, text)',
    'public.fn_hr_plaza_solicitar(uuid, integer, jsonb)',
    'public.fn_hr_escala_vigente(uuid, integer, uuid, integer, date, text, text, text)',
    'public.fn_hr_plaza_disponible(uuid, integer, uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;