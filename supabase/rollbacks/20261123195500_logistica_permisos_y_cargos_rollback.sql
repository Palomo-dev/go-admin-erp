-- Reversión de 20261123195500_logistica_permisos_y_cargos.

-- 5. Logística vuelve a quedar inactiva en las 6 organizaciones activadas por la migración.
update public.organization_modules
   set is_active = false, disabled_at = now(), updated_at = now()
 where module_code = 'logistica' and organization_id in (333, 335, 337, 338, 339, 358);

-- 4. Trigger.
drop trigger if exists trg_logistica_cargos_al_activar on public.organization_modules;
drop function if exists public.fn_logistica_cargos_al_activar();

-- 3. Cargos creados por la migración, solo si nadie los tiene asignado.
delete from public.job_position_page_access a using public.job_positions jp
 where a.job_position_id = jp.id and jp.code in ('LOG-DESPACHO', 'LOG-DOMICILIO');
delete from public.job_position_module_access a using public.job_positions jp
 where a.job_position_id = jp.id and jp.code in ('LOG-DESPACHO', 'LOG-DOMICILIO');
delete from public.job_position_permissions a using public.job_positions jp
 where a.job_position_id = jp.id and jp.code in ('LOG-DESPACHO', 'LOG-DOMICILIO');
delete from public.job_positions jp
 where jp.code in ('LOG-DESPACHO', 'LOG-DOMICILIO')
   and not exists (select 1 from public.organization_members om where om.job_position_id = jp.id)
   and not exists (select 1 from public.employments e where e.position_id = jp.id);
drop function if exists public.fn_logistica_crear_cargos(integer);

-- 2. Gestiona = pos.create, como en 20261123165617.
create or replace function public.fn_logistica_gestiona(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_caja_puede(p_org, 'pos.create');
$$;
comment on function public.fn_logistica_gestiona(integer) is
  'Logística: permiso para gestionar domiciliarios, asignar y ver todos los envíos (hoy = fn_caja_puede pos.create).';

-- 1. Permisos (y lo que quede asignado a roles o cargos).
delete from public.role_permissions rp using public.permissions p
 where rp.permission_id = p.id and p.code in ('logistica.view', 'logistica.manage', 'logistica.deliver');
delete from public.job_position_permissions jpp using public.permissions p
 where jpp.permission_id = p.id and p.code in ('logistica.view', 'logistica.manage', 'logistica.deliver');
delete from public.permissions where code in ('logistica.view', 'logistica.manage', 'logistica.deliver');
