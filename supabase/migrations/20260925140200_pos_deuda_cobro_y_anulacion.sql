-- Punto 6 (2026-09-24): deuda, cobro de deuda y anulaciones en el servidor.
--
-- Antes, desde el navegador y en N escrituras sin transacción:
--   - holdCartWithDebt: sales, invoice_sales, invoice_items, sale_items y stock
--     con la sucursal del usuario (no la del carrito);
--   - el cobro de una deuda: update de venta y factura, pagos, comisión y
--     propina, sin idempotencia (un reintento duplicaba pagos);
--   - cancelDebtWithCreditNote: nota crédito, factura, venta y
--     accounts_receivable escritos a mano, sin permiso;
--   - VentasService.cancelSale: solo sales.status = 'void' (sin stock, pagos,
--     factura ni permiso).
--
-- Ahora:
--   1. pos_checkout_v1 con sobre.mode:
--      - 'debt': venta NUEVA a crédito (misma validación de precios del punto 3):
--        exige cliente (regla existente; no exige caja), sin pagos, venta
--        pendiente, factura 'issued' a crédito con vencimiento = fecha +
--        sobre.debt.payment_terms días; la cartera la crea el disparador.
--      - 'settle': cobrar una venta que YA existe (deuda; la mesa en el punto
--        1). Idempotente por sobre.payment_key (tabla pos_cobros): el mismo
--        intento no repite pagos ni propina. Suma propina y flete de ese cobro
--        a la venta (y el flete como línea si la factura ya existía), registra
--        pagos contra la factura y deja saldo y estado desde los pagos.
--        Rechaza una venta anulada o ya pagada.
--      Parche sobre la definición VIVA (otras sesiones la modifican): falla sin
--      cambiar nada si algún fragmento no aparece exactamente una vez.
--   2. pos_anular_venta_v1(sale_id, motivo): exige pos.void (fn_tiene_permiso),
--      motivo, sin devoluciones procesadas y sin mesa abierta. Anula los pagos
--      solo si su caja sigue abierta (si no: devolución), revierte su asiento,
--      anula propinas (fn_propina_anular), cancela comisiones devengadas,
--      devuelve el stock del kardex (fn_stock_entrada_devolucion) y los
--      seriales, emite la nota crédito por lo facturado y anula la factura. La
--      cartera la ajustan los disparadores. Idempotente (venta ya anulada).
--      La nota crédito ELECTRÓNICA no se envía a Factus todavía: si la factura
--      salió a la DIAN devuelve el aviso factura_electronica_sin_nota_credito_dian.

-- ── Intentos de cobro de una venta existente ────────────────────────────────
create table if not exists public.pos_cobros (
  id              uuid primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  sale_id         uuid not null references public.sales(id) on delete cascade,
  created_by      uuid,
  amount          numeric not null default 0,
  tip_amount      numeric not null default 0,
  shipping_fee    numeric not null default 0,
  payment_ids     uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists idx_pos_cobros_sale on public.pos_cobros (sale_id);
create index if not exists idx_pos_cobros_org on public.pos_cobros (organization_id);

alter table public.pos_cobros enable row level security;

drop policy if exists pos_cobros_select_miembros on public.pos_cobros;
create policy pos_cobros_select_miembros on public.pos_cobros
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

revoke all on public.pos_cobros from anon;
revoke insert, update, delete on public.pos_cobros from authenticated;
grant select on public.pos_cobros to authenticated;

comment on table public.pos_cobros is
  'Un registro por intento de cobro de una venta que ya existe (deuda, mesa): la llave del intento (payment_key) hace idempotentes sus pagos y su propina. Solo la escribe pos_checkout_v1.';

-- ── pos_checkout_v1: modos debt y settle ────────────────────────────────────
do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$  v_si          record;
begin$frag0$;
  v_new0 text := $frag0$  v_si          record;
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
  v_old1 text := $frag1$  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;
$frag1$;
  v_new1 text := $frag1$  if v_org is null or v_branch is null or v_sale_id is null then
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
  v_old2 text := $frag2$  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;$frag2$;
  v_new2 text := $frag2$  if jsonb_typeof(v_items) <> 'array' or (v_mode <> 'settle' and jsonb_array_length(v_items) = 0) then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;$frag2$;
  v_old3 text := $frag3$  if abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then$frag3$;
  v_new3 text := $frag3$  if v_mode <> 'settle' and abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then$frag3$;
  v_old4 text := $frag4$  if not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop$frag4$;
  v_new4 text := $frag4$  if v_mode <> 'settle' and not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop$frag4$;
  v_old5 text := $frag5$  v_balance    := greatest(0, v_total - v_total_paid);
  v_status     := case when v_total_paid >= v_total then 'paid' else 'pending' end;
  v_pay_status := case when v_total_paid >= v_total then 'paid' else 'partial' end;
$frag5$;
  v_new5 text := $frag5$  v_balance    := greatest(0, v_total - v_total_paid);
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
  v_old6 text := $frag6$  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
  perform pg_advisory_xact_lock(hashtext('pos_checkout:' || v_sale_id::text));
$frag6$;
  v_new6 text := $frag6$  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
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
  v_old7 text := $frag7$      v_replayed := true;
    end;
  end if;

  -- ── 5. Promociones$frag7$;
  v_new7 text := $frag7$      v_replayed := true;
    end;
  end if;
  end if;

  -- ── 5. Promociones$frag7$;
  v_old8 text := $frag8$        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount
      ) values ($frag8$;
  v_new8 text := $frag8$        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount, notes
      ) values ($frag8$;
  v_old9 text := $frag9$        case when v_tip > 0 then v_tip else null end
      ) returning * into v_sale;$frag9$;
  v_new9 text := $frag9$        case when v_tip > 0 then v_tip else null end,
        case when v_mode = 'debt'
          then 'Venta con deuda - ' || coalesce(nullif(btrim(v_debt->>'reason'), ''), 'Sin motivo especificado')
          else null end
      ) returning * into v_sale;$frag9$;
  v_old10 text := $frag10$  if not v_replayed and cardinality(v_promos) > 0 then$frag10$;
  v_new10 text := $frag10$  if not v_replayed and v_mode <> 'settle' and cardinality(v_promos) > 0 then$frag10$;
  v_old11 text := $frag11$  if not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items ($frag11$;
  v_new11 text := $frag11$  if v_mode <> 'settle' and not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items ($frag11$;
  v_old12 text := $frag12$  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
  order by inv.created_at asc limit 1;$frag12$;
  v_new12 text := $frag12$  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
    and coalesce(inv.document_type, 'invoice') = 'invoice'
  order by inv.created_at asc limit 1;$frag12$;
  v_old13 text := $frag13$      v_org, v_branch, v_customer, v_sale_id, v_number, v_created_at, v_created_at, v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included, coalesce(v_first_method, 'cash'), 0,
      v_actor, 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text,$frag13$;
  v_new13 text := $frag13$      v_org, coalesce(v_sale.branch_id, v_branch), v_customer, v_sale_id, v_number, v_created_at,
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
  v_old14 text := $frag14$  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  select count(*) into v_existing_payments$frag14$;
  v_new14 text := $frag14$  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
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
  v_old15 text := $frag15$    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;
$frag15$;
  v_new15 text := $frag15$    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;
  end if;
$frag15$;
  v_old16 text := $frag16$  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    for v_si in$frag16$;
  v_new16 text := $frag16$  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    v_lineas_nuevas := true;
    for v_si in$frag16$;
  v_old17 text := $frag17$    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;
$frag17$;
  v_new17 text := $frag17$    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
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
  v_old18 text := $frag18$  if v_tip > 0 and not exists (select 1 from public.tips t where t.sale_id = v_sale_id) then$frag18$;
  v_new18 text := $frag18$  if v_tip > 0 and (v_mode = 'settle' or not exists (select 1 from public.tips t where t.sale_id = v_sale_id)) then$frag18$;
  v_old19 text := $frag19$  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────$frag19$;
  v_new19 text := $frag19$  if v_mode = 'settle' then
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
  v_old20 text := $frag20$    'warnings', to_jsonb(v_warnings)
  );
end;$frag20$;
  v_new20 text := $frag20$    'warnings', to_jsonb(v_warnings),
    'mode', v_mode,
    'payment_key', v_key
  );
end;$frag20$;
begin
  if position($m$public.pos_cobros$m$ in v_def) > 0 then
    raise notice 'public.pos_checkout_v1(jsonb): el cambio ya estaba aplicado; nada que hacer';
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
  if position($m$public.pos_cobros$m$ in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'public.pos_checkout_v1(jsonb): no quedó con el cambio';
  end if;
end $parche$;

-- ── Consecutivo de nota crédito ─────────────────────────────────────────────
-- La resolución de notas crédito de la sede si existe; si no, NC-#### con
-- candado por organización (la misma regla que procesar_devolucion y
-- CreditNoteNumberService).
create or replace function public.fn_pos_numero_nota_credito(p_org integer, p_branch integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero text;
begin
  begin
    select n.invoice_number into v_numero
      from public.fn_get_next_invoice_number(p_org, p_branch, 'credit_note') n;
  exception when others then
    v_numero := null;
  end;
  if v_numero is null then
    perform pg_advisory_xact_lock(hashtextextended('numero_nota_credito:' || p_org, 0));
    select 'NC-' || lpad((coalesce(max(nullif(regexp_replace(regexp_replace(i.number, '^NC-?', '', 'i'), '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
      into v_numero
      from public.invoice_sales i
     where i.organization_id = p_org and i.document_type = 'credit_note'
       and i.number ~* '^NC-?\d+$';
  end if;
  return v_numero;
end;
$$;

revoke all on function public.fn_pos_numero_nota_credito(integer, integer) from public, anon, authenticated;

-- ── Anular una venta del POS (y una deuda) ──────────────────────────────────
create or replace function public.pos_anular_venta_v1(p_sale_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_motivo     text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_sale       public.sales%rowtype;
  v_inv        public.invoice_sales%rowtype;
  v_modo       text;
  v_pago       record;
  v_je         record;
  v_mov        record;
  v_serial     record;
  v_tip        record;
  v_nc_id      uuid;
  v_nc_numero  text;
  v_n_pagos    integer := 0;
  v_n_asientos integer := 0;
  v_n_propinas integer := 0;
  v_n_stock    integer := 0;
  v_n_seriales integer := 0;
  v_n_comision integer := 0;
  v_avisos     text[] := '{}';
  v_periodo_ok boolean;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;

  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- El permiso se resuelve en el servidor (nunca por nombre de rol).
  if not public.fn_tiene_permiso(v_sale.organization_id, 'pos.void') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Idempotente: anular dos veces no revierte dos veces.
  if v_sale.status = 'void' then
    return jsonb_build_object('sale_id', v_sale.id, 'ya_anulada', true);
  end if;

  if exists (select 1 from public.returns r where r.sale_id = v_sale.id and r.status = 'processed') then
    raise exception 'venta_con_devoluciones' using errcode = '22023',
      hint = 'La venta tiene devoluciones: siga con devoluciones.';
  end if;
  if exists (select 1 from public.table_sessions ts
              where ts.sale_id = v_sale.id and ts.status in ('active', 'bill_requested')) then
    raise exception 'mesa_abierta' using errcode = '22023',
      hint = 'La mesa sigue abierta: anúlela desde «Liberar mesa».';
  end if;

  select * into v_inv from public.invoice_sales i
   where i.sale_id = v_sale.id and i.organization_id = v_sale.organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
   order by i.created_at limit 1;

  -- ── Pagos: se anulan solo si la caja en que entraron sigue abierta ──────
  v_modo := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = v_sale.organization_id and os.key = 'pos_cash_session_mode'),
    'branch');
  for v_pago in
    select p.* from public.payments p
     where p.organization_id = v_sale.organization_id and p.status = 'completed'
       and ((p.source = 'sale' and p.source_id = v_sale.id::text)
         or (p.source = 'invoice_sales' and p.source_id in (
               select i.id::text from public.invoice_sales i
                where i.sale_id = v_sale.id and coalesce(i.document_type, 'invoice') = 'invoice')))
     for update
  loop
    if not exists (
      select 1 from public.cash_sessions cs
       where cs.organization_id = v_sale.organization_id and cs.status = 'open'
         and cs.opened_at <= v_pago.created_at
         and case when v_modo = 'user'
                  then cs.opened_by = v_pago.created_by and cs.branch_id is not distinct from v_pago.branch_id
                  else (cs.branch_id = v_pago.branch_id or cs.branch_id is null) end
    ) then
      raise exception 'caja_cerrada' using errcode = '22023',
        hint = 'El pago entró en una caja ya cerrada: registre una devolución.';
    end if;

    for v_je in
      select je.id from public.journal_entries je
       where je.organization_id = v_sale.organization_id
         and je.fact_key = 'settlement:payment:' || v_pago.id::text
         and coalesce(je.posted, false)
         and not exists (select 1 from public.journal_entries r
                          where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
    loop
      if v_periodo_ok is null then
        v_periodo_ok := public.fn_is_period_open(v_sale.organization_id, public.fn_today_for(v_sale.organization_id, v_sale.branch_id));
        if not v_periodo_ok then
          raise exception 'periodo_cerrado' using errcode = '22023';
        end if;
      end if;
      perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'venta-' || left(v_sale.id::text, 8), now(), v_uid);
      v_n_asientos := v_n_asientos + 1;
    end loop;

    update public.payments set status = 'cancelled', updated_at = now() where id = v_pago.id;
    v_n_pagos := v_n_pagos + 1;
  end loop;

  -- ── Propinas: la anulación existente (revierte su asiento; pos.void) ────
  for v_tip in select t.id from public.tips t where t.sale_id = v_sale.id and t.voided_at is null loop
    perform public.fn_propina_anular(v_tip.id, v_motivo);
    v_n_propinas := v_n_propinas + 1;
  end loop;

  -- ── Comisiones devengadas ───────────────────────────────────────────────
  with c as (
    update public.commissions set status = 'cancelled', updated_at = now()
     where organization_id = v_sale.organization_id and status = 'accrued'
       and ((source_type = 'sale' and source_id = v_sale.id::text)
         or (v_inv.id is not null and source_type = 'invoice_sale' and source_id = v_inv.id::text))
    returning 1
  ) select count(*) into v_n_comision from c;
  if exists (select 1 from public.commissions
              where organization_id = v_sale.organization_id and status = 'paid'
                and source_type = 'sale' and source_id = v_sale.id::text) then
    v_avisos := array_append(v_avisos, 'comision_ya_pagada');
  end if;

  -- ── Stock: vuelve exactamente lo que salió por la venta (kardex) ────────
  for v_mov in
    select sm.branch_id, sm.product_id, sum(sm.qty) as qty,
           max(sm.unit_cost) as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_sale.organization_id
       and sm.source in ('sale', 'mesa_sale')
       and sm.source_id = v_sale.id::text
       and sm.direction = 'out'
     group by sm.branch_id, sm.product_id
  loop
    perform public.fn_stock_entrada_devolucion(
      v_sale.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.qty, v_mov.unit_cost,
      'anulacion:' || v_sale.id::text, 'Anulación de la venta ' || v_sale.id::text || ' - ' || v_motivo, v_uid);
    v_n_stock := v_n_stock + 1;
  end loop;

  -- ── Seriales vendidos vuelven a stock ───────────────────────────────────
  for v_serial in
    select sn.* from public.serial_numbers sn
     where sn.organization_id = v_sale.organization_id and sn.sale_id = v_sale.id::text and sn.status = 'sold'
  loop
    update public.serial_numbers set
      status = 'in_stock', sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
      web_order_id = null, invoice_sale_id = null, sale_channel = 'in_stock', sale_date = null,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status,
      from_branch_id, to_branch_id, source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, v_sale.organization_id, 'returned', 'sold', 'in_stock',
      v_serial.current_branch_id, v_serial.current_branch_id, 'sales', v_sale.id::text, v_sale.id,
      v_sale.customer_id, v_uid, 'Anulación: ' || v_motivo
    );
    v_n_seriales := v_n_seriales + 1;
  end loop;

  -- ── Factura: nota crédito por lo facturado y factura anulada ────────────
  -- La cartera la ajustan los disparadores (nunca a mano). La nota crédito
  -- ELECTRÓNICA no se envía a Factus todavía: si la factura salió a la DIAN,
  -- queda el aviso para enviarla a mano (docs/design/POS-COBRO-SERVIDOR.md §6).
  if v_inv.id is not null then
    if v_inv.einvoice_status in ('pending', 'processing', 'sent', 'accepted') then
      v_avisos := array_append(v_avisos, 'factura_electronica_sin_nota_credito_dian');
    end if;
    v_nc_numero := public.fn_pos_numero_nota_credito(v_sale.organization_id, v_inv.branch_id);
    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
      currency, subtotal, tax_total, total, balance, status, document_type,
      related_invoice_id, tax_included, payment_method, description, created_by
    ) values (
      v_sale.organization_id, v_inv.branch_id, v_inv.customer_id, v_sale.id, v_nc_numero, now(), now(),
      v_inv.currency, -coalesce(v_inv.subtotal, 0), -coalesce(v_inv.tax_total, 0), -coalesce(v_inv.total, 0), 0,
      'issued', 'credit_note', v_inv.id, v_inv.tax_included, coalesce(v_inv.payment_method, 'credit'),
      'Nota crédito por anulación de la factura ' || v_inv.number || ' - ' || v_motivo, v_uid
    ) returning id into v_nc_id;

    insert into public.invoice_items (
      invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
      total_line, tax_rate, tax_code, discount_amount, tax_included, serial_ids
    )
    select v_nc_id, v_nc_id, 'sale', ii.product_id, coalesce(ii.description, 'Anulación'),
           -ii.qty, ii.unit_price, -ii.total_line, coalesce(ii.tax_rate, 0), ii.tax_code,
           -coalesce(ii.discount_amount, 0), coalesce(ii.tax_included, v_inv.tax_included),
           coalesce(ii.serial_ids, '{}')
      from public.invoice_items ii
     where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id
     order by ii.created_at, ii.id;

    update public.invoice_sales set status = 'void', balance = 0, updated_at = now() where id = v_inv.id;
  end if;

  update public.sales set
    status         = 'void',
    balance        = 0,
    payment_status = case when v_n_pagos > 0 then 'refunded' else payment_status end,
    notes          = coalesce(notes || E'\n', '') || '[ANULADA] ' || v_motivo,
    updated_at     = now()
  where id = v_sale.id;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
  ) values (
    v_sale.organization_id, v_sale.branch_id, v_uid, 'sales', v_sale.id::text, 'VOID',
    jsonb_build_object('status', v_sale.status, 'payment_status', v_sale.payment_status, 'total', v_sale.total, 'balance', v_sale.balance),
    jsonb_build_object('status', 'void'),
    jsonb_build_object('motivo', v_motivo, 'factura', v_inv.number, 'nota_credito', v_nc_numero,
                       'pagos_anulados', v_n_pagos, 'asientos_revertidos', v_n_asientos,
                       'propinas_anuladas', v_n_propinas, 'comisiones_canceladas', v_n_comision,
                       'productos_devueltos', v_n_stock, 'seriales_devueltos', v_n_seriales,
                       'avisos', to_jsonb(v_avisos))
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'ya_anulada', false,
    'nota_credito_id', v_nc_id,
    'nota_credito_numero', v_nc_numero,
    'pagos_anulados', v_n_pagos,
    'asientos_revertidos', v_n_asientos,
    'propinas_anuladas', v_n_propinas,
    'comisiones_canceladas', v_n_comision,
    'productos_devueltos', v_n_stock,
    'seriales_devueltos', v_n_seriales,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;

comment on function public.pos_anular_venta_v1(uuid, text) is
  'Anula una venta del POS o una deuda en una transacción: pagos (solo si su caja sigue abierta) con reverso contable, propinas, comisiones, stock por kardex, seriales, nota crédito por lo facturado y factura anulada; la cartera la ajustan los disparadores. Exige pos.void. Idempotente. La NC electrónica no se envía a Factus todavía.';

revoke all on function public.pos_anular_venta_v1(uuid, text) from public, anon;
grant execute on function public.pos_anular_venta_v1(uuid, text) to authenticated, service_role;
