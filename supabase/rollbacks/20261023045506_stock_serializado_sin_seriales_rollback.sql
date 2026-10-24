-- Revierte el parche de fn_inv_int_mover, borra el reporte y, solo si este
-- cambio añadió serial_ids a pos_checkout_v1, lo quita.
--
-- No restaura datos: la migración no insertó ni borró seriales, ni deshizo
-- ventas. Una factura emitida después sigue emitida. El hueco de existencia
-- sin serial que ya estaba queda igual.

do $mover$
declare
  v_def text := pg_get_functiondef('public.fn_inv_int_mover(integer,integer,integer,integer,text,numeric,numeric,text,text,text,uuid,jsonb)'::regprocedure);
  v_sel_old text := 'select p.id, p.organization_id, p.track_stock, p.track_lots into v_prod';
  v_sel_new text := 'select p.id, p.organization_id, p.track_stock, p.track_lots, p.track_serial into v_prod';
  v_old text := $old$    if v_n <> array_length(v_seriales, 1) then
      raise exception 'serial_no_disponible' using errcode = '22023';
    end if;
  end if;$old$;
  v_new text := $new$    if v_n <> array_length(v_seriales, 1) then
      raise exception 'serial_no_disponible' using errcode = '22023';
    end if;
  end if;

  -- stock_serializado_sin_seriales: la entrada inicial, el ajuste y la compra
  -- de un producto con serial exigen tantos seriales como unidades. No se inventan.
  if p_direction = 'in'
     and p_source in ('initial', 'adjustment', 'purchase', 'purchase_order', 'purchase_invoice')
     and coalesce(v_prod.track_serial, false)
  then
    if v_qty <> trunc(v_qty)
       or coalesce(array_length(v_seriales, 1), 0) <> v_qty::integer
    then
      raise exception 'seriales_no_cuadran' using errcode = '22023',
        detail = jsonb_build_object(
          'product_id', p_product,
          'cantidad', v_qty,
          'seriales', coalesce(array_length(v_seriales, 1), 0),
          'source', p_source
        )::text;
    end if;
  end if;$new$;
begin
  if position('stock_serializado_sin_seriales' in v_def) = 0 then
    raise notice 'fn_inv_int_mover no tiene el parche de seriales en la entrada';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new) <> 1 then
    raise exception 'fn_inv_int_mover: el bloque de entrada serializada no aparece exactamente una vez';
  end if;
  if (length(v_def) - length(replace(v_def, v_sel_new, ''))) / length(v_sel_new) <> 1 then
    raise exception 'fn_inv_int_mover: el select con track_serial no aparece exactamente una vez';
  end if;
  execute replace(replace(v_def, v_new, v_old), v_sel_new, v_sel_old);
end;
$mover$;

drop function if exists public.fn_reporte_stock_sin_seriales(integer);

do $pos$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old text := $old$      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;$old$;
  v_new text := $new$      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included, serial_ids
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean,
      -- stock_serializado_sin_seriales_pos
      coalesce((
        select array_agg(x::integer)
          from jsonb_array_elements_text(coalesce(i.value->'serial_ids', '[]'::jsonb)) x
      ), '{}'::integer[])
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;$new$;
begin
  if position('stock_serializado_sin_seriales_pos' in v_def) = 0 then
    raise notice 'pos_checkout_v1 no fue parcheado por esta migración; si ya guarda serial_ids, se deja';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new) <> 1 then
    raise exception 'pos_checkout_v1: el insert con serial_ids no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_new, v_old);
end;
$pos$;
