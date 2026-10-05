-- Reversión de 20261005233711_alta_organizacion_security_definer.
alter function public.fn_alta_organizacion(jsonb) security invoker;
grant execute on function public.fn_alta_organizacion(jsonb) to public;
