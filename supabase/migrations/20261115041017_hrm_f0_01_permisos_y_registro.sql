-- HRM fase 0 · paso 1: permisos por grupo de datos, funciones de resolución
-- y registro de accesos a datos sensibles. Ver docs/hrm/ADR-001-modelo-fundaciones.md §6 y §7.
--
-- - Crea los códigos hr.* que faltaban (R10: hr.employees.view se usaba y no existía).
-- - Los entrega, como DATOS de role_permissions, a los roles 1 y 2 (todos) y al
--   rol 5 (hr.employees.view_team). Ninguna función de HRM compara role_id: todo
--   pasa por check_user_permission (rol + cargo, precedencia del cargo).
-- - hr_access_log: solo inserción; ni service_role puede editarlo o borrarlo.
--
-- Funciones SECURITY DEFINER: todas nacen sin EXECUTE para anon ni public.

-- 1. Permisos ---------------------------------------------------------------
insert into public.permissions (code, name, description, module, category)
values
  ('hr.employees.view', 'Ver empleados', 'Ve los datos básicos y el vínculo laboral de todos los empleados de la organización.', 'hr', 'hr'),
  ('hr.employees.view_team', 'Ver a su equipo', 'Ve los datos básicos, la asistencia y las ausencias de las personas a su cargo.', 'hr', 'hr'),
  ('hr.employees.create', 'Crear empleados', 'Crea personas y vínculos laborales.', 'hr', 'hr'),
  ('hr.employees.edit', 'Editar empleados', 'Edita los datos básicos y el vínculo laboral, y registra cambios con fecha de efecto.', 'hr', 'hr'),
  ('hr.data.identificacion.view', 'Ver identificación', 'Documento, datos personales, beneficiarios y contactos de emergencia de toda la organización.', 'hr', 'hr'),
  ('hr.data.identificacion.view_team', 'Ver identificación de su equipo', 'Documento, datos personales, beneficiarios y contactos de emergencia de su equipo.', 'hr', 'hr'),
  ('hr.data.identificacion.edit', 'Editar identificación', 'Edita documento, datos personales, beneficiarios y contactos de emergencia.', 'hr', 'hr'),
  ('hr.data.salario_pago.view', 'Ver salario y pago', 'Salario, historial salarial y afiliaciones de toda la organización.', 'hr', 'hr'),
  ('hr.data.salario_pago.view_team', 'Ver salario y pago de su equipo', 'Salario e historial salarial de su equipo.', 'hr', 'hr'),
  ('hr.data.salario_pago.edit', 'Editar salario y pago', 'Registra cambios de salario y edita paquetes salariales.', 'hr', 'hr'),
  ('hr.data.banco.view', 'Ver datos bancarios', 'Cuentas bancarias de toda la organización.', 'hr', 'hr'),
  ('hr.data.banco.view_team', 'Ver datos bancarios de su equipo', 'Cuentas bancarias de su equipo.', 'hr', 'hr'),
  ('hr.data.banco.edit', 'Editar datos bancarios', 'Edita cuentas bancarias de los empleados.', 'hr', 'hr'),
  ('hr.data.salud.view', 'Ver datos de salud', 'Incapacidades, conceptos médicos ocupacionales y sus soportes (nunca la historia clínica).', 'hr', 'hr'),
  ('hr.data.salud.view_team', 'Ver datos de salud de su equipo', 'Datos de salud de su equipo.', 'hr', 'hr'),
  ('hr.data.salud.edit', 'Editar datos de salud', 'Registra incapacidades, conceptos ocupacionales y sus soportes.', 'hr', 'hr'),
  ('hr.data.disciplinario.view', 'Ver procesos disciplinarios', 'Procesos disciplinarios y sus soportes de toda la organización.', 'hr', 'hr'),
  ('hr.data.disciplinario.view_team', 'Ver procesos disciplinarios de su equipo', 'Procesos disciplinarios de su equipo.', 'hr', 'hr'),
  ('hr.data.disciplinario.edit', 'Editar procesos disciplinarios', 'Registra procesos disciplinarios y sus soportes.', 'hr', 'hr'),
  ('hr.data.sst.view', 'Ver SST', 'Registros de seguridad y salud en el trabajo de toda la organización.', 'hr', 'hr'),
  ('hr.data.sst.view_team', 'Ver SST de su equipo', 'Registros de SST de su equipo.', 'hr', 'hr'),
  ('hr.data.sst.edit', 'Editar SST', 'Registra accidentes, capacitaciones, EPP y demás registros de SST.', 'hr', 'hr'),
  ('hr.data.export', 'Exportar datos sensibles', 'Exporta datos sensibles de empleados; cada exportación queda registrada.', 'hr', 'hr'),
  ('hr.attendance.view', 'Ver asistencia', 'Turnos, marcaciones y timesheets de toda la organización.', 'hr', 'hr'),
  ('hr.attendance.manage', 'Gestionar asistencia', 'Asigna turnos, corrige marcaciones y aprueba timesheets.', 'hr', 'hr'),
  ('hr.leaves.view', 'Ver ausencias', 'Ausencias y saldos de toda la organización.', 'hr', 'hr'),
  ('hr.departments.manage', 'Gestionar áreas', 'Crea y edita áreas y subáreas.', 'hr', 'hr'),
  ('hr.approvals.manage', 'Gestionar aprobaciones', 'Configura reglas de aprobación y actúa como aprobador de respaldo.', 'hr', 'hr'),
  ('hr.parameters.manage', 'Gestionar parámetros de RR. HH.', 'Fija los parámetros propios de la organización y sus festivos.', 'hr', 'hr'),
  ('hr.access_log.view', 'Ver registro de accesos', 'Consulta quién vio, editó o exportó datos sensibles.', 'hr', 'hr')
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      module = excluded.module, category = excluded.category;

-- Roles de sistema 1 y 2: todos los códigos nuevos. Rol 5: ver a su equipo.
insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (1), (2)) r(role_id)
 where p.code like 'hr.%'
   and p.code in (
     'hr.employees.view','hr.employees.view_team','hr.employees.create','hr.employees.edit',
     'hr.data.identificacion.view','hr.data.identificacion.view_team','hr.data.identificacion.edit',
     'hr.data.salario_pago.view','hr.data.salario_pago.view_team','hr.data.salario_pago.edit',
     'hr.data.banco.view','hr.data.banco.view_team','hr.data.banco.edit',
     'hr.data.salud.view','hr.data.salud.view_team','hr.data.salud.edit',
     'hr.data.disciplinario.view','hr.data.disciplinario.view_team','hr.data.disciplinario.edit',
     'hr.data.sst.view','hr.data.sst.view_team','hr.data.sst.edit',
     'hr.data.export','hr.attendance.view','hr.attendance.manage','hr.leaves.view',
     'hr.departments.manage','hr.approvals.manage','hr.parameters.manage','hr.access_log.view')
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

insert into public.role_permissions (role_id, permission_id, allowed)
select 5, p.id, true from public.permissions p
 where p.code = 'hr.employees.view_team'
   and not exists (select 1 from public.role_permissions rp where rp.role_id = 5 and rp.permission_id = p.id);

-- 2. Resolución de permisos ---------------------------------------------------
-- Grupos de datos válidos (una sola definición).
create or replace function public.fn_hr_grupos_datos()
returns text[]
language sql immutable
set search_path = public, pg_temp
as $$ select array['identificacion','salario_pago','banco','salud','disciplinario','sst']::text[] $$;

create or replace function public.fn_hr_puede_actor(p_actor uuid, p_org integer, p_code text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_actor is not null and p_org is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = p_actor and om.organization_id = p_org and om.is_active)
     and coalesce(public.check_user_permission(p_actor, p_org, p_code), false);
$$;

create or replace function public.fn_hr_puede(p_org integer, p_code text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select public.fn_hr_puede_actor(auth.uid(), p_org, p_code); $$;

-- Para RLS: organizaciones donde el usuario de la sesión tiene el código.
-- Sin argumentos correlacionados: el planner la evalúa una vez (hashed SubPlan).
create or replace function public.fn_hr_orgs_con_permiso(p_code text)
returns setof integer
language sql stable security definer
set search_path = public, pg_temp
as $$
  select om.organization_id
    from public.organization_members om
   where om.user_id = auth.uid()
     and om.is_active
     and coalesce(public.check_user_permission(om.user_id, om.organization_id, p_code), false);
$$;

-- 3. Registro de accesos --------------------------------------------------------
create table if not exists public.hr_access_log (
  id            bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null,
  person_id     uuid,
  employment_id uuid,
  data_group    text not null,
  action        text not null check (action in ('ver','editar','exportar')),
  occurred_at   timestamptz not null default now(),
  ip            inet,
  user_agent    text,
  route         text,
  detail        jsonb not null default '{}'::jsonb,
  constraint hr_access_log_grupo_chk check (data_group = any (public.fn_hr_grupos_datos()))
);
comment on table public.hr_access_log is
  'HRM: registro de solo inserción de cada lectura, edición o exportación de datos sensibles (ADR-001 §7). detail lleva nombres de campos, nunca valores.';
create index if not exists hr_access_log_org_fecha_idx on public.hr_access_log (organization_id, occurred_at desc);
create index if not exists hr_access_log_persona_idx on public.hr_access_log (person_id, occurred_at desc);

create or replace function public.fn_hr_access_log_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'hr_access_log es de solo inserción' using errcode = '42501';
end;
$$;

drop trigger if exists trg_hr_access_log_inmutable on public.hr_access_log;
create trigger trg_hr_access_log_inmutable
  before update or delete on public.hr_access_log
  for each row execute function public.fn_hr_access_log_inmutable();

alter table public.hr_access_log enable row level security;
revoke all on public.hr_access_log from anon, public;
revoke insert, update, delete, truncate on public.hr_access_log from authenticated, service_role;
grant select on public.hr_access_log to authenticated;

drop policy if exists hr_access_log_select on public.hr_access_log;
create policy hr_access_log_select on public.hr_access_log
  for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.access_log.view')));

-- IP y agente de la petición PostgREST (cuando la RPC se llama con la sesión).
create or replace function public.fn_hr_peticion_ip()
returns inet
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_h jsonb;
  v_ip text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  v_ip := coalesce(v_h->>'cf-connecting-ip',
                   btrim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)),
                   v_h->>'x-real-ip');
  if v_ip is null or v_ip = '' then return null; end if;
  begin
    return v_ip::inet;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.fn_hr_peticion_agente()
returns text
language plpgsql stable
set search_path = public, pg_temp
as $$
begin
  return left(nullif(current_setting('request.headers', true), '')::jsonb->>'user-agent', 500);
exception when others then
  return null;
end;
$$;

-- Inserción interna (la usan las funciones de HRM). p_ip/p_ua nulos → cabeceras.
create or replace function public.fn_hr_registrar_acceso_interno(
  p_actor uuid, p_org integer, p_person uuid, p_employment uuid,
  p_grupo text, p_accion text, p_ip text, p_ua text, p_ruta text, p_detalle jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet;
  v_origen text := 'declarada';
begin
  if p_actor is null then
    raise exception 'hr: el registro de accesos exige un actor' using errcode = '22023';
  end if;
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is null then
    v_ip := public.fn_hr_peticion_ip();
    v_origen := case when v_ip is null then 'desconocida' else 'cabecera' end;
  end if;
  insert into public.hr_access_log
    (organization_id, actor_user_id, person_id, employment_id, data_group, action, ip, user_agent, route, detail)
  values
    (p_org, p_actor, p_person, p_employment, p_grupo, p_accion, v_ip,
     left(coalesce(nullif(p_ua, ''), public.fn_hr_peticion_agente()), 500), left(p_ruta, 300),
     coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('ip_origen', v_origen));
end;
$$;

revoke execute on function public.fn_hr_puede_actor(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_puede(integer, text) from public, anon;
revoke execute on function public.fn_hr_orgs_con_permiso(text) from public, anon;
revoke execute on function public.fn_hr_registrar_acceso_interno(uuid, integer, uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_access_log_inmutable() from public, anon, authenticated;
grant execute on function public.fn_hr_puede_actor(uuid, integer, text) to service_role;
grant execute on function public.fn_hr_puede(integer, text) to authenticated, service_role;
grant execute on function public.fn_hr_orgs_con_permiso(text) to authenticated, service_role;
grant execute on function public.fn_hr_registrar_acceso_interno(uuid, integer, uuid, uuid, text, text, text, text, text, jsonb) to service_role;
