-- Rollback de 20261025130400_p1_cuenta_titulo_configurada: el constraint trigger y la función son nuevos;
-- verificado el 25-oct-2026 que no existen en la BD viva (pg_proc/pg_trigger), así que revertir = eliminarlos.
drop trigger if exists trg_chart_cuenta_titulo_configurada on public.chart_of_accounts;
drop function if exists public.fn_chart_cuenta_titulo_configurada();
