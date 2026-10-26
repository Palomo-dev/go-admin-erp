-- Stock masivo: fn_productos_stock_masivo_alcance expandía la selección DENTRO del WHERE
-- (`p.id = any(public.fn_productos_int_expandir_variantes(...))`). La función es STABLE y
-- SECURITY DEFINER (no se inlinea ni se pliega a constante): según el plan elegido (y con las
-- estadísticas de products desactualizadas en prod) se reevalúa por fila candidata
-- → «canceling statement due to statement timeout» con 600 productos de la org 347.
-- Arreglo: expandir UNA vez en una variable y filtrar contra ella. Mismo resultado, mismos
-- permisos, validación, security definer y search_path.
-- Revisadas en prod (pg_proc) las demás RPC masivas de productos (estado, categoría, precio,
-- ajuste de stock, masivo_alcance): ya expanden a variable o devuelven la expansión directa;
-- esta es la única con el patrón any(fn(...)) en el WHERE.
create or replace function public.fn_productos_stock_masivo_alcance(
  p_organization_id integer, p_product_ids integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.adjust', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 50000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '50000';
  end if;
  -- Una sola expansión (padre <-> variantes) para toda la selección.
  v_ids := public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids);
  return (
    select coalesce(array_agg(p.id order by p.id), '{}'::integer[])
      from public.products p
     where p.id = any(v_ids)
       and p.organization_id = p_organization_id
       and p.track_stock);
end;
$$;

revoke all on function public.fn_productos_stock_masivo_alcance(integer, integer[]) from public, anon;
grant execute on function public.fn_productos_stock_masivo_alcance(integer, integer[]) to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261026113000', 'productos_masivos_sin_reevaluar', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
