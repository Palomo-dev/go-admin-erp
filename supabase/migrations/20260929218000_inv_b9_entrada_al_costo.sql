-- Inventario B9: devoluciones de stock al COSTO vigente y con su propio origen.
--
-- fn_stock_entrada_al_costo(org, sucursal, producto, cantidad, origen, documento, nota, usuario):
-- entrada por la primitiva (fn_stock_entrada → fn_inv_int_mover) al costo de fn_costo_unitario_producto
-- (promedio de la sucursal o costo vigente), no a 0. Los orígenes que la usan ('folio_item_reversal',
-- 'web_refund') no recalculan el promedio (regla única de fn_inv_int_mover), así que solo registra la
-- entrada con un costo correcto en el kardex. Solo servidor: la llaman otras funciones y rutas con
-- service role; no se abre al navegador.
--
-- Además, fn_folio_item_eliminar (20260929216000) pasa a registrar con origen 'folio_item_reversal'
-- en vez de 'return': 'return' es el origen de las devoluciones de venta y la trazabilidad lo enlazaba
-- a un documento de devolución que no existe para un cargo de folio.

create or replace function public.fn_stock_entrada_al_costo(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric,
  p_source text, p_source_id text, p_note text, p_updated_by uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return public.fn_stock_entrada(p_organization_id, p_branch_id, p_product_id, p_qty,
                                 public.fn_costo_unitario_producto(p_product_id, p_branch_id, null),
                                 p_source, p_source_id, p_note, p_updated_by);
end;
$$;

revoke all on function public.fn_stock_entrada_al_costo(integer, integer, integer, numeric, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_stock_entrada_al_costo(integer, integer, integer, numeric, text, text, text, uuid)
  to service_role;

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
      perform public.fn_stock_entrada_al_costo(v_org, p_branch_id, v_item.product_id, v_item.quantity,
                                               'folio_item_reversal', v_item.folio_id::text, v_nota, auth.uid());
      v_n := 1;
    else
      for v_row in select * from public.fn_receta_int_expandir(v_org, v_item.product_id, v_item.quantity, true) loop
        continue when not v_row.track_stock;
        perform public.fn_stock_entrada_al_costo(v_org, p_branch_id,
                                                 case when v_row.es_ingrediente then v_row.product_id else v_item.product_id end,
                                                 case when v_row.es_ingrediente then v_row.qty else v_item.quantity end,
                                                 'folio_item_reversal', v_item.folio_id::text, v_nota, auth.uid());
        v_n := v_n + 1;
      end loop;
    end if;
  end if;

  return jsonb_build_object('eliminado', true, 'movimientos', v_n);
end;
$$;

revoke all on function public.fn_folio_item_eliminar(uuid, integer) from public, anon;
grant execute on function public.fn_folio_item_eliminar(uuid, integer) to authenticated;
