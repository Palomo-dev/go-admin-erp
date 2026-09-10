-- GO Assistant — Fase 2: registrar una venta y un ajuste de inventario.
--
-- POR QUE RPC Y NO LOS SERVICIOS EXISTENTES. El plan decia "las herramientas
-- llaman a los servicios existentes". No se sostiene: `posService`,
-- `adjustmentService`, `purchaseOrderService` y los demas importan
-- `@/lib/supabase/config` —el cliente de NAVEGADOR— y `posService` ademas guarda
-- carritos en `localStorage` y la organizacion en estado estatico de clase.
-- Ninguno se puede invocar desde un route handler sin caer justo en el bug C4
-- que la Fase 0 arreglo. Refactorizarlos tocaria el POS en produccion.
--
-- Estas RPC no tocan nada de la UI existente, y son transaccionales, que es lo
-- que §5.3 invariante 4 exige de todos modos.
--
-- SECURITY INVOKER (el default): la RLS del usuario sigue aplicando dentro.
--
-- Nota sobre efectos automaticos (verificado en pg_trigger): `sales`,
-- `sale_items`, `stock_movements`, `payments` e `inventory_adjustments` tienen
-- disparadores que generan los asientos contables (fn_auto_journal_*). No hay
-- que replicarlos aqui. Lo que SI hay que hacer a mano es mover `stock_levels`:
-- `stock_movements` NO tiene disparador que lo actualice.

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

  -- PASO 1: validar TODAS las lineas y calcular el total ANTES de escribir nada.
  -- Asi una linea invalida no deja media venta creada (aunque la transaccion lo
  -- revertiria igual, fallar antes da un mensaje mucho mas util).
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

    -- El precio lo pone el CATALOGO, no el modelo. Solo se acepta uno explicito
    -- si viene, y aun asi debe ser positivo: que una IA invente el precio de
    -- venta es justo lo que no puede pasar.
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

  -- PASO 2: estado segun lo pagado.
  if v_paid <= 0 then
    v_status := 'pending'; v_pay_status := 'pending';
  elsif v_paid >= v_subtotal then
    v_status := 'paid'; v_pay_status := 'paid';
  else
    v_status := 'partial'; v_pay_status := 'partial';
  end if;

  -- PASO 3: la venta. `include_in_cash_register = false` a proposito: esta venta
  -- no nace de una sesion de caja abierta en el POS, y meterla en el arqueo
  -- descuadraria el cierre del cajero.
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

  -- PASO 4: lineas, movimiento de stock y existencias.
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

      -- `stock_movements` NO tiene disparador que mueva `stock_levels`.
      update public.stock_levels
         set qty_on_hand = qty_on_hand - v_qty, updated_at = now()
       where product_id = v_product_id and branch_id = p_branch_id and lot_id is null;
    end if;
  end loop;

  -- PASO 5: el pago, si lo hubo. Sus disparadores cierran la cuenta por cobrar
  -- y generan el asiento.
  if v_paid > 0 then
    insert into public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency, status, created_by
    ) values (
      p_organization_id, p_branch_id, 'sale', v_sale_id::text,
      coalesce(v_method, 'cash'), v_paid, 'COP', 'completed', p_user_id
    );
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'lineas', v_lineas, 'subtotal', v_subtotal,
    'total', v_subtotal, 'pagado', v_paid, 'saldo', greatest(v_subtotal - v_paid, 0),
    'estado', v_status, 'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_register_sale(integer, integer, uuid, jsonb) is
  'GO Assistant: registra una venta con sus lineas, movimiento de stock y pago, en una sola transaccion.';


create or replace function public.assistant_create_adjustment(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_product_id  integer;
  v_qty         numeric;
  v_name        text;
  v_type        text := lower(coalesce(nullif(trim(p_payload->>'type'),''), ''));
  v_reason      text := nullif(trim(p_payload->>'reason'), '');
  v_adj_id      integer;
  v_lineas      integer := 0;
  v_resumen     jsonb := '[]'::jsonb;
  v_direction   text;
begin
  if v_type not in ('gain','loss') then
    raise exception 'TYPE_INVALID' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  v_direction := case when v_type = 'gain' then 'in' else 'out' end;

  -- Validacion completa antes de escribir.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'quantity','')::numeric;
    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    select name into v_name from public.products
     where id = v_product_id and organization_id = p_organization_id;
    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;
    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id, 'nombre', v_name, 'cantidad', v_qty);
  end loop;

  insert into public.inventory_adjustments (
    organization_id, branch_id, type, reason, status, created_by, notes
  ) values (
    p_organization_id, p_branch_id, v_type, v_reason, 'posted', p_user_id,
    nullif(trim(p_payload->>'notes'), '')
  ) returning id into v_adj_id;

  for v_item in select * from jsonb_array_elements(v_resumen) loop
    v_product_id := (v_item->>'product_id')::integer;
    v_qty := (v_item->>'cantidad')::numeric;

    insert into public.adjustment_items (inventory_adjustment_id, product_id, quantity)
    values (v_adj_id, v_product_id, v_qty);

    insert into public.stock_movements (
      organization_id, branch_id, product_id, direction, qty, source, source_id, note, updated_by
    ) values (
      p_organization_id, p_branch_id, v_product_id, v_direction, v_qty, 'adjustment',
      v_adj_id::text, v_reason, p_user_id
    );

    -- Igual que en la venta: `stock_levels` se mueve a mano.
    if exists (select 1 from public.stock_levels
                where product_id = v_product_id and branch_id = p_branch_id and lot_id is null) then
      update public.stock_levels
         set qty_on_hand = qty_on_hand + (case when v_type = 'gain' then v_qty else -v_qty end),
             updated_at = now()
       where product_id = v_product_id and branch_id = p_branch_id and lot_id is null;
    else
      insert into public.stock_levels (product_id, branch_id, qty_on_hand)
      values (v_product_id, p_branch_id, case when v_type = 'gain' then v_qty else -v_qty end);
    end if;
  end loop;

  return jsonb_build_object(
    'adjustment_id', v_adj_id, 'tipo', v_type, 'lineas', v_lineas,
    'motivo', v_reason, 'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) is
  'GO Assistant: registra un ajuste de inventario documentado con sus lineas y movimientos.';

-- `anon` no ejecuta nada de esto. Revocar de PUBLIC, no del rol: EXECUTE se
-- concede a PUBLIC por defecto y `anon` hereda de ahi.
revoke all on function public.assistant_register_sale(integer, integer, uuid, jsonb) from public;
revoke all on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) from public;
grant execute on function public.assistant_register_sale(integer, integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.assistant_create_adjustment(integer, integer, uuid, jsonb) to authenticated, service_role;
