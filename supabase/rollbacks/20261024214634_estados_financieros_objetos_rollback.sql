-- Revierte 20261024214634_estados_financieros_objetos.sql.
-- Borra el perfil, los topes, los accionistas y los ajustes de conciliación
-- de todas las organizaciones, y las dos funciones nuevas.
-- No toca financial_report_account_metadata ni las marcas que ya existían.
-- La política de escritura que esta migración agregó sobre esa tabla sí se quita.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

drop function if exists public.fn_movimientos_informe(integer, date, integer, uuid, date);
drop function if exists public.fn_guardar_marca_informe(integer, text, text, text, boolean, boolean, numeric);

drop policy if exists estados_marca_escritura on public.financial_report_account_metadata;

drop table if exists public.ajustes_conciliacion_fiscal;
drop table if exists public.accionistas_org;
drop table if exists public.topes_exogena;
drop table if exists public.perfil_estados_financieros;

drop function if exists public.fn_miembro_finanzas(integer, boolean);
