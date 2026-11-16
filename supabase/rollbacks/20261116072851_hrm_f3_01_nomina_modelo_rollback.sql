-- Reversión de 20261116072851_hrm_f3_01_nomina_modelo.
-- (El comentario de la migración aplicada nombra este archivo con el sello provisional
-- 20261116100000; la versión real es 20261116072851.)
-- ADVERTENCIA: borra las tablas nuevas con sus datos (conceptos propios de las organizaciones,
-- novedades, embargos y ajustes por vínculo) y las columnas nuevas de payroll_*. No los restaura.
-- Revertir antes 20261116xxxxxx_hrm_f3_03 y _f3_02, que dependen de esta.

drop index if exists public.payroll_items_slip_code_idx;
alter table public.payroll_slips drop column if exists alerts;
alter table public.payroll_slips drop column if exists inputs;
alter table public.payroll_slips drop column if exists input_hash;
alter table public.payroll_slips drop column if exists branch_id;
drop index if exists public.payroll_runs_idempotencia_uq;
alter table public.payroll_runs drop column if exists adjusts_run_id;
alter table public.payroll_runs drop column if exists reason;
alter table public.payroll_runs drop column if exists alerts;
alter table public.payroll_runs drop column if exists parameters_snapshot;
alter table public.payroll_runs drop column if exists input_hash;
alter table public.payroll_runs drop column if exists engine_version;
alter table public.payroll_runs drop constraint if exists payroll_runs_run_type_check;
alter table public.payroll_runs drop column if exists run_type;
alter table public.payroll_periods drop constraint if exists payroll_periods_kind_check;
alter table public.payroll_periods drop column if exists kind;
comment on column public.payroll_periods.status is null;

drop table if exists public.hr_garnishments;
drop table if exists public.hr_payroll_novelties;
drop table if exists public.hr_payroll_employee_settings;
drop function if exists public.fn_hr_nomina_conceptos(integer);
drop table if exists public.hr_payroll_concepts;
drop function if exists public.fn_hr_payroll_concepts_validar();
drop function if exists public.fn_hr_nomina_habilitar(integer, boolean, text);
drop function if exists public.fn_hr_nomina_habilitada(integer);
drop table if exists public.hr_payroll_settings;

delete from public.hr_legal_parameters
 where country_code = 'COL'
   and code in ('ibc_no_salarial_tope_pct','retencion_redondeo_cop','cesantias_exenta_tabla','nomina_alerta_variacion_pct');
delete from public.hr_org_parameters where code in ('nomina_alerta_variacion_pct');
delete from public.hr_parameter_catalog
 where code in ('ibc_no_salarial_tope_pct','retencion_redondeo_cop','cesantias_exenta_tabla','nomina_alerta_variacion_pct');

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code in ('hr.payroll.close','hr.payroll.pay'));
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code in ('hr.payroll.close','hr.payroll.pay'));
delete from public.permissions where code in ('hr.payroll.close','hr.payroll.pay');
