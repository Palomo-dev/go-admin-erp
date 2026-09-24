-- Reversión de 20260925130100_pos_caja_abierta_unica_por_modo.sql
--
-- Vuelve a dejar la unicidad de caja abierta solo en el navegador. La columna
-- `open_scope_key` no guarda nada que no se pueda recalcular.

drop index if exists public.ux_cash_sessions_abierta_por_alcance;
drop trigger if exists trg_cash_session_open_scope_key on public.cash_sessions;
drop function if exists public.fn_cash_session_open_scope_key();
alter table public.cash_sessions drop column if exists open_scope_key;
