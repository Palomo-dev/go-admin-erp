-- Revierte 20261107141000. No toca datos: son funciones de lectura.
drop function if exists public.fn_libro_lineas(integer, date, date, integer, integer);
drop function if exists public.fn_libro_resumen(integer, date, date, text);
drop function if exists public.fn_libro_inventarios_balances(integer, date, integer);
drop function if exists public.fn_libro_mayor_balances(integer, date, date, integer);
drop function if exists public.fn_indicadores_financieros_base(integer, date, date);
drop function if exists public.fn_ef_presentacion(text, text);
drop function if exists public.fn_estado_resultado_integral(integer, date, date);
drop function if exists public.fn_estado_cambios_patrimonio(integer, date, date);
drop function if exists public.fn_estado_flujos_efectivo(integer, date, date);
drop function if exists public.fn_ef_flujo_lineas(integer, timestamptz, timestamptz);
drop type if exists public.ef_linea_flujo;
drop function if exists public.fn_ef_rango(integer, date, date);
drop function if exists public.fn_ef_resultado(integer, timestamptz, timestamptz);
drop function if exists public.fn_ef_movimientos(integer, timestamptz, timestamptz, boolean);
drop function if exists public.fn_ef_atributos(integer);
drop function if exists public.fn_ef_exigir_lectura(integer);
drop function if exists public.fn_ef_es_cierre(integer, text, text);
