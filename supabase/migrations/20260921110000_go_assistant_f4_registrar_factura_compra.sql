-- GO Assistant — F4 cierra el círculo: de la foto de la factura a la factura
-- registrada.
--
-- `leer_documento` (F4) extrae la factura y la concilia con proveedor y
-- productos, pero no había herramienta para "subirla": el usuario se quedaba
-- con un JSON bonito y la factura sin registrar. Esta RPC hace, en UNA
-- transacción, lo mismo que hace hoy el módulo al recibir una orden de compra
-- (`purchaseOrderService.generateInvoiceFromPurchaseOrder`):
--
--   1. proveedor: existente por id, o creado por NIT+nombre si no existe;
--   2. `invoice_purchase` en `received` (dispara `fn_auto_journal_purchase`);
--   3. `invoice_items` (dispara `fn_recalc_invoice_totals`);
--   4. cuenta por pagar en `accounts_payable` (`pending`, saldo = total);
--   5. si `receive_stock`, entrada de inventario por línea con producto
--      (`stock_movements` source `purchase` + `stock_levels`), como al recibir
--      una OC. Las líneas sin producto conciliado NO mueven stock.
--
-- Duplicados: mismo proveedor + mismo `number_ext` → DUPLICATE_INVOICE. Es la
-- protección de §7.2.6 del plan, en la base y no solo en el preview.
--
-- SECURITY INVOKER: la RLS del usuario sigue aplicando. Devuelve lo necesario
-- para deshacer por compensación (anular la factura, cerrar la CxP, salida del
-- stock que entró).

create or replace function public.assistant_register_purchase_invoice(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item          jsonb;
  v_supplier_id   integer := nullif(p_payload->>'supplier_id','')::integer;
  v_supplier_name text;
  v_new_supplier  boolean := false;
  v_nit           text := nullif(regexp_replace(coalesce(p_payload->'supplier'->>'nit',''), '[^0-9]', '', 'g'), '');
  v_number        text := nullif(trim(p_payload->>'number_ext'), '');
  v_issue         timestamptz := coalesce(nullif(p_payload->>'issue_date','')::timestamptz, now());
  v_due           timestamptz := nullif(p_payload->>'due_date','')::timestamptz;
  v_currency      text := upper(coalesce(nullif(trim(p_payload->>'currency'),''), 'USD'));
  v_pay_method    text := nullif(trim(p_payload->>'payment_method'),'');
  v_tax_included  boolean := coalesce((p_payload->>'tax_included')::boolean, false);
  v_receive       boolean := coalesce((p_payload->>'receive_stock')::boolean, true);
  v_product_id    integer;
  v_qty           numeric;
  v_price         numeric;
  v_tax_rate      numeric;
  v_discount      numeric;
  v_line_base     numeric;
  v_line_tax      numeric;
  v_line_total    numeric;
  v_subtotal      numeric := 0;
  v_tax_total     numeric := 0;
  v_total         numeric := 0;
  v_invoice_id    uuid;
  v_ap_id         uuid;
  v_lineas        integer := 0;
  v_stock_lines   jsonb := '[]'::jsonb;
  v_resumen       jsonb := '[]'::jsonb;
  v_name          text;
begin
  if v_number is null then
    raise exception 'NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  -- 1. Proveedor: por id; si no, por NIT; si no, se crea con NIT + nombre.
  if v_supplier_id is not null then
    select name into v_supplier_name from public.suppliers
     where id = v_supplier_id and organization_id = p_organization_id;
    if v_supplier_name is null then
      raise exception 'SUPPLIER_NOT_IN_ORG' using errcode = 'P0002';
    end if;
  else
    if v_nit is not null then
      select id, name into v_supplier_id, v_supplier_name from public.suppliers
       where organization_id = p_organization_id
         and regexp_replace(coalesce(nit,''), '[^0-9]', '', 'g') = v_nit
       order by is_active desc nulls last, id limit 1;
    end if;
    if v_supplier_id is null then
      v_supplier_name := nullif(trim(p_payload->'supplier'->>'name'), '');
      if v_supplier_name is null then
        raise exception 'SUPPLIER_REQUIRED' using errcode = '22023';
      end if;
      insert into public.suppliers (organization_id, name, nit, dv, doc_type, supplier_type, is_active)
      values (p_organization_id, v_supplier_name, v_nit,
              -- `suppliers.dv` es `character(1)`, no integer.
              left(nullif(p_payload->'supplier'->>'dv',''), 1),
              case when v_nit is not null then 'nit' else null end, 'company', true)
      returning id into v_supplier_id;
      v_new_supplier := true;
    end if;
  end if;

  -- Duplicado: misma factura del mismo proveedor.
  if exists (select 1 from public.invoice_purchase
              where organization_id = p_organization_id and supplier_id = v_supplier_id
                and upper(trim(number_ext)) = upper(v_number) and status <> 'void') then
    raise exception 'DUPLICATE_INVOICE:%', v_number using errcode = '23505';
  end if;

  -- Líneas: se validan y se totalizan antes de escribir nada.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_name       := null;
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'qty','')::numeric;
    v_price      := nullif(v_item->>'unit_price','')::numeric;
    v_tax_rate   := coalesce(nullif(v_item->>'tax_rate','')::numeric, 0);
    v_discount   := coalesce(nullif(v_item->>'discount_amount','')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    if v_product_id is not null then
      select name into v_name from public.products
       where id = v_product_id and organization_id = p_organization_id;
      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
    end if;

    v_line_base := (v_qty * v_price) - v_discount;
    if v_tax_included then
      v_line_tax   := round(v_line_base - (v_line_base / (1 + v_tax_rate / 100)), 2);
      v_line_total := v_line_base;
      v_line_base  := v_line_base - v_line_tax;
    else
      v_line_tax   := round(v_line_base * v_tax_rate / 100, 2);
      v_line_total := v_line_base + v_line_tax;
    end if;
    v_subtotal := v_subtotal + v_line_base;
    v_tax_total := v_tax_total + v_line_tax;
    v_total := v_total + v_line_total;
    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id,
      'description', coalesce(nullif(trim(v_item->>'description'),''), v_name, 'Producto'),
      'qty', v_qty, 'unit_price', v_price, 'tax_rate', v_tax_rate,
      'discount_amount', v_discount, 'total_line', v_line_total);
  end loop;

  -- 2. La factura. `received` dispara el asiento contable de compra.
  insert into public.invoice_purchase (
    organization_id, branch_id, supplier_id, number_ext, issue_date, due_date, currency,
    subtotal, tax_total, total, balance, status, created_by, notes, payment_method, tax_included
  ) values (
    p_organization_id, p_branch_id, v_supplier_id, v_number, v_issue,
    coalesce(v_due, v_issue + interval '30 days'), v_currency,
    v_subtotal, v_tax_total, v_total, v_total, 'received', p_user_id,
    nullif(trim(p_payload->>'notes'),''), v_pay_method, v_tax_included
  ) returning id into v_invoice_id;

  -- 3. Las líneas (el disparador recalcula totales de la factura).
  for v_item in select * from jsonb_array_elements(v_resumen) loop
    insert into public.invoice_items (
      invoice_id, invoice_type, invoice_purchase_id, invoice_sales_id, product_id, description,
      qty, unit_price, tax_rate, total_line, discount_amount, tax_included
    ) values (
      v_invoice_id, 'purchase', v_invoice_id, null,
      nullif(v_item->>'product_id','')::integer, v_item->>'description',
      (v_item->>'qty')::numeric, (v_item->>'unit_price')::numeric, (v_item->>'tax_rate')::numeric,
      (v_item->>'total_line')::numeric, (v_item->>'discount_amount')::numeric, v_tax_included
    );

    -- 5. Entrada de inventario, solo con producto conciliado.
    if v_receive and nullif(v_item->>'product_id','') is not null then
      v_product_id := (v_item->>'product_id')::integer;
      v_qty := (v_item->>'qty')::numeric;
      insert into public.stock_movements (
        organization_id, branch_id, product_id, direction, qty, source, source_id, note, updated_by
      ) values (
        p_organization_id, p_branch_id, v_product_id, 'in', v_qty, 'purchase', v_invoice_id::text,
        'Entrada por compra ' || v_number, p_user_id
      );
      if exists (select 1 from public.stock_levels
                  where product_id = v_product_id and branch_id = p_branch_id and lot_id is null) then
        update public.stock_levels
           set qty_on_hand = qty_on_hand + v_qty, updated_at = now()
         where product_id = v_product_id and branch_id = p_branch_id and lot_id is null;
      else
        insert into public.stock_levels (product_id, branch_id, qty_on_hand)
        values (v_product_id, p_branch_id, v_qty);
      end if;
      v_stock_lines := v_stock_lines || jsonb_build_object('product_id', v_product_id, 'quantity', v_qty);
    end if;
  end loop;

  -- El disparador de líneas pudo recalcular total: el saldo debe coincidir.
  select total into v_total from public.invoice_purchase where id = v_invoice_id;
  update public.invoice_purchase set balance = v_total where id = v_invoice_id;

  -- 4. Cuenta por pagar, como hace el módulo.
  insert into public.accounts_payable (
    organization_id, branch_id, supplier_id, invoice_id, amount, balance, due_date, status
  ) values (
    p_organization_id, p_branch_id, v_supplier_id, v_invoice_id, v_total, v_total,
    coalesce(v_due, v_issue + interval '30 days'), 'pending'
  ) returning id into v_ap_id;

  return jsonb_build_object(
    'invoice_id', v_invoice_id, 'number_ext', v_number,
    'supplier_id', v_supplier_id, 'proveedor', v_supplier_name, 'proveedor_nuevo', v_new_supplier,
    'subtotal', v_subtotal, 'tax_total', v_tax_total, 'total', v_total, 'moneda', v_currency,
    'lineas', v_lineas, 'lineas_con_stock', jsonb_array_length(v_stock_lines),
    'accounts_payable_id', v_ap_id, 'stock_lines', v_stock_lines, 'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) is
  'GO Assistant: registra una factura de compra (proveedor, factura, lineas, CxP y entrada de stock) en una transaccion.';

revoke all on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) from public;
grant execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) to authenticated, service_role;
