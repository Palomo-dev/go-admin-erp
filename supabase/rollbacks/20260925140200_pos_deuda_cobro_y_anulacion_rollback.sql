-- Reversión de 20260925140200_pos_deuda_cobro_y_anulacion: quita los modos
-- debt/settle de pos_checkout_v1 (parche inverso sobre la definición viva) y
-- borra pos_anular_venta_v1, fn_pos_numero_nota_credito y pos_cobros.
-- ATENCIÓN: se pierde el registro de intentos de cobro; las ventas, pagos,
-- notas crédito y anulaciones ya hechas no se deshacen. Revertir antes las
-- migraciones posteriores que tocan pos_checkout_v1.

do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$  v_si          record;
  v_mode        text;       -- 'sale' (venta nueva) | 'debt' (venta nueva a crédito) | 'settle' (cobrar una venta que ya existe)
  v_key         uuid;       -- settle: intento de cobro (idempotencia de pagos y propina)
  v_cobro       public.pos_cobros%rowtype;
  v_debt        jsonb;
  v_terms       integer;
  v_pagado      numeric;
  v_pay_ids     uuid[] := '{}';
  v_pay_id      uuid;
  v_lineas_nuevas boolean := false;
begin$frag0$;
  v_new0 text := $frag0$  v_si          record;
begin$frag0$;
  v_old1 text := $frag1$  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;

  -- Punto 6: un solo cobro para la venta de mostrador, la venta a crédito
  -- (deuda) y el cobro de una venta que ya existe (deuda, mesa).
  v_mode := coalesce(nullif(p_envelope->>'mode', ''), 'sale');
  if v_mode not in ('sale', 'debt', 'settle') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  v_key := nullif(p_envelope->>'payment_key', '')::uuid;
  if v_mode = 'settle' and v_key is null then
    raise exception 'El cobro de una venta existente necesita payment_key' using errcode = '22023';
  end if;
  v_debt := case when jsonb_typeof(p_envelope->'debt') = 'object' then p_envelope->'debt' else '{}'::jsonb end;
  v_terms := coalesce(nullif(v_debt->>'payment_terms', '')::integer, 30);
  if v_terms < 0 or v_terms > 3650 then
    raise exception 'plazo_invalido' using errcode = '22023';
  end if;
$frag1$;
  v_new1 text := $frag1$  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;
$frag1$;
  v_old2 text := $frag2$  if jsonb_typeof(v_items) <> 'array' or (v_mode <> 'settle' and jsonb_array_length(v_items) = 0) then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;$frag2$;
  v_new2 text := $frag2$  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;$frag2$;
  v_old3 text := $frag3$  if v_mode <> 'settle' and abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then$frag3$;
  v_new3 text := $frag3$  if abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then$frag3$;
  v_old4 text := $frag4$  if v_mode <> 'settle' and not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop$frag4$;
  v_new4 text := $frag4$  if not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop$frag4$;
  v_old5 text := $frag5$  v_balance    := greatest(0, v_total - v_total_paid);
  v_status     := case when v_total_paid >= v_total then 'paid' else 'pending' end;
  v_pay_status := case when v_total_paid >= v_total then 'paid' else 'partial' end;

  -- Deuda (antes holdCartWithDebt: N inserts desde el navegador). Mismas
  -- reglas: exige cliente; no exige caja; nace sin pagos y pendiente.
  if v_mode = 'debt' then
    if v_customer is null then
      raise exception 'deuda_sin_cliente' using errcode = '22023';
    end if;
    if v_total_paid > 0 or v_pay_sum > 0 then
      raise exception 'deuda_con_pagos' using errcode = '22023';
    end if;
    if v_total <= 0 then
      raise exception 'Total de la venta inválido' using errcode = '22023';
    end if;
    v_balance    := v_total;
    v_status     := 'pending';
    v_pay_status := 'pending';
  end if;
$frag5$;
  v_new5 text := $frag5$  v_balance    := greatest(0, v_total - v_total_paid);
  v_status     := case when v_total_paid >= v_total then 'paid' else 'pending' end;
  v_pay_status := case when v_total_paid >= v_total then 'paid' else 'partial' end;
$frag5$;
  v_old6 text := $frag6$  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
  perform pg_advisory_xact_lock(hashtext('pos_checkout:' || v_sale_id::text));

  if v_mode = 'settle' then
    -- ── 4b. Cobrar una venta que ya existe (deuda, mesa) ───────────────────
    select * into v_sale from public.sales s where s.id = v_sale_id for update;
    if not found then
      raise exception 'venta_no_encontrada' using errcode = 'P0002';
    end if;
    if v_sale.organization_id <> v_org then
      raise exception 'La venta pertenece a otra organización' using errcode = '42501';
    end if;
    -- Reintento del MISMO intento: se devuelve lo que ya quedó, sin escribir.
    select * into v_cobro from public.pos_cobros c where c.id = v_key;
    if found then
      if v_cobro.sale_id <> v_sale_id or v_cobro.organization_id <> v_org then
        raise exception 'cobro_de_otra_venta' using errcode = '22023';
      end if;
      select * into v_invoice from public.invoice_sales inv
      where inv.sale_id = v_sale_id and inv.organization_id = v_org and coalesce(inv.document_type, 'invoice') = 'invoice'
      order by inv.created_at asc limit 1;
      select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb) into v_payment_rows
      from public.payments p where p.id = any(v_cobro.payment_ids);
      return jsonb_build_object(
        'sale', to_jsonb(v_sale), 'invoice', to_jsonb(v_invoice), 'payments', v_payment_rows,
        'replayed', true, 'completed', '[]'::jsonb, 'warnings', '[]'::jsonb,
        'mode', v_mode, 'payment_key', v_key);
    end if;
    if v_sale.status = 'void' then
      raise exception 'venta_anulada' using errcode = '22023';
    end if;
    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= 0 then
      raise exception 'venta_ya_pagada' using errcode = '22023';
    end if;

    v_customer := coalesce(v_customer, v_sale.customer_id);
    -- Propina y flete de ESTE cobro se suman a la venta (total = líneas +
    -- flete + propina, igual que en mostrador).
    update public.sales set
      customer_id     = coalesce(customer_id, v_customer),
      tip_amount      = case when v_tip > 0 then coalesce(tip_amount, 0) + v_tip else tip_amount end,
      tip_server_id   = case when v_tip > 0 then coalesce(nullif(p_envelope->'tip'->>'server_id', '')::uuid, tip_server_id, v_user_id) else tip_server_id end,
      delivery_fee    = coalesce(delivery_fee, 0) + v_shipping,
      total           = coalesce(total, 0) + v_tip + v_shipping,
      salesperson_id  = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_id else salesperson_id end,
      commission_rate = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_rate else commission_rate end,
      commission_type = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_type else commission_type end,
      updated_at      = now()
    where id = v_sale_id
    returning * into v_sale;
    v_subtotal     := coalesce(v_sale.subtotal, 0);
    v_tax_total    := coalesce(v_sale.tax_total, 0);
    v_discount     := coalesce(v_sale.discount_total, 0);
    v_total        := coalesce(v_sale.total, 0);
    v_tax_included := coalesce(v_sale.tax_included, false);
  else
$frag6$;
  v_new6 text := $frag6$  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
  perform pg_advisory_xact_lock(hashtext('pos_checkout:' || v_sale_id::text));
$frag6$;
  v_old7 text := $frag7$      v_replayed := true;
    end;
  end if;
  end if;

  -- ── 5. Promociones$frag7$;
  v_new7 text := $frag7$      v_replayed := true;
    end;
  end if;

  -- ── 5. Promociones$frag7$;
  v_old8 text := $frag8$        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount, notes
      ) values ($frag8$;
  v_new8 text := $frag8$        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount
      ) values ($frag8$;
  v_old9 text := $frag9$        case when v_tip > 0 then v_tip else null end,
        case when v_mode = 'debt'
          then 'Venta con deuda - ' || coalesce(nullif(btrim(v_debt->>'reason'), ''), 'Sin motivo especificado')
          else null end
      ) returning * into v_sale;$frag9$;
  v_new9 text := $frag9$        case when v_tip > 0 then v_tip else null end
      ) returning * into v_sale;$frag9$;
  v_old10 text := $frag10$  if not v_replayed and v_mode <> 'settle' and cardinality(v_promos) > 0 then$frag10$;
  v_new10 text := $frag10$  if not v_replayed and cardinality(v_promos) > 0 then$frag10$;
  v_old11 text := $frag11$  if v_mode <> 'settle' and not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items ($frag11$;
  v_new11 text := $frag11$  if not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items ($frag11$;
  v_old12 text := $frag12$  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
    and coalesce(inv.document_type, 'invoice') = 'invoice'
  order by inv.created_at asc limit 1;$frag12$;
  v_new12 text := $frag12$  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
  order by inv.created_at asc limit 1;$frag12$;
  v_old13 text := $frag13$      v_org, coalesce(v_sale.branch_id, v_branch), v_customer, v_sale_id, v_number, v_created_at,
      case when v_mode = 'debt' then v_created_at + make_interval(days => v_terms) else v_created_at end,
      v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_mode = 'debt' then 'issued' when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included,
      case when v_mode = 'debt' then 'credit' else coalesce(v_first_method, 'cash') end,
      case when v_mode = 'debt' then v_terms else 0 end,
      v_actor,
      case when v_mode = 'debt'
        then coalesce(nullif(btrim(v_debt->>'notes'), ''),
                      'Carrito puesto en espera: ' || coalesce(nullif(btrim(v_debt->>'reason'), ''), 'Sin motivo especificado'))
        else 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text end,$frag13$;
  v_new13 text := $frag13$      v_org, v_branch, v_customer, v_sale_id, v_number, v_created_at, v_created_at, v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included, coalesce(v_first_method, 'cash'), 0,
      v_actor, 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text,$frag13$;
  v_old14 text := $frag14$  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  if v_mode = 'settle' then
    for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop
      if coalesce((v_pay->>'amount')::numeric, 0) <= 0 then continue; end if;
      v_takes_change := (not v_change_assigned) and v_change > 0 and (v_pay->>'method') = 'cash';
      if v_takes_change then v_change_assigned := true; end if;
      insert into public.payments (
        organization_id, branch_id, amount, method, currency, status, change_amount,
        source, source_id, created_by
      ) values (
        v_org, v_branch, (v_pay->>'amount')::numeric, v_pay->>'method', v_currency, 'completed',
        case when v_takes_change then v_change else 0 end,
        'invoice_sales', v_invoice.id::text, v_actor
      ) returning id into v_pay_id;
      v_pay_ids := array_append(v_pay_ids, v_pay_id);
    end loop;
  end if;

  if v_mode <> 'settle' then
  select count(*) into v_existing_payments$frag14$;
  v_new14 text := $frag14$  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  select count(*) into v_existing_payments$frag14$;
  v_old15 text := $frag15$    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;
  end if;
$frag15$;
  v_new15 text := $frag15$    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;
$frag15$;
  v_old16 text := $frag16$  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    v_lineas_nuevas := true;
    for v_si in$frag16$;
  v_new16 text := $frag16$  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    for v_si in$frag16$;
  v_old17 text := $frag17$    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;
  -- Flete cobrado al saldar una venta cuya factura ya existía (deuda): su línea.
  if v_mode = 'settle' and not v_lineas_nuevas and v_shipping > 0 then
    insert into public.invoice_items (
      invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
      total_line, tax_rate, tax_included, discount_amount
    ) values (
      v_invoice.id, v_invoice.id, 'sale', null, 'Envío (Delivery)', 1, v_shipping,
      v_shipping, 0, v_tax_included, 0
    );
  end if;
$frag17$;
  v_new17 text := $frag17$    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;
$frag17$;
  v_old18 text := $frag18$  if v_tip > 0 and (v_mode = 'settle' or not exists (select 1 from public.tips t where t.sale_id = v_sale_id)) then$frag18$;
  v_new18 text := $frag18$  if v_tip > 0 and not exists (select 1 from public.tips t where t.sale_id = v_sale_id) then$frag18$;
  v_old19 text := $frag19$  if v_mode = 'settle' then
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado
    from public.payments p
    where p.organization_id = v_org and p.status = 'completed'
      and ((p.source = 'sale' and p.source_id = v_sale_id::text)
        or (p.source = 'invoice_sales' and p.source_id in (
              select i.id::text from public.invoice_sales i
              where i.sale_id = v_sale_id and coalesce(i.document_type, 'invoice') = 'invoice')));
    v_balance := greatest(0, round(coalesce(v_sale.total, 0) - v_pagado, 2));
    update public.sales set
      balance        = v_balance,
      status         = case when v_balance <= 0 then 'paid' else 'pending' end,
      payment_status = case when v_balance <= 0 then 'paid' when v_pagado > 0 then 'partial' else 'pending' end,
      updated_at     = now()
    where id = v_sale_id;
    insert into public.pos_cobros (id, organization_id, sale_id, created_by, amount, tip_amount, shipping_fee, payment_ids)
    values (v_key, v_org, v_sale_id, v_actor, v_pay_sum, v_tip, v_shipping, v_pay_ids);
  end if;

  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────$frag19$;
  v_new19 text := $frag19$  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────$frag19$;
  v_old20 text := $frag20$    'warnings', to_jsonb(v_warnings),
    'mode', v_mode,
    'payment_key', v_key
  );
end;$frag20$;
  v_new20 text := $frag20$    'warnings', to_jsonb(v_warnings)
  );
end;$frag20$;
begin
  if position($m$public.pos_cobros$m$ in v_def) = 0 then
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
  if (length(v_def) - length(replace(v_def, v_old6, ''))) / length(v_old6) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 7 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old7, ''))) / length(v_old7) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 8 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old8, ''))) / length(v_old8) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 9 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old9, ''))) / length(v_old9) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 10 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old10, ''))) / length(v_old10) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 11 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old11, ''))) / length(v_old11) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 12 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old12, ''))) / length(v_old12) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 13 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old13, ''))) / length(v_old13) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 14 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old14, ''))) / length(v_old14) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 15 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old15, ''))) / length(v_old15) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 16 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old16, ''))) / length(v_old16) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 17 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old17, ''))) / length(v_old17) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 18 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old18, ''))) / length(v_old18) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 19 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old19, ''))) / length(v_old19) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 20 no aparece exactamente una vez; la función cambió';
  end if;
  if (length(v_def) - length(replace(v_def, v_old20, ''))) / length(v_old20) <> 1 then
    raise exception 'public.pos_checkout_v1(jsonb): el fragmento 21 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  v_def := replace(v_def, v_old3, v_new3);
  v_def := replace(v_def, v_old4, v_new4);
  v_def := replace(v_def, v_old5, v_new5);
  v_def := replace(v_def, v_old6, v_new6);
  v_def := replace(v_def, v_old7, v_new7);
  v_def := replace(v_def, v_old8, v_new8);
  v_def := replace(v_def, v_old9, v_new9);
  v_def := replace(v_def, v_old10, v_new10);
  v_def := replace(v_def, v_old11, v_new11);
  v_def := replace(v_def, v_old12, v_new12);
  v_def := replace(v_def, v_old13, v_new13);
  v_def := replace(v_def, v_old14, v_new14);
  v_def := replace(v_def, v_old15, v_new15);
  v_def := replace(v_def, v_old16, v_new16);
  v_def := replace(v_def, v_old17, v_new17);
  v_def := replace(v_def, v_old18, v_new18);
  v_def := replace(v_def, v_old19, v_new19);
  v_def := replace(v_def, v_old20, v_new20);
  execute v_def;
  if position($m$public.pos_cobros$m$ in pg_get_functiondef(v_oid)) > 0 then
    raise exception 'public.pos_checkout_v1(jsonb): la reversión no quitó el cambio';
  end if;
end $parche$;

drop function if exists public.pos_anular_venta_v1(uuid, text);
drop function if exists public.fn_pos_numero_nota_credito(integer, integer);
drop table if exists public.pos_cobros;
