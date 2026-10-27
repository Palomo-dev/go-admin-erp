-- Rollback de 20261027190000: vuelve a la política anterior (cualquier miembro activo).
drop policy if exists categories_update_policy on public.categories;
create policy categories_update_policy on public.categories
  for update to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = (select auth.uid()) and om.is_active = true));

drop function if exists public.fn_categorias_puede_editar(integer);

delete from supabase_migrations.schema_migrations where version = '20261027190000';
