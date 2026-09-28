-- fn_productos_permisos se reemplazó en 20260928230000_receta_resolutor_unico (se agregó «costos»)
-- sin repetir su revoke. La ACL se conservó (create or replace no cambia privilegios; verificado con
-- el MCP: anon sin execute), pero la política de migraciones pide el revoke explícito junto a toda
-- función con elevación. Idempotente: no cambia nada si ya estaba así.
revoke all on function public.fn_productos_permisos(integer) from public, anon;
grant execute on function public.fn_productos_permisos(integer) to authenticated, service_role;
