-- Rollback de 20261028220000_web_order_refunds.
set lock_timeout = '3s';
set statement_timeout = '60s';
begin;
drop function if exists public.fn_web_order_reembolso_cerrar(uuid, boolean, uuid);
drop function if exists public.fn_web_order_reembolso_reservar(uuid, numeric, text, text);
drop table if exists public.web_order_refunds;
commit;
