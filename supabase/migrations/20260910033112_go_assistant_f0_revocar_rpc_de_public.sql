-- Corrección: `revoke ... from anon` no hacía nada.
--
-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva, y `anon`
-- hereda de PUBLIC. Revocar del rol `anon` en concreto deja intacta la concesión
-- a PUBLIC, así que `has_function_privilege('anon', …, 'EXECUTE')` seguía
-- devolviendo `true`. Hay que revocar de PUBLIC y volver a conceder solo a quien
-- corresponde.
--
-- Estas dos son SECURITY INVOKER, así que la RLS ya las protegía (un anónimo no
-- ve ninguna fila y el insert fallaría igual). Aun así se cierra: es el mismo
-- patrón que dejó cientos de funciones de este proyecto accesibles a `anon`, y
-- no conviene añadir dos más a esa lista.

revoke all on function public.assistant_set_product_price(integer, integer, numeric) from public;
revoke all on function public.assistant_create_product(integer, jsonb) from public;

grant execute on function public.assistant_set_product_price(integer, integer, numeric) to authenticated;
grant execute on function public.assistant_create_product(integer, jsonb) to authenticated;
grant execute on function public.assistant_set_product_price(integer, integer, numeric) to service_role;
grant execute on function public.assistant_create_product(integer, jsonb) to service_role;