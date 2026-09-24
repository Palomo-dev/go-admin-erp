-- Punto 1 (2026-09-24): la mesa cobra con el mismo cobro del POS.
--
-- Antes, completarVentaMesa (pedidosService.ts) reimplementaba el cobro en N
-- escrituras desde el navegador: pagos antes que la factura, cartera escrita a
-- mano, sin idempotencia (comisión y pagos duplicables al reintentar; medido:
-- 9 ventas de mesa pagadas con pagos por encima del total en 3
-- organizaciones, 7 de ellas con pagos idénticos repetidos). Y los totales de
-- la cuenta sumaban precio × cantidad + impuesto − descuento: con el impuesto
-- incluido en el precio el IVA contaba dos veces (recalcularTotalVenta,
-- generarPreCuenta y el ajuste de cantidad, que además dejaba fijo el
-- descuento).
--
-- Ahora:
--   - fn_pos_linea_totales: la regla única de la línea en SQL.
--   - fn_pos_recalcular_venta / pos_mesa_recalcular_venta: líneas y cabecera
--     de la cuenta desde sale_items (total = líneas + flete + propina).
--   - pos_cocina_ajustar_linea_mesa: descuento proporcional a la cantidad y
--     regla única; recalcula la cabecera en la misma transacción.
--   - pos_checkout_v1 'settle' con sobre.table_session_id: valida la sesión,
--     toma tasa y modo de impuesto de cada línea del cobro (sale_item_id),
--     recalcula, valida precio y descuento de las líneas (punto 3), descuenta
--     stock como 'mesa_sale' en la sucursal de la venta, rehace las líneas de
--     la factura si la cuenta cambió (sin DIAN), marca pagadas las líneas de
--     una cuenta dividida (paid_sale_item_ids, split_id) y liga la sesión. La
--     sesión la sigue cerrando pos_mesa_liberar (verifica saldo 0).
-- Parches sobre las definiciones VIVAS (otras sesiones las modifican).

-- ── Regla única de la línea en SQL (la misma de calcularLineaVenta y de ─────
-- fn_pos_validar_linea_venta) ────────────────────────────────────────────────
create or replace function public.fn_pos_linea_totales(
  p_qty numeric, p_unit_price numeric, p_discount numeric, p_tax_rate numeric, p_tax_included boolean
)
returns table (tax numeric, total numeric)
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    round(case when coalesce(p_tax_included, false) then x.n - x.n / (1 + coalesce(p_tax_rate, 0) / 100)
               else x.n * coalesce(p_tax_rate, 0) / 100 end, 2),
    case when coalesce(p_tax_included, false) then x.n
         else x.n + round(x.n * coalesce(p_tax_rate, 0) / 100, 2) end
  from (select coalesce(p_qty, 0) * coalesce(p_unit_price, 0) - coalesce(p_discount, 0) as n) x
$$;

comment on function public.fn_pos_linea_totales(numeric, numeric, numeric, numeric, boolean) is
  'Impuesto y total de una línea de venta: neto = cantidad × precio − descuento; incluido: total = neto; si no, total = neto + round(neto × tasa / 100, 2). Misma regla que calcularLineaVenta (src/lib/pos/lineaVenta.ts).';

revoke all on function public.fn_pos_linea_totales(numeric, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.fn_pos_linea_totales(numeric, numeric, numeric, numeric, boolean) to authenticated, service_role;

-- ── Totales de una venta desde sus líneas ───────────────────────────────────
-- Las líneas con modo de impuesto (sale_items.tax_included no nulo) se
-- recalculan con la regla única; la cabecera sale de la suma de las líneas
-- (total = líneas + flete + propina; saldo = total − pagado). Antes la mesa
-- sumaba precio × cantidad + impuesto − descuento: con impuesto incluido el
-- IVA contaba dos veces. Solo toca ventas pendientes (nunca una pagada o
-- anulada). Interna: la llaman pos_mesa_recalcular_venta, el ajuste de líneas
-- de la mesa y el cobro.
create or replace function public.fn_pos_recalcular_venta(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale     public.sales%rowtype;
  v_sub      numeric;
  v_tax      numeric;
  v_desc     numeric;
  v_lineas   numeric;
  v_pagado   numeric;
  v_total    numeric;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or v_sale.status not in ('pending', 'draft', 'partial') then
    return v_sale;
  end if;

  update public.sale_items si set
    tax_amount = c.tax, total = c.total, updated_at = now()
  from (
    select s2.id, t.tax, t.total
      from public.sale_items s2
      cross join lateral public.fn_pos_linea_totales(s2.quantity, s2.unit_price, s2.discount_amount, s2.tax_rate, s2.tax_included) t
     where s2.sale_id = p_sale_id and s2.tax_included is not null
  ) c
  where si.id = c.id
    and (si.tax_amount is distinct from c.tax or si.total is distinct from c.total);

  select coalesce(sum(si.total - coalesce(si.tax_amount, 0)), 0), coalesce(sum(coalesce(si.tax_amount, 0)), 0),
         coalesce(sum(coalesce(si.discount_amount, 0)), 0), coalesce(sum(si.total), 0)
    into v_sub, v_tax, v_desc, v_lineas
  from public.sale_items si
  where si.sale_id = p_sale_id and si.quantity > 0;

  select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado
  from public.payments p
  where p.organization_id = v_sale.organization_id and p.status = 'completed'
    and ((p.source = 'sale' and p.source_id = p_sale_id::text)
      or (p.source = 'invoice_sales' and p.source_id in (
            select i.id::text from public.invoice_sales i
            where i.sale_id = p_sale_id and coalesce(i.document_type, 'invoice') = 'invoice')));

  v_total := v_lineas + coalesce(v_sale.delivery_fee, 0) + coalesce(v_sale.tip_amount, 0);
  update public.sales set
    subtotal       = v_sub,
    tax_total      = v_tax,
    discount_total = v_desc,
    total          = v_total,
    balance        = greatest(0, round(v_total - v_pagado, 2)),
    updated_at     = now()
  where id = p_sale_id
  returning * into v_sale;
  return v_sale;
end;
$$;

revoke all on function public.fn_pos_recalcular_venta(uuid) from public, anon, authenticated;

-- ── RPC de la mesa: recalcular y leer los totales de su cuenta ──────────────
create or replace function public.pos_mesa_recalcular_venta(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale_id;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not exists (select 1 from public.table_sessions ts where ts.sale_id = p_sale_id) then
    raise exception 'no_es_venta_de_mesa' using errcode = '22023';
  end if;
  v_sale := public.fn_pos_recalcular_venta(p_sale_id);
  return jsonb_build_object(
    'sale_id', v_sale.id, 'status', v_sale.status,
    'subtotal', v_sale.subtotal, 'tax_total', v_sale.tax_total, 'discount_total', v_sale.discount_total,
    'delivery_fee', v_sale.delivery_fee, 'tip_amount', v_sale.tip_amount,
    'total', v_sale.total, 'balance', v_sale.balance);
end;
$$;

comment on function public.pos_mesa_recalcular_venta(uuid) is
  'Recalcula las líneas (regla única) y la cabecera de la cuenta de una mesa y devuelve sus totales. Pertenencia y sucursal en el servidor.';

revoke all on function public.pos_mesa_recalcular_venta(uuid) from public, anon;
grant execute on function public.pos_mesa_recalcular_venta(uuid) to authenticated, service_role;

do $parche$
declare
  v_oid oid := 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text)'::regprocedure);
  v_old0 text := $frag0$  v_accion     text;
begin$frag0$;
  v_new0 text := $frag0$  v_accion     text;
  v_desc_linea numeric;
  v_total_linea numeric;
begin$frag0$;
  v_old1 text := $frag1$    v_tax_unit := coalesce(v_si.tax_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1);
    v_tax := round(v_tax_unit * p_nueva_cantidad, 2);
    update public.sale_items
    set quantity = p_nueva_cantidad,
        total = v_si.unit_price * p_nueva_cantidad + v_tax,
        tax_amount = v_tax,
        updated_at = now()
    where id = v_si.id;$frag1$;
  v_new1 text := $frag1$    -- Punto 1 (2026-09-24): el descuento escala con la cantidad (antes quedaba
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
  v_old2 text := $frag2$  return jsonb_build_object(
    'accion', v_accion, 'sale_id', v_sale.id,$frag2$;
  v_new2 text := $frag2$  -- Cabecera de la cuenta desde sus líneas, en la misma transacción.
  perform public.fn_pos_recalcular_venta(v_sale.id);

  return jsonb_build_object(
    'accion', v_accion, 'sale_id', v_sale.id,$frag2$;
begin
  if position($m$fn_pos_recalcular_venta$m$ in v_def) > 0 then
    raise notice 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): el cambio ya estaba aplicado; nada que hacer';
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
  if position($m$fn_pos_recalcular_venta$m$ in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text): no quedó con el cambio';
  end if;
end $parche$;

do $parche$
declare
  v_oid oid := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old0 text := $frag0$  v_lineas_nuevas boolean := false;
begin$frag0$;
  v_new0 text := $frag0$  v_lineas_nuevas boolean := false;
  v_mesa        uuid;       -- settle de una mesa: su sesión
begin$frag0$;
  v_old1 text := $frag1$    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= 0 then
      raise exception 'venta_ya_pagada' using errcode = '22023';
    end if;
$frag1$;
  v_new1 text := $frag1$    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= 0 then
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
  v_old2 text := $frag2$      customer_id     = coalesce(customer_id, v_customer),$frag2$;
  v_new2 text := $frag2$      table_session_id = coalesce(table_session_id, v_mesa),
      customer_id     = coalesce(customer_id, v_customer),$frag2$;
  v_old3 text := $frag3$          v_org, v_branch, v_si.product_id, v_si.quantity, 'sale', v_sale_id::text, v_si.unit_price, v_user_id$frag3$;
  v_new3 text := $frag3$          v_org, coalesce(v_sale.branch_id, v_branch), v_si.product_id, v_si.quantity,
          case when v_mesa is not null then 'mesa_sale' else 'sale' end, v_sale_id::text, v_si.unit_price, v_user_id$frag3$;
  v_old4 text := $frag4$      v_pay_ids := array_append(v_pay_ids, v_pay_id);
    end loop;
  end if;
$frag4$;
  v_new4 text := $frag4$      v_pay_ids := array_append(v_pay_ids, v_pay_id);
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
  v_old5 text := $frag5$  -- ── 11. Líneas de factura (de sale_items guardados, no del sobre) ───────$frag5$;
  v_new5 text := $frag5$  -- Mesa: si la cuenta cambió después del primer pago (platos agregados o
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
begin
  if position($m$sesion_mesa_invalida$m$ in v_def) > 0 then
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
  v_def := replace(v_def, v_old0, v_new0);
  v_def := replace(v_def, v_old1, v_new1);
  v_def := replace(v_def, v_old2, v_new2);
  v_def := replace(v_def, v_old3, v_new3);
  v_def := replace(v_def, v_old4, v_new4);
  v_def := replace(v_def, v_old5, v_new5);
  execute v_def;
  if position($m$sesion_mesa_invalida$m$ in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'public.pos_checkout_v1(jsonb): no quedó con el cambio';
  end if;
end $parche$;
