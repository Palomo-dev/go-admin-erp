-- Reversión de 20261005233220 (vuelve a cerrar la escritura). NO aplicar mientras el alta de
-- organizaciones escriba esas tablas con la sesión del usuario.
revoke insert, update, delete, truncate on table public.subscriptions from authenticated;
revoke insert, update, delete, truncate on table public.subscription_addons from authenticated;
revoke insert, update, delete, truncate on table public.organization_modules from authenticated;
revoke insert, update, delete, truncate on table public.organization_module_pages from authenticated;
