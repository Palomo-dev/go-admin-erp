-- Reversión de 20260910033112_go_assistant_f0_revocar_rpc_de_public.sql
-- Restaura el estado anterior (EXECUTE para PUBLIC salvo anon). No recomendado.
grant execute on function public.assistant_set_product_price(integer, integer, numeric) to public;
grant execute on function public.assistant_create_product(integer, jsonb) to public;
revoke all on function public.assistant_set_product_price(integer, integer, numeric) from anon;
revoke all on function public.assistant_create_product(integer, jsonb) from anon;
