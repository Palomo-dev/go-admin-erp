-- Rollback de 20261026113000: vuelve a la definición previa de fn_productos_stock_masivo_alcance
-- (expansión dentro del WHERE, como estaba en prod el 2026-10-26). Reintroduce el timeout.
create or replace function public.fn_productos_stock_masivo_alcance(
  p_organization_id integer, p_product_ids integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.adjust', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 50000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '50000';
  end if;
  return (
    select coalesce(array_agg(p.id order by p.id), '{}'::integer[])
      from public.products p
     where p.id = any(public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids))
       and p.organization_id = p_organization_id
       and p.track_stock);
end;
$$;

revoke all on function public.fn_productos_stock_masivo_alcance(integer, integer[]) from public, anon;
grant execute on function public.fn_productos_stock_masivo_alcance(integer, integer[]) to authenticated, service_role;

delete from supabase_migrations.schema_migrations where version = '20261026113000';
