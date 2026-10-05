-- Reversión de 20261005214525_v2_menus_y_carta_por_sede.
-- ADVERTENCIA: borra la carta por sede y las copias de menú por sede (y sus ítems por cascada).
-- Los menús del sitio principal (branch_id NULL) no se tocan.
-- Antes: desplegar el código que ya no lee branch_id ni website_branch_products.

drop function if exists public.fn_website_copiar_menu_a_sede(uuid, integer);
drop table if exists public.website_branch_products;
drop function if exists public.fn_website_branch_products_coherencia();

delete from public.website_menus where branch_id is not null;
drop trigger if exists trg_website_menus_branch_org on public.website_menus;
drop index if exists public.idx_website_menus_sede;
alter table public.website_menus drop column if exists source_menu_id;
alter table public.website_menus drop column if exists branch_id;
