-- Rollback de 20261027200000: INSERT y DELETE vuelven a «cualquier miembro activo».
drop policy if exists categories_insert_policy on public.categories;
create policy categories_insert_policy on public.categories
  for insert to authenticated
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists categories_delete_policy on public.categories;
create policy categories_delete_policy on public.categories
  for delete to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));

delete from supabase_migrations.schema_migrations where version = '20261027200000';
