-- Revierte HRM fase 0 · paso 12. Devuelve las funciones a su versión anterior
-- (copiada de la migración que la creó).
-- Quita los permisos nuevos de todos los roles y cargos y los borra del catálogo.

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

create or replace function public.fn_hr_actor_puede_grupo(p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_propio boolean;
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
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, p_org, v_base || '.edit');
  end if;
  v_propio := exists (select 1 from public.hr_people p where p.id = p_person and p.user_id = p_actor)
           or exists (select 1 from public.employments e join public.organization_members om on om.id = e.organization_member_id
                       where e.person_id = p_person and om.user_id = p_actor);
  if p_accion = 'exportar' and not (v_propio or public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.export')) then
    return false;
  end if;
  return v_propio
      or public.fn_hr_puede_actor(p_actor, p_org, v_base || '.view')
      or exists (select 1 from public.employments e
                  where e.person_id = p_person
                    and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team')));
end;
$$;

create or replace function public.fn_hr_actor_puede_empleo(p_actor uuid, p_employment uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_base text;
begin
  select e.organization_id into v_org from public.employments e where e.id = p_employment;
  if v_org is null or p_actor is null then return false; end if;
  v_base := case when p_grupo = 'basico' then 'hr.employees' else 'hr.data.' || p_grupo end;
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, v_org, v_base || '.edit');
  end if;
  return public.fn_hr_puede_actor(p_actor, v_org, v_base || '.view')
      or p_employment in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team'))
      or exists (select 1 from public.employments e
                   left join public.organization_members om on om.id = e.organization_member_id
                   left join public.hr_people p on p.id = e.person_id
                  where e.id = p_employment
                    and (om.user_id = p_actor or p.user_id = p_actor)
                    and exists (select 1 from public.organization_members m
                                 where m.user_id = p_actor and m.organization_id = v_org and m.is_active));
end;
$$;

create or replace function public.fn_hr_storage_puede_subir(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_partes text[] := storage.foldername(p_name);
  v_org integer;
  v_persona uuid;
begin
  if auth.uid() is null or cardinality(v_partes) <> 3 or p_name like '%..%' then
    return false;
  end if;
  if v_partes[1] !~ '^[0-9]{1,9}$' or not (v_partes[2] = any (public.fn_hr_grupos_datos()))
     or v_partes[3] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_org := v_partes[1]::integer;
  v_persona := v_partes[3]::uuid;
  if not exists (select 1 from public.hr_people p where p.id = v_persona and p.organization_id = v_org) then
    return false;
  end if;
  return public.fn_hr_puede(v_org, 'hr.data.' || v_partes[2] || '.edit');
end;
$$;

create or replace function public.fn_hr_mis_permisos(p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g text;
  v_grupos jsonb := '{}'::jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  foreach g in array public.fn_hr_grupos_datos() loop
    v_grupos := v_grupos || jsonb_build_object(g, jsonb_build_object(
      'ver', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view'),
      'ver_equipo', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view_team'),
      'editar', public.fn_hr_puede(p_org, 'hr.data.' || g || '.edit')));
  end loop;
  return jsonb_build_object(
    'empleados', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.employees.view'),
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
    'parametros', public.fn_hr_puede(p_org, 'hr.parameters.manage'),
    'registro_accesos', public.fn_hr_puede(p_org, 'hr.access_log.view'));
end;
$$;

drop function if exists public.fn_hr_grupos_bloqueados_equipo();
update public.permissions set name = 'Gestionar parámetros de RR. HH.', description = 'Fija los parámetros propios de la organización y sus festivos.'
 where code = 'hr.parameters.manage';
with nuevos as (select id from public.permissions where code in ('hr.employees.view_branch','hr.data.identificacion.view_branch',
  'hr.data.salario_pago.view_branch','hr.data.banco.view_branch','hr.data.salud.view_branch','hr.data.disciplinario.view_branch',
  'hr.data.sst.view_branch','hr.requests.approve')),
a as (delete from public.role_permissions where permission_id in (select id from nuevos)),
b as (delete from public.job_position_permissions where permission_id in (select id from nuevos))
delete from public.permissions where id in (select id from nuevos);
