-- HRM fase 1 · personas: lista de empleados, ficha única, registrar un cambio,
-- alta con reingreso y bandeja «Mis aprobaciones» (Figma 20.2 a 20.7).
-- Decisiones del dueño del 2026-11-15 (brief de la fase 1):
-- - Seguridad social (EPS, AFP, ARL, CCF y cesantías) es un evento con fecha de
--   efecto y aprobación, como salario, cargo, sede y jornada. Las entidades salen
--   de un catálogo (`hr_ss_entities`); su código PILA queda POR CONFIRMAR (NC):
--   no se inventa ningún código, lo completa la fase 4 contra la fuente oficial.
-- - Varios cambios con la misma fecha van en UNA solicitud: se aprueban o se
--   rechazan juntos (cargo + salario enlazados).
-- - Un cambio con fecha dentro de un período de nómina cerrado se bloquea.
-- - El cambio de cuenta bancaria pasa por aprobación.
-- - El jefe ve los contactos de emergencia de su equipo; nunca salario, banco ni salud.
-- - Documento duplicado: activo se bloquea; retirado ofrece reingreso en la misma ficha.
-- - Sin permiso de salario se crea el empleado y queda una tarea a quien lo tiene.
-- - Vencimientos: aviso N días antes (parámetro `aviso_vencimientos_dias`, 30 por
--   defecto, la empresa lo puede cambiar) a RR. HH. y al jefe.
-- Las escalas salariales y las plazas son de la parte «Estructura» (otro frente):
-- aquí no se crean.

-- 1. Catálogo de entidades de seguridad social -----------------------------------------
create table if not exists public.hr_ss_entities (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null default 'COL',
  subsystem     text not null check (subsystem in ('eps','afp','arl','ccf','cesantias')),
  name          text not null check (length(btrim(name)) > 1),
  pila_code     text,
  nit           text,
  verificacion  text not null default 'NC' check (verificacion in ('V','S','NC')),
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint hr_ss_entities_nombre_uq unique (country_code, subsystem, name)
);
comment on table public.hr_ss_entities is
  'HRM: catálogo de entidades de seguridad social (EPS, AFP, ARL, CCF, cesantías). pila_code NULL = por confirmar contra la fuente oficial antes de la PILA (fase 4).';
alter table public.hr_ss_entities enable row level security;
revoke all on public.hr_ss_entities from anon, public;
revoke insert, update, delete, truncate on public.hr_ss_entities from authenticated;
grant select on public.hr_ss_entities to authenticated;
drop policy if exists hr_ss_entities_select on public.hr_ss_entities;
create policy hr_ss_entities_select on public.hr_ss_entities for select to authenticated using (true);

insert into public.hr_ss_entities (subsystem, name, notes)
select v.s, v.n, 'Código PILA por confirmar (NC) contra el listado oficial antes de la fase 4.'
  from (values
    ('eps','Nueva EPS'),('eps','EPS Sura'),('eps','Sanitas'),('eps','Salud Total'),('eps','Compensar EPS'),
    ('eps','Famisanar'),('eps','Aliansalud'),('eps','SOS (Servicio Occidental de Salud)'),('eps','Coosalud'),
    ('eps','Mutual Ser'),('eps','Comfenalco Valle EPS'),('eps','Savia Salud'),
    ('afp','Colpensiones'),('afp','Porvenir'),('afp','Protección'),('afp','Colfondos'),('afp','Skandia'),
    ('arl','Positiva'),('arl','ARL Sura'),('arl','Colmena Seguros'),('arl','Seguros Bolívar'),('arl','AXA Colpatria'),
    ('arl','La Equidad Seguros'),('arl','Mapfre'),('arl','Seguros de Vida Alfa'),
    ('ccf','Comfama'),('ccf','Comfenalco Antioquia'),('ccf','Compensar'),('ccf','Cafam'),('ccf','Colsubsidio'),
    ('ccf','Comfandi'),('ccf','Comfenalco Valle'),('ccf','Comfacundi'),('ccf','Comfamiliar Risaralda'),
    ('ccf','Comfaboy'),('ccf','Cajasan'),('ccf','Comfenalco Santander'),('ccf','Comfamiliar Atlántico'),
    ('ccf','Combarranquilla'),('ccf','Comfenalco Cartagena'),('ccf','Comfamiliar Huila'),('ccf','Comfacauca'),
    ('ccf','Comfanorte'),('ccf','Comfatolima'),('ccf','Confa'),('ccf','Comfacesar'),('ccf','Comfamiliar Nariño'),
    ('ccf','Cofrem'),('ccf','Cajamag'),('ccf','Comfenalco Quindío'),('ccf','Comfacor'),
    ('cesantias','Porvenir'),('cesantias','Protección'),('cesantias','Colfondos'),('cesantias','Skandia'),
    ('cesantias','Fondo Nacional del Ahorro')
  ) as v(s, n)
on conflict (country_code, subsystem, name) do nothing;

-- 2. El historial admite seguridad social; contrato de aprendizaje -----------------------
alter table public.hr_employment_events drop constraint if exists hr_employment_events_field_check;
alter table public.hr_employment_events add constraint hr_employment_events_field_check
  check (field in ('salario','periodo_salario','cargo','sede','area','jefe','jornada_horas_semana','tipo_contrato',
                   'fin_contrato','centro_costo','tipo_vinculacion','eps','afp','arl','ccf','cesantias'));
alter table public.employments drop constraint if exists employments_contract_type_check;
alter table public.employments add constraint employments_contract_type_check
  check (contract_type = any (array['indefinite','fixed_term','service','hourly','project','apprenticeship']));

-- 3. Certificaciones con vencimiento ---------------------------------------------------
create table if not exists public.hr_person_certifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  person_id       uuid not null references public.hr_people(id),
  name            text not null check (length(btrim(name)) between 2 and 160),
  issuer          text,
  issued_on       date,
  expires_on      date,
  document_id     uuid references public.hr_documents(id),
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hr_person_certifications_fechas_chk check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
comment on table public.hr_person_certifications is
  'HRM: certificaciones del empleado con vencimiento (aviso N días antes). Las ve quien ve al empleado; las edita hr.employees.edit.';
create index if not exists hr_person_certifications_persona_idx on public.hr_person_certifications (person_id) where is_active;
create index if not exists hr_person_certifications_vence_idx on public.hr_person_certifications (organization_id, expires_on) where is_active;
drop trigger if exists trg_hr_person_certifications_misma_org on public.hr_person_certifications;
create trigger trg_hr_person_certifications_misma_org before insert on public.hr_person_certifications
  for each row execute function public.fn_hr_misma_org_persona();
alter table public.hr_person_certifications enable row level security;
revoke all on public.hr_person_certifications from anon, public;
revoke delete, truncate on public.hr_person_certifications from authenticated;
grant select, insert, update on public.hr_person_certifications to authenticated;
drop policy if exists hr_person_certifications_select on public.hr_person_certifications;
create policy hr_person_certifications_select on public.hr_person_certifications for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.view'))
         or person_id in (select public.fn_hr_mis_personas())
         or person_id in (select public.fn_hr_equipo_personas('hr.employees.view_team')));
drop policy if exists hr_person_certifications_insert on public.hr_person_certifications;
create policy hr_person_certifications_insert on public.hr_person_certifications for insert to authenticated
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')));
drop policy if exists hr_person_certifications_update on public.hr_person_certifications;
create policy hr_person_certifications_update on public.hr_person_certifications for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.edit')));

-- 4. Documentos que exige cada cargo ----------------------------------------------------
-- Si el cargo no tiene lista propia, rige la lista base de la plataforma
-- (fn_hr_documentos_exigidos). La edita quien edita cargos.
create table if not exists public.hr_position_required_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  position_id     uuid not null references public.job_positions(id) on delete cascade,
  category        text not null check (category ~ '^[a-z][a-z0-9_]{2,40}$'),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint hr_position_required_documents_uq unique (position_id, category)
);
comment on table public.hr_position_required_documents is
  'HRM: categorías de documento que exige un cargo. Sin filas, rige la lista base de fn_hr_documentos_exigidos.';
alter table public.hr_position_required_documents enable row level security;
revoke all on public.hr_position_required_documents from anon, public;
revoke truncate on public.hr_position_required_documents from authenticated;
grant select, insert, delete on public.hr_position_required_documents to authenticated;
drop policy if exists hr_position_required_documents_select on public.hr_position_required_documents;
create policy hr_position_required_documents_select on public.hr_position_required_documents for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_position_required_documents_write on public.hr_position_required_documents;
create policy hr_position_required_documents_write on public.hr_position_required_documents for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))
              and position_id in (select j.id from public.job_positions j
                                   where j.organization_id in (select public.fn_hr_orgs_con_permiso('hr.positions.edit'))));

-- 5. Cambio de cuenta bancaria con aprobación ------------------------------------------
create table if not exists public.hr_bank_account_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  person_id            uuid not null references public.hr_people(id),
  employment_id        uuid references public.employments(id),
  bank_name            text not null,
  account_type         text not null,
  account_number       text not null,
  holder_name          text,
  reason               text not null check (length(btrim(reason)) >= 3),
  status               text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado','anulado')),
  approval_instance_id uuid references public.hr_approval_instances(id),
  requested_by         uuid not null,
  applied_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.hr_bank_account_requests is
  'HRM grupo banco: solicitudes de cambio de cuenta (pasan por aprobación). Sin acceso directo: solo por RPC con registro.';
create index if not exists hr_bank_account_requests_persona_idx on public.hr_bank_account_requests (person_id) where status = 'pendiente';
drop trigger if exists trg_hr_bank_account_requests_misma_org on public.hr_bank_account_requests;
create trigger trg_hr_bank_account_requests_misma_org before insert on public.hr_bank_account_requests
  for each row execute function public.fn_hr_misma_org_persona();
alter table public.hr_bank_account_requests enable row level security;
revoke all on public.hr_bank_account_requests from anon, authenticated, public;

-- 6. Invitación al portal ligada a la persona ---------------------------------------------
alter table public.invitations add column if not exists hr_person_id uuid references public.hr_people(id) on delete set null;
comment on column public.invitations.hr_person_id is
  'HRM: persona-empleado a la que se invita al portal. Al aceptar, el miembro nuevo se enlaza a esa persona y a su vínculo (no se crea otro).';

-- 7. Aviso de vencimientos: parámetro de la empresa (30 días por defecto) -----------------
insert into public.hr_parameter_catalog (code, name, description, unit, org_override, research_ref) values
  ('aviso_vencimientos_dias', 'Días de aviso antes de un vencimiento',
   'Cuántos días antes avisa la ficha (y RR. HH. y el jefe reciben el aviso) de un contrato, certificación o documento por vencer.',
   'dias', 'libre', 'Decisión del dueño 2026-11-15 (fase 1)')
on conflict (code) do update set name = excluded.name, description = excluded.description, unit = excluded.unit, org_override = excluded.org_override;
insert into public.hr_legal_parameters (country_code, code, value, effective_from, status, verificacion, legal_source, notes)
select 'COL', 'aviso_vencimientos_dias', 30, date '2026-01-01', 'vigente', 'V',
       'Política de GO Admin (no es norma legal)', 'Valor por defecto; cada empresa lo ajusta en Configuración › Recursos humanos.'
 where not exists (select 1 from public.hr_legal_parameters where country_code = 'COL' and code = 'aviso_vencimientos_dias');

create table if not exists public.hr_expiry_notices (
  organization_id integer not null references public.organizations(id) on delete cascade,
  kind            text not null,
  ref_id          uuid not null,
  due_date        date not null,
  notified_at     timestamptz not null default now(),
  primary key (organization_id, kind, ref_id, due_date)
);
comment on table public.hr_expiry_notices is 'HRM: avisos de vencimiento ya enviados (evita repetirlos). Solo la escribe el job diario.';
alter table public.hr_expiry_notices enable row level security;
revoke all on public.hr_expiry_notices from anon, authenticated, public;

-- 8. Utilidades ---------------------------------------------------------------------------
create or replace function public.fn_hr_nombre_persona(p_person uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(concat_ws(' ', p.first_name, p.second_name, p.last_name, p.second_last_name)), '')
    from public.hr_people p where p.id = p_person;
$$;

create or replace function public.fn_hr_dias_aviso(p_org integer)
returns integer
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  return coalesce(public.fn_hr_parametro(p_org, 'aviso_vencimientos_dias', public.fn_today_for(p_org, null))::integer, 30);
exception when others then
  return 30;
end;
$$;

-- Categorías que exige el cargo (o la lista base).
create or replace function public.fn_hr_documentos_exigidos(p_position uuid)
returns text[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select array_agg(r.category order by r.category) from public.hr_position_required_documents r where r.position_id = p_position),
    array['documento_identidad','hoja_vida','contrato_trabajo','afiliacion_eps','afiliacion_afp','certificado_bancario']);
$$;

-- Vínculo vigente de una persona: el más reciente.
create or replace function public.fn_hr_vinculo_actual(p_person uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.id from public.employments e where e.person_id = p_person
   order by e.hire_date desc, e.created_at desc limit 1;
$$;

-- Estado visible del vínculo en una fecha.
create or replace function public.fn_hr_estado_vinculo(p_e public.employments, p_hoy date)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_e.status in ('terminated','retired') or (p_e.termination_date is not null and p_e.termination_date < p_hoy) then 'retirado'
    when p_e.hire_date > p_hoy then 'por_ingresar'
    when p_e.status = 'suspended' then 'suspendido'
    when p_e.status = 'probation' or (p_e.probation_end_date is not null and p_e.probation_end_date >= p_hoy) then 'periodo_prueba'
    else 'activo' end;
$$;

-- Nombre legible del valor de un campo del historial (cargo, sede, jefe, entidad…).
create or replace function public.fn_hr_nombre_valor(p_campo text, p_valor jsonb)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v text := p_valor #>> '{}';
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' or v is null then return null; end if;
  case p_campo
    when 'cargo' then return (select j.name from public.job_positions j where j.id = v::uuid);
    when 'sede' then return (select b.name from public.branches b where b.id = v::integer);
    when 'area' then return (select d.name from public.departments d where d.id = v::uuid);
    when 'jefe' then return (select public.fn_hr_nombre_persona(e.person_id) from public.employments e where e.id = v::uuid);
    when 'centro_costo' then return (select concat_ws(' ', c.code, c.name) from public.cost_centers c where c.id = v::uuid);
    when 'eps','afp','arl','ccf','cesantias' then return (select s.name from public.hr_ss_entities s where s.id = v::uuid);
    when 'salario' then return null;
    else return v;
  end case;
exception when others then
  return v;
end;
$$;

-- ¿Puede el actor ver a la persona (ficha básica)?
create or replace function public.fn_hr_actor_ve_persona(p_actor uuid, p_org integer, p_person uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.organization_members om where om.user_id = p_actor and om.organization_id = p_org and om.is_active)
     and exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org)
     and (public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view')
          or exists (select 1 from public.employments e where e.person_id = p_person
                       and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team')))
          or exists (select 1 from public.hr_people p where p.id = p_person and p.user_id = p_actor)
          or exists (select 1 from public.employments e join public.organization_members om on om.id = e.organization_member_id
                      where e.person_id = p_person and om.user_id = p_actor));
$$;

-- Período de nómina cerrado que contiene una fecha (aprobado, pagado o cerrado).
create or replace function public.fn_hr_periodo_cerrado(p_org integer, p_fecha date)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object('cerrado', true, 'periodo_id', pp.id, 'nombre', pp.name,
                               'desde', pp.period_start, 'hasta', pp.period_end,
                               'primera_fecha_libre', (select max(x.period_end) + 1 from public.payroll_periods x
                                                        where x.organization_id = p_org and x.status in ('approved','paying','paid','closed')))
       from public.payroll_periods pp
      where pp.organization_id = p_org and pp.status in ('approved','paying','paid','closed')
        and p_fecha between pp.period_start and pp.period_end
      order by pp.period_end desc limit 1),
    jsonb_build_object('cerrado', false));
$$;

-- Alertas de una persona (sin montos). p_ver_salario: incluye «sin salario».
create or replace function public.fn_hr_alertas_persona(p_org integer, p_person uuid, p_employment uuid, p_hoy date, p_dias integer, p_ver_salario boolean)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v jsonb := '[]'::jsonb;
  v_faltan text[];
begin
  select * into e from public.employments where id = p_employment;
  if found and public.fn_hr_estado_vinculo(e, p_hoy) <> 'retirado' then
    if e.contract_end_date is not null and e.contract_end_date < p_hoy then
      v := v || jsonb_build_object('tipo','contrato_vencido','nivel','peligro','fecha',e.contract_end_date);
    elsif e.contract_end_date is not null and e.contract_end_date <= p_hoy + p_dias then
      v := v || jsonb_build_object('tipo','contrato_vence','nivel','advertencia','fecha',e.contract_end_date,'dias',e.contract_end_date - p_hoy);
    end if;
    if e.probation_end_date is not null and e.probation_end_date >= p_hoy and e.probation_end_date <= p_hoy + p_dias then
      v := v || jsonb_build_object('tipo','prueba_termina','nivel','informacion','fecha',e.probation_end_date,'dias',e.probation_end_date - p_hoy);
    end if;
    select array_agg(c) into v_faltan from unnest(public.fn_hr_documentos_exigidos(e.position_id)) c
     where not exists (select 1 from public.hr_documents d where d.person_id = p_person and d.category = c and d.status = 'activo');
    if cardinality(v_faltan) > 0 then
      v := v || jsonb_build_object('tipo','documentos_faltan','nivel','advertencia','n',cardinality(v_faltan),'categorias',to_jsonb(v_faltan));
    end if;
    if p_ver_salario and not exists (select 1 from public.hr_employment_events ev
                                      where ev.employment_id = e.id and ev.field = 'salario' and ev.status in ('aprobado','pendiente')) then
      v := v || jsonb_build_object('tipo','sin_salario','nivel','advertencia');
    end if;
  end if;
  v := v || coalesce((select jsonb_agg(case when c.expires_on < p_hoy
                       then jsonb_build_object('tipo','certificacion_vencida','nivel','peligro','fecha',c.expires_on,'nombre',c.name,'id',c.id)
                       else jsonb_build_object('tipo','certificacion_por_vencer','nivel','advertencia','fecha',c.expires_on,'dias',c.expires_on - p_hoy,'nombre',c.name,'id',c.id) end
                       order by c.expires_on)
                  from public.hr_person_certifications c
                 where c.person_id = p_person and c.is_active and c.expires_on is not null and c.expires_on <= p_hoy + p_dias), '[]'::jsonb);
  v := v || coalesce((select jsonb_agg(case when d.valid_until < p_hoy
                       then jsonb_build_object('tipo','documento_vencido','nivel','peligro','fecha',d.valid_until,'categoria',d.category,'id',d.id)
                       else jsonb_build_object('tipo','documento_por_vencer','nivel','advertencia','fecha',d.valid_until,'dias',d.valid_until - p_hoy,'categoria',d.category,'id',d.id) end
                       order by d.valid_until)
                  from public.hr_documents d
                 where d.person_id = p_person and d.status = 'activo' and d.valid_until is not null and d.valid_until <= p_hoy + p_dias
                   and not exists (select 1 from public.hr_person_certifications c where c.document_id = d.id and c.is_active)), '[]'::jsonb);
  return v;
end;
$$;

-- 9. Validación: entidades de seguridad social y contrato de aprendizaje ----------------
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
      if v_txt not in ('indefinite','fixed_term','service','hourly','project','apprenticeship') then raise exception 'hr: tipo de contrato inválido' using errcode = '22023'; end if;
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
    when 'eps','afp','arl','ccf','cesantias' then
      if not exists (select 1 from public.hr_ss_entities s where s.id = v_txt::uuid and s.subsystem = p_campo and s.is_active) then
        raise exception 'hr: la entidad no es del subsistema %', p_campo using errcode = '22023'; end if;
    else
      raise exception 'hr: campo desconocido %', p_campo using errcode = '22023';
  end case;
  return to_jsonb(v_txt);
end;
$$;

create or replace function public.fn_hr_tipo_solicitud_campo(p_campo text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_campo
    when 'salario' then 'cambio_salario' when 'periodo_salario' then 'cambio_salario'
    when 'cargo' then 'cambio_cargo' when 'sede' then 'cambio_sede'
    when 'area' then 'cambio_area' when 'centro_costo' then 'cambio_area'
    when 'jefe' then 'cambio_jefe' when 'jornada_horas_semana' then 'cambio_jornada'
    when 'eps' then 'cambio_seguridad_social' when 'afp' then 'cambio_seguridad_social'
    when 'arl' then 'cambio_seguridad_social' when 'ccf' then 'cambio_seguridad_social'
    when 'cesantias' then 'cambio_seguridad_social'
    else 'cambio_contrato' end;
$$;

-- 10. Registrar varios cambios con la misma fecha (una sola solicitud) ------------------
-- p_cambios: [{ "campo": "cargo", "valor": "<uuid>" }, { "campo": "salario", "valor": 3800000 }]
-- Se aprueban o se rechazan juntos. Bloquea fechas de nómina cerrada y un segundo
-- cambio pendiente del mismo campo.
create or replace function public.fn_hr_registrar_cambios(
  p_employment uuid, p_efectivo date, p_cambios jsonb, p_motivo text, p_nota text default null, p_contexto jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_e public.employments;
  c jsonb;
  v_campo text;
  v_grupo text;
  v_edita_todo boolean := true;
  v_valor jsonb;
  v_anterior jsonb;
  v_ev uuid;
  v_eventos uuid[] := '{}';
  v_campos text[] := '{}';
  v_inst uuid;
  v_tipo text;
  v_monto jsonb;
  v_pct numeric;
  v_cerrado jsonb;
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
  if coalesce(length(btrim(p_motivo)), 0) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 or jsonb_array_length(p_cambios) > 8 then
    raise exception 'hr: se esperaba la lista de cambios' using errcode = '22023';
  end if;
  v_cerrado := public.fn_hr_periodo_cerrado(v_e.organization_id, p_efectivo);
  if (v_cerrado->>'cerrado')::boolean then
    raise exception 'periodo_cerrado: %', coalesce(v_cerrado->>'primera_fecha_libre', '') using errcode = '55000';
  end if;

  for c in select * from jsonb_array_elements(p_cambios) loop
    v_campo := c->>'campo';
    if v_campo is null or v_campo = any (v_campos) then
      raise exception 'hr: campo repetido o vacío' using errcode = '22023';
    end if;
    v_grupo := public.fn_hr_grupo_de_campo(v_campo);
    if public.fn_hr_actor_puede_empleo(v_uid, p_employment, v_grupo, 'editar') then
      null;
    elsif p_employment in (select public.fn_hr_equipo_empleos_actor(v_uid,
              case when v_grupo = 'basico' then 'hr.employees.view_team' else 'hr.data.' || v_grupo || '.view_team' end)) then
      v_edita_todo := false;
    else
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    if exists (select 1 from public.hr_employment_events ev where ev.employment_id = p_employment and ev.field = v_campo and ev.status = 'pendiente') then
      raise exception 'cambio_pendiente: ya hay un cambio de % por aprobar', v_campo using errcode = '55000';
    end if;
    v_valor := public.fn_hr_validar_valor(v_e.organization_id, p_employment, v_campo, c->'valor');
    v_anterior := public.fn_hr_valor_vigente_interno(p_employment, v_campo, p_efectivo);
    if v_campo = 'salario' then
      v_monto := v_valor;
      if jsonb_typeof(v_anterior) = 'number' and (v_anterior #>> '{}')::numeric > 0 then
        v_pct := round(((v_valor #>> '{}')::numeric / (v_anterior #>> '{}')::numeric - 1) * 100, 2);
      end if;
    end if;
    insert into public.hr_employment_events
      (organization_id, employment_id, field, effective_from, old_value, new_value, reason, requested_by)
    values (v_e.organization_id, p_employment, v_campo, p_efectivo, v_anterior, v_valor, btrim(p_motivo), v_uid)
    returning id into v_ev;
    v_eventos := v_eventos || v_ev;
    v_campos := v_campos || v_campo;
  end loop;

  v_tipo := case when 'salario' = any (v_campos) or 'periodo_salario' = any (v_campos) then 'cambio_salario'
                 else public.fn_hr_tipo_solicitud_campo(v_campos[1]) end;
  v_inst := public.fn_hr_aprobacion_iniciar(v_e.organization_id, v_tipo, 'hr_employment_events', v_eventos[1], p_employment, v_uid,
              jsonb_build_object('branch_id', v_e.branch_id, 'department_id', v_e.department_id, 'position_id', v_e.position_id,
                                 'campo', v_campos[1], 'campos', to_jsonb(v_campos), 'eventos', to_jsonb(v_eventos),
                                 'monto', v_monto, 'aumento_pct', v_pct,
                                 'nota', nullif(left(btrim(coalesce(p_nota, '')), 1000), ''),
                                 'soporte_documento_id', nullif(p_contexto->>'soporte_documento_id', '')));
  if v_inst is not null then
    update public.hr_employment_events set approval_instance_id = v_inst where id = any (v_eventos);
    v_status := 'pendiente';
  elsif v_edita_todo then
    update public.hr_employment_events set status = 'aprobado', approved_by = v_uid, approved_at = now() where id = any (v_eventos);
    foreach v_ev in array v_eventos loop
      perform public.fn_hr_aplicar_evento(v_ev);
    end loop;
    v_status := 'aprobado';
  else
    raise exception 'requiere_regla_de_aprobacion: no hay a quién enviar la solicitud de %', v_tipo using errcode = '42501';
  end if;

  foreach v_grupo in array array(select distinct public.fn_hr_grupo_de_campo(x) from unnest(v_campos) x) loop
    perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id, v_grupo, 'editar',
      p_contexto->>'ip', p_contexto->>'user_agent', coalesce(p_contexto->>'ruta', 'rpc:fn_hr_registrar_cambios'),
      jsonb_build_object('campos', (select to_jsonb(array_agg(x)) from unnest(v_campos) x where public.fn_hr_grupo_de_campo(x) = v_grupo),
                         'eventos', to_jsonb(v_eventos)));
  end loop;
  return jsonb_build_object('ids', to_jsonb(v_eventos), 'status', v_status, 'approval_instance_id', v_inst);
end;
$$;

-- 11. Cierre de una aprobación: todos los eventos enlazados y el cambio de cuenta -------
create or replace function public.fn_hr_banco_aplicar_solicitud(p_req uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r public.hr_bank_account_requests;
begin
  select * into r from public.hr_bank_account_requests where id = p_req for update;
  if not found or r.status <> 'aprobado' or r.applied_at is not null then return; end if;
  update public.hr_person_bank_accounts set is_primary = false, valid_to = coalesce(valid_to, public.fn_today_for(r.organization_id, null))
   where person_id = r.person_id and is_primary and is_active;
  insert into public.hr_person_bank_accounts (organization_id, person_id, bank_name, account_type, account_number, holder_name,
                                              is_primary, valid_from, updated_by)
  values (r.organization_id, r.person_id, r.bank_name, r.account_type, r.account_number, r.holder_name,
          true, public.fn_today_for(r.organization_id, null), r.requested_by);
  update public.hr_bank_account_requests set applied_at = now() where id = r.id;
end;
$$;

create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
$$;

-- 12. Lista de empleados (ámbito: toda la organización o su equipo) -----------------------
create or replace function public.fn_hr_empleados_listar(p_actor uuid, p_org integer, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_dias integer := public.fn_hr_dias_aviso(p_org);
  v_todos boolean;
  v_doc_todos boolean;
  v_ver_salario boolean;
  v_filas jsonb;
  v_docs integer;
begin
  if not exists (select 1 from public.organization_members om where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_todos := public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view');
  if not v_todos and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view_team')
     and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view_branch') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_doc_todos := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.view');
  v_ver_salario := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view');

  with alcance as (
    select e.* from public.employments e
     where e.organization_id = p_org and e.person_id is not null
       and (v_todos or e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team')))
  ),
  ultimo as (
    select distinct on (a.person_id) a.* from alcance a order by a.person_id, a.hire_date desc, a.created_at desc
  ),
  equipo_doc as (
    select x from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.data.identificacion.view_team') x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'persona_id', p.id,
      'vinculo_id', u.id,
      'nombre', public.fn_hr_nombre_persona(p.id),
      'doc_tipo', case when v_doc_todos or u.id in (select x from equipo_doc) then i.doc_type end,
      'doc_numero', case when v_doc_todos or u.id in (select x from equipo_doc) then i.doc_number end,
      'cargo_id', u.position_id, 'cargo', j.name,
      'area_id', u.department_id, 'area', d.name,
      'sede_id', u.branch_id, 'sede', b.name,
      'tipo_contrato', u.contract_type, 'fin_contrato', u.contract_end_date,
      'ingreso', u.hire_date, 'retiro', u.termination_date,
      'estado', public.fn_hr_estado_vinculo(u, v_hoy),
      'tiene_usuario', (p.user_id is not null or u.organization_member_id is not null),
      'invitacion_pendiente', exists (select 1 from public.invitations iv where iv.hr_person_id = p.id and iv.status = 'pending'
                                        and (iv.expires_at is null or iv.expires_at > now())),
      'tiene_correo', coalesce(nullif(btrim(p.work_email), ''), nullif(btrim(i.personal_email), '')) is not null,
      'alertas', public.fn_hr_alertas_persona(p_org, p.id, u.id, v_hoy, v_dias, v_ver_salario)
    ) order by public.fn_hr_nombre_persona(p.id)), '[]'::jsonb),
    count(i.doc_number) filter (where v_doc_todos or u.id in (select x from equipo_doc))
    into v_filas, v_docs
    from ultimo u
    join public.hr_people p on p.id = u.person_id
    left join public.hr_people_identification i on i.person_id = p.id
    left join public.job_positions j on j.id = u.position_id
    left join public.departments d on d.id = u.department_id
    left join public.branches b on b.id = u.branch_id;

  if v_docs > 0 then
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'identificacion', 'ver', p_ip, p_ua, p_ruta,
      jsonb_build_object('lista', 'empleados', 'personas', v_docs, 'campos', jsonb_build_array('doc_type','doc_number')));
  end if;
  return jsonb_build_object('hoy', v_hoy, 'dias_aviso', v_dias, 'alcance', case when v_todos then 'organizacion' else 'equipo' end,
                            'empleados', v_filas);
end;
$$;

-- 13. Ficha única (datos básicos; los sensibles van por fn_hr_datos_sensibles_leer) -------
create or replace function public.fn_hr_ficha_leer(p_actor uuid, p_org integer, p_person uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_dias integer := public.fn_hr_dias_aviso(p_org);
  p public.hr_people;
  e public.employments;
  v_ver_salario boolean;
  v_laboral jsonb := '[]'::jsonb;
  v_campo text;
  v_permisos jsonb := '{}'::jsonb;
  g text;
  v_jefe jsonb;
begin
  if not public.fn_hr_actor_ve_persona(p_actor, p_org, p_person) then
    if not exists (select 1 from public.hr_people x where x.id = p_person and x.organization_id = p_org) then
      raise exception 'hr: la persona no existe' using errcode = 'P0002';
    end if;
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into p from public.hr_people where id = p_person;
  select * into e from public.employments where id = public.fn_hr_vinculo_actual(p_person);
  v_ver_salario := public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'salario_pago', 'ver');

  foreach g in array public.fn_hr_grupos_datos() loop
    v_permisos := v_permisos || jsonb_build_object(g, jsonb_build_object(
      'ver', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, g, 'ver'),
      'editar', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, g, 'editar')));
  end loop;

  if e.id is not null then
    foreach v_campo in array array['cargo','jefe','area','sede','centro_costo','jornada_horas_semana'] loop
      v_laboral := v_laboral || (
        select jsonb_build_object('campo', v_campo,
                 'valor', public.fn_hr_valor_vigente_interno(e.id, v_campo, v_hoy),
                 'nombre', public.fn_hr_nombre_valor(v_campo, public.fn_hr_valor_vigente_interno(e.id, v_campo, v_hoy)),
                 'desde', coalesce(ev.effective_from, e.hire_date),
                 'motivo', ev.reason, 'source', ev.source,
                 'aprobo', public.fn_hr_nombre_usuario(ev.approved_by))
          from (select 1) x
          left join lateral (select * from public.hr_employment_events z
                              where z.employment_id = e.id and z.field = v_campo and z.status = 'aprobado' and z.effective_from <= v_hoy
                              order by z.effective_from desc, z.approved_at desc nulls last limit 1) ev on true);
    end loop;
    select jsonb_build_object('persona_id', je.person_id, 'vinculo_id', je.id, 'nombre', public.fn_hr_nombre_persona(je.person_id),
                              'cargo', jj.name, 'sede', jb.name)
      into v_jefe
      from public.employments je
      left join public.job_positions jj on jj.id = je.position_id
      left join public.branches jb on jb.id = je.branch_id
     where je.id = e.manager_id;
  end if;

  return jsonb_build_object(
    'hoy', v_hoy, 'dias_aviso', v_dias,
    'persona', jsonb_build_object('id', p.id, 'nombre', public.fn_hr_nombre_persona(p.id), 'first_name', p.first_name,
                 'second_name', p.second_name, 'last_name', p.last_name, 'second_last_name', p.second_last_name,
                 'preferred_name', p.preferred_name, 'work_email', p.work_email, 'work_phone', p.work_phone,
                 'tiene_usuario', (p.user_id is not null or e.organization_member_id is not null),
                 'invitacion_pendiente', exists (select 1 from public.invitations iv where iv.hr_person_id = p.id and iv.status = 'pending'
                                                   and (iv.expires_at is null or iv.expires_at > now())),
                 'actualizado', p.updated_at, 'actualizado_por', public.fn_hr_nombre_usuario(p.updated_by)),
    'vinculo', case when e.id is null then null else jsonb_build_object(
                 'id', e.id, 'estado', public.fn_hr_estado_vinculo(e, v_hoy),
                 'cargo_id', e.position_id, 'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
                 'area_id', e.department_id, 'area', (select d.name from public.departments d where d.id = e.department_id),
                 'sede_id', e.branch_id, 'sede', (select b.name from public.branches b where b.id = e.branch_id),
                 'centro_costo_id', e.cost_center_id, 'jefe_id', e.manager_id,
                 'tipo_contrato', e.contract_type, 'fin_contrato', e.contract_end_date, 'tipo_vinculacion', e.employment_type,
                 'ingreso', e.hire_date, 'fin_prueba', e.probation_end_date, 'retiro', e.termination_date,
                 'motivo_retiro', e.termination_reason, 'jornada', e.work_hours_per_week, 'periodo_salario', e.salary_period,
                 'clase_arl', public.fn_hr_clase_arl(e.id)) end,
    'jefe', v_jefe,
    'laboral', v_laboral,
    'afiliaciones', case when e.id is null then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object('subsistema', s.c,
                 'entidad_id', public.fn_hr_valor_vigente_interno(e.id, s.c, v_hoy) #>> '{}',
                 'entidad', public.fn_hr_nombre_valor(s.c, public.fn_hr_valor_vigente_interno(e.id, s.c, v_hoy)),
                 'desde', (select max(z.effective_from) from public.hr_employment_events z
                            where z.employment_id = e.id and z.field = s.c and z.status = 'aprobado' and z.effective_from <= v_hoy),
                 'pendiente', exists (select 1 from public.hr_employment_events z where z.employment_id = e.id and z.field = s.c and z.status = 'pendiente'))
               order by s.o)
          from unnest(array['eps','afp','arl','ccf','cesantias']) with ordinality as s(c, o)) end,
    'historial', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', z.id, 'campo', z.field, 'desde', z.effective_from,
                   'anterior', case when z.field in ('salario','periodo_salario') then null else z.old_value end,
                   'nuevo', case when z.field in ('salario','periodo_salario') then null else z.new_value end,
                   'anterior_nombre', public.fn_hr_nombre_valor(z.field, case when z.field in ('salario','periodo_salario') then null else z.old_value end),
                   'nuevo_nombre', public.fn_hr_nombre_valor(z.field, case when z.field in ('salario','periodo_salario') then null else z.new_value end),
                   'motivo', z.reason, 'estado', z.status, 'source', z.source,
                   'programado', z.status = 'aprobado' and z.effective_from > v_hoy,
                   'registro', public.fn_hr_nombre_usuario(z.requested_by), 'creado', z.created_at,
                   'aprobo', public.fn_hr_nombre_usuario(z.approved_by), 'aprobado_en', z.approved_at,
                   'instancia_id', z.approval_instance_id,
                   'nota', (select ai.context->>'nota' from public.hr_approval_instances ai where ai.id = z.approval_instance_id),
                   'espera', case when z.status = 'pendiente' then (
                        select jsonb_agg(public.fn_hr_nombre_usuario(u)) from public.hr_approval_instances ai
                          join public.hr_approval_steps st on st.instance_id = ai.id and st.step_order = ai.current_step
                          cross join lateral unnest(st.approver_user_ids) u
                         where ai.id = z.approval_instance_id) end,
                   'rechazo', case when z.status = 'rechazado' then (
                        select jsonb_build_object('por', public.fn_hr_nombre_usuario(dd.actor_user_id), 'en', dd.decided_at, 'comentario', dd.comment)
                          from public.hr_approval_decisions dd where dd.instance_id = z.approval_instance_id and dd.decision = 'rechazar'
                         order by dd.decided_at desc limit 1) end)
                 order by z.effective_from desc, z.created_at desc)
                 from public.hr_employment_events z join public.employments ze on ze.id = z.employment_id
                where ze.person_id = p_person), '[]'::jsonb),
    'alertas', case when e.id is null then '[]'::jsonb else public.fn_hr_alertas_persona(p_org, p_person, e.id, v_hoy, v_dias, v_ver_salario) end,
    'expediente', case when e.id is null then null else jsonb_build_object(
                   'exigidos', to_jsonb(public.fn_hr_documentos_exigidos(e.position_id)),
                   'subidos', (select coalesce(jsonb_agg(distinct d.category), '[]'::jsonb) from public.hr_documents d
                                where d.person_id = p_person and d.status = 'activo'
                                  and d.category = any (public.fn_hr_documentos_exigidos(e.position_id)))) end,
    'documentos_total', (select count(*) from public.hr_documents d where d.person_id = p_person and d.status = 'activo'),
    'certificaciones', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'entidad', c.issuer,
                          'expedicion', c.issued_on, 'vence', c.expires_on, 'documento_id', c.document_id,
                          'documento_nombre', (select dd.file_name from public.hr_documents dd where dd.id = c.document_id))
                          order by c.expires_on nulls last, c.name)
                        from public.hr_person_certifications c where c.person_id = p_person and c.is_active), '[]'::jsonb),
    'permisos', jsonb_build_object(
                  'grupos', v_permisos,
                  'editar_basico', public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.edit'),
                  'crear', public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create'),
                  'registrar_cambio', e.id is not null and (public.fn_hr_actor_puede_empleo(p_actor, e.id, 'basico', 'editar')
                                       or e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))),
                  'ver_contactos', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'identificacion', 'ver')
                                   or (e.id is not null and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))),
                  'ver_registro', public.fn_hr_puede_actor(p_actor, p_org, 'hr.access_log.view'),
                  'es_propio', p.user_id = p_actor));
end;
$$;

-- 14. Documentos de la persona, de los grupos que el actor puede ver --------------------
create or replace function public.fn_hr_documentos_listar(p_actor uuid, p_org integer, p_person uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  g text;
  v_ver text[] := '{}';
  v jsonb;
begin
  if not public.fn_hr_actor_ve_persona(p_actor, p_org, p_person) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  foreach g in array public.fn_hr_grupos_datos() loop
    if public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, g, 'ver') then v_ver := v_ver || g; end if;
  end loop;
  select coalesce(jsonb_agg(case when d.data_group = any (v_ver) then jsonb_build_object(
             'id', d.id, 'grupo', d.data_group, 'categoria', d.category, 'nombre', d.file_name, 'tipo', d.mime_type,
             'tamano', d.size_bytes, 'vence', d.valid_until, 'creado', d.created_at,
             'subio', public.fn_hr_nombre_usuario(d.uploaded_by), 'restringido', false)
           else jsonb_build_object('id', d.id, 'grupo', d.data_group, 'categoria', d.category, 'restringido', true) end
           order by d.created_at desc), '[]'::jsonb)
    into v from public.hr_documents d where d.person_id = p_person and d.status = 'activo';
  foreach g in array v_ver loop
    if exists (select 1 from public.hr_documents d where d.person_id = p_person and d.data_group = g and d.status = 'activo') then
      perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, g, 'ver', p_ip, p_ua, p_ruta,
        jsonb_build_object('lista', 'documentos'));
    end if;
  end loop;
  return jsonb_build_object('documentos', v, 'grupos_visibles', to_jsonb(v_ver),
    'exigidos', to_jsonb(public.fn_hr_documentos_exigidos((select e.position_id from public.employments e where e.id = public.fn_hr_vinculo_actual(p_person)))));
end;
$$;

-- 15. Contactos de emergencia: RR. HH. (identificación) y el jefe (su equipo) -----------
create or replace function public.fn_hr_contactos_emergencia_leer(p_actor uuid, p_org integer, p_person uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'identificacion', 'ver')
          or exists (select 1 from public.employments e where e.person_id = p_person and e.organization_id = p_org
                       and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team')))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, 'identificacion', 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('campos', jsonb_build_array('contactos_emergencia')));
  return jsonb_build_object('contactos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name,
            'relationship', c.relationship, 'phone', c.phone, 'alt_phone', c.alt_phone, 'priority', c.priority)
            order by c.priority, c.created_at)
          from public.hr_person_emergency_contacts c where c.person_id = p_person and c.is_active), '[]'::jsonb),
    'editar', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'identificacion', 'editar'));
end;
$$;

-- 16. Banco: número enmascarado salvo «Mostrar», y cambio de cuenta con aprobación -------
create or replace function public.fn_hr_enmascarar_cuenta(p_numero text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$ select case when p_numero is null then null else '•••• ' || right(regexp_replace(p_numero, '\s', '', 'g'), 4) end $$;

create or replace function public.fn_hr_banco_leer(p_actor uuid, p_org integer, p_person uuid, p_completo boolean, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    raise exception 'hr: la persona no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'banco', 'ver') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, 'banco', 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('numero_completo', coalesce(p_completo, false)));
  return jsonb_build_object(
    'cuentas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'banco', a.bank_name, 'tipo', a.account_type,
                  'numero', case when p_completo then a.account_number else public.fn_hr_enmascarar_cuenta(a.account_number) end,
                  'titular', a.holder_name, 'principal', a.is_primary, 'desde', a.valid_from)
                  order by a.is_primary desc, a.created_at desc)
                from public.hr_person_bank_accounts a where a.person_id = p_person and a.is_active), '[]'::jsonb),
    'solicitud_pendiente', (select jsonb_build_object('id', r.id, 'banco', r.bank_name, 'tipo', r.account_type,
                  'numero', public.fn_hr_enmascarar_cuenta(r.account_number), 'instancia_id', r.approval_instance_id,
                  'creado', r.created_at, 'solicito', public.fn_hr_nombre_usuario(r.requested_by))
                from public.hr_bank_account_requests r where r.person_id = p_person and r.status = 'pendiente'
                order by r.created_at desc limit 1),
    'editar', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'banco', 'editar'),
    'completo', coalesce(p_completo, false));
end;
$$;

create or replace function public.fn_hr_banco_solicitar_cambio(p_actor uuid, p_org integer, p_person uuid, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_req uuid;
  v_inst uuid;
  v_emp uuid := public.fn_hr_vinculo_actual(p_person);
  e public.employments;
begin
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    raise exception 'hr: la persona no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'banco', 'editar') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if exists (select 1 from public.hr_bank_account_requests r where r.person_id = p_person and r.status = 'pendiente') then
    raise exception 'cambio_pendiente: ya hay un cambio de cuenta por aprobar' using errcode = '55000';
  end if;
  if coalesce(btrim(p_datos->>'bank_name'), '') = '' or coalesce(p_datos->>'account_type', '') not in ('savings','checking','deposito_electronico')
     or coalesce(btrim(p_datos->>'account_number'), '') !~ '^[0-9 -]{4,30}$' then
    raise exception 'hr: datos de la cuenta inválidos' using errcode = '22023';
  end if;
  insert into public.hr_bank_account_requests (organization_id, person_id, employment_id, bank_name, account_type, account_number,
                                               holder_name, reason, requested_by)
  values (p_org, p_person, v_emp, btrim(p_datos->>'bank_name'), p_datos->>'account_type',
          regexp_replace(btrim(p_datos->>'account_number'), '[ -]', '', 'g'), nullif(btrim(coalesce(p_datos->>'holder_name', '')), ''),
          coalesce(nullif(btrim(p_datos->>'motivo'), ''), 'Cambio de cuenta bancaria'), p_actor)
  returning id into v_req;
  select * into e from public.employments where id = v_emp;
  v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'cambio_cuenta_bancaria', 'hr_bank_account_requests', v_req, v_emp, p_actor,
              jsonb_build_object('branch_id', e.branch_id, 'department_id', e.department_id, 'position_id', e.position_id,
                                 'nota', nullif(left(btrim(coalesce(p_datos->>'nota', '')), 1000), '')));
  if v_inst is not null then
    update public.hr_bank_account_requests set approval_instance_id = v_inst where id = v_req;
  else
    update public.hr_bank_account_requests set status = 'aprobado' where id = v_req;
    perform public.fn_hr_banco_aplicar_solicitud(v_req);
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, v_emp, 'banco', 'editar', p_ip, p_ua, p_ruta,
    jsonb_build_object('campos', jsonb_build_array('cuentas'), 'solicitud', v_req));
  return jsonb_build_object('id', v_req, 'status', case when v_inst is null then 'aprobado' else 'pendiente' end, 'approval_instance_id', v_inst);
end;
$$;

-- 17. «Últimas consultas» del salario y la cuenta de una persona -----------------------
create or replace function public.fn_hr_ultimas_consultas(p_actor uuid, p_org integer, p_person uuid, p_limite integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'salario_pago', 'ver')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.access_log.view')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x->>'en' desc) from (
    select jsonb_build_object('id', l.id, 'actor', public.fn_hr_nombre_usuario(l.actor_user_id),
             'cargo', (select j.name from public.organization_members om join public.job_positions j on j.id = om.job_position_id
                        where om.user_id = l.actor_user_id and om.organization_id = p_org limit 1),
             'en', l.occurred_at, 'grupo', l.data_group, 'accion', l.action,
             'numero_completo', coalesce((l.detail->>'numero_completo')::boolean, false)) x
      from public.hr_access_log l
     where l.organization_id = p_org and l.person_id = p_person and l.data_group in ('salario_pago','banco')
       and l.action in ('ver','exportar')
     order by l.occurred_at desc limit greatest(1, least(coalesce(p_limite, 5), 50))) s), '[]'::jsonb);
end;
$$;

-- 18. Documento duplicado (alta): activo bloquea, retirado ofrece reingreso -----------------
create or replace function public.fn_hr_buscar_documento(p_actor uuid, p_org integer, p_tipo text, p_numero text, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid;
  e public.employments;
  v_estado text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select i.person_id into v_person from public.hr_people_identification i
   where i.organization_id = p_org and i.doc_type = p_tipo
     and regexp_replace(i.doc_number, '[^0-9A-Za-z]', '', 'g') = regexp_replace(coalesce(p_numero, ''), '[^0-9A-Za-z]', '', 'g');
  if v_person is null then
    return jsonb_build_object('existe', false);
  end if;
  select * into e from public.employments where id = public.fn_hr_vinculo_actual(v_person);
  v_estado := case when e.id is null then 'retirado' else public.fn_hr_estado_vinculo(e, public.fn_today_for(p_org, null)) end;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, e.id, 'identificacion', 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('busqueda_documento', true));
  return jsonb_build_object('existe', true, 'persona_id', v_person, 'nombre', public.fn_hr_nombre_persona(v_person),
    'estado', v_estado, 'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
    'area', (select d.name from public.departments d where d.id = e.department_id),
    'sede', (select b.name from public.branches b where b.id = e.branch_id),
    'retiro', e.termination_date);
end;
$$;

-- 19. Alta de un empleado (o reingreso) en una sola transacción -----------------------------
-- p_datos: persona_id (reingreso), first_name, second_name, last_name, second_last_name,
-- doc_type, doc_number, birth_date, personal_phone, personal_email, work_email,
-- branch_id, department_id, position_id, manager_id, contract_type, contract_end_date,
-- hire_date, work_hours_per_week, cost_center_id, salary_period, salario,
-- eps, afp, arl, ccf, cesantias.
create or replace function public.fn_hr_alta_empleado(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid := nullif(p_datos->>'persona_id', '')::uuid;
  v_existente uuid;
  v_emp uuid;
  v_hire date := (p_datos->>'hire_date')::date;
  v_hoy date := public.fn_today_for(p_org, null);
  v_salario boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.edit');
  v_campo text;
  v_valor jsonb;
  v_tareas integer := 0;
  v_u uuid;
  e_prev public.employments;
  v_ident jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.edit') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if coalesce(btrim(p_datos->>'first_name'), '') = '' or coalesce(btrim(p_datos->>'last_name'), '') = '' then
    raise exception 'nombre_obligatorio' using errcode = '22023';
  end if;
  if coalesce(p_datos->>'doc_type', '') = '' or coalesce(btrim(p_datos->>'doc_number'), '') = '' then
    raise exception 'documento_obligatorio' using errcode = '22023';
  end if;
  if v_hire is null then
    raise exception 'fecha_ingreso_obligatoria' using errcode = '22023';
  end if;
  if nullif(p_datos->>'branch_id', '') is null or not exists (select 1 from public.branches b where b.id = (p_datos->>'branch_id')::integer and b.organization_id = p_org) then
    raise exception 'sede_invalida' using errcode = '22023';
  end if;

  select i.person_id into v_existente from public.hr_people_identification i
   where i.organization_id = p_org and i.doc_type = p_datos->>'doc_type'
     and regexp_replace(i.doc_number, '[^0-9A-Za-z]', '', 'g') = regexp_replace(p_datos->>'doc_number', '[^0-9A-Za-z]', '', 'g');
  if v_existente is not null then
    select * into e_prev from public.employments where id = public.fn_hr_vinculo_actual(v_existente);
    if e_prev.id is not null and public.fn_hr_estado_vinculo(e_prev, v_hoy) <> 'retirado' then
      raise exception 'documento_duplicado: la persona está activa' using errcode = '23505';
    end if;
    if v_person is distinct from v_existente then
      raise exception 'documento_retirado: la persona está retirada; registra un reingreso' using errcode = '55000';
    end if;
  elsif v_person is not null then
    raise exception 'hr: la persona del reingreso no coincide con el documento' using errcode = '22023';
  end if;

  v_ident := jsonb_strip_nulls(jsonb_build_object(
    'doc_type', p_datos->>'doc_type', 'doc_number', regexp_replace(btrim(p_datos->>'doc_number'), '[.\s]', '', 'g'),
    'birth_date', nullif(p_datos->>'birth_date', ''), 'personal_phone', nullif(btrim(coalesce(p_datos->>'personal_phone', '')), ''),
    'personal_email', nullif(lower(btrim(coalesce(p_datos->>'personal_email', ''))), '')));

  if v_person is null then
    insert into public.hr_people (organization_id, first_name, second_name, last_name, second_last_name, work_email, created_by, updated_by)
    values (p_org, btrim(p_datos->>'first_name'), nullif(btrim(coalesce(p_datos->>'second_name', '')), ''),
            btrim(p_datos->>'last_name'), nullif(btrim(coalesce(p_datos->>'second_last_name', '')), ''),
            nullif(lower(btrim(coalesce(p_datos->>'work_email', ''))), ''), p_actor, p_actor)
    returning id into v_person;
  else
    update public.hr_people set status = 'activo', updated_by = p_actor where id = v_person;
  end if;
  perform public.fn_hr_datos_sensibles_guardar(p_actor, p_org, v_person, 'identificacion',
    jsonb_build_object('identificacion', v_ident), p_ip, p_ua, p_ruta);

  insert into public.employments (organization_id, person_id, status, hire_date, employment_type, contract_type, contract_end_date,
                                  position_id, department_id, manager_id, branch_id, work_hours_per_week, salary_period, cost_center_id,
                                  probation_end_date)
  values (p_org, v_person, 'active', v_hire,
          case when p_datos->>'contract_type' = 'apprenticeship' then 'intern' else 'employee' end,
          coalesce(nullif(p_datos->>'contract_type', ''), 'indefinite'), nullif(p_datos->>'contract_end_date', '')::date,
          nullif(p_datos->>'position_id', '')::uuid, nullif(p_datos->>'department_id', '')::uuid, nullif(p_datos->>'manager_id', '')::uuid,
          (p_datos->>'branch_id')::integer, coalesce(nullif(p_datos->>'work_hours_per_week', '')::numeric, 42),
          coalesce(nullif(p_datos->>'salary_period', ''), 'monthly'), nullif(p_datos->>'cost_center_id', '')::uuid,
          nullif(p_datos->>'probation_end_date', '')::date)
  returning id into v_emp;
  -- Valida que cargo, área, jefe y centro de costo sean de la organización.
  foreach v_campo in array array['cargo','area','jefe','centro_costo'] loop
    v_valor := public.fn_hr_valor_columna((select x from public.employments x where x.id = v_emp), v_campo);
    if v_valor is not null and jsonb_typeof(v_valor) <> 'null' then
      perform public.fn_hr_validar_valor(p_org, v_emp, v_campo, v_valor);
    end if;
  end loop;

  -- Valores iniciales con fecha de ingreso: salario (con permiso) y seguridad social.
  if v_salario and nullif(p_datos->>'salario', '') is not null then
    v_valor := public.fn_hr_validar_valor(p_org, v_emp, 'salario', p_datos->'salario');
    insert into public.hr_employment_events (organization_id, employment_id, field, effective_from, old_value, new_value, reason,
                                             status, requested_by, approved_by, approved_at, applied_at)
    values (p_org, v_emp, 'salario', v_hire, null, v_valor, 'Ingreso', 'aprobado', p_actor, p_actor, now(), now());
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, v_emp, 'salario_pago', 'editar', p_ip, p_ua, p_ruta,
      jsonb_build_object('campos', jsonb_build_array('salario'), 'alta', true));
  end if;
  foreach v_campo in array array['eps','afp','arl','ccf','cesantias'] loop
    if nullif(p_datos->>v_campo, '') is not null then
      v_valor := public.fn_hr_validar_valor(p_org, v_emp, v_campo, p_datos->v_campo);
      insert into public.hr_employment_events (organization_id, employment_id, field, effective_from, old_value, new_value, reason,
                                               status, requested_by, approved_by, approved_at, applied_at)
      values (p_org, v_emp, v_campo, v_hire, null, v_valor, 'Ingreso', 'aprobado', p_actor, p_actor, now(), now());
    end if;
  end loop;

  -- Sin permiso de salario: tarea a quien lo tiene (decisión 12).
  if not v_salario or nullif(p_datos->>'salario', '') is null then
    for v_u in select om.user_id from public.organization_members om
                where om.organization_id = p_org and om.is_active and om.user_id <> p_actor
                  and public.fn_hr_puede_actor(om.user_id, p_org, 'hr.data.salario_pago.edit')
                limit 5 loop
      insert into public.tasks (organization_id, title, description, assigned_to, priority, status, created_by, related_to_id, related_to_type, due_date)
      values (p_org, 'Completar el salario de ' || public.fn_hr_nombre_persona(v_person),
              'Recursos humanos › Empleados: el empleado se creó sin salario. Regístralo desde su ficha.',
              v_u, 'high', 'open', p_actor, v_person, 'hr_person', (v_hire::timestamp at time zone public.fn_hr_zona_horaria(p_org, null)));
      v_tareas := v_tareas + 1;
    end loop;
  end if;

  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, v_emp, 'basico', 'editar', p_ip, p_ua, p_ruta,
    jsonb_build_object('alta', true, 'reingreso', v_existente is not null));
  return jsonb_build_object('persona_id', v_person, 'vinculo_id', v_emp, 'reingreso', v_existente is not null,
                            'por_ingresar', v_hire > v_hoy, 'tareas', v_tareas, 'salario', v_salario and nullif(p_datos->>'salario', '') is not null);
exception
  when unique_violation then
    raise exception 'documento_duplicado: ya hay una persona con ese documento' using errcode = '23505';
end;
$$;

-- 20. Bandeja «Mis aprobaciones» -------------------------------------------------------
create or replace function public.fn_hr_aprobacion_resumen(p_actor uuid, p_org integer, i public.hr_approval_instances, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_ver_salario boolean;
  v_eventos jsonb := '[]'::jsonb;
  v_cuenta jsonb;
begin
  select * into e from public.employments where id = i.employment_id;
  v_ver_salario := e.person_id is not null and public.fn_hr_actor_puede_grupo(p_actor, p_org, e.person_id, 'salario_pago', 'ver');
  if i.subject_table = 'hr_employment_events' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', z.id, 'campo', z.field, 'desde', z.effective_from, 'motivo', z.reason, 'estado', z.status,
             'oculto', z.field in ('salario','periodo_salario') and not v_ver_salario,
             'anterior', case when z.field in ('salario','periodo_salario') and not v_ver_salario then null else z.old_value end,
             'nuevo', case when z.field in ('salario','periodo_salario') and not v_ver_salario then null else z.new_value end,
             'anterior_nombre', public.fn_hr_nombre_valor(z.field, z.old_value),
             'nuevo_nombre', public.fn_hr_nombre_valor(z.field, z.new_value)) order by z.created_at), '[]'::jsonb)
      into v_eventos
      from public.hr_employment_events z where z.approval_instance_id = i.id;
    if v_ver_salario and exists (select 1 from public.hr_employment_events z where z.approval_instance_id = i.id and z.field in ('salario','periodo_salario')) then
      perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, e.id, 'salario_pago', 'ver', p_ip, p_ua, p_ruta,
        jsonb_build_object('campos', jsonb_build_array('salario'), 'aprobacion', i.id));
    end if;
  elsif i.subject_table = 'hr_bank_account_requests' then
    select jsonb_build_object('banco', r.bank_name, 'tipo', r.account_type, 'numero', public.fn_hr_enmascarar_cuenta(r.account_number), 'motivo', r.reason)
      into v_cuenta from public.hr_bank_account_requests r where r.id = i.subject_id;
  end if;
  return jsonb_build_object(
    'id', i.id, 'tipo', i.request_type, 'estado', i.status, 'creado', i.created_at, 'decidido', i.decided_at,
    'solicito', public.fn_hr_nombre_usuario(i.requested_by), 'es_propia', i.requested_by = p_actor,
    'regla', (select r.name from public.hr_approval_rules r where r.id = i.rule_id),
    'persona', case when e.id is null then null else jsonb_build_object('id', e.person_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                 'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
                 'area', (select d.name from public.departments d where d.id = e.department_id),
                 'sede', (select b.name from public.branches b where b.id = e.branch_id)) end,
    'efecto', (select min(z.effective_from) from public.hr_employment_events z where z.approval_instance_id = i.id),
    'eventos', v_eventos, 'cuenta', v_cuenta,
    'nota', i.context->>'nota', 'soporte_documento_id', i.context->>'soporte_documento_id',
    'contexto', case when i.subject_table in ('hr_employment_events','hr_bank_account_requests') then null else i.context end,
    'decision', (select jsonb_build_object('decision', d.decision, 'en', d.decided_at, 'comentario', d.comment,
                   'por', public.fn_hr_nombre_usuario(d.actor_user_id))
                   from public.hr_approval_decisions d where d.instance_id = i.id order by d.decided_at desc limit 1));
end;
$$;

create or replace function public.fn_hr_aprobaciones_bandeja(p_actor uuid, p_org integer, p_estado text, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v jsonb;
begin
  if not exists (select 1 from public.organization_members om where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_estado = 'resueltas' then
    select coalesce(jsonb_agg(public.fn_hr_aprobacion_resumen(p_actor, p_org, i.inst, p_ip, p_ua, p_ruta) order by i.decided_at desc nulls last), '[]'::jsonb)
      into v
      from (select ai as inst, ai.decided_at from public.hr_approval_instances ai
             where ai.organization_id = p_org and ai.status <> 'pendiente'
               and exists (select 1 from public.hr_approval_decisions d where d.instance_id = ai.id and d.actor_user_id = p_actor)
             order by ai.decided_at desc nulls last limit 50) i;
  else
    select coalesce(jsonb_agg(public.fn_hr_aprobacion_resumen(p_actor, p_org, i.inst, p_ip, p_ua, p_ruta)
                              || jsonb_build_object('en_nombre_de', public.fn_hr_nombre_usuario(i.delegador)) order by i.created_at), '[]'::jsonb)
      into v
      from (select ai as inst, ai.created_at, dd.delegator_user_id as delegador
              from public.hr_approval_instances ai
              join public.hr_approval_steps s on s.instance_id = ai.id and s.step_order = ai.current_step and s.status = 'pendiente'
              left join lateral (
                select d.delegator_user_id from public.hr_approval_delegations d
                 where d.organization_id = ai.organization_id and d.delegate_user_id = p_actor
                   and d.delegator_user_id = any (s.approver_user_ids) and d.is_active
                   and v_hoy between d.starts_on and d.ends_on
                   and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, ai.request_type)
                 limit 1) dd on true
             where ai.organization_id = p_org and ai.status = 'pendiente'
               and ai.requested_by is distinct from p_actor
               and (p_actor = any (s.approver_user_ids) or dd.delegator_user_id is not null)) i;
  end if;
  return jsonb_build_object('estado', coalesce(p_estado, 'pendientes'), 'solicitudes', v,
    'ver_montos', public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view'));
end;
$$;

-- Una solicitud concreta (para «Ver solicitud» desde la ficha): quien la pidió,
-- sus aprobadores o quien gestiona aprobaciones.
create or replace function public.fn_hr_aprobacion_ver(p_actor uuid, p_org integer, p_instancia uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  i public.hr_approval_instances;
  v_puede_decidir boolean;
begin
  select * into i from public.hr_approval_instances where id = p_instancia and organization_id = p_org;
  if not found then
    raise exception 'hr: la solicitud no existe' using errcode = 'P0002';
  end if;
  if not (i.requested_by = p_actor
          or exists (select 1 from public.hr_approval_steps s where s.instance_id = i.id and p_actor = any (s.approver_user_ids))
          or exists (select 1 from public.hr_approval_steps s join public.hr_approval_delegations d
                       on d.organization_id = s.organization_id and d.delegator_user_id = any (s.approver_user_ids)
                      where s.instance_id = i.id and d.delegate_user_id = p_actor and d.is_active)
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.approvals.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_puede_decidir := i.status = 'pendiente' and i.requested_by is distinct from p_actor
    and exists (select 1 from public.hr_approval_steps s where s.instance_id = i.id and s.step_order = i.current_step and s.status = 'pendiente'
                  and (p_actor = any (s.approver_user_ids)
                       or exists (select 1 from public.hr_approval_delegations d
                                   where d.organization_id = i.organization_id and d.delegate_user_id = p_actor
                                     and d.delegator_user_id = any (s.approver_user_ids) and d.is_active
                                     and public.fn_today_for(p_org, null) between d.starts_on and d.ends_on
                                     and public.fn_hr_delegacion_cubre(d.request_type, d.request_types, i.request_type))));
  return public.fn_hr_aprobacion_resumen(p_actor, p_org, i, p_ip, p_ua, p_ruta)
      || jsonb_build_object('puede_decidir', v_puede_decidir,
           'puede_retirar', i.status = 'pendiente' and (i.requested_by = p_actor or public.fn_hr_puede_actor(p_actor, p_org, 'hr.approvals.manage')),
           'espera', (select jsonb_agg(public.fn_hr_nombre_usuario(u)) from public.hr_approval_steps s
                        cross join lateral unnest(s.approver_user_ids) u
                       where s.instance_id = i.id and s.step_order = i.current_step and s.status = 'pendiente'));
end;
$$;

-- 21. Invitación aceptada: el miembro nuevo se enlaza a su persona y a su vínculo ----------
create or replace function public.create_employment_for_new_member()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id integer;
  v_person uuid;
  v_email text;
begin
  if exists (select 1 from public.employments where organization_member_id = new.id) then
    return new;
  end if;

  -- Invitación al portal del empleado (RR. HH.): la persona ya existe sin usuario.
  select lower(u.email) into v_email from auth.users u where u.id = new.user_id;
  if v_email is not null then
    select iv.hr_person_id into v_person
      from public.invitations iv join public.hr_people p on p.id = iv.hr_person_id
     where iv.organization_id = new.organization_id and lower(iv.email) = v_email and iv.hr_person_id is not null
       and p.organization_id = new.organization_id and p.user_id is null
     order by iv.created_at desc limit 1;
  end if;
  if v_person is not null then
    update public.hr_people set user_id = new.user_id, organization_member_id = new.id where id = v_person;
    update public.employments set organization_member_id = new.id
     where id = public.fn_hr_vinculo_actual(v_person) and organization_member_id is null;
    if found then
      return new;
    end if;
  end if;

  select mb.branch_id into v_branch_id from public.member_branches mb
   where mb.organization_member_id = new.id order by mb.id asc limit 1;
  if v_branch_id is null then
    select b.id into v_branch_id from public.branches b
     where b.organization_id = new.organization_id and b.is_main = true and b.is_active = true limit 1;
  end if;
  insert into public.employments (organization_member_id, person_id, status, hire_date, employment_type, contract_type, work_location,
                                  work_hours_per_week, currency_code, salary_period, branch_id)
  values (new.id, v_person, 'active', public.fn_today_for(new.organization_id, v_branch_id), 'employee', 'indefinite', 'onsite',
          48, public.fn_moneda_base_organizacion(new.organization_id), 'monthly', v_branch_id);
  return new;
end;
$$;

-- 22. Aviso diario de vencimientos a RR. HH. y al jefe ---------------------------------------
create or replace function public.fn_hr_avisar_vencimientos()
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  u uuid;
  n integer := 0;
  v_dest uuid[];
begin
  for r in
    with vence as (
      select c.organization_id as org, 'certificacion' as kind, c.id as ref_id, c.expires_on as due, c.person_id, c.name as que
        from public.hr_person_certifications c where c.is_active and c.expires_on is not null
      union all
      select d.organization_id, 'documento', d.id, d.valid_until, d.person_id, d.category
        from public.hr_documents d where d.status = 'activo' and d.valid_until is not null
      union all
      select e.organization_id, 'contrato', e.id, e.contract_end_date, e.person_id, 'contrato'
        from public.employments e where e.contract_end_date is not null and e.status not in ('terminated','retired') and e.person_id is not null
    )
    select v.*, public.fn_today_for(v.org, null) as hoy from vence v
     where v.due between public.fn_today_for(v.org, null) and public.fn_today_for(v.org, null) + public.fn_hr_dias_aviso(v.org)
       and not exists (select 1 from public.hr_expiry_notices x where x.organization_id = v.org and x.kind = v.kind and x.ref_id = v.ref_id and x.due_date = v.due)
  loop
    v_dest := array_remove(public.fn_hr_rrhh_aprobadores(r.org)
                || public.fn_hr_usuario_de_empleo((select e.manager_id from public.employments e where e.id = public.fn_hr_vinculo_actual(r.person_id))), null);
    foreach u in array coalesce((select array_agg(distinct x) from unnest(v_dest) x), '{}'::uuid[]) loop
      insert into public.notifications (organization_id, recipient_user_id, channel, payload, status)
      values (r.org, u, 'app', jsonb_build_object(
                'type', 'hr_vencimiento',
                'title', case r.kind when 'contrato' then 'Contrato por vencer' when 'certificacion' then 'Certificación por vencer' else 'Documento por vencer' end,
                'content', coalesce(public.fn_hr_nombre_persona(r.person_id), '') || ': vence el ' || to_char(r.due, 'YYYY-MM-DD') || '.',
                'person_id', r.person_id, 'kind', r.kind, 'ref_id', r.ref_id, 'due_date', r.due,
                'url', '/app/hrm/empleados/' || r.person_id), 'pending');
    end loop;
    insert into public.hr_expiry_notices (organization_id, kind, ref_id, due_date) values (r.org, r.kind, r.ref_id, r.due)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 23. Permisos de ejecución --------------------------------------------------------------
revoke execute on function public.fn_hr_nombre_persona(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_dias_aviso(integer) from public, anon, authenticated;
revoke execute on function public.fn_hr_documentos_exigidos(uuid) from public, anon;
revoke execute on function public.fn_hr_vinculo_actual(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_estado_vinculo(public.employments, date) from public, anon;
revoke execute on function public.fn_hr_nombre_valor(text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_actor_ve_persona(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_periodo_cerrado(integer, date) from public, anon, authenticated;
revoke execute on function public.fn_hr_alertas_persona(integer, uuid, uuid, date, integer, boolean) from public, anon, authenticated;
revoke execute on function public.fn_hr_validar_valor(integer, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_tipo_solicitud_campo(text) from public, anon;
revoke execute on function public.fn_hr_registrar_cambios(uuid, date, jsonb, text, text, jsonb) from public, anon;
revoke execute on function public.fn_hr_banco_aplicar_solicitud(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_empleados_listar(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_ficha_leer(uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_documentos_listar(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_contactos_emergencia_leer(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_enmascarar_cuenta(text) from public, anon;
revoke execute on function public.fn_hr_banco_leer(uuid, integer, uuid, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_banco_solicitar_cambio(uuid, integer, uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_ultimas_consultas(uuid, integer, uuid, integer) from public, anon, authenticated;
revoke execute on function public.fn_hr_buscar_documento(uuid, integer, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_alta_empleado(uuid, integer, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_resumen(uuid, integer, public.hr_approval_instances, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobaciones_bandeja(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_aprobacion_ver(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_employment_for_new_member() from public, anon, authenticated;
revoke execute on function public.fn_hr_avisar_vencimientos() from public, anon, authenticated;

grant execute on function public.fn_hr_documentos_exigidos(uuid) to authenticated, service_role;
grant execute on function public.fn_hr_estado_vinculo(public.employments, date) to authenticated, service_role;
grant execute on function public.fn_hr_tipo_solicitud_campo(text) to authenticated, service_role;
grant execute on function public.fn_hr_enmascarar_cuenta(text) to service_role;
grant execute on function public.fn_hr_registrar_cambios(uuid, date, jsonb, text, text, jsonb) to authenticated;
grant execute on function public.fn_hr_periodo_cerrado(integer, date) to service_role;
grant execute on function public.fn_hr_empleados_listar(uuid, integer, text, text, text) to service_role;
grant execute on function public.fn_hr_ficha_leer(uuid, integer, uuid) to service_role;
grant execute on function public.fn_hr_documentos_listar(uuid, integer, uuid, text, text, text) to service_role;
grant execute on function public.fn_hr_contactos_emergencia_leer(uuid, integer, uuid, text, text, text) to service_role;
grant execute on function public.fn_hr_banco_leer(uuid, integer, uuid, boolean, text, text, text) to service_role;
grant execute on function public.fn_hr_banco_solicitar_cambio(uuid, integer, uuid, jsonb, text, text, text) to service_role;
grant execute on function public.fn_hr_ultimas_consultas(uuid, integer, uuid, integer) to service_role;
grant execute on function public.fn_hr_buscar_documento(uuid, integer, text, text, text, text, text) to service_role;
grant execute on function public.fn_hr_alta_empleado(uuid, integer, jsonb, text, text, text) to service_role;
grant execute on function public.fn_hr_aprobaciones_bandeja(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.fn_hr_aprobacion_ver(uuid, integer, uuid, text, text, text) to service_role;
grant execute on function public.fn_hr_avisar_vencimientos() to service_role;

-- Job diario (05:20 UTC = 00:20 en Bogotá): avisos de vencimiento.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-avisar-vencimientos') then
    perform cron.unschedule('hrm-avisar-vencimientos');
  end if;
  perform cron.schedule('hrm-avisar-vencimientos', '20 5 * * *', 'select public.fn_hr_avisar_vencimientos();');
end $$;
