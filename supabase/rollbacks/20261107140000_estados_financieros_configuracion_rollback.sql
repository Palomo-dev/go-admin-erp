-- Revierte 20261107140000. ADVERTENCIA: borra las marcas de cuentas, notas, certificación y
-- políticas guardadas por las organizaciones: la estructura se va, esos datos no vuelven.
-- Antes hay que revertir 20261107141000, que depende de estas tablas.
drop function if exists public.fn_estados_cuentas_flujo_guardar(integer, jsonb);
drop function if exists public.fn_estados_configuracion_guardar(integer, jsonb);
drop function if exists public.fn_ef_validar_texto(jsonb, integer);
drop function if exists public.fn_ef_politicas(integer);
drop table if exists public.financial_report_config_audit;
drop table if exists public.financial_report_account_metadata;
drop table if exists public.financial_report_settings;
