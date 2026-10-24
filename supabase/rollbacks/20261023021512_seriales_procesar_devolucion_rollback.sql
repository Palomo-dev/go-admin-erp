-- Rollback de 20261023021512_seriales_procesar_devolucion.sql
-- Devuelve procesar_devolucion al texto anterior a las disposiciones por serial.
-- No borra devoluciones, notas ni asientos ya hechos.
-- Ejecutar después de revertir el reembolso de garantía (21531) y antes de
-- borrar fn_nc_asiento_devolucion (21305) y la columna serial_dispositions (21111).

do $rollback$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  if position('serial_dispositions_20261023' in v_def) = 0 then
    return;
  end if;
  v_nuevo := replace(v_def, $rb_new_1$  update public.returns set
    cash_movement_id = v_mov_caja,
    customer_credit_id = v_credito,
    credit_note_invoice_id = v_nc_id
  where id = v_return_id;

  -- Devuelta solo cuando lo reembolsado cubre el total. Una parte deja el
  -- payment_status como estaba: el listado ya distingue la devolución parcial
  -- por la suma de las devoluciones. status sigue en paid para poder devolver
  -- otra línea después.
  update public.sales s
     set payment_status = 'refunded'
   where s.id = v_sale.id
     and s.organization_id = p_organization_id
     and s.payment_status is distinct from 'refunded'
     and coalesce((
       select sum(r.total_refund)
         from public.returns r
        where r.sale_id = s.id
          and r.organization_id = s.organization_id
          and coalesce(r.status, 'processed') not in ('void', 'cancelled', 'anulado')
     ), 0) >= coalesce(s.total, 0) - 0.01;

  return jsonb_build_object($rb_new_1$, $rb_old_1$  update public.returns set
    cash_movement_id = v_mov_caja,
    customer_credit_id = v_credito,
    credit_note_invoice_id = v_nc_id
  where id = v_return_id;

  return jsonb_build_object($rb_old_1$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 1';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_2$           array(select x::integer from jsonb_array_elements_text(l->'serial_ids') x)
      from jsonb_array_elements(v_lineas) l;
    perform public.fn_nc_asiento_devolucion(p_organization_id, v_nc_id);
    perform set_config('app.asiento_por_lineas', 'off', true);
  end if;$rb_new_2$, $rb_old_2$           array(select x::integer from jsonb_array_elements_text(l->'serial_ids') x)
      from jsonb_array_elements(v_lineas) l;
  end if;$rb_old_2$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 2';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_3$    end loop;

    -- La nota se inserta sin asiento automático: las líneas aún no existen y
    -- la cuenta de devolución es por producto. El asiento se crea después.
    perform set_config('app.asiento_por_lineas', 'on', true);
    insert into public.invoice_sales ($rb_new_3$, $rb_old_3$    end loop;

    insert into public.invoice_sales ($rb_old_3$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 3';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_4$      refund_amount, tax_amount, reason_id, restocked, stock_movement_id, serial_ids, serial_dispositions
    ) values (
      p_organization_id, v_return_id, (v_linea->>'sale_item_id')::uuid, (v_linea->>'product_id')::integer,
      (v_linea->>'quantity')::numeric, (v_linea->>'unit_refund')::numeric,
      (v_linea->>'refund_amount')::numeric, (v_linea->>'tax_amount')::numeric,
      (v_linea->>'reason_id')::integer, v_mov_stock is not null, v_mov_stock,
      array(select x::integer from jsonb_array_elements_text(v_linea->'serial_ids') x),
      coalesce(v_linea->'serial_dispositions', '{}'::jsonb)
    );$rb_new_4$, $rb_old_4$      refund_amount, tax_amount, reason_id, restocked, stock_movement_id, serial_ids
    ) values (
      p_organization_id, v_return_id, (v_linea->>'sale_item_id')::uuid, (v_linea->>'product_id')::integer,
      (v_linea->>'quantity')::numeric, (v_linea->>'unit_refund')::numeric,
      (v_linea->>'refund_amount')::numeric, (v_linea->>'tax_amount')::numeric,
      (v_linea->>'reason_id')::integer, v_mov_stock is not null, v_mov_stock,
      array(select x::integer from jsonb_array_elements_text(v_linea->'serial_ids') x)
    );$rb_old_4$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 4';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_5$          v_serial.id, p_organization_id, 'returned', v_serial.status,
          coalesce(nullif(v_linea->'serial_dispositions'->>v_serial.id::text, ''),
                   case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end),$rb_new_5$, $rb_old_5$          v_serial.id, p_organization_id, 'returned', v_serial.status,
          case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end,$rb_old_5$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 5';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_6$        update public.serial_numbers set
          status = coalesce(nullif(v_linea->'serial_dispositions'->>v_serial.id::text, ''),
                            case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end),
          sold_to_customer_id = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then sold_to_customer_id
            else null end,
          sold_by_user_id = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then sold_by_user_id
            else null end,
          sale_id = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then sale_id
            else null end,
          web_order_id = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then web_order_id
            else null end,
          invoice_sale_id = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then invoice_sale_id
            else null end,
          sale_channel = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then sale_channel
            else 'in_stock' end,
          sale_date = case
            when coalesce(v_linea->'serial_dispositions'->>v_serial.id::text, '') = 'damaged' then sale_date
            else null end,$rb_new_6$, $rb_old_6$        update public.serial_numbers set
          status = case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end,
          sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
          web_order_id = null, invoice_sale_id = null,
          sale_channel = 'in_stock', sale_date = null,$rb_old_6$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 6';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_7$    v_mov_stock := null;
    -- Stock por kardex. Sin seriales manda affects_inventory (peso: la casilla;
    -- el resto: la casilla si vino, si no el motivo). Con seriales entra solo
    -- lo marcado in_stock. La garantía dañada entra y sale (pérdida) para
    -- dejar el kardex sin cambiar el disponible.
    declare
      v_entra numeric := 0;
      v_danados numeric := 0;
      v_a_stock numeric := 0;
    begin
      if jsonb_typeof(v_linea->'serial_dispositions') = 'object'
         and v_linea->'serial_dispositions' <> '{}'::jsonb then
        select (count(*) filter (where d.value = 'in_stock'))::numeric,
               (count(*) filter (where d.value = 'damaged'))::numeric
          into v_a_stock, v_danados
          from jsonb_each_text(v_linea->'serial_dispositions') d;
        v_entra := v_a_stock;
        if coalesce((v_linea->>'movimiento_danado')::boolean, false) then
          v_entra := v_entra + v_danados;
        else
          v_danados := 0;
        end if;
      elsif (v_linea->>'affects_inventory')::boolean then
        v_entra := (v_linea->>'quantity')::numeric;
      end if;
      if (v_linea->>'track_stock')::boolean and v_entra > 0 then
        select sm.unit_cost into v_costo from public.stock_movements sm
         where sm.organization_id = p_organization_id
           and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
           and sm.source_id = v_sale.id::text
           and sm.product_id = (v_linea->>'product_id')::integer
           and sm.direction = 'out'
         order by sm.id limit 1;
        v_mov_stock := public.fn_stock_entrada_devolucion(
          p_organization_id, v_sale.branch_id, (v_linea->>'product_id')::integer,
          v_entra, v_costo, v_return_id::text,
          'Devolución de la venta ' || v_sale.id::text, v_uid);
        if v_a_stock = 0 then
          v_mov_stock := null;
        end if;
      end if;
      if (v_linea->>'track_stock')::boolean and v_danados > 0 then
        perform public.fn_inv_int_mover(
          p_organization_id, v_sale.branch_id, (v_linea->>'product_id')::integer, null,
          'out', v_danados, v_costo, 'loss', v_return_id::text,
          'Unidad dañada en la devolución ' || v_return_id::text, v_uid, '{}'::jsonb);
      end if;
    end;$rb_new_7$, $rb_old_7$    v_mov_stock := null;
    -- Stock por kardex: solo si el producto lleva stock y el motivo lo repone.
    if (v_linea->>'track_stock')::boolean and (v_linea->>'affects_inventory')::boolean then
      select sm.unit_cost into v_costo from public.stock_movements sm
       where sm.organization_id = p_organization_id
         and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
         and sm.source_id = v_sale.id::text
         and sm.product_id = (v_linea->>'product_id')::integer
         and sm.direction = 'out'
       order by sm.id limit 1;
      v_mov_stock := public.fn_stock_entrada_devolucion(
        p_organization_id, v_sale.branch_id, (v_linea->>'product_id')::integer,
        (v_linea->>'quantity')::numeric, v_costo, v_return_id::text,
        'Devolución de la venta ' || v_sale.id::text, v_uid);
    end if;$rb_old_7$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 7';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_8$      'affects_inventory', case
        when coalesce(v_prod.track_serial, false) then false
        when coalesce(v_prod.sale_mode, 'unit') = 'weight' then coalesce((v_item->>'restock')::boolean, false)
        when v_item ? 'restock' then coalesce((v_item->>'restock')::boolean, false)
        else v_motivo.affects_inventory end,
      'origen_garantia', coalesce((v_item->>'origen_garantia')::boolean, false),
      'movimiento_danado', coalesce((v_item->>'movimiento_danado')::boolean, false)
        and coalesce((v_item->>'origen_garantia')::boolean, false)
        and coalesce(p_idempotency_key, '') like 'garantia:%',
      'track_stock', coalesce(v_prod.track_stock, false),
      'serial_ids', to_jsonb(v_serials),
      'serial_dispositions', (
        select coalesce(jsonb_object_agg(s.id::text, s.disp), '{}'::jsonb)
          from (
            select sn.id,
              case
                when coalesce(v_item->'serial_dispositions'->>sn.id::text, '') in ('in_stock', 'damaged', 'returned')
                  then v_item->'serial_dispositions'->>sn.id::text
                when v_motivo.affects_inventory then 'in_stock'
                else 'returned'
              end as disp
              from public.serial_numbers sn
             where sn.id = any(v_serials)
          ) s
      ));$rb_new_8$, $rb_old_8$      'affects_inventory', case when coalesce(v_prod.sale_mode, 'unit') = 'weight'
                                then coalesce((v_item->>'restock')::boolean, false)
                                else v_motivo.affects_inventory end,
      'track_stock', coalesce(v_prod.track_stock, false),
      'serial_ids', to_jsonb(v_serials));$rb_old_8$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 8';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_9$    v_serials := array(select x::integer from jsonb_array_elements_text(coalesce(v_item->'serial_ids', '[]'::jsonb)) x);
    -- serial_dispositions_20261023
    if v_item ? 'serial_dispositions' and jsonb_typeof(v_item->'serial_dispositions') = 'object' then
      if exists (
        select 1 from jsonb_each_text(v_item->'serial_dispositions') d
         where d.value not in ('in_stock', 'damaged', 'returned')
            or d.key !~ '^[0-9]+$'
            or not (d.key::integer = any(coalesce(v_serials, '{}')))
      ) then
        raise exception 'disposicion_invalida' using errcode = '22023';
      end if;
    end if;
    if coalesce(v_prod.track_serial, false) then
      if cardinality(v_serials) <> v_qty then
        raise exception 'seriales_no_coinciden' using errcode = '22023';
      end if;
      for v_serial in select sn.* from public.serial_numbers sn where sn.id = any(v_serials) loop
        if exists (
          select 1
            from public.return_lines rl
            join public.returns r on r.id = rl.return_id
           where r.organization_id = p_organization_id
             and r.sale_id = v_sale.id
             and coalesce(r.status, 'processed') not in ('void', 'cancelled', 'anulado')
             and v_serial.id = any(rl.serial_ids)
        ) then
          raise exception 'serial_ya_devuelto' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
        if coalesce((v_item->>'origen_garantia')::boolean, false) is not true
           and exists (
             select 1 from public.warranty_claims w
              where w.organization_id = p_organization_id
                and w.serial_number_id = v_serial.id
                and w.status = 'resolved'
                and w.resolution_type = 'refund'
           ) then
          raise exception 'serial_ya_reembolsado_garantia' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
        if v_serial.status = 'warranty_claim'
           and not (
             coalesce((v_item->>'origen_garantia')::boolean, false)
             and coalesce(p_idempotency_key, '') like 'garantia:%'
           ) then
          raise exception 'serial_en_garantia' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
        if v_serial.organization_id <> p_organization_id or v_serial.product_id <> v_si.product_id
           or (
             v_serial.status <> 'sold'
             and not (
               v_serial.status = 'warranty_claim'
               and coalesce((v_item->>'origen_garantia')::boolean, false)
               and coalesce(p_idempotency_key, '') like 'garantia:%'
             )
           )
           or (v_serial.sale_id is not null and v_serial.sale_id <> v_sale.id::text) then
          raise exception 'serial_invalido' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
      end loop;$rb_new_9$, $rb_old_9$    v_serials := array(select x::integer from jsonb_array_elements_text(coalesce(v_item->'serial_ids', '[]'::jsonb)) x);
    if coalesce(v_prod.track_serial, false) then
      if cardinality(v_serials) <> v_qty then
        raise exception 'seriales_no_coinciden' using errcode = '22023';
      end if;
      for v_serial in select sn.* from public.serial_numbers sn where sn.id = any(v_serials) loop
        if v_serial.organization_id <> p_organization_id or v_serial.product_id <> v_si.product_id
           or v_serial.status <> 'sold'
           or (v_serial.sale_id is not null and v_serial.sale_id <> v_sale.id::text) then
          raise exception 'serial_invalido' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
      end loop;$rb_old_9$);
  if v_nuevo = v_def then
    raise exception 'rollback devolucion: no está el tramo 9';
  end if;
  v_def := v_nuevo;
  execute v_def;
end
$rollback$;
