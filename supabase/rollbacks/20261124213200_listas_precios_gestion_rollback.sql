-- Reversión de 20261124213200_listas_precios_gestion.
-- Solo funciones: no toca datos. Revertir ANTES que 20261124213000.

set lock_timeout = '10s';

drop function if exists public.price_list_delete(integer, uuid);
drop function if exists public.price_list_duplicate(integer, uuid, text);
drop function if exists public.price_list_reorder(integer, uuid[]);
drop function if exists public.customer_set_price_list(integer, uuid, uuid);
drop function if exists public.price_list_remove_assignment(integer, uuid, uuid, uuid);
drop function if exists public.price_list_assign_segment(integer, uuid, uuid);
drop function if exists public.price_list_assign_customers(integer, uuid, uuid[]);
drop function if exists public.price_list_import(integer, uuid, jsonb, boolean, boolean);
drop function if exists public.price_list_save(integer, uuid, jsonb);
drop function if exists public.customer_price_list_info(integer, uuid);
drop function if exists public.price_list_segment_candidates(integer, uuid);
drop function if exists public.price_list_customer_candidates(integer, uuid, text, integer);
drop function if exists public.price_list_customers(integer, uuid, text, integer, integer);
drop function if exists public.price_list_detail(integer, uuid);
drop function if exists public.price_lists_overview(integer);
drop function if exists public.fn_lista_precios_estado(boolean, date, date, date, integer);
drop function if exists public.fn_lista_precios_clientes_efectivos(integer);
drop function if exists public.fn_lista_precios_mes(integer);
drop function if exists public.fn_lista_precios_exigir_gestion(integer);
drop function if exists public.fn_lista_precios_exigir_miembro(integer);
