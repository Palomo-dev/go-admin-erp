-- Rollback de categories_por_pertenencia: restaura las políticas anteriores,
-- TAMBIÉN la lectura anónima y entre organizaciones. No toca datos.

set local lock_timeout = '3s';

drop policy if exists categories_select_policy on public.categories;
drop policy if exists categories_insert_policy on public.categories;
drop policy if exists categories_update_policy on public.categories;
drop policy if exists categories_delete_policy on public.categories;
drop policy if exists "Allow anon select categories" on public.categories;

create policy "Allow anon select categories" on public.categories
  for select to public
  using (true);

create policy categories_select_policy on public.categories
  for select to public
  using (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid()
  ));

create policy categories_insert_policy on public.categories
  for insert to public
  with check (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid()
  ));

create policy categories_update_policy on public.categories
  for update to public
  using (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid()
  ));

create policy categories_delete_policy on public.categories
  for delete to public
  using (organization_id in (
    select organization_members.organization_id from organization_members
    where organization_members.user_id = auth.uid()
  ));

grant all on public.categories to anon;
grant truncate on public.categories to authenticated;
