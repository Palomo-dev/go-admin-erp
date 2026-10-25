-- Rollback de 20261025130400_p1_cuenta_titulo_configurada: trigger y función nuevos, no había definición previa.
drop trigger if exists trg_chart_cuenta_titulo_configurada on public.chart_of_accounts;
drop function if exists public.fn_chart_cuenta_titulo_configurada();
