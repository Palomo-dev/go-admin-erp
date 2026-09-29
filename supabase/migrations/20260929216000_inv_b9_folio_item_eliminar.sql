-- Inventario B9 (docs/implementacion/INVENTARIO-PLAN.md §5.10, PMS): eliminar un cargo del folio y
-- devolver su stock en una sola transacción.
--
-- Antes, foliosService.deleteFolioItem borraba el ítem desde el navegador y devolvía el stock con
-- stockMovementService.incrementOnPurchase: entraba como una COMPRA al precio de venta, recalculando
-- el costo promedio con ese precio (lo corrompía), y si el producto tenía receta devolvía el plato en
-- vez de sus ingredientes (la salida había descontado los ingredientes).
--
-- Ahora la devolución es simétrica a la salida (decrement_stock_with_recipe): con receta efectiva se
-- devuelven los ingredientes que se descontaron; sin receta, el producto. Entra por
-- fn_stock_entrada_devolucion (origen 'return', al costo de la salida, sin recalcular el promedio).
-- Guarda: la organización sale del folio (folio → reserva), nunca del cliente; la sucursal debe ser
-- de esa organización.

create or replace function public.fn_folio_item_eliminar(p_item_id uuid, p_branch_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item public.folio_items;
  v_org integer;
  v_ef record;
  v_row record;
  v_n integer := 0;
  v_nota text;
begin
  select * into v_item from public.folio_items where id = p_item_id for update;
  if not found then
    raise exception 'folio: cargo no encontrado' using errcode = 'P0002';
  end if;

  select r.organization_id into v_org
    from public.folios f join public.reservations r on r.id = f.reservation_id
   where f.id = v_item.folio_id;
  if v_org is null then
    raise exception 'folio: cargo no encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);

  if p_branch_id is not null and not exists (
       select 1 from public.branches where id = p_branch_id and organization_id = v_org) then
    raise exception 'folio: sucursal no válida' using errcode = '22023';
  end if;

  delete from public.folio_items where id = p_item_id;

  if v_item.product_id is not null and coalesce(v_item.quantity, 0) > 0 and p_branch_id is not null then
    v_nota := concat('Reversión de cargo del folio: ', v_item.description);
    select * into v_ef from public.fn_receta_efectiva(v_item.product_id);
    if v_ef.recipe_id is null then
      perform public.fn_stock_entrada_devolucion(v_org, p_branch_id, v_item.product_id, v_item.quantity,
                                                 null, v_item.folio_id::text, v_nota, auth.uid());
      v_n := 1;
    else
      for v_row in select * from public.fn_receta_int_expandir(v_org, v_item.product_id, v_item.quantity, true) loop
        continue when not v_row.track_stock;
        perform public.fn_stock_entrada_devolucion(v_org, p_branch_id,
                                                   case when v_row.es_ingrediente then v_row.product_id else v_item.product_id end,
                                                   case when v_row.es_ingrediente then v_row.qty else v_item.quantity end,
                                                   null, v_item.folio_id::text, v_nota, auth.uid());
        v_n := v_n + 1;
      end loop;
    end if;
  end if;

  return jsonb_build_object('eliminado', true, 'movimientos', v_n);
end;
$$;

revoke all on function public.fn_folio_item_eliminar(uuid, integer) from public, anon;
grant execute on function public.fn_folio_item_eliminar(uuid, integer) to authenticated;
