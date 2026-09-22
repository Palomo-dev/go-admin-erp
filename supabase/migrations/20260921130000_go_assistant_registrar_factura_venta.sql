-- GO Assistant — factura de venta.
--
-- Hace en UNA transacción lo que hace el formulario de Finanzas → Facturas de
-- venta → Nueva (`NuevaFacturaForm.tsx`): la venta (`sales`, source `invoice`,
-- pendiente) con sus `sale_items`, la factura (`invoice_sales`) con el
-- consecutivo `FACT-####` de la organización y sus `invoice_items`.
--
-- Estado: `draft` por defecto, como en el formulario; con `issue = true` nace
-- `issued`, y entonces los disparadores del ERP crean la cuenta por cobrar
-- (`create_account_receivable_on_invoice`) y el asiento (`fn_auto_journal_sale`).
-- Igual que el formulario, NO mueve inventario: en este ERP la factura de venta
-- no descuenta stock (lo hace la venta POS o el despacho). Se dice en la tarjeta.
--
-- El precio lo pone el catálogo si el usuario no dicta uno; el IVA es 0 salvo
-- que se indique por línea. SECURITY INVOKER: la RLS del usuario aplica.

create or replace function public.assistant_register_sales_invoice(
  p_organization_id integer,
  p_branch_id       integer,
  p_user_id         uuid,
  p_payload         jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item         jsonb;
  v_customer_id  uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_customer     text;
  v_issue        boolean := coalesce((p_payload->>'issue')::boolean, false);
  v_issue_date   timestamptz := coalesce(nullif(p_payload->>'issue_date','')::timestamptz, now());
  v_terms        integer := coalesce(nullif(p_payload->>'payment_terms','')::integer, 30);
  v_due          timestamptz := coalesce(nullif(p_payload->>'due_date','')::timestamptz, null);
  v_currency     text := upper(coalesce(nullif(trim(p_payload->>'currency'),''), 'USD'));
  v_pay_method   text := coalesce(nullif(trim(p_payload->>'payment_method'),''), 'credit');
  v_tax_included boolean := coalesce((p_payload->>'tax_included')::boolean, false);
  v_prefix       text := 'FACT';
  v_number       text;
  v_next         integer;
  v_product_id   integer;
  v_name         text;
  v_qty          numeric;
  v_price        numeric;
  v_tax_rate     numeric;
  v_discount     numeric;
  v_base         numeric;
  v_tax          numeric;
  v_line_total   numeric;
  v_subtotal     numeric := 0;
  v_tax_total    numeric := 0;
  v_total        numeric := 0;
  v_sale_id      uuid;
  v_invoice_id   uuid;
  v_lineas       integer := 0;
  v_resumen      jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.branches
                  where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if v_customer_id is not null then
    select full_name into v_customer from public.customers
     where id = v_customer_id and organization_id = p_organization_id;
    if v_customer is null then
      raise exception 'CUSTOMER_NOT_IN_ORG' using errcode = 'P0002';
    end if;
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
     or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if v_due is null then v_due := v_issue_date + make_interval(days => v_terms); end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_name       := null;
    v_product_id := nullif(v_item->>'product_id','')::integer;
    v_qty        := nullif(v_item->>'qty','')::numeric;
    v_price      := nullif(v_item->>'unit_price','')::numeric;
    v_tax_rate   := coalesce(nullif(v_item->>'tax_rate','')::numeric, 0);
    v_discount   := coalesce(nullif(v_item->>'discount_amount','')::numeric, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    if v_product_id is not null then
      select name into v_name from public.products
       where id = v_product_id and organization_id = p_organization_id;
      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
      -- El precio lo pone el catálogo si el usuario no dijo otro.
      if v_price is null then
        select price into v_price from public.product_prices
         where product_id = v_product_id and effective_to is null
         order by effective_from desc limit 1;
      end if;
      if v_price is null then
        raise exception 'PRICE_UNKNOWN:%', v_name using errcode = '22023';
      end if;
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;

    v_base := (v_qty * v_price) - v_discount;
    if v_tax_included then
      v_tax := round(v_base - (v_base / (1 + v_tax_rate / 100)), 2);
      v_line_total := v_base;
      v_base := v_base - v_tax;
    else
      v_tax := round(v_base * v_tax_rate / 100, 2);
      v_line_total := v_base + v_tax;
    end if;
    v_subtotal := v_subtotal + v_base;
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;
    v_lineas := v_lineas + 1;
    v_resumen := v_resumen || jsonb_build_object(
      'product_id', v_product_id,
      'description', coalesce(nullif(trim(v_item->>'description'),''), v_name, 'Producto'),
      'qty', v_qty, 'unit_price', v_price, 'tax_rate', v_tax_rate, 'tax_amount', v_tax,
      'discount_amount', v_discount, 'total_line', v_line_total);
  end loop;

  -- Consecutivo FACT-#### de la organización (mismo criterio que
  -- `generateInvoiceNumber`: máximo del prefijo + 1, huecos incluidos).
  select coalesce(max((regexp_match(number, '^' || v_prefix || '\s*-\s*(\d{1,7})(?:\D|$)', 'i'))[1]::integer), 0) + 1
    into v_next
    from public.invoice_sales
   where organization_id = p_organization_id and number ~* ('^' || v_prefix || '\s*-');
  v_number := v_prefix || '-' || lpad(v_next::text, 4, '0');
  while exists (select 1 from public.invoice_sales
                 where organization_id = p_organization_id and upper(trim(number)) = v_number) loop
    v_next := v_next + 1;
    v_number := v_prefix || '-' || lpad(v_next::text, 4, '0');
  end loop;

  -- 1. La venta, como hace el formulario (pendiente, origen factura).
  insert into public.sales (
    organization_id, branch_id, customer_id, user_id, sale_date,
    subtotal, tax_total, total, balance, status, payment_status, source,
    include_in_cash_register, notes, discount_total
  ) values (
    p_organization_id, p_branch_id, v_customer_id, p_user_id, v_issue_date,
    v_subtotal, v_tax_total, v_total, v_total, 'pending', 'pending', 'invoice',
    false, nullif(trim(p_payload->>'notes'),''), 0
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_resumen) loop
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_rate, tax_amount, discount_amount)
    values (v_sale_id, nullif(v_item->>'product_id','')::integer, (v_item->>'qty')::numeric,
            (v_item->>'unit_price')::numeric, (v_item->>'total_line')::numeric,
            (v_item->>'tax_rate')::numeric, (v_item->>'tax_amount')::numeric, (v_item->>'discount_amount')::numeric);
  end loop;

  -- 2. La factura. `issued` dispara cuenta por cobrar y asiento.
  insert into public.invoice_sales (
    organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date, currency,
    subtotal, tax_total, total, balance, status, payment_terms, payment_method, notes,
    tax_included, created_by, document_type
  ) values (
    p_organization_id, p_branch_id, v_customer_id, v_sale_id, v_number, v_issue_date, v_due, v_currency,
    v_subtotal, v_tax_total, v_total, v_total, case when v_issue then 'issued' else 'draft' end,
    v_terms, v_pay_method, nullif(trim(p_payload->>'notes'),''), v_tax_included, p_user_id, 'invoice'
  ) returning id into v_invoice_id;

  -- 3. Las líneas de la factura.
  for v_item in select * from jsonb_array_elements(v_resumen) loop
    insert into public.invoice_items (
      invoice_id, invoice_type, invoice_sales_id, invoice_purchase_id, product_id, description,
      qty, unit_price, tax_rate, total_line, discount_amount, tax_included
    ) values (
      v_invoice_id, 'sale', v_invoice_id, null,
      nullif(v_item->>'product_id','')::integer, v_item->>'description',
      (v_item->>'qty')::numeric, (v_item->>'unit_price')::numeric, (v_item->>'tax_rate')::numeric,
      (v_item->>'total_line')::numeric, (v_item->>'discount_amount')::numeric, v_tax_included
    );
  end loop;

  select total into v_total from public.invoice_sales where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id', v_invoice_id, 'sale_id', v_sale_id, 'number', v_number,
    'customer_id', v_customer_id, 'cliente', v_customer,
    'estado', case when v_issue then 'issued' else 'draft' end,
    'subtotal', v_subtotal, 'tax_total', v_tax_total, 'total', v_total, 'moneda', v_currency,
    'vence', v_due, 'lineas', v_lineas, 'detalle', v_resumen
  );
end;
$$;

comment on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) is
  'GO Assistant: crea venta + factura de venta (FACT-####) con lineas en una transaccion; draft o issued.';

-- Deshacer: anular. Sin pagos. `void` dispara `fn_auto_journal_void` (reversa
-- contable del ERP) y la CxC se sincroniza por `tr_update_account_receivable`.
create or replace function public.assistant_void_sales_invoice(
  p_organization_id integer,
  p_user_id         uuid,
  p_invoice_id      uuid
) returns jsonb
language plpgsql
as $$
declare
  v_inv record;
begin
  select * into v_inv from public.invoice_sales
   where id = p_invoice_id and organization_id = p_organization_id;
  if v_inv.id is null then
    raise exception 'INVOICE_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if v_inv.status = 'void' then
    return jsonb_build_object('invoice_id', p_invoice_id, 'already_void', true);
  end if;
  if exists (select 1 from public.payments
              where source in ('invoice_sales','sale') and source_id in (p_invoice_id::text, v_inv.sale_id::text)
                and status = 'completed') then
    raise exception 'VOID_HAS_PAYMENTS' using errcode = '22023';
  end if;

  update public.invoice_sales
     set status = 'void', balance = 0, updated_at = now(),
         notes = coalesce(notes, '') || E'\nAnulada desde GO Assistant (deshacer).'
   where id = p_invoice_id;
  if v_inv.sale_id is not null then
    update public.sales set status = 'void', balance = 0, updated_at = now() where id = v_inv.sale_id;
  end if;
  -- La CxC de una anulada queda a cero (el disparador la sincroniza al cambiar
  -- el estado, pero se fuerza por si la factura nunca la tuvo).
  update public.accounts_receivable set balance = 0, updated_at = now()
   where organization_id = p_organization_id and invoice_id = p_invoice_id;

  return jsonb_build_object('invoice_id', p_invoice_id, 'number', v_inv.number, 'estado_previo', v_inv.status);
end;
$$;

comment on function public.assistant_void_sales_invoice(integer, uuid, uuid) is
  'GO Assistant: anula una factura de venta sin pagos (factura y venta a void, CxC a cero).';

revoke all on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) from public;
revoke all on function public.assistant_void_sales_invoice(integer, uuid, uuid) from public;
grant execute on function public.assistant_register_sales_invoice(integer, integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.assistant_void_sales_invoice(integer, uuid, uuid) to authenticated, service_role;
