-- Revierte HRM fase 1 · estructura (20261115180026_hrm_f1_02_estructura).
-- ADVERTENCIA: borra las escalas salariales (incluidas las heredadas de
-- job_positions.min_salary / max_salary, que siguen en sus columnas), las
-- competencias de los cargos, las sedes de cada área, el presupuesto de plazas y
-- las solicitudes de plaza. Las instancias de aprobación de tipo `plaza_nueva`
-- quedan en hr_approval_instances sin su registro. Las columnas nuevas de
-- job_positions y departments se eliminan con sus datos.

drop trigger if exists trg_hr_plaza_al_decidir on public.hr_approval_instances;

drop function if exists public.fn_hr_plaza_disponible(uuid, integer, uuid, integer);
drop function if exists public.fn_hr_escala_vigente(uuid, integer, uuid, integer, date, text, text, text);
drop function if exists public.fn_hr_plaza_solicitar(uuid, integer, jsonb);
drop function if exists public.fn_hr_plaza_plan(uuid, integer, jsonb, text, text, text);
drop function if exists public.fn_hr_plaza_validar_datos(integer, jsonb);
drop function if exists public.fn_hr_estructura_plazas(uuid, integer);
drop function if exists public.fn_hr_cargo_guardar(uuid, integer, uuid, jsonb, text, text, text);
drop function if exists public.fn_hr_cargo_detalle(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_estructura_cargos(uuid, integer, integer, text, text, text);
drop function if exists public.fn_hr_area_archivar(uuid, integer, uuid);
drop function if exists public.fn_hr_area_guardar(uuid, integer, uuid, jsonb);
drop function if exists public.fn_hr_estructura_areas(uuid, integer);
drop function if exists public.fn_hr_escala_json(public.hr_position_salary_scales);
drop function if exists public.fn_hr_escala_aplicable(uuid, integer, date);
drop function if exists public.fn_hr_salario_en(uuid, date);
drop function if exists public.fn_hr_presupuesto(integer, date);
drop function if exists public.fn_hr_ocupacion(integer, date);
drop function if exists public.fn_hr_nombre_usuario(uuid);
drop function if exists public.fn_hr_nombre_persona(uuid);
drop function if exists public.fn_hr_nivel_cargo(smallint, text);
drop function if exists public.fn_hr_estructura_exigir(uuid, integer, text);
drop function if exists public.fn_hr_plaza_al_decidir();

drop table if exists public.hr_headcount_budget;
drop table if exists public.hr_headcount_requests;
drop table if exists public.hr_position_salary_scales;
drop function if exists public.fn_hr_escala_validar();
drop table if exists public.hr_position_competencies;
drop table if exists public.hr_department_branches;

alter table public.departments drop constraint if exists departments_cost_center_fk;
alter table public.departments drop column if exists cost_center_id;
alter table public.job_positions drop constraint if exists job_positions_reports_to_fk;
alter table public.job_positions drop constraint if exists job_positions_grade_chk;
alter table public.job_positions drop column if exists experience;
alter table public.job_positions drop column if exists education;
alter table public.job_positions drop column if exists responsibilities;
alter table public.job_positions drop column if exists reports_to_position_id;
alter table public.job_positions drop column if exists grade;

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code = 'hr.headcount.request');
delete from public.permissions where code = 'hr.headcount.request';
