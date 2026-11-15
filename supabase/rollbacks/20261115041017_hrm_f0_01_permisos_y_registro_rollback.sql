-- Revierte HRM fase 0 · paso 1: permisos por grupo y registro de accesos.
-- ADVERTENCIAS:
-- - Borra hr_access_log (el registro de accesos). Exportarlo antes: es evidencia.
--   El trigger de inmutabilidad se quita primero para poder borrar la tabla.
-- - Quita los 30 códigos nuevos de role_permissions y job_position_permissions
--   de TODOS los roles y cargos, no solo de los roles 1, 2 y 5.
-- Revertir antes los pasos 2 a 10, que usan estas funciones.

drop policy if exists hr_access_log_select on public.hr_access_log;
drop trigger if exists trg_hr_access_log_inmutable on public.hr_access_log;
drop table if exists public.hr_access_log;
drop function if exists public.fn_hr_access_log_inmutable();
drop function if exists public.fn_hr_registrar_acceso_interno(uuid, integer, uuid, uuid, text, text, text, text, text, jsonb);
drop function if exists public.fn_hr_peticion_agente();
drop function if exists public.fn_hr_peticion_ip();
drop function if exists public.fn_hr_orgs_con_permiso(text);
drop function if exists public.fn_hr_puede(integer, text);
drop function if exists public.fn_hr_puede_actor(uuid, integer, text);
drop function if exists public.fn_hr_grupos_datos();

with nuevos as (
  select id from public.permissions where code in (
    'hr.employees.view','hr.employees.view_team','hr.employees.create','hr.employees.edit',
    'hr.data.identificacion.view','hr.data.identificacion.view_team','hr.data.identificacion.edit',
    'hr.data.salario_pago.view','hr.data.salario_pago.view_team','hr.data.salario_pago.edit',
    'hr.data.banco.view','hr.data.banco.view_team','hr.data.banco.edit',
    'hr.data.salud.view','hr.data.salud.view_team','hr.data.salud.edit',
    'hr.data.disciplinario.view','hr.data.disciplinario.view_team','hr.data.disciplinario.edit',
    'hr.data.sst.view','hr.data.sst.view_team','hr.data.sst.edit',
    'hr.data.export','hr.attendance.view','hr.attendance.manage','hr.leaves.view',
    'hr.departments.manage','hr.approvals.manage','hr.parameters.manage','hr.access_log.view')),
a as (delete from public.role_permissions where permission_id in (select id from nuevos)),
b as (delete from public.job_position_permissions where permission_id in (select id from nuevos))
delete from public.permissions where id in (select id from nuevos);
