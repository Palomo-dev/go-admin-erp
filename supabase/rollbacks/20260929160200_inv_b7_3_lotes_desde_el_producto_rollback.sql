-- Rollback de 20260929160200_inv_b7_3_lotes_desde_el_producto.sql
-- Quita la línea de track_lots de fn_producto_guardar (por su marcador), los
-- disparadores de herencia y devuelve fn_producto_int_stock_inicial a su
-- versión anterior (sin lotes). No cambia `products.track_lots` de los productos
-- que ya lo activaron ni borra los lotes ni los movimientos de stock inicial.

do $$
declare
  v_def text;
  v_linea text := E'      track_lots = case when not v_track then false when v_pr ? ''track_lots'' then coalesce((v_pr->>''track_lots'')::boolean, false) else track_lots end, -- inv_b7_3 track_lots\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_producto_guardar';
  if v_def is not null and position(v_linea in v_def) > 0 then
    execute replace(v_def, v_linea, '');
  end if;
end;
$$;

drop trigger if exists trg_producto_lotes_variantes on public.products;
drop trigger if exists trg_producto_lotes_hereda_padre on public.products;
drop function if exists public.fn_producto_int_lotes_de_variantes();
drop function if exists public.fn_producto_int_lotes_hereda_padre();

create or replace function public.fn_producto_int_stock_inicial(
  p_org integer, p_product_id integer, p_entradas jsonb, p_nota text default 'Stock inicial')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_e jsonb;
  v_branch integer;
  v_entries jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.products where id = p_product_id and organization_id = p_org and track_stock) then
    return;
  end if;
  -- Filas en 0 para las sucursales activas (y las que traiga la entrada) sin fila propia.
  insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
  select p_product_id, b.id, null, 0, 0, 0, 0
    from public.branches b
   where b.organization_id = p_org
     and (b.is_active or b.id in (select (x->>'branch_id')::int from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) x))
     and not exists (select 1 from public.stock_levels sl
                      where sl.product_id = p_product_id and sl.branch_id = b.id and sl.lot_id is null);

  for v_e in select * from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) loop
    v_branch := (v_e->>'branch_id')::int;
    if not exists (select 1 from public.branches where id = v_branch and organization_id = p_org) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    if v_e ? 'min_level' then
      update public.stock_levels set min_level = greatest(coalesce((v_e->>'min_level')::numeric, 0), 0), updated_at = now()
       where product_id = p_product_id and branch_id = v_branch and lot_id is null;
    end if;
    if coalesce((v_e->>'qty')::numeric, 0) > 0 then
      if coalesce((v_e->>'unit_cost')::numeric, 0) <= 0 then
        raise exception 'stock_sin_costo' using errcode = '22023', detail = v_branch::text;
      end if;
      v_entries := v_entries || jsonb_build_object(
        'organization_id', p_org, 'branch_id', v_branch, 'product_id', p_product_id,
        'qty', (v_e->>'qty')::numeric, 'unit_cost', coalesce((v_e->>'unit_cost')::numeric, 0),
        'source', 'initial', 'source_id', null, 'note', coalesce(p_nota, 'Stock inicial'),
        'updated_by', auth.uid());
    elsif coalesce((v_e->>'qty')::numeric, 0) < 0 then
      raise exception 'cantidad_negativa' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(v_entries) > 0 then
    -- Exige costo > 0 con cantidad (regla del kardex y la contabilidad).
    perform public.fn_register_stock_entry(v_entries, null);
  end if;
end;
$$;

revoke all on function public.fn_producto_int_stock_inicial(integer, integer, jsonb, text) from public, anon, authenticated;
