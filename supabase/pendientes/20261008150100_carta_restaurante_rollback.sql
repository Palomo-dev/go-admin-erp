-- Reversión de 20261008150100_carta_restaurante.sql (SIN APLICAR).
-- Quita las RPC, las tres tablas de la carta y las columnas kind/icon de product_tags.
-- Las cartas creadas (horarios, sedes, excepciones) se pierden: los productos, precios y
-- categorías del inventario no se tocan.

drop function if exists public.reordenar_cartas(integer, uuid[]);
drop function if exists public.guardar_carta(uuid, jsonb);
drop function if exists public.crear_carta(integer, text, text, uuid, boolean);
drop function if exists public.get_public_menu(integer, integer, timestamptz);
drop function if exists public.fn_carta_vigente(jsonb, integer, text);

drop table if exists public.restaurant_menu_items;
drop table if exists public.restaurant_menu_sections;
drop table if exists public.restaurant_menus;
drop function if exists public.fn_carta_mismo_tenant();

alter table public.product_tags drop constraint if exists product_tags_kind_valido;
alter table public.product_tags
  drop column if exists icon,
  drop column if exists kind;
