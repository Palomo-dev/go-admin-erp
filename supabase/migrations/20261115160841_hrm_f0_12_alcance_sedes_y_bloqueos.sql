-- HRM fase 0 · paso 12: alcance «Sus sedes», bloqueos de «Solo su equipo» y
-- permiso «Aprobar solicitudes de RR. HH.». Diseño aprobado 10.RH.4 (editor de
-- rol, grupos de datos); decisiones del dueño del 2026-11-15.
--
-- - Alcance de un rol en RR. HH.: toda la organización (`.view`), sus sedes
--   (`.view_branch`, nuevo) o solo su equipo (`.view_team`).
-- - Con «Solo su equipo», salario, cuenta bancaria y salud quedan BLOQUEADOS
--   aunque alguien marque el permiso: la base no los resuelve.
-- - «Su equipo» = quienes le reportan directa o indirectamente (manager_id) y
--   las personas de las áreas que dirige.
-- - «Sus sedes» = las sucursales asignadas a la persona (member_branches) o, si
--   no tiene ninguna asignada, la sede de su vínculo laboral.
-- - Editar un grupo exige el permiso de editar Y que la persona esté en su
--   alcance (antes bastaba el permiso de editar).
-- - hr.parameters.manage se llama ahora «Configurar Recursos humanos».

insert into public.permissions (code, name, description, module, category)
values
  ('hr.employees.view_branch', 'Ver empleados de sus sedes', 'Ve los datos básicos, la asistencia y las ausencias de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.identificacion.view_branch', 'Ver identificación de sus sedes', 'Documento, datos personales, beneficiarios y contactos de emergencia de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.salario_pago.view_branch', 'Ver salario y pago de sus sedes', 'Salario e historial salarial de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.banco.view_branch', 'Ver datos bancarios de sus sedes', 'Cuentas bancarias de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.salud.view_branch', 'Ver datos de salud de sus sedes', 'Datos de salud de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.disciplinario.view_branch', 'Ver procesos disciplinarios de sus sedes', 'Procesos disciplinarios de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.data.sst.view_branch', 'Ver SST de sus sedes', 'Registros de SST de las personas de sus sedes.', 'hr', 'hr'),
  ('hr.requests.approve', 'Aprobar solicitudes de RR. HH.', 'Recibe los pasos «RR. HH.» de las cadenas de aprobación y los que no tienen a quién llegar.', 'hr', 'hr')
on conflict (code) do update
  set name = excluded.name, description = excluded.description, module = excluded.module, category = excluded.category;

update public.permissions
   set name = 'Configurar Recursos humanos',
       description = 'Parámetros legales y de la empresa, festivos propios y clases de riesgo ARL.'
 where code = 'hr.parameters.manage';

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p cross join (values (1), (2)) r(role_id)
 where p.code in ('hr.employees.view_branch','hr.data.identificacion.view_branch','hr.data.salario_pago.view_branch',
                  'hr.data.banco.view_branch','hr.data.salud.view_branch','hr.data.disciplinario.view_branch',
                  'hr.data.sst.view_branch','hr.requests.approve')
   and not exists (select 1 from public.role_permissions rp where rp.role_id = r.role_id and rp.permission_id = p.id);

-- Grupos que «Solo su equipo» nunca deja ver.
create or replace function public.fn_hr_grupos_bloqueados_equipo()
returns text[]
language sql immutable
set search_path = public, pg_temp
as $$ select array['salario_pago','banco','salud']::text[] $$;

-- Alcance de un actor para un código `*.view_team`: su equipo (si el grupo no
-- está bloqueado) más sus sedes (si tiene el `*.view_branch` del mismo grupo).
create or replace function public.fn_hr_equipo_empleos_actor(p_actor uuid, p_code text)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  with recursive
  base as (
    select regexp_replace(p_code, '\.view_team$', '') as b,
           regexp_replace(regexp_replace(p_code, '\.view_team$', ''), '^hr\.data\.', '') = any (public.fn_hr_grupos_bloqueados_equipo())
             and p_code like 'hr.data.%' as bloqueado
  ),
  orgs as (
    select om.organization_id from public.organization_members om, base
     where om.user_id = p_actor and om.is_active and not base.bloqueado
       and coalesce(public.check_user_permission(p_actor, om.organization_id, p_code), false)
  ),
  orgs_sede as (
    select om.id as member_id, om.organization_id from public.organization_members om, base
     where om.user_id = p_actor and om.is_active
       and coalesce(public.check_user_permission(p_actor, om.organization_id, base.b || '.view_branch'), false)
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
  ),
  sedes as (
    select os.organization_id, mb.branch_id
      from orgs_sede os join public.member_branches mb on mb.organization_member_id = os.member_id
    union
    select os.organization_id, e.branch_id
      from orgs_sede os join public.employments e on e.organization_member_id = os.member_id
     where e.branch_id is not null
       and not exists (select 1 from public.member_branches mb where mb.organization_member_id = os.member_id)
  )
  select id from reportes where id not in (select id from mios)
  union
  select e.id from public.employments e
   where e.department_id in (select id from areas)
     and e.organization_id in (select organization_id from orgs)
     and e.id not in (select id from mios)
  union
  select e.id from public.employments e
    join sedes s on s.organization_id = e.organization_id and s.branch_id = e.branch_id;
$$;
revoke execute on function public.fn_hr_equipo_empleos_actor(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hr_equipo_empleos_actor(uuid, text) to service_role;
revoke execute on function public.fn_hr_grupos_bloqueados_equipo() from public, anon;
grant execute on function public.fn_hr_grupos_bloqueados_equipo() to authenticated, service_role;

-- Editar exige permiso de edición y que la persona esté en su alcance.
create or replace function public.fn_hr_actor_puede_grupo(p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_propio boolean;
  v_alcance boolean;
begin
  if p_actor is null or p_person is null
     or not (p_grupo = any (public.fn_hr_grupos_datos()))
     or p_accion not in ('ver','editar','exportar') then
    return false;
  end if;
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    return false;
  end if;
  if not exists (select 1 from public.organization_members om
                  where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    return false;
  end if;
  v_base := 'hr.data.' || p_grupo;
  v_alcance := public.fn_hr_puede_actor(p_actor, p_org, v_base || '.view')
            or exists (select 1 from public.employments e
                        where e.person_id = p_person
                          and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team')));
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, p_org, v_base || '.edit') and v_alcance;
  end if;
  v_propio := exists (select 1 from public.hr_people p where p.id = p_person and p.user_id = p_actor)
           or exists (select 1 from public.employments e join public.organization_members om on om.id = e.organization_member_id
                       where e.person_id = p_person and om.user_id = p_actor);
  if p_accion = 'exportar' and not (v_propio or public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.export')) then
    return false;
  end if;
  return v_propio or v_alcance;
end;
$$;
revoke execute on function public.fn_hr_actor_puede_grupo(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_actor_puede_grupo(uuid, integer, uuid, text, text) to service_role;

create or replace function public.fn_hr_actor_puede_empleo(p_actor uuid, p_employment uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_base text;
  v_alcance boolean;
begin
  select e.organization_id into v_org from public.employments e where e.id = p_employment;
  if v_org is null or p_actor is null then return false; end if;
  v_base := case when p_grupo = 'basico' then 'hr.employees' else 'hr.data.' || p_grupo end;
  v_alcance := public.fn_hr_puede_actor(p_actor, v_org, v_base || '.view')
            or p_employment in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team'));
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, v_org, v_base || '.edit') and v_alcance;
  end if;
  return v_alcance
      or exists (select 1 from public.employments e
                   left join public.organization_members om on om.id = e.organization_member_id
                   left join public.hr_people p on p.id = e.person_id
                  where e.id = p_employment
                    and (om.user_id = p_actor or p.user_id = p_actor)
                    and exists (select 1 from public.organization_members m
                                 where m.user_id = p_actor and m.organization_id = v_org and m.is_active));
end;
$$;
revoke execute on function public.fn_hr_actor_puede_empleo(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_actor_puede_empleo(uuid, uuid, text, text) to service_role;

-- La subida directa al bucket también exige que la persona esté en su alcance.
create or replace function public.fn_hr_storage_puede_subir(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_partes text[] := storage.foldername(p_name);
begin
  if auth.uid() is null or cardinality(v_partes) <> 3 or p_name like '%..%' then
    return false;
  end if;
  if v_partes[1] !~ '^[0-9]{1,9}$' or not (v_partes[2] = any (public.fn_hr_grupos_datos()))
     or v_partes[3] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return public.fn_hr_actor_puede_grupo(auth.uid(), v_partes[1]::integer, v_partes[3]::uuid, v_partes[2], 'editar');
end;
$$;
revoke execute on function public.fn_hr_storage_puede_subir(text) from public, anon;
grant execute on function public.fn_hr_storage_puede_subir(text) to authenticated, service_role;

-- Lo que el usuario de la sesión puede hacer: se suma el alcance por sedes y
-- los grupos bloqueados por «Solo su equipo».
create or replace function public.fn_hr_mis_permisos(p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g text;
  v_grupos jsonb := '{}'::jsonb;
  v_bloq boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  foreach g in array public.fn_hr_grupos_datos() loop
    v_bloq := g = any (public.fn_hr_grupos_bloqueados_equipo());
    v_grupos := v_grupos || jsonb_build_object(g, jsonb_build_object(
      'ver', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view'),
      'ver_sedes', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view_branch'),
      'ver_equipo', not v_bloq and public.fn_hr_puede(p_org, 'hr.data.' || g || '.view_team'),
      'editar', public.fn_hr_puede(p_org, 'hr.data.' || g || '.edit')));
  end loop;
  return jsonb_build_object(
    'empleados', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.employees.view'),
                                    'ver_sedes', public.fn_hr_puede(p_org, 'hr.employees.view_branch'),
                                    'ver_equipo', public.fn_hr_puede(p_org, 'hr.employees.view_team'),
                                    'crear', public.fn_hr_puede(p_org, 'hr.employees.create'),
                                    'editar', public.fn_hr_puede(p_org, 'hr.employees.edit')),
    'grupos', v_grupos,
    'exportar', public.fn_hr_puede(p_org, 'hr.data.export'),
    'asistencia', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.attendance.view'),
                                     'gestionar', public.fn_hr_puede(p_org, 'hr.attendance.manage')),
    'ausencias', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.leaves.view'),
                                    'aprobar', public.fn_hr_puede(p_org, 'hr.leaves.approve')),
    'nomina', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.payroll.view'),
                                 'procesar', public.fn_hr_puede(p_org, 'hr.payroll.process')),
    'aprobaciones', public.fn_hr_puede(p_org, 'hr.approvals.manage'),
    'aprobar_solicitudes', public.fn_hr_puede(p_org, 'hr.requests.approve'),
    'parametros', public.fn_hr_puede(p_org, 'hr.parameters.manage'),
    'registro_accesos', public.fn_hr_puede(p_org, 'hr.access_log.view'));
end;
$$;
revoke execute on function public.fn_hr_mis_permisos(integer) from public, anon;
grant execute on function public.fn_hr_mis_permisos(integer) to authenticated;
