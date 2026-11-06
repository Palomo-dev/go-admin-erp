-- Reversión de 20261106170000_plan_cuentas_crear_auxiliar.
-- Quita las funciones y la columna. Las cuentas y los asientos ya creados no se tocan:
-- un traslado publicado se revierte con su contra-asiento, no aquí.
drop function if exists public.fn_plan_crear_auxiliar(integer, text, text, text, boolean, text);
drop function if exists public.fn_plan_cuenta_autor(integer, text);
drop function if exists public.fn_plan_saldos(integer);
alter table public.chart_of_accounts drop column if exists created_by;
