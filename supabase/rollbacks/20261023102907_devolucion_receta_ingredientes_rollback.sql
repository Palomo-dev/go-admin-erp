-- Reversión de devolucion_receta_ingredientes.
--
-- Quita TODAS las entradas «Reposición de ingrediente» (también las de
-- devoluciones hechas después de la migración): descuenta esa cantidad del
-- stock sin lote, borra el movimiento y, si el asiento quedó publicado, lo
-- contrarresta con fn_revertir_asiento. El contra-asiento permanece. Si el
-- descuento dejaría existencias negativas, no cambia nada.
-- No toca la salida original de la venta ni los motivos de devolución.
-- sale_items.recipe_id se elimina; el valor guardado no se recupera.
-- Ejecutar el archivo completo, en una sola transacción.

do $datos$
declare
  v_mov record;
  v_je integer;
  v_posted boolean;
begin
  for v_mov in
    select sm.id, sm.organization_id, sm.branch_id, sm.product_id, sm.qty
      from public.stock_movements sm
     where sm.source = 'return'
       and sm.direction = 'in'
       and sm.note like 'Reposición de ingrediente:%'
     order by sm.id desc
  loop
    select je.id, je.posted
      into v_je, v_posted
      from public.journal_entries je
     where je.organization_id = v_mov.organization_id
       and (
         je.fact_key = 'stock_movement:' || v_mov.id::text
         or (je.source = 'stock_movements' and je.source_id = v_mov.id::text)
       )
     order by je.id
     limit 1;

    if v_je is not null and coalesce(v_posted, false) then
      if not exists (
        select 1
          from public.journal_entries rev
         where rev.organization_id = v_mov.organization_id
           and rev.fact_key = 'reversal:' || v_je::text
      ) then
        perform public.fn_revertir_asiento(v_je, 'reposicion_ingrediente', 'devolucion_receta_ingredientes');
      end if;
    elsif v_je is not null then
      delete from public.journal_lines where journal_entry_id = v_je;
      delete from public.journal_entries where id = v_je and coalesce(posted, false) = false;
    end if;

    update public.return_lines
       set restocked = false,
           stock_movement_id = null
     where stock_movement_id = v_mov.id;

    update public.stock_levels sl
       set qty_on_hand = sl.qty_on_hand - v_mov.qty,
           updated_at = now()
     where sl.id = (
       select sl2.id
         from public.stock_levels sl2
        where sl2.product_id = v_mov.product_id
          and sl2.branch_id = v_mov.branch_id
          and sl2.lot_id is null
          and sl2.qty_on_hand >= v_mov.qty
        order by sl2.id
        limit 1
     );
    if not found then
      raise exception 'Revertir la reposición % dejaría existencias negativas o sin fila de stock', v_mov.id;
    end if;

    delete from public.stock_movements where id = v_mov.id;
  end loop;
end
$datos$;

do $parche$
declare
  v_def text := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  v_new_decl text := $decl$  v_mov_stock integer;
  v_mov_ing integer;$decl$;
  v_old_decl text := '  v_mov_stock integer;';
  v_new_serial text := $frag$
    -- Ingredientes (devolucion_receta_ingredientes): repone las salidas reales
    -- de esa venta, en proporción a lo devuelto y al costo de cada salida.
    v_mov_ing := public.fn_devolucion_reponer_ingredientes(
      p_organization_id, v_sale.branch_id, v_sale.id,
      (v_linea->>'sale_item_id')::uuid,
      (v_linea->>'product_id')::integer,
      (v_linea->>'sold_quantity')::numeric,
      case
        when jsonb_typeof(v_linea->'serial_dispositions') = 'object'
             and v_linea->'serial_dispositions' <> '{}'::jsonb then
          coalesce((
            select count(*) filter (where d.value = 'in_stock')
              from jsonb_each_text(v_linea->'serial_dispositions') d
          ), 0)::numeric
        when coalesce((v_linea->>'affects_inventory')::boolean, false) then
          (v_linea->>'quantity')::numeric
        else 0
      end,
      v_return_id, v_uid);
    if v_mov_stock is null then
      v_mov_stock := v_mov_ing;
    end if;

    -- Seriales: vuelven a stock si el motivo repone; si no, quedan «returned».$frag$;
  v_old_serial text := '    -- Seriales: vuelven a stock si el motivo repone; si no, quedan «returned».';
begin
  if position('fn_devolucion_reponer_ingredientes' in v_def) = 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_new_decl, ''))) / length(v_new_decl) <> 1
     or (length(v_def) - length(replace(v_def, v_new_serial, ''))) / length(v_new_serial) <> 1 then
    raise exception 'No se puede revertir procesar_devolucion: un fragmento no aparece una sola vez';
  end if;
  execute replace(replace(v_def, v_new_decl, v_old_decl), v_new_serial, v_old_serial);
end
$parche$;

create or replace function public.decrement_stock_with_recipe(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric, p_source text,
  p_source_id text default null::text, p_unit_cost numeric default null::numeric,
  p_updated_by uuid default null::uuid, p_note text default null::text)
returns json
language plpgsql
as $function$
declare
  v_ef record;
  v_row record;
  v_nombre text;
  v_n integer := 0;
  v_prod boolean := false;
begin
  select * into v_ef from public.fn_receta_efectiva(p_product_id);
  if v_ef.recipe_id is null then
    return public.decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id,
                                          p_unit_cost, p_note, p_updated_by);
  end if;
  select coalesce(r.name, 'receta') into v_nombre from public.product_recipes r where r.id = v_ef.recipe_id;

  for v_row in select * from public.fn_receta_int_expandir(p_organization_id, p_product_id, p_qty, true) loop
    continue when not v_row.track_stock;
    if v_row.es_ingrediente then
      perform public.decrement_stock_on_sale(p_organization_id, p_branch_id, v_row.product_id, v_row.qty, p_source,
        p_source_id, null, concat('Ingrediente de receta: ', v_nombre, ' - ', v_row.nombre, coalesce(' | ' || p_note, '')),
        p_updated_by);
      v_n := v_n + 1;
    else
      perform public.decrement_stock_on_sale(p_organization_id, p_branch_id, p_product_id, p_qty, p_source, p_source_id,
                                             p_unit_cost, p_note, p_updated_by);
      v_prod := true;
    end if;
  end loop;

  return json_build_object('success', true,
    'mode', case when v_ef.al_producir then 'preparation' else 'recipe' end,
    'recipe_id', v_ef.recipe_id, 'inherited', v_ef.heredada,
    'ingredients_processed', v_n, 'product_stock_deducted', v_prod);
end;
$function$;

revoke all on function public.decrement_stock_with_recipe(integer, integer, integer, numeric, text, text, numeric, uuid, text) from public, anon;
grant execute on function public.decrement_stock_with_recipe(integer, integer, integer, numeric, text, text, numeric, uuid, text) to authenticated, service_role;

drop function if exists public.fn_devolucion_reponer_ingredientes(integer, integer, uuid, uuid, integer, numeric, numeric, integer, uuid);

alter table public.sale_items drop constraint if exists sale_items_recipe_id_fkey;
alter table public.sale_items drop column if exists recipe_id;
