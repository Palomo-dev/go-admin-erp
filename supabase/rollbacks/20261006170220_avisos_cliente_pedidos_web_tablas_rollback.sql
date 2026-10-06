-- Reversión de 20261006170220_avisos_cliente_pedidos_web_tablas.sql.
-- ADVIERTE: se pierden los ajustes de avisos de cada organización y el
-- registro de avisos enviados (no se pueden reconstruir). El ERP vuelve a
-- mandar el correo de cada estado como antes (sin interruptores).
-- Orden de reversión de avisos_cliente_pedidos_web: 170832 → 170233 → 170220.

drop table if exists public.web_order_notices;
drop table if exists public.web_order_notice_settings;
