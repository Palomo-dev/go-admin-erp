-- HRM fase 0 · paso 2: persona-empleado independiente del usuario (R4, R5).
-- Ver docs/hrm/ADR-001-modelo-fundaciones.md §2.
--
-- - hr_people: la persona; user_id y organization_member_id opcionales (SET NULL).
-- - Datos sensibles (identificación, beneficiarios, contactos, banco) en tablas
--   sin política para authenticated: solo se leen y escriben por RPC (paso 7).
-- - employments pasa a ser el vínculo laboral de la persona: gana organization_id
--   y person_id; organization_member_id deja de ser NOT NULL y su FK pasa de
--   CASCADE a SET NULL. Borrar un usuario ya no borra el historial laboral.
-- - Las columnas sensibles heredadas de employments quedan congeladas (hoy las
--   107 filas las tienen en NULL; verificado antes de aplicar).
-- - Backfill: una persona por cada vínculo existente, desde profiles.

-- 1. Persona --------------------------------------------------------------------
create table if not exists public.hr_people (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        integer not null references public.organizations(id) on delete cascade,
  first_name             text not null check (length(btrim(first_name)) > 0),
  second_name            text,
  last_name              text,
  second_last_name       text,
  preferred_name         text,
  work_email             text,
  work_phone             text,
  user_id                uuid references auth.users(id) on delete set null,
  organization_member_id bigint references public.organization_members(id) on delete set null,
  status                 text not null default 'activo' check (status in ('activo','inactivo')),
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  created_by             uuid,
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
comment on table public.hr_people is
  'HRM: persona-empleado de la organización, exista o no como usuario de la app (ADR-001 §2).';
create unique index if not exists hr_people_org_miembro_uq on public.hr_people (organization_id, organization_member_id) where organization_member_id is not null;
create unique index if not exists hr_people_org_usuario_uq on public.hr_people (organization_id, user_id) where user_id is not null;
create index if not exists hr_people_org_idx on public.hr_people (organization_id);
create index if not exists hr_people_usuario_idx on public.hr_people (user_id) where user_id is not null;

-- 2. Datos sensibles (grupo identificación y banco) ------------------------------
create table if not exists public.hr_people_identification (
  person_id        uuid primary key references public.hr_people(id),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  doc_type         text not null check (doc_type in ('CC','CE','TI','RC','PA','PEP','PPT','NIT','NUIP','DIE')),
  doc_number       text not null check (doc_number ~ '^[A-Za-z0-9-]{3,20}$'),
  doc_issue_date   date,
  doc_issue_place  text,
  birth_date       date,
  birth_place      text,
  sex              text check (sex in ('F','M','X')),
  nationality      text,
  marital_status   text check (marital_status in ('soltero','casado','union_libre','separado','divorciado','viudo')),
  personal_email   text,
  personal_phone   text,
  address          text,
  municipality_id  uuid,
  education_level  text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  constraint hr_people_identification_doc_uq unique (organization_id, doc_type, doc_number)
);
comment on table public.hr_people_identification is
  'HRM grupo identificacion: solo por RPC (fn_hr_datos_sensibles_*). Documento único por organización.';

create table if not exists public.hr_person_beneficiaries (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     integer not null references public.organizations(id) on delete cascade,
  person_id           uuid not null references public.hr_people(id),
  full_name           text not null,
  relationship        text not null check (relationship in ('conyuge','companero','hijo','padre','madre','hermano','otro')),
  doc_type            text check (doc_type in ('CC','CE','TI','RC','PA','PEP','PPT','NIT','NUIP','DIE')),
  doc_number          text,
  birth_date          date,
  is_tax_dependent    boolean not null default false,
  is_ccf_beneficiary  boolean not null default false,
  is_health_beneficiary boolean not null default false,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
create index if not exists hr_person_beneficiaries_persona_idx on public.hr_person_beneficiaries (person_id);

create table if not exists public.hr_person_emergency_contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  person_id        uuid not null references public.hr_people(id),
  full_name        text not null,
  relationship     text,
  phone            text not null,
  alt_phone        text,
  priority         smallint not null default 1 check (priority between 1 and 9),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index if not exists hr_person_emergency_contacts_persona_idx on public.hr_person_emergency_contacts (person_id);

create table if not exists public.hr_person_bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null references public.organizations(id) on delete cascade,
  person_id        uuid not null references public.hr_people(id),
  bank_code        text,
  bank_name        text not null,
  account_type     text not null check (account_type in ('ahorros','corriente','deposito_electronico')),
  account_number   text not null check (account_number ~ '^[0-9-]{4,30}$'),
  holder_name      text,
  is_primary       boolean not null default false,
  valid_from       date,
  valid_to         date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index if not exists hr_person_bank_accounts_persona_idx on public.hr_person_bank_accounts (person_id);
create unique index if not exists hr_person_bank_accounts_principal_uq on public.hr_person_bank_accounts (person_id) where is_primary and is_active;

-- Coherencia de organización entre la persona y sus datos.
create or replace function public.fn_hr_misma_org_persona()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select p.organization_id into v_org from public.hr_people p where p.id = new.person_id;
  if v_org is null then
    raise exception 'hr: la persona no existe' using errcode = '23503';
  end if;
  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    raise exception 'hr: la persona es de otra organización' using errcode = '42501';
  end if;
  if tg_table_name <> 'hr_documents' then  -- hr_documents (paso 7) no tiene updated_at
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_misma_org_persona() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['hr_people_identification','hr_person_beneficiaries','hr_person_emergency_contacts','hr_person_bank_accounts'] loop
    execute format('drop trigger if exists trg_%1$s_misma_org on public.%1$I', t);
    execute format('create trigger trg_%1$s_misma_org before insert or update on public.%1$I for each row execute function public.fn_hr_misma_org_persona()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;

-- 3. employments → vínculo laboral de la persona --------------------------------
alter table public.employments add column if not exists organization_id integer references public.organizations(id) on delete cascade;
alter table public.employments add column if not exists person_id uuid references public.hr_people(id);
create index if not exists employments_org_idx on public.employments (organization_id);
create index if not exists employments_persona_idx on public.employments (person_id);
create index if not exists employments_jefe_idx on public.employments (manager_id) where manager_id is not null;

alter table public.employments alter column organization_member_id drop not null;
alter table public.employments drop constraint if exists employments_organization_member_id_fkey;
alter table public.employments add constraint employments_organization_member_id_fkey
  foreign key (organization_member_id) references public.organization_members(id) on delete set null;

-- Backfill: organización y persona de cada vínculo existente.
update public.employments e
   set organization_id = om.organization_id
  from public.organization_members om
 where om.id = e.organization_member_id and e.organization_id is null;

insert into public.hr_people (organization_id, first_name, last_name, work_email, user_id, organization_member_id)
select om.organization_id,
       coalesce(nullif(btrim(pr.first_name), ''), nullif(split_part(pr.email, '@', 1), ''), 'Sin nombre'),
       nullif(btrim(pr.last_name), ''),
       pr.email, om.user_id, om.id
  from public.employments e
  join public.organization_members om on om.id = e.organization_member_id
  left join public.profiles pr on pr.id = om.user_id
 where e.person_id is null
   and not exists (select 1 from public.hr_people p where p.organization_member_id = om.id)
 group by om.organization_id, om.id, om.user_id, pr.first_name, pr.last_name, pr.email;

update public.employments e
   set person_id = p.id
  from public.hr_people p
 where p.organization_member_id = e.organization_member_id and e.person_id is null;

alter table public.employments drop constraint if exists employments_organization_id_nn;
alter table public.employments add constraint employments_organization_id_nn check (organization_id is not null) not valid;
alter table public.employments validate constraint employments_organization_id_nn;

comment on column public.employments.organization_id is 'HRM: organización del vínculo (ADR-001 §2). La fija trg_000_employments_organizacion.';
comment on column public.employments.person_id is 'HRM: persona del vínculo (hr_people). employments es el vínculo laboral de la persona.';
comment on column public.employments.base_salary is 'LEGADO CONGELADO (ADR-001 §2): el salario vive en hr_employment_events. Solo admite NULL.';

-- Organización, coherencia y persona en cada vínculo nuevo o reasignado.
create or replace function public.fn_hr_employments_organizacion()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org_miembro integer;
  v_user uuid;
  v_org_persona integer;
begin
  if new.organization_member_id is not null then
    select om.organization_id, om.user_id into v_org_miembro, v_user
      from public.organization_members om where om.id = new.organization_member_id;
    if new.organization_id is null then
      new.organization_id := v_org_miembro;
    elsif v_org_miembro is not null and v_org_miembro <> new.organization_id then
      raise exception 'hr: el miembro es de otra organización' using errcode = '42501';
    end if;
  end if;

  if new.organization_id is null then
    raise exception 'hr: el vínculo laboral necesita organization_id o un miembro' using errcode = '23502';
  end if;

  if new.person_id is null and new.organization_member_id is not null then
    select p.id into new.person_id from public.hr_people p
     where p.organization_member_id = new.organization_member_id;
    if new.person_id is null then
      insert into public.hr_people (organization_id, first_name, last_name, work_email, user_id, organization_member_id)
      select new.organization_id,
             coalesce(nullif(btrim(pr.first_name), ''), nullif(split_part(pr.email, '@', 1), ''), 'Sin nombre'),
             nullif(btrim(pr.last_name), ''), pr.email, v_user, new.organization_member_id
        from (select 1) x
        left join public.profiles pr on pr.id = v_user
      returning id into new.person_id;
    end if;
  end if;

  if new.person_id is not null then
    select p.organization_id into v_org_persona from public.hr_people p where p.id = new.person_id;
    if v_org_persona is distinct from new.organization_id then
      raise exception 'hr: la persona es de otra organización' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_employments_organizacion() from public, anon, authenticated;

drop trigger if exists trg_000_employments_organizacion on public.employments;
create trigger trg_000_employments_organizacion
  before insert or update of organization_member_id, organization_id, person_id on public.employments
  for each row execute function public.fn_hr_employments_organizacion();

-- Columnas sensibles heredadas: congeladas (solo NULL).
create or replace function public.fn_hr_employments_campos_legados()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_col text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  foreach v_col in array array['base_salary','bank_name','bank_account_type','bank_account_number',
                               'eps_code','afp_code','arl_code','arl_risk_level','severance_fund_code'] loop
    if v_new->>v_col is not null and (v_new->v_col) is distinct from (v_old->v_col) then
      raise exception 'hr_campo_legado_congelado: % ya no se guarda en employments', v_col
        using errcode = '42501',
              hint = 'Salario: fn_hr_registrar_cambio. Banco e identificación: /api/hrm/personas/[id]/datos/[grupo].';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.fn_hr_employments_campos_legados() from public, anon, authenticated;

drop trigger if exists trg_employments_campos_sensibles_legados on public.employments;
create trigger trg_employments_campos_sensibles_legados
  before insert or update on public.employments
  for each row execute function public.fn_hr_employments_campos_legados();

-- 4. Vínculos propios y equipo (para RLS y RPC) ----------------------------------
create or replace function public.fn_hr_mis_empleos()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.id
    from public.employments e
    join public.organization_members om on om.id = e.organization_member_id
   where om.user_id = auth.uid() and om.is_active
  union
  select e.id
    from public.employments e
    join public.hr_people p on p.id = e.person_id
   where p.user_id = auth.uid()
     and e.organization_id in (select om.organization_id from public.organization_members om
                                where om.user_id = auth.uid() and om.is_active);
$$;

create or replace function public.fn_hr_mis_personas()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct e.person_id from public.employments e
   where e.id in (select public.fn_hr_mis_empleos()) and e.person_id is not null
  union
  select p.id from public.hr_people p
   where p.user_id = auth.uid()
     and p.organization_id in (select om.organization_id from public.organization_members om
                                where om.user_id = auth.uid() and om.is_active);
$$;

-- Equipo de un actor: reportes directos e indirectos (manager_id) y personas de
-- las áreas (y subáreas) que dirige, solo en organizaciones donde tiene p_code.
create or replace function public.fn_hr_equipo_empleos_actor(p_actor uuid, p_code text)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  with recursive
  orgs as (
    select om.organization_id from public.organization_members om
     where om.user_id = p_actor and om.is_active
       and coalesce(public.check_user_permission(p_actor, om.organization_id, p_code), false)
  ),
  mios as (
    select e.id, e.organization_id from public.employments e
      left join public.organization_members om on om.id = e.organization_member_id
      left join public.hr_people p on p.id = e.person_id
     where e.organization_id in (select organization_id from orgs)
       and (om.user_id = p_actor or p.user_id = p_actor)
  ),
  reportes as (
    select e.id, e.organization_id from public.employments e join mios m on e.manager_id = m.id
     where e.organization_id = m.organization_id
    union
    select e.id, e.organization_id from public.employments e join reportes r on e.manager_id = r.id
     where e.organization_id = r.organization_id
  ),
  areas as (
    select d.id from public.departments d join mios m on d.manager_employment_id = m.id
     where d.organization_id = m.organization_id
    union
    select d.id from public.departments d join areas a on d.parent_id = a.id
  )
  select id from reportes where id not in (select id from mios)
  union
  select e.id from public.employments e
   where e.department_id in (select id from areas)
     and e.organization_id in (select organization_id from orgs)
     and e.id not in (select id from mios);
$$;

create or replace function public.fn_hr_equipo_empleos(p_code text)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$ select public.fn_hr_equipo_empleos_actor(auth.uid(), p_code); $$;

create or replace function public.fn_hr_equipo_personas(p_code text)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct e.person_id from public.employments e
   where e.id in (select public.fn_hr_equipo_empleos(p_code)) and e.person_id is not null;
$$;

revoke execute on function public.fn_hr_mis_empleos() from public, anon;
revoke execute on function public.fn_hr_mis_personas() from public, anon;
revoke execute on function public.fn_hr_equipo_empleos_actor(uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_equipo_empleos(text) from public, anon;
revoke execute on function public.fn_hr_equipo_personas(text) from public, anon;
grant execute on function public.fn_hr_mis_empleos() to authenticated, service_role;
grant execute on function public.fn_hr_mis_personas() to authenticated, service_role;
grant execute on function public.fn_hr_equipo_empleos_actor(uuid, text) to service_role;
grant execute on function public.fn_hr_equipo_empleos(text) to authenticated, service_role;
grant execute on function public.fn_hr_equipo_personas(text) to authenticated, service_role;

-- 5. RLS de hr_people --------------------------------------------------------------
alter table public.hr_people enable row level security;
revoke all on public.hr_people from anon, public;
grant select, insert, update on public.hr_people to authenticated;

drop policy if exists hr_people_select on public.hr_people;
create policy hr_people_select on public.hr_people for select to authenticated
  using (
    organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.view'))
    or id in (select public.fn_hr_mis_personas())
    or id in (select public.fn_hr_equipo_personas('hr.employees.view_team'))
  );

drop policy if exists hr_people_insert on public.hr_people;
create policy hr_people_insert on public.hr_people for insert to authenticated
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.create')));

drop policy if exists hr_people_update on public.hr_people;
create policy hr_people_update on public.hr_people for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')));

create or replace function public.fn_hr_people_updated()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'hr: una persona no cambia de organización' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_people_updated() from public, anon, authenticated;
drop trigger if exists trg_hr_people_updated on public.hr_people;
create trigger trg_hr_people_updated before update on public.hr_people
  for each row execute function public.fn_hr_people_updated();
