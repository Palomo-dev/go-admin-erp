-- Aplicada el 2026-10-06 con apply_migration (versión 20261006170832).
-- Parte 3 de 3 de avisos_cliente_pedidos_web: authenticated solo lee; escribe el servidor del ERP.
-- El cuerpo bajo la línea de guiones es el texto exacto aplicado (md5 11ebafac2e96083f01af24716316e066).
-- ------------------------------------------------------------------------
revoke insert, update, delete on public.web_order_notice_settings from authenticated;
revoke insert, update, delete on public.web_order_notices from authenticated;
