-- Revierte HRM fase 0 · paso 5: parámetros por vigencia.
-- ADVERTENCIA: borra hr_org_parameters (valores propios de las organizaciones).
-- country_payroll_rules y fiscal_uvt no se modificaron; solo se quita el comentario.
-- No restaura datos.

drop function if exists public.fn_hr_parametro_tramos(integer, text, date, date);
drop function if exists public.fn_hr_parametro_json(integer, text, date);
drop function if exists public.fn_hr_parametro(integer, text, date);
drop function if exists public.fn_hr_parametro_confirmado(integer, text, date);
drop function if exists public.fn_hr_parametro_detalle(integer, text, date);
drop table if exists public.hr_org_parameters;
drop table if exists public.hr_legal_parameters;
drop table if exists public.hr_parameter_catalog;
drop function if exists public.fn_hr_org_parametro_validar();
drop function if exists public.fn_hr_parametros_sin_solape();
drop function if exists public.fn_hr_pais(integer);
comment on table public.country_payroll_rules is null;
