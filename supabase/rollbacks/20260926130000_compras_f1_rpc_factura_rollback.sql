-- Rollback de 20260926130000_compras_f1_rpc_factura.sql
--
-- Restaura las versiones anteriores de `fn_void_purchase_invoice`,
-- `confirm_purchase_invoice`, `assistant_register_purchase_invoice` y
-- `fn_retro_journal_purchases`, y borra las RPC nuevas de la factura de compra.
--
-- ADVERTENCIAS:
-- - El CHECK de `stock_movements.source` vuelve a la lista sin `purchase_void`.
--   Si ya hay movimientos `purchase_void` (anulaciones hechas con la v2), el
--   `add constraint` falla: decidir antes qué hacer con esas filas (no se
--   borran aquí). Con el CHECK viejo, anular una compra recibida vuelve a fallar.
-- - `fn_retro_journal_purchases` vuelve a ser ejecutable por `authenticated` y a
--   contabilizar borradores: es el estado anterior, con su defecto.
-- - No revierte datos: facturas, CxP, kardex y documentos soporte creados con las
--   funciones nuevas se quedan.

drop function if exists public.fn_factura_compra_desde_oc(uuid);
drop function if exists public.fn_factura_compra_eliminar_borrador(uuid);
drop function if exists public.fn_factura_compra_recepcionar(uuid);
drop function if exists public.fn_factura_compra_confirmar(uuid, boolean, boolean);
drop function if exists public.fn_factura_compra_guardar(integer, jsonb);
drop function if exists public.fn_siguiente_numero_compra(integer);
drop function if exists public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid);
drop function if exists public.fn_fc_recepcionar_int(uuid);
drop function if exists public.fn_fc_crear_ds_int(uuid, uuid);
drop function if exists public.fn_fc_guardar_int(integer, jsonb, uuid);
drop function if exists public.fn_fc_recalcular_saldo(uuid);

alter table public.stock_movements drop constraint if exists stock_movements_source_check;
alter table public.stock_movements add constraint stock_movements_source_check check (source = any (array[
  'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss', 'production', 'initial', 'web_sale', 'mesa_sale',
  'invoice_sale', 'folio_item', 'room_consumption', 'web_order', 'purchase_order', 'purchase_invoice', 'invoice_void',
  'credit_note', 'web_refund', 'folio_item_reversal', 'transfer_out', 'transfer_in'
]::text[]));

CREATE OR REPLACE FUNCTION public.confirm_purchase_invoice(invoice_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invoice_record RECORD;
BEGIN
  perform public.fn_assert_acceso_org((select ip.organization_id from public.invoice_purchase ip where ip.id = invoice_id_param));
  -- Verificar que la factura exista y esté en draft
  SELECT * INTO invoice_record FROM invoice_purchase WHERE id = invoice_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura de compra no encontrada con ID: %', invoice_id_param;
  END IF;

  IF invoice_record.status != 'draft' THEN
    RAISE EXCEPTION 'La factura de compra con ID: % no está en estado borrador', invoice_id_param;
  END IF;

  -- Actualizar la factura a received
  UPDATE invoice_purchase
  SET
    status = 'received',
    updated_at = NOW()
  WHERE id = invoice_id_param;

  -- Asegurar que la cuenta por pagar esté actualizada
  UPDATE accounts_payable
  SET
    status = 'pending',
    updated_at = NOW()
  WHERE invoice_id = invoice_id_param;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_void_purchase_invoice(p_invoice_id uuid, p_reason text DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_inv public.invoice_purchase%ROWTYPE;
  v_pay_count int;
  v_item RECORD;
  v_sl RECORD;
  v_orig_entry RECORD;
  v_new_entry_id integer;
BEGIN
  perform public.fn_assert_acceso_org((select ip.organization_id from public.invoice_purchase ip where ip.id = p_invoice_id));
  SELECT * INTO v_inv FROM public.invoice_purchase WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura de compra no encontrada'; END IF;
  IF v_inv.status = 'void' THEN RAISE EXCEPTION 'La factura ya está anulada'; END IF;

  -- Bloquear si hay pagos registrados
  SELECT COUNT(*) INTO v_pay_count FROM public.payments
   WHERE (source = 'invoice_purchase' AND source_id::text = p_invoice_id::text)
      OR (source = 'account_payable' AND source_id::text IN (
            SELECT id::text FROM public.accounts_payable WHERE invoice_id = p_invoice_id));
  IF v_pay_count > 0 THEN
    RAISE EXCEPTION 'No se puede anular: la factura tiene pagos registrados';
  END IF;

  -- Reversar inventario si la factura fue recibida
  IF v_inv.status = 'received' THEN
    FOR v_item IN
      SELECT product_id, qty, unit_price FROM public.invoice_items
      WHERE (invoice_id = p_invoice_id OR invoice_purchase_id = p_invoice_id)
        AND product_id IS NOT NULL AND COALESCE(qty, 0) > 0
    LOOP
      SELECT id, qty_on_hand INTO v_sl FROM public.stock_levels
       WHERE product_id = v_item.product_id AND branch_id = v_inv.branch_id;
      IF FOUND THEN
        UPDATE public.stock_levels
          SET qty_on_hand = qty_on_hand - v_item.qty, updated_at = now()
          WHERE id = v_sl.id;
      END IF;
      INSERT INTO public.stock_movements(
        organization_id, branch_id, product_id, direction, qty, unit_cost, source, source_id, note, updated_by)
      VALUES (
        v_inv.organization_id, v_inv.branch_id, v_item.product_id, 'out', v_item.qty, v_item.unit_price,
        'purchase_void', p_invoice_id::text, 'Anulación factura ' || COALESCE(v_inv.number_ext, ''), p_user);
    END LOOP;
  END IF;

  -- Cuenta por pagar a 0
  UPDATE public.accounts_payable SET balance = 0, updated_at = now() WHERE invoice_id = p_invoice_id;

  -- Reversa contable ESPEJO del asiento de compra original (incluye IVA)
  SELECT je.id, je.organization_id, je.branch_id
    INTO v_orig_entry
  FROM public.journal_entries je
  WHERE je.source = 'invoice_purchase'
    AND je.source_id = p_invoice_id::text
    AND je.memo LIKE 'Compra %'
  ORDER BY je.id DESC
  LIMIT 1;

  IF v_orig_entry.id IS NOT NULL THEN
    -- Cabecera de la reversa
    INSERT INTO public.journal_entries(
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by)
    VALUES (
      v_orig_entry.organization_id, v_orig_entry.branch_id, now(),
      'Anulación factura de compra ' || COALESCE(v_inv.number_ext, ''),
      'invoice_purchase', p_invoice_id::text, true, p_user)
    RETURNING id INTO v_new_entry_id;

    -- Líneas espejo (débito<->crédito) del asiento original
    INSERT INTO public.journal_lines(journal_entry_id, account_code, description, debit, credit)
    SELECT v_new_entry_id, jl.account_code,
           'Reversa - ' || jl.description,
           jl.credit, jl.debit
    FROM public.journal_lines jl
    WHERE jl.journal_entry_id = v_orig_entry.id;
  END IF;

  -- Anular la factura
  UPDATE public.invoice_purchase
  SET status = 'void',
      balance = 0,
      notes = COALESCE(notes, '') ||
        CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN E'\n[ANULADA] ' || p_reason ELSE E'\n[ANULADA]' END,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assistant_register_purchase_invoice(p_organization_id integer, p_branch_id integer, p_user_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $function$
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
              left(nullif(p_payload->'supplier'->>'dv',''), 1),
              case when v_nit is not null then 'nit' else null end, 'company', true)
      returning id into v_supplier_id;
      v_new_supplier := true;
    end if;
  end if;

  if exists (select 1 from public.invoice_purchase
              where organization_id = p_organization_id and supplier_id = v_supplier_id
                and upper(trim(number_ext)) = upper(v_number) and status <> 'void') then
    raise exception 'DUPLICATE_INVOICE:%', v_number using errcode = '23505';
  end if;

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

  insert into public.invoice_purchase (
    organization_id, branch_id, supplier_id, number_ext, issue_date, due_date, currency,
    subtotal, tax_total, total, balance, status, created_by, notes, payment_method, tax_included
  ) values (
    p_organization_id, p_branch_id, v_supplier_id, v_number, v_issue,
    coalesce(v_due, v_issue + interval '30 days'), v_currency,
    v_subtotal, v_tax_total, v_total, v_total, 'received', p_user_id,
    nullif(trim(p_payload->>'notes'),''), v_pay_method, v_tax_included
  ) returning id into v_invoice_id;

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

  select total into v_total from public.invoice_purchase where id = v_invoice_id;
  update public.invoice_purchase set balance = v_total where id = v_invoice_id;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_retro_journal_purchases()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_purchase RECORD;
    v_rule RECORD;
    v_entry_id integer;
    v_count integer := 0;
BEGIN
    FOR v_purchase IN
        SELECT inv.id, inv.organization_id, inv.branch_id, inv.number_ext,
               inv.issue_date, inv.subtotal, inv.tax_total, inv.total,
               inv.created_at
        FROM invoice_purchase inv
        WHERE NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source = 'invoice_purchase'
              AND je.source_id = inv.id::text
              AND je.organization_id = inv.organization_id
        )
    LOOP
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_purchase.organization_id
          AND source_type = 'purchase'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            CONTINUE;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := v_purchase.organization_id,
            p_branch_id := v_purchase.branch_id,
            p_entry_date := COALESCE(v_purchase.issue_date, v_purchase.created_at),
            p_memo := 'Compra ' || COALESCE(v_purchase.number_ext, v_purchase.id::text),
            p_source := 'invoice_purchase',
            p_source_id := v_purchase.id::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := v_purchase.total,
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN v_purchase.tax_total ELSE 0 END
        );

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Facturas de compra contabilizadas: %', v_count;
END;
$function$;

grant execute on function public.fn_retro_journal_purchases() to authenticated;
grant execute on function public.fn_void_purchase_invoice(uuid, text, uuid) to authenticated;
grant execute on function public.confirm_purchase_invoice(uuid) to authenticated;
grant execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) to authenticated;
