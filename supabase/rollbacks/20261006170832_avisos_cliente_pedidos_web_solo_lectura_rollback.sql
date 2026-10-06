-- Reversión de 20261006170832_avisos_cliente_pedidos_web_solo_lectura.sql.
-- Devuelve a authenticated los privilegios de escritura por defecto de Supabase
-- (sin políticas de insert/update/delete, RLS sigue negando la escritura).
-- Orden de reversión de avisos_cliente_pedidos_web: 170832 → 170233 → 170220.

grant insert, update, delete on public.web_order_notice_settings to authenticated;
grant insert, update, delete on public.web_order_notices to authenticated;
