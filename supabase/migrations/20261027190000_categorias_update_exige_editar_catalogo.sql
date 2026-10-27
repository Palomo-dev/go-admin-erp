-- QA 27-oct, D1: editar una categoría (imagen, ícono, nombre…) exige en la base
-- el mismo permiso que la interfaz (fn_productos_permisos ->> 'editar'):
-- dueño de la organización, inventory.edit, product_management o
-- inventory_management. Antes bastaba con ser miembro activo.
-- No afecta: SELECT/INSERT/DELETE (sin cambios), el service role (salta la RLS)
-- ni las RPC SECURITY DEFINER que actualizan categories (mover_categorias,
-- eliminar_categoria, fn_cuentas_catalogo_guardar): categories no tiene FORCE RLS.
-- Helper propio que nunca lanza excepción (fn_productos_permisos lanza con
-- fn_assert_acceso_org y en una política rompería la consulta entera).

create or replace function public.fn_categorias_puede_editar(p_org integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_org and om.is_active)
     and (exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = auth.uid())
          or public.check_user_permission(auth.uid(), p_org, 'inventory.edit')
          or public.check_user_permission(auth.uid(), p_org, 'product_management')
          or public.check_user_permission(auth.uid(), p_org, 'inventory_management'));
$function$;

revoke all on function public.fn_categorias_puede_editar(integer) from public, anon;
grant execute on function public.fn_categorias_puede_editar(integer) to authenticated, service_role;

drop policy if exists categories_update_policy on public.categories;
create policy categories_update_policy on public.categories
  for update to authenticated
  using (public.fn_categorias_puede_editar(organization_id))
  with check (public.fn_categorias_puede_editar(organization_id));

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261027190000', 'categorias_update_exige_editar_catalogo', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
