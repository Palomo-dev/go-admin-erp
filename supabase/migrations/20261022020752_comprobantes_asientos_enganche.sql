-- Fase 5. Enganche de cuenta por linea en facturas, compras y notas.
create or replace function public.fn_fase5_reemplazar_cuerpo(
  p_firma regprocedure,
  p_viejo text,
  p_nuevo text
) returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_def text := pg_get_functiondef(p_firma);
  v_veces integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if position(p_viejo in v_def) = 0 then
    raise exception 'FRAGMENTO_NO_ENCONTRADO en %', p_firma::text;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception 'FRAGMENTO_AMBIGUO en % (% veces)', p_firma::text, v_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$fn$;

revoke all on function public.fn_fase5_reemplazar_cuerpo(regprocedure, text, text) from public, anon, authenticated;

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_auto_journal_sale()'::regprocedure,
  $viejo$    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;$viejo$,
  $nuevo$    IF NEW.document_type IS NOT NULL AND NEW.document_type NOT IN ('invoice', 'debit_note') THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea venta$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_auto_journal_sale()'::regprocedure,
  $viejo$    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Venta ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );$viejo$,
  $nuevo$    if public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end) then
      v_entry_id := public.fn_asiento_documento_por_lineas(NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end, v_fact_key);
    elsif public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id) is not null then
      perform fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
        'invoice_sales', NEW.id::text, v_fact_key,
        v_rule.debit_account_code, v_rule.credit_account_code, NEW.total,
        'tercero_requerido',
        public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id));
    else
      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := case when NEW.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
      );
    end if;$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_auto_journal_purchase()'::regprocedure,
  $viejo$    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Compra ' || COALESCE(NEW.number_ext, NEW.id::text),
        p_source := 'invoice_purchase',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := v_fact_key
    );$viejo$,
  $nuevo$    if public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, 'compra') then
      v_entry_id := public.fn_asiento_documento_por_lineas(NEW.id, 'compra', v_fact_key);
    elsif public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_purchase', NEW.id) is not null then
      perform fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
        'invoice_purchase', NEW.id::text, v_fact_key,
        v_rule.debit_account_code, v_rule.credit_account_code, NEW.total,
        'tercero_requerido',
        public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_purchase', NEW.id));
    else
      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Compra ' || COALESCE(NEW.number_ext, NEW.id::text),
        p_source := 'invoice_purchase',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := v_fact_key
      );
    end if;$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_auto_journal_credit_note()'::regprocedure,
  $viejo$    IF NEW.document_type IS NULL OR NEW.document_type != 'credit_note' THEN
        RETURN NEW;
    END IF;$viejo$,
  $nuevo$    IF NEW.document_type IS NULL OR NEW.document_type != 'credit_note' THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea nota: las líneas aún no existen; el emisor deja el GUC.
    IF coalesce(current_setting('app.asiento_por_lineas', true), '') = 'on' THEN
        RETURN NEW;
    END IF;$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_auto_journal_credit_note()'::regprocedure,
  $viejo$    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Nota Crédito ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := ABS(COALESCE(NEW.total, 0)),
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := 'accrual:credit_note:' || NEW.id::text
    );$viejo$,
  $nuevo$    if public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'sale_credit_note', NEW.id) is not null then
      perform fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
        'invoice_sales', NEW.id::text, 'accrual:credit_note:' || NEW.id::text,
        v_rule.debit_account_code, v_rule.credit_account_code, ABS(COALESCE(NEW.total, 0)),
        'tercero_requerido',
        public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'sale_credit_note', NEW.id));
    else
      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Nota Crédito ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := ABS(COALESCE(NEW.total, 0)),
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := 'accrual:credit_note:' || NEW.id::text
      );
    end if;$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_factura_venta_guardar(integer,uuid,jsonb)'::regprocedure,
  $viejo$    note, impuestos_linea
  )
  select v_id, v_id, 'sale', nullif(i->>'product_id', '')::integer, btrim(i->>'description'),$viejo$,
  $nuevo$    note, impuestos_linea, cuenta_contable
  )
  select v_id, v_id, 'sale', nullif(i->>'product_id', '')::integer, btrim(i->>'description'),
    -- fase5-cuenta-linea$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_factura_venta_guardar(integer,uuid,jsonb)'::regprocedure,
  $viejo$         case when jsonb_typeof(i->'taxes') = 'array' and jsonb_array_length(i->'taxes') > 0 then i->'taxes' end
    from jsonb_array_elements(v_items) i;$viejo$,
  $nuevo$         case when jsonb_typeof(i->'taxes') = 'array' and jsonb_array_length(i->'taxes') > 0 then i->'taxes' end,
         nullif(btrim(i->>'cuenta_contable'), '')
    from jsonb_array_elements(v_items) i;$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
  $viejo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), '')
    );$viejo$,
  $nuevo$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), '')
    );
    -- fase5-cuenta-linea compra$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
  $viejo$  v_numero := public.fn_pos_numero_nota_credito(v_inv.organization_id, v_inv.branch_id);

  insert into public.invoice_sales ($viejo$,
  $nuevo$  v_numero := public.fn_pos_numero_nota_credito(v_inv.organization_id, v_inv.branch_id);

  if public.fn_documento_lineas_json_tienen_cuenta(v_inv.organization_id, v_lineas, 'devolucion') then
    perform set_config('app.asiento_por_lineas', 'on', true);
  end if;

  insert into public.invoice_sales (
    -- fase5-cuenta-linea nota$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
  $viejo$    total_line, tax_rate, tax_code, discount_amount, tax_included, credited_item_id
  )
  select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer,$viejo$,
  $nuevo$    total_line, tax_rate, tax_code, discount_amount, tax_included, credited_item_id, cuenta_contable
  )
  select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer,$nuevo$
);

select public.fn_fase5_reemplazar_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
  $viejo$         (l->>'tax_included')::boolean, (l->>'item_id')::uuid
    from jsonb_array_elements(v_lineas) l;$viejo$,
  $nuevo$         (l->>'tax_included')::boolean, (l->>'item_id')::uuid,
         coalesce(
           nullif(btrim(l->>'cuenta_contable'), ''),
           (select ii.cuenta_contable from public.invoice_items ii
             where ii.id = nullif(l->>'item_id', '')::uuid and ii.invoice_sales_id = v_inv.id)
         )
    from jsonb_array_elements(v_lineas) l;

  if coalesce(current_setting('app.asiento_por_lineas', true), '') = 'on' then
    perform public.fn_asiento_documento_por_lineas(v_nc_id, 'nota_credito', 'accrual:credit_note:' || v_nc_id::text);
    perform set_config('app.asiento_por_lineas', '', true);
  end if;$nuevo$
);

drop function public.fn_fase5_reemplazar_cuerpo(regprocedure, text, text);
