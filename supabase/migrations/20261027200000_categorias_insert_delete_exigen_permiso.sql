-- QA 27-oct, D1 (segunda parte): crear y borrar categorías desde el cliente también exige
-- permiso de catálogo, no solo ser miembro activo. Base: fn_categorias_puede_editar
-- (20261027190000: dueño, inventory.edit, product_management, inventory_management).
--   INSERT: además inventory.create (alta rápida de categoría desde Nuevo producto y la
--           acción create_category del asistente piden «crear»).
--   DELETE: además inventory.delete. Hoy nadie borra directo desde el cliente: Eliminar va
--           por la RPC eliminar_categoria.
-- Sin cambios: SELECT, el service role (salta la RLS: product-scraper, siembras) y las RPC
-- SECURITY DEFINER que insertan/borran (fn_categorias_importar, fn_importar_productos_lote,
-- eliminar_categoria): categories no tiene FORCE RLS.
-- Impacto medido el 27-oct: 188 miembros activos, 42 sin permiso de editar (9 orgs); de esos,
-- 0 tienen inventory.create y 0 inventory.delete, así que esos 42 pierden crear y borrar
-- directo. Ninguno con permiso pierde nada.

drop policy if exists categories_insert_policy on public.categories;
create policy categories_insert_policy on public.categories
  for insert to authenticated
  with check (
    public.fn_categorias_puede_editar(organization_id)
    or (exists (select 1 from public.organization_members om
                 where om.user_id = (select auth.uid()) and om.organization_id = categories.organization_id and om.is_active)
        and public.check_user_permission((select auth.uid()), organization_id, 'inventory.create'))
  );

drop policy if exists categories_delete_policy on public.categories;
create policy categories_delete_policy on public.categories
  for delete to authenticated
  using (
    public.fn_categorias_puede_editar(organization_id)
    or (exists (select 1 from public.organization_members om
                 where om.user_id = (select auth.uid()) and om.organization_id = categories.organization_id and om.is_active)
        and public.check_user_permission((select auth.uid()), organization_id, 'inventory.delete'))
  );

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261027200000', 'categorias_insert_delete_exigen_permiso', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
