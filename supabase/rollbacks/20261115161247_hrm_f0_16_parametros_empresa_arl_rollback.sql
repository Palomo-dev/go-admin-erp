-- Revierte HRM fase 0 · paso 16. Devuelve las funciones a su versión anterior
-- (copiada de la migración que la creó).
-- ADVERTENCIA: borra hr_arl_assignments y los valores propios de los dos parámetros nuevos. Las vigencias de plataforma vuelven a como estaban.

drop trigger if exists trg_payroll_periods_parametros_cierre on public.payroll_periods;
drop function if exists public.fn_hr_nomina_bloquear_cierre_sin_parametros();
drop function if exists public.fn_hr_parametros_para_cierre(integer, date);
drop function if exists public.fn_hr_clase_arl(uuid);
drop table if exists public.hr_arl_assignments;
drop function if exists public.fn_hr_arl_validar();
drop function if exists public.fn_hr_parametros_empresa_guardar(integer, jsonb);
delete from public.hr_org_parameters where code in ('pila_operador','retencion_procedimiento');
delete from public.hr_parameter_catalog where code in ('pila_operador','retencion_procedimiento');

update public.hr_legal_parameters set effective_from = '2026-01-01'
 where country_code = 'COL' and code in ('horas_extra_max_dia','horas_extra_max_semana') and effective_from = '2025-06-25';
delete from public.hr_legal_parameters where country_code = 'COL' and code in ('jornada_max_semanal','divisor_hora_mensual')
   and effective_from in ('2023-07-15','2024-07-15');
delete from public.hr_legal_parameters where country_code = 'COL' and code = 'smmlv' and effective_from = '2026-01-01' and status = 'suspendido';
update public.hr_legal_parameters set effective_from = '2026-01-01'
 where country_code = 'COL' and code = 'smmlv' and effective_from = '2026-02-19' and status = 'transitorio';
alter table public.hr_legal_parameters drop constraint if exists hr_legal_parameters_status_check;
alter table public.hr_legal_parameters add constraint hr_legal_parameters_status_check check (status in ('vigente','transitorio','litigio','por_confirmar'));
