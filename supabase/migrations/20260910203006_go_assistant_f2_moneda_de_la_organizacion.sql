-- Corrección: la venta escribía `payments.currency = 'COP'` cableado.
--
-- Para una organización que factura en dólares eso no es un detalle de formato:
-- guarda un importe en USD etiquetado como pesos, y a partir de ahí la
-- conciliación y los informes mienten. El ERP ya sabe la moneda
-- (`organization_currencies.is_base`), solo había que preguntársela.
--
-- La moneda llega como parámetro y no se resuelve dentro de la función a
-- propósito: quien llama ya la resolvió con la cadena de respaldo completa
-- (base -> preferencia -> USD -> primera), y repetir esa lógica en SQL crearía
-- una segunda fuente de verdad que diverge.

create or replace function public.assistant_register_sale(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item          jsonb;
  v_product_id    integer;
  v_qty           numeric;
  v_price         numeric;
  v_track         boolean;
  v_name          text;
  v_available     numeric;
  v_subtotal      numeric := 0;
  v_sale_id       uuid;
  v_customer_id   uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_paid          numeric := coalesce(nullif(p_payload->>'paid_amount','')::numeric, 0);
  v_method        text := nullif(trim(p_payload->>'payment_method'), '');
  -- Moneda de la organizacion, resuelta por el llamador. 'USD' es el ultimo
  -- recurso, el mismo que usa el resto del ERP.
  v_currency      text := upper(coalesce(nullif(trim(p_payload->>'currency'), ''), 'USD'));
  v_status        text;
  v_pay_status    text;
  v_lineas        integer := 0;
  v_resumen       jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  if v_customer_id is not null and not exists (
    select 1 from public.customers
     where id = v_customer_id and organization_id = p_organization_id) then
    raise exception 'CUSTOMER_NOT_IN_ORG' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'quantity','')::numeric;

    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;

    select name, track_stock into v_name, v_track
      from public.products
     where id = v_product_id and organization_id = p_organization_id;

    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;

    v_price := nullif(v_item->>'unit_price','')::numeric;
    if v_price is null then
      select price into v_price
        from public.product_prices
       where product_id = v_product_id and effective_to is null
       order by effective_from desc limit 1;
    end if;
    if v_price is null then
      raise exception 'PRICE_UNKNOWN:%', v_name using errcode = '22023';
    end if;
    if v_price < 0 then
      raise exception 'PRICE_INVALID' using errcode = '22023';
    end if;

    if v_track then
      select coalesce(sum(qty_on_hand - coalesce(qty_reserved,0)), 0) into v_available
        from public.stock_levels
       where product_id = v_product_id and branch_id = p_branch_id;
      if v_available < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%:%:%', v_name, v_available, v_qty using errcode = '22023';
      end if;
    end if;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id, 'nombre', v_name,
      'cantidad', v_qty, 'precio', v_price, 'total', v_price * v_qty);
  end loop;

  if v_paid <= 0 then
    v_status := 'pending'; v_pay_status := 'pending';
  elsif v_paid >= v_subtotal then
    v_status := 'paid'; v_pay_status := 'paid';
  else
    v_status := 'partial'; v_pay_status := 'partial';
  end if;

  insert into public.sales (
    organization_id, branch_id, customer_id, user_id,
    subtotal, tax_total, total, balance,
    status, payment_status, notes, source, include_in_cash_register
  ) values (
    p_organization_id, p_branch_id, v_customer_id, p_user_id,
    v_subtotal, 0, v_subtotal, greatest(v_subtotal - v_paid, 0),
    v_status, v_pay_status,
    nullif(trim(p_payload->>'notes'), ''), 'pos', false
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_resumen) loop
    v_product_id := (v_item->>'product_id')::integer;
    v_qty := (v_item->>'cantidad')::numeric;
    v_price := (v_item->>'precio')::numeric;

    insert into public.sale_items (sale_id, product_id, quantity, unit_price, total)
    values (v_sale_id, v_product_id, v_qty, v_price, v_price * v_qty);

    select track_stock into v_track from public.products where id = v_product_id;
    if v_track then
      insert into public.stock_movements (
        organization_id, branch_id, product_id, direction, qty, source, source_id, note, updated_by
      ) values (
        p_organization_id, p_branch_id, v_product_id, 'out', v_qty, 'sale', v_sale_id::text,
        'Venta registrada por GO Assistant', p_user_id
      );

      update public.stock_levels
         set qty_on_hand = qty_on_hand - v_qty, updated_at = now()
       where product_id = v_product_id and branch_id = p_branch_id and lot_id is null;
    end if;
  end loop;

  if v_paid > 0 then
    insert into public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency, status, created_by
    ) values (
      p_organization_id, p_branch_id, 'sale', v_sale_id::text,
      coalesce(v_method, 'cash'), v_paid, v_currency, 'completed', p_user_id
    );
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'lineas', v_lineas, 'subtotal', v_subtotal,
    'total', v_subtotal, 'pagado', v_paid, 'saldo', greatest(v_subtotal - v_paid, 0),
    'estado', v_status, 'moneda', v_currency, 'detalle', v_resumen
  );
end;
$$;

revoke all on function public.assistant_register_sale(integer, integer, uuid, jsonb) from public;
grant execute on function public.assistant_register_sale(integer, integer, uuid, jsonb) to authenticated, service_role;