-- Reversión de supabase/migrations/20261108161000_tributario_decisiones_periodo.sql.
-- ADVERTENCIA DE DATOS: borra la historia de decisiones registradas sobre períodos con varias vigencias y (ronda 5) las
-- decisiones de transición del gran contribuyente con su detalle. Exportarla antes si existe alguna
-- (select * from public.tax_period_decisions). Las aclaraciones que esas decisiones cerraron en organization_tax_profiles
-- NO se restauran: vuelven al guardar otra vez la vigencia.

drop function if exists public.fn_tributario_transicion_gc_registrar(integer, uuid, jsonb);
drop function if exists public.fn_tributario_decision_periodo_registrar(integer, text, date, date, text, text, text, uuid, text);
drop table if exists public.tax_period_decisions;
