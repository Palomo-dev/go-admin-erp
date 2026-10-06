-- Rollback de 20261007130400_comanda_web_avanza_pedido.
-- Los estados de pedidos ya avanzados por el trigger se conservan.

drop trigger if exists trg_comanda_web_avanza_pedido on public.kitchen_tickets;
drop function if exists public.fn_comanda_web_avanza_pedido();
