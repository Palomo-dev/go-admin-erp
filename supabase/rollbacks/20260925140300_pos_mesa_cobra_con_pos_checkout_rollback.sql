-- Reversión de 20260925140300_pos_mesa_cobra_con_pos_checkout: quita los
-- parches de pos_checkout_v1 y pos_cocina_ajustar_linea_mesa (definición viva)
-- y borra las funciones nuevas. Los totales ya recalculados se quedan.

do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$  v_lineas_nuevas boolean := false;
  v_mesa        uuid;       -- settle de una mesa: su sesión
begin$frag0$;
  v_new0 text := $frag0$  v_lineas_nuevas boolean := false;
begin$frag0$;
  v_old1 text := $frag1$    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= 0 then
      raise exception 'venta_ya_pagada' using errcode = '22023';
    end if;

    -- ── Mesa (punto 1): la cuenta se cobra con el mismo cobro del mostrador ─
    v_mesa := nullif(p_envelope->>'table_session_id', '')::uuid;
    if v_mesa is not null then
      if not exists (
        select 1 from public.table_sessions ts
         where ts.id = v_mesa and ts.organization_id = v_org and ts.sale_id = v_sale_id
           and ts.status in ('active', 'bill_requested')
      ) then
        raise exception 'sesion_mesa_invalida' using errcode = '22023';
      end if;
      -- Tasa y modo de impuesto de cada línea: los del motor del cobro (igual
      -- que en mostrador); cantidad, precio y descuento: los de la base.
      for v_item in select value from jsonb_array_elements(v_items) loop
        if coalesce(v_item->>'sale_item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          update public.sale_items si set
            tax_rate     = greatest(0, least(100, coalesce((v_item->>'tax_rate')::numeric, 0))),
            tax_included = coalesce((v_item->>'tax_included')::boolean, v_tax_included),
            updated_at   = now()
          where si.id = (v_item->>'sale_item_id')::uuid and si.sale_id = v_sale_id and si.paid_at is null;
        end if;
      end loop;
      perform public.fn_pos_recalcular_venta(v_sale_id);
      -- Punto 3 también en la mesa: sus líneas las escribió el navegador al
      -- pedir; precio vigente (al pedir o ahora), modificadores y descuento se
      -- validan al cobrar.
      for v_si in
        select si.* from public.sale_items si
         where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0
      loop
        perform public.fn_pos_validar_linea_venta(v_org, v_actor, jsonb_build_object(
          'product_id', v_si.product_id, 'quantity', v_si.quantity, 'unit_price', v_si.unit_price,
          'discount_amount', coalesce(v_si.discount_amount, 0), 'tax_rate', coalesce(v_si.tax_rate, 0),
          'tax_included', coalesce(v_si.tax_included, false), 'total', v_si.total,
          'tax_amount', coalesce(v_si.tax_amount, 0), 'notes', coalesce(v_si.notes, '{}'::jsonb),
          'priced_at', v_si.created_at), v_si.created_at, null);
      end loop;
      select * into v_sale from public.sales s where s.id = v_sale_id;
    end if;
$frag1$;
  v_new1 text := $frag1$    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= 0 then
      raise exception 'venta_ya_pagada' using errcode = '22023';
    end if;
$frag1$;
  v_old2 text := $frag2$      table_session_id = coalesce(table_session_id, v_mesa),
      customer_id     = coalesce(customer_id, v_customer),$frag2$;
  v_new2 text := $frag2$      customer_id     = coalesce(customer_id, v_customer),$frag2$;
  v_old3 text := $frag3$          v_org, coalesce(v_sale.branch_id, v_branch), v_si.product_id, v_si.quantity,
          case when v_mesa is not null then 'mesa_sale' else 'sale' end, v_sale_id::text, v_si.unit_price, v_user_id$frag3$;
  v_new3 text := $frag3$          v_org, v_branch, v_si.product_id, v_si.quantity, 'sale', v_sale_id::text, v_si.unit_price, v_user_id$frag3$;
  v_old4 text := $frag4$      v_pay_ids := array_append(v_pay_ids, v_pay_id);
    end loop;
    -- Cuenta dividida por platos: las líneas de este pago quedan pagadas.
    if v_mesa is not null and jsonb_typeof(p_envelope->'paid_sale_item_ids') = 'array' then
      update public.sale_items si set
        paid_at = now(), paid_by_split_id = nullif(p_envelope->>'split_id', ''), updated_at = now()
      where si.sale_id = v_sale_id and si.paid_at is null
        and si.id::text in (select jsonb_array_elements_text(p_envelope->'paid_sale_item_ids'));
    end if;
  end if;
$frag4$;
  v_new4 text := $frag4$      v_pay_ids := array_append(v_pay_ids, v_pay_id);
    end loop;
  end if;
$frag4$;
  v_old5 text := $frag5$  -- Mesa: si la cuenta cambió después del primer pago (platos agregados o
  -- quitados entre cobros de una cuenta dividida), las líneas de la factura se
  -- rehacen desde sale_items, solo si la factura no salió a la DIAN.
  if v_mesa is not null and v_invoice.id is not null and v_invoice.einvoice_status is null
     and v_invoice.status <> 'void'
     and exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id)
     and abs((select coalesce(sum(ii.total_line), 0) from public.invoice_items ii
               where ii.invoice_id = v_invoice.id and ii.product_id is not null)
           - (select coalesce(sum(si.total), 0) from public.sale_items si
               where si.sale_id = v_sale_id and si.quantity > 0)) > 0.01 then
    delete from public.invoice_items ii where ii.invoice_id = v_invoice.id;
  end if;

  -- ── 11. Líneas de factura (de sale_items guardados, no del sobre) ───────$frag5$;
  v_new5 text := $frag5$  -- ── 11. Líneas de factura (de sale_items guardados, no del sobre) ───────$frag5$;
begin
  if position($m$sesion_mesa_invalida$m$ in v_def) = 0 then
    raise notice 'public.pos_checkout_v1(jsonb): el cambio no está aplicado; nada que revertir';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old0, ''))) / length(v_old0) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 1 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old1, ''))) / length(v_old1) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 2 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old2, ''))) / length(v_old2) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 3 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old3, ''))) / length(v_old3) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 4 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old4, ''))) / length(v_old4) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 5 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old5, ''))) / length(v_old5) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 6 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  v_def := replace(v_def, v_old3, v_new3);
  v_def := replace(v_def, v_old4, v_new4);
  v_def := replace(v_def, v_old5, v_new5);
  execute v_def;
  if position($m$sesion_mesa_invalida$m$ in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'public.pos_checkout_v1(jsonb): la reversión no quitó el cambio';
  end if;
end $parche$;

do $parche$
declare
  v_oid oid := 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text)'::regprocedure);
  v_old0 text := $frag0$  v_accion     text;
  v_desc_linea numeric;
  v_total_linea numeric;
begin$frag0$;
  v_new0 text := $frag0$  v_accion     text;
begin$frag0$;
  v_old1 text := $frag1$    -- Punto 1 (2026-09-24): el descuento escala con la cantidad (antes quedaba
    -- fijo) y la línea sigue la regla única (antes sumaba el impuesto aunque
    -- el precio lo incluyera). Líneas anteriores sin modo: impuesto por unidad.
    v_desc_linea := round(coalesce(v_si.discount_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1) * p_nueva_cantidad, 2);
    if v_si.tax_included is not null then
      select t.tax, t.total into v_tax, v_total_linea
        from public.fn_pos_linea_totales(p_nueva_cantidad, v_si.unit_price, v_desc_linea, v_si.tax_rate, v_si.tax_included) t;
    else
      v_tax_unit := coalesce(v_si.tax_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1);
      v_tax := round(v_tax_unit * p_nueva_cantidad, 2);
      v_total_linea := v_si.unit_price * p_nueva_cantidad - v_desc_linea + v_tax;
    end if;
    update public.sale_items
    set quantity = p_nueva_cantidad,
        total = v_total_linea,
        tax_amount = v_tax,
        discount_amount = v_desc_linea,
        updated_at = now()
    where id = v_si.id;$frag1$;
  v_new1 text := $frag1$    v_tax_unit := coalesce(v_si.tax_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1);
    v_tax := round(v_tax_unit * p_nueva_cantidad, 2);
    update public.sale_items
    set quantity = p_nueva_cantidad,
        total = v_si.unit_price * p_nueva_cantidad + v_tax,
        tax_amount = v_tax,
        updated_at = now()
    where id = v_si.id;$frag1$;
  v_old2 text := $frag2$  -- Cabecera de la cuenta desde sus líneas, en la misma transacción.
  perform public.fn_pos_recalcular_venta(v_sale.id);

  return jsonb_build_object(
    'accion', v_accion, 'sale_id', v_sale.id,$frag2$;
  v_new2 text := $frag2$  return jsonb_build_object(
    'accion', v_accion, 'sale_id', v_sale.id,$frag2$;
begin
  if position($m$fn_pos_recalcular_venta$m$ in v_def) = 0 then
    raise notice 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): el cambio no está aplicado; nada que revertir';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old0, ''))) / length(v_old0) <> 1 then
    raise exception 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): el fragmento 1 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old1, ''))) / length(v_old1) <> 1 then
    raise exception 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): el fragmento 2 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old2, ''))) / length(v_old2) <> 1 then
    raise exception 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): el fragmento 3 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  execute v_def;
  if position($m$fn_pos_recalcular_venta$m$ in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): la reversión no quitó el cambio';
  end if;
end $parche$;

drop function if exists public.pos_mesa_recalcular_venta(uuid);
drop function if exists public.fn_pos_recalcular_venta(uuid);
drop function if exists public.fn_pos_linea_totales(numeric, numeric, numeric, numeric, boolean);
