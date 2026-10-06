-- Rollback de 20261006181211_carta_qr_pedido_mesa.
-- Requiere revertir antes 20261006181437 (fn_mesa_cuenta_publica usa fn_mesa_pedido_publico).
-- ⚠️ Pierde web_orders.diner_label (quién pidió cada ronda) y el ajuste por sede
-- qr_rounds_auto_confirm: no se restauran.
drop function if exists public.fn_mesa_pedido_publico(integer, uuid);
drop function if exists public.fn_mesa_linea_publica(public.sale_items, text, text);
drop function if exists public.fn_mesa_estado_ronda(text);
alter table public.restaurant_booking_settings drop column if exists qr_rounds_auto_confirm;
alter table public.web_orders drop constraint if exists web_orders_diner_label_largo;
alter table public.web_orders drop column if exists diner_label;
