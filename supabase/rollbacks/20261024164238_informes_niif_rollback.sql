-- Revertir primero el código que consulta estas tablas y RPC. No toca asientos ni sus saldos.
-- Exportar antes las tres tablas nuevas: esta reversión elimina las personalizaciones
-- posteriores (notas, firmas, ORI/equivalentes/costos, parámetros y anotaciones) y su auditoría.
-- No revierte ediciones explícitas posteriores sobre chart_of_accounts.presentacion_niif:
-- la migración no modifica clasificaciones previas; el cambio deliberado del usuario es dato
-- de negocio. Su antes/después está en financial_report_config_audit y se debe exportar.
drop function if exists public.fn_informes_anulaciones(integer,timestamptz);
drop function if exists public.fn_guardar_configuracion_informes(integer,jsonb);
drop table if exists public.financial_report_config_audit;
drop table if exists public.financial_report_account_metadata;
drop table if exists public.financial_report_settings;
