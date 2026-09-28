-- Rollback de 20260928232000_receta_permisos_revoke_explicito.sql
-- No-op a propósito: antes de la migración fn_productos_permisos ya tenía exactamente estos
-- privilegios (sin anon ni public; authenticated y service_role con execute). Devolverle execute a
-- anon sería abrir una función SECURITY DEFINER, que es lo que la política prohíbe.
select 1;
