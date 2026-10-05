-- Reversión de 20261005232009_seguridad_organizacion_bloque1.
grant execute on function public.create_user_fallback(uuid, text, text, jsonb) to authenticated;
grant execute on function public.cleanup_signup_data(text) to authenticated;
grant execute on function public.cleanup_residual_signup_data() to authenticated;
grant execute on function public.cleanup_temporary_members() to authenticated;

grant insert, update, delete, truncate on table public.subscriptions to anon, authenticated;
grant insert, update, delete, truncate on table public.subscription_addons to anon, authenticated;
grant insert, update, delete, truncate on table public.organization_modules to anon, authenticated;
grant insert, update, delete, truncate on table public.organization_module_pages to anon, authenticated;

drop trigger if exists trg_branches_organizacion_inmutable on public.branches;
drop function if exists public.fn_branches_organizacion_inmutable();
