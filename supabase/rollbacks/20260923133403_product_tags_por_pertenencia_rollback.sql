-- Rollback de product_tags_por_pertenencia: restaura las políticas anteriores,
-- TAMBIÉN la lectura anónima y entre organizaciones. No toca datos.

set local lock_timeout = '3s';

drop policy if exists product_tags_miembros on public.product_tags;
drop policy if exists "Allow anon select product_tags" on public.product_tags;
drop policy if exists "Users can view their organization product_tags" on public.product_tags;

create policy "Allow anon select product_tags" on public.product_tags
  for select to public
  using (true);

create policy "Users can view their organization product_tags" on public.product_tags
  for all to public
  using (exists (
    select 1 from organization_members om
    where om.organization_id = product_tags.organization_id and om.user_id = auth.uid()
  ));

grant all on public.product_tags to anon;
grant truncate on public.product_tags to authenticated;
