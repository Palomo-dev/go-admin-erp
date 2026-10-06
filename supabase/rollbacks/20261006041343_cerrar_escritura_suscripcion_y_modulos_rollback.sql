-- Reversión de 20261006150600_cerrar_escritura_suscripcion_y_modulos: devuelve a `authenticated`
-- la escritura que tenía el 2026-10-06 (la misma que restauró 20261005233220). `anon` no tenía
-- escritura antes, así que no se le devuelve.
grant insert, update, delete, truncate on table public.subscriptions to authenticated;
grant insert, update, delete, truncate on table public.subscription_addons to authenticated;
grant insert, update, delete, truncate on table public.organization_modules to authenticated;
grant insert, update, delete, truncate on table public.organization_module_pages to authenticated;
