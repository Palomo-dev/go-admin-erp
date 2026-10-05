-- Revierte la parte de tablas de 20261005232009: el alta de organizaciones
-- (fn_alta_organizacion, SECURITY INVOKER) escribe suscripción y módulos con la sesión
-- del usuario y el registro fallaba en su último paso. Se vuelve a cerrar cuando esas
-- escrituras pasen al servidor. anon sigue sin escritura (no la usa ningún flujo).
grant insert, update, delete, truncate on table public.subscriptions to authenticated;
grant insert, update, delete, truncate on table public.subscription_addons to authenticated;
grant insert, update, delete, truncate on table public.organization_modules to authenticated;
grant insert, update, delete, truncate on table public.organization_module_pages to authenticated;
