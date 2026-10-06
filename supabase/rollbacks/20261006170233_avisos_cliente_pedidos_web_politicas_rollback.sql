-- Reversión de 20261006170233_avisos_cliente_pedidos_web_politicas.sql.
-- Quita las políticas de lectura y el grant select: los miembros dejan de leer
-- los avisos desde el navegador. No toca datos.
-- Orden de reversión de avisos_cliente_pedidos_web: 170832 → 170233 → 170220.

drop policy if exists web_order_notice_settings_select on public.web_order_notice_settings;
drop policy if exists web_order_notices_select on public.web_order_notices;
revoke select on public.web_order_notice_settings from authenticated;
revoke select on public.web_order_notices from authenticated;
