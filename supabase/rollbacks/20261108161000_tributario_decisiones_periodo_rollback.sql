-- Reversión de supabase/migrations/20261108161000_tributario_decisiones_periodo.sql.
-- ADVERTENCIA DE DATOS: borra la historia de decisiones registradas sobre períodos con varias vigencias. Exportarla antes
-- si existe alguna (select * from public.tax_period_decisions).

drop function if exists public.fn_tributario_decision_periodo_registrar(integer, text, date, date, text, text, text, uuid, text);
drop table if exists public.tax_period_decisions;
