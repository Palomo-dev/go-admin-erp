-- Rollback de 20260923175318_venta_web_se_liga_a_su_pedido.sql
drop trigger if exists trg_sales_ligar_pedido_web on public.sales;
drop function if exists public.fn_sales_ligar_pedido_web();
