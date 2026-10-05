-- Seguridad de organización, bloque 1.
-- Funciones de alta y limpieza heredadas sin uso en el código: sin ejecución para sesiones.
-- Tablas de suscripción y módulos: escritura solo desde el servidor (revertido en
-- 20261005233220: el alta de organizaciones las escribe con la sesión del usuario).
-- Sucursales: la organización de una sucursal no cambia salvo desde el servidor.

revoke execute on function public.create_user_fallback(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cleanup_signup_data(text) from public, anon, authenticated;
revoke execute on function public.cleanup_residual_signup_data() from public, anon, authenticated;
revoke execute on function public.cleanup_temporary_members() from public, anon, authenticated;

revoke insert, update, delete, truncate on table public.subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on table public.subscription_addons from anon, authenticated;
revoke insert, update, delete, truncate on table public.organization_modules from anon, authenticated;
revoke insert, update, delete, truncate on table public.organization_module_pages from anon, authenticated;

create or replace function public.fn_branches_organizacion_inmutable()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sucursal_organizacion_inmutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_branches_organizacion_inmutable() from public, anon, authenticated;

create or replace trigger trg_branches_organizacion_inmutable
  before update of organization_id on public.branches
  for each row execute function public.fn_branches_organizacion_inmutable();
