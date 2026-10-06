-- Rollback de 20261007130500_aviso_pedido_web_nuevo (escrito el 2026-10-06; faltaba).
--
-- E6 solo crea cosas nuevas (verificado por MCP el 2026-10-06: no existen
-- fn_notify_web_order_created ni los disparadores trg_notify_web_order_created_ins /
-- trg_notify_web_order_created_pago en web_orders), así que revertir es quitarlas.
-- No toca datos: las notificaciones «Nuevo pedido web …» ya creadas se quedan en la campana
-- (historial de la organización; se reconocen por payload->>'type' = 'web_order_created').
-- Tras revertir, el único aviso de un pedido web vuelve a ser la pantalla Pedidos online abierta.

drop trigger if exists trg_notify_web_order_created_pago on public.web_orders;
drop trigger if exists trg_notify_web_order_created_ins on public.web_orders;
drop function if exists public.fn_notify_web_order_created();
