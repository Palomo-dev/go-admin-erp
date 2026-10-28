-- RLS sin subconsultas por fila + índices parciales para el conteo de ofertas. SIN APLICAR en prod.
--
-- Causa (prod, 27-oct, 18:49–19:03 COT): HEAD /rest/v1/products?select=id,product_prices!inner(id)
-- &organization_id=eq.145&status=eq.active&product_prices.effective_to=is.null
-- &product_prices.compare_price=gt.0 (UA node; conteo «ofertas» de /api/website/fuentes-datos)
-- se cortaba a los 8 s (57014) dentro de «SQL function is_user_member_of_org». Sin RLS el plan
-- cuesta ~7.500 (Merge Semi Join); con RLS, cada uno de los ~61.000 precios vigentes evaluaba
-- EXISTS(products JOIN organization_members ... auth.uid()) y, por dentro, la política de
-- organization_members llamaba is_user_member_of_org() por fila.
--
-- Arreglo: public.fn_mis_orgs(p_incluir_inactivas) security definer stable (no pasa por RLS de
-- organization_members), llamada como `= ANY ((select public.fn_mis_orgs(...))::integer[])` → InitPlan,
-- se evalúa UNA vez por sentencia; auth.uid() como (select auth.uid()).
--
-- Permisos efectivos (verificados con pg_policies el 2026-10-27 ~19:20 COT) — SE CONSERVAN:
-- * products_select_policy, select_product_prices_by_org_membership, sale_items_select_policy y
--   sale_items_insert_update_delete_policy NO filtraban is_active: la subconsulta sobre
--   organization_members pasaba por su RLS, y organization_members_self_select (user_id = auth.uid())
--   deja ver TODAS las filas propias, activas o no. Por eso usan fn_mis_orgs(true).
-- * organization_members_select_for_user_orgs = is_user_member_of_org(organization_id), que sí exige
--   is_active = true → fn_mis_orgs() (solo activas, por defecto).
-- * No se tocan las políticas INSERT/UPDATE/DELETE de products ni la INSERT de product_prices.
--   sale_items_insert_update_delete_policy es FOR ALL (también aplica a SELECT, OR con la de select),
--   así que se reescribe con la misma condición para que la lectura no siga pagando la subconsulta.
--
-- Tamaños (pg_total_relation_size / heap, 2026-10-27): products 246 MB / 101 MB;
-- product_prices 38 MB / 19 MB (~254 k filas, ~61 k vigentes); sale_items 4,7 MB / 3,2 MB
-- (~17 k filas); organization_members 128 kB.
-- Los índices van SIN CONCURRENTLY porque execute_sql corre en transacción: CREATE INDEX toma
-- SHARE lock (bloquea escrituras, no lecturas) mientras se construye. product_prices: segundos;
-- sale_items: instantáneo. Aplicar en horario de baja escritura (o crear los índices aparte con
-- CONCURRENTLY fuera de transacción y dejar aquí el IF NOT EXISTS).

begin;

create or replace function public.fn_mis_orgs(p_incluir_inactivas boolean default false)
returns integer[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct om.organization_id), '{}'::integer[])
  from public.organization_members om
  where om.user_id = auth.uid()
    and (p_incluir_inactivas or om.is_active = true);
$$;

comment on function public.fn_mis_orgs(boolean) is
  'Organizaciones de auth.uid() (activas por defecto; true incluye membresías inactivas). '
  'Para RLS: usar como = ANY ((select public.fn_mis_orgs(...))::integer[]) para que se evalúe una vez.';

-- anon también la necesita: las políticas son `to public` y anon las evalúa (p. ej. lecturas
-- públicas del sitio); sin EXECUTE fallaría con 42501 en vez de no ver filas. Para anon,
-- auth.uid() es null → devuelve '{}' (no abre nada). Solo expone las orgs del propio llamador.
revoke all on function public.fn_mis_orgs(boolean) from public;
grant execute on function public.fn_mis_orgs(boolean) to anon, authenticated, service_role;

-- organization_members ------------------------------------------------------------------------
drop policy if exists organization_members_select_for_user_orgs on public.organization_members;
create policy organization_members_select_for_user_orgs on public.organization_members
  for select to public
  using (organization_id = any ((select public.fn_mis_orgs(false))::integer[]));

-- products ------------------------------------------------------------------------------------
drop policy if exists products_select_policy on public.products;
create policy products_select_policy on public.products
  for select to public
  using (organization_id = any ((select public.fn_mis_orgs(true))::integer[]));

-- product_prices ------------------------------------------------------------------------------
drop policy if exists select_product_prices_by_org_membership on public.product_prices;
create policy select_product_prices_by_org_membership on public.product_prices
  for select to public
  using (exists (
    select 1 from public.products p
    where p.id = product_prices.product_id
      and p.organization_id = any ((select public.fn_mis_orgs(true))::integer[])));

-- sale_items ----------------------------------------------------------------------------------
drop policy if exists sale_items_select_policy on public.sale_items;
create policy sale_items_select_policy on public.sale_items
  for select to public
  using (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.organization_id = any ((select public.fn_mis_orgs(true))::integer[])));

drop policy if exists sale_items_insert_update_delete_policy on public.sale_items;
create policy sale_items_insert_update_delete_policy on public.sale_items
  for all to public
  using (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and s.organization_id = any ((select public.fn_mis_orgs(true))::integer[])));

-- índices parciales ---------------------------------------------------------------------------
create index if not exists idx_product_prices_ofertas_vigentes
  on public.product_prices (product_id)
  where effective_to is null and compare_price > 0;

create index if not exists idx_sale_items_product_con_descuento
  on public.sale_items (product_id)
  where discount_amount > 0;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261027240000', 'rls_mis_orgs_ofertas', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;

commit;
