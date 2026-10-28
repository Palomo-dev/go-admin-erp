-- Rollback de 20261027240000: restaura las políticas tal como estaban en prod el 2026-10-27
-- (pg_policies), quita los índices parciales y fn_mis_orgs. Reintroduce el costo de RLS por fila.
begin;

drop policy if exists organization_members_select_for_user_orgs on public.organization_members;
create policy organization_members_select_for_user_orgs on public.organization_members
  for select to public using (is_user_member_of_org(organization_id));

drop policy if exists products_select_policy on public.products;
create policy products_select_policy on public.products
  for select to public
  using (organization_id in (select organization_members.organization_id from organization_members
                             where organization_members.user_id = auth.uid()));

drop policy if exists select_product_prices_by_org_membership on public.product_prices;
create policy select_product_prices_by_org_membership on public.product_prices
  for select to public
  using (exists (select 1 from products p join organization_members om on p.organization_id = om.organization_id
                 where p.id = product_prices.product_id and om.user_id = auth.uid()));

drop policy if exists sale_items_select_policy on public.sale_items;
create policy sale_items_select_policy on public.sale_items
  for select to public
  using (exists (select 1 from sales where sales.id = sale_items.sale_id
                 and sales.organization_id in (select organization_members.organization_id from organization_members
                                               where organization_members.user_id = auth.uid())));

drop policy if exists sale_items_insert_update_delete_policy on public.sale_items;
create policy sale_items_insert_update_delete_policy on public.sale_items
  for all to public
  using (exists (select 1 from sales where sales.id = sale_items.sale_id
                 and sales.organization_id in (select organization_members.organization_id from organization_members
                                               where organization_members.user_id = auth.uid())));

drop index if exists public.idx_product_prices_ofertas_vigentes;
drop index if exists public.idx_sale_items_product_con_descuento;
drop function if exists public.fn_mis_orgs(boolean);

delete from supabase_migrations.schema_migrations where version = '20261027240000';

commit;
