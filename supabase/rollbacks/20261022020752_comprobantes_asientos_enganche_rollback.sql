-- Reversa de 20261022020752_comprobantes_asientos_enganche.
--
-- Devuelve el cuerpo de las funciones de factura, compra y nota al texto
-- que estaba en produccion antes de esta fase. Hay que correrla ANTES de
-- revertir 20261022020351 y 20261022020425, porque esos cuerpos todavia
-- llaman a fn_asiento_documento_por_lineas.
--
-- No restaura valores. Los comprobantes y terceros ya grabados siguen en
-- las columnas hasta que se revierta 20261022020232.
--
-- El ayudante no usa el reemplazo de la migracion al reves: el texto viejo
-- puede seguir siendo parte del texto nuevo. Busca el fragmento nuevo y, si
-- ya no esta y el viejo si, no hace nada.

-- Reversa de 20261022060000_comprobantes_asientos.
--
-- Restaura el cuerpo de las funciones de factura, compra y nota, y el de
-- fn_asiento_manual_crear / fn_asiento_manual_publicar, al texto que estaba
-- en produccion antes de esta fase (definicion medida el 2026-10-22).
-- Luego quita columnas, tablas, disparadores y funciones nuevas.
--
-- No restaura valores. Si despues del despliegue alguien guardo una cuenta
-- en un producto, una categoria o una linea, o un consecutivo de comprobante,
-- al quitar la columna o la tabla ese valor se pierde. Los asientos ya
-- publicados no se renumeran ni se borran: sus columnas de comprobante y
-- tercero vuelven a no existir.
--
-- El ayudante no usa el reemplazo de la migracion al reves: el texto viejo
-- puede seguir siendo parte del texto nuevo. Busca el fragmento nuevo y, si
-- ya no esta y el viejo si, no hace nada.

create or replace function public.fn_fase5_revertir_cuerpo(
  p_firma regprocedure,
  p_origen text,
  p_destino text
) returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_def text := pg_get_functiondef(p_firma);
  v_veces integer;
begin
  if position(p_origen in v_def) = 0 then
    if position(p_destino in v_def) > 0 then
      return;
    end if;
    raise exception 'FRAGMENTO_NO_ENCONTRADO en %', p_firma::text;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_origen, ''))) / length(p_origen);
  if v_veces <> 1 then
    raise exception 'FRAGMENTO_AMBIGUO en % (% veces)', p_firma::text, v_veces;
  end if;
  execute replace(v_def, p_origen, p_destino);
end;
$fn$;

-- reverso 1: public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
$fase5_origen$         (l->>'tax_included')::boolean, (l->>'item_id')::uuid,
         coalesce(
           nullif(btrim(l->>'cuenta_contable'), ''),
           (select ii.cuenta_contable from public.invoice_items ii
             where ii.id = nullif(l->>'item_id', '')::uuid and ii.invoice_sales_id = v_inv.id)
         )
    from jsonb_array_elements(v_lineas) l;

  if coalesce(current_setting('app.asiento_por_lineas', true), '') = 'on' then
    perform public.fn_asiento_documento_por_lineas(v_nc_id, 'nota_credito', 'accrual:credit_note:' || v_nc_id::text);
    perform set_config('app.asiento_por_lineas', '', true);
  end if;$fase5_origen$,
$fase5_destino$         (l->>'tax_included')::boolean, (l->>'item_id')::uuid
    from jsonb_array_elements(v_lineas) l;$fase5_destino$
);

-- reverso 2: public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
$fase5_origen$    total_line, tax_rate, tax_code, discount_amount, tax_included, credited_item_id, cuenta_contable
  )
  select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer,$fase5_origen$,
$fase5_destino$    total_line, tax_rate, tax_code, discount_amount, tax_included, credited_item_id
  )
  select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer,$fase5_destino$
);

-- reverso 3: public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_nota_credito_emitir(uuid,text,jsonb,numeric,text,text,boolean,text,text,integer,text)'::regprocedure,
$fase5_origen$  v_numero := public.fn_pos_numero_nota_credito(v_inv.organization_id, v_inv.branch_id);

  if public.fn_documento_lineas_json_tienen_cuenta(v_inv.organization_id, v_lineas, 'devolucion') then
    perform set_config('app.asiento_por_lineas', 'on', true);
  end if;

  insert into public.invoice_sales (
    -- fase5-cuenta-linea nota$fase5_origen$,
$fase5_destino$  v_numero := public.fn_pos_numero_nota_credito(v_inv.organization_id, v_inv.branch_id);

  insert into public.invoice_sales ($fase5_destino$
);

-- reverso 4: public.fn_fc_guardar_int(integer,jsonb,uuid)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_fc_guardar_int(integer,jsonb,uuid)'::regprocedure,
$fase5_origen$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note, cuenta_contable
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), ''),
      nullif(btrim(v_l->>'cuenta_contable'), '')
    );
    -- fase5-cuenta-linea compra$fase5_origen$,
$fase5_destino$      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), '')
    );$fase5_destino$
);

-- reverso 5: public.fn_factura_venta_guardar(integer,uuid,jsonb)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_factura_venta_guardar(integer,uuid,jsonb)'::regprocedure,
$fase5_origen$         case when jsonb_typeof(i->'taxes') = 'array' and jsonb_array_length(i->'taxes') > 0 then i->'taxes' end,
         nullif(btrim(i->>'cuenta_contable'), '')
    from jsonb_array_elements(v_items) i;$fase5_origen$,
$fase5_destino$         case when jsonb_typeof(i->'taxes') = 'array' and jsonb_array_length(i->'taxes') > 0 then i->'taxes' end
    from jsonb_array_elements(v_items) i;$fase5_destino$
);

-- reverso 6: public.fn_factura_venta_guardar(integer,uuid,jsonb)
select public.fn_fase5_revertir_cuerpo(
  'public.fn_factura_venta_guardar(integer,uuid,jsonb)'::regprocedure,
$fase5_origen$    note, impuestos_linea, cuenta_contable
  )
  select v_id, v_id, 'sale', nullif(i->>'product_id', '')::integer, btrim(i->>'description'),
    -- fase5-cuenta-linea$fase5_origen$,
$fase5_destino$    note, impuestos_linea
  )
  select v_id, v_id, 'sale', nullif(i->>'product_id', '')::integer, btrim(i->>'description'),$fase5_destino$
);

-- reverso 7: public.fn_auto_journal_credit_note()
select public.fn_fase5_revertir_cuerpo(
  'public.fn_auto_journal_credit_note()'::regprocedure,
$fase5_origen$    if public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'sale_credit_note', NEW.id) is not null then
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
    end if;$fase5_origen$,
$fase5_destino$    v_entry_id := fn_create_journal_entry(
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
    );$fase5_destino$
);

-- reverso 8: public.fn_auto_journal_credit_note()
select public.fn_fase5_revertir_cuerpo(
  'public.fn_auto_journal_credit_note()'::regprocedure,
$fase5_origen$    IF NEW.document_type IS NULL OR NEW.document_type != 'credit_note' THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea nota: las líneas aún no existen; el emisor deja el GUC.
    IF coalesce(current_setting('app.asiento_por_lineas', true), '') = 'on' THEN
        RETURN NEW;
    END IF;$fase5_origen$,
$fase5_destino$    IF NEW.document_type IS NULL OR NEW.document_type != 'credit_note' THEN
        RETURN NEW;
    END IF;$fase5_destino$
);

-- reverso 9: public.fn_auto_journal_purchase()
select public.fn_fase5_revertir_cuerpo(
  'public.fn_auto_journal_purchase()'::regprocedure,
$fase5_origen$    if public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, 'compra') then
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
    end if;$fase5_origen$,
$fase5_destino$    v_entry_id := fn_create_journal_entry(
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
    );$fase5_destino$
);

-- reverso 10: public.fn_auto_journal_sale()
select public.fn_fase5_revertir_cuerpo(
  'public.fn_auto_journal_sale()'::regprocedure,
$fase5_origen$    if public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end) then
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
    end if;$fase5_origen$,
$fase5_destino$    v_entry_id := fn_create_journal_entry(
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
    );$fase5_destino$
);

-- reverso 11: public.fn_auto_journal_sale()
select public.fn_fase5_revertir_cuerpo(
  'public.fn_auto_journal_sale()'::regprocedure,
$fase5_origen$    IF NEW.document_type IS NOT NULL AND NEW.document_type NOT IN ('invoice', 'debit_note') THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea venta$fase5_origen$,
$fase5_destino$    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;$fase5_destino$
);


drop function if exists public.fn_fase5_revertir_cuerpo(regprocedure, text, text);
