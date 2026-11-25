-- Reversión de 20261125120000_anticipo_contraentrega_2805.
--
-- 1. Los asientos de ajuste (web_order_advance:reclass:<pago>) están publicados y son inmutables:
--    no se borran. Se registra el asiento contrario (Dr 2805 / Cr 1305) con la clave
--    web_order_advance:reclass_reverso:<pago>, solo para los pagos que siguen en el pedido.
-- 2. Se quita el disparador del cruce al facturar y sus funciones de apoyo.
-- 3. fn_auto_journal_payment, fn_tercero_de_documento y fn_trg_tercero_linea_asiento vuelven a su
--    texto anterior (copiado de la base el 2026-11-25 antes de aplicar).
--
-- OJO: los recibos de anticipo que se hayan registrado DESPUÉS de aplicar la migración ya quedaron
-- en 2805; si se revierte, hay que decidir con el Contador si se llevan a 1305 con otro ajuste.

DO $reverso$
declare
  v_p record;
begin
  for v_p in
    select p.id, p.organization_id, p.branch_id, p.source_id, l.credit as monto
      from public.payments p
      join public.journal_entries e
        on e.organization_id = p.organization_id and e.fact_key = 'web_order_advance:reclass:' || p.id::text
      join public.journal_lines l on l.journal_entry_id = e.id and l.account_code like '2805%' and l.credit > 0
     where p.source = 'web_order'
  loop
    perform public.fn_create_journal_entry(
      p_organization_id := v_p.organization_id,
      p_branch_id := v_p.branch_id,
      p_entry_date := now(),
      p_memo := 'Reverso del ajuste del anticipo de contraentrega (2805 a 1305)',
      p_source := 'web_order_advance',
      p_source_id := v_p.source_id,
      p_debit_account := '2805',
      p_credit_account := '1305',
      p_amount := v_p.monto,
      p_fact_key := 'web_order_advance:reclass_reverso:' || v_p.id::text
    );
  end loop;
end
$reverso$;

DROP TRIGGER IF EXISTS trg_anticipo_pedido_web_aplicado ON public.payments;
DROP FUNCTION IF EXISTS public.fn_trg_anticipo_pedido_web_aplicado();

CREATE OR REPLACE FUNCTION public.fn_auto_journal_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_source_type text;
    v_es_cobro boolean;
    v_memo text;
    v_money_account text;
    v_counterpart text;
    v_discount numeric := 0;
    v_discount_account text;
BEGIN
    IF NEW.status IS NOT NULL AND NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.source IN ('invoice_sales', 'account_receivable', 'sale', 'web_order') THEN
        v_source_type := 'sale_payment';
        v_es_cobro := true;
        v_memo := 'Cobro recibido';
    ELSIF NEW.source IN ('invoice_purchase', 'account_payable') THEN
        v_source_type := 'purchase_payment';
        v_es_cobro := false;
        v_memo := 'Pago a proveedor';
    ELSE
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de ' || v_source_type);
        RETURN NEW;
    END IF;

    v_money_account := CASE WHEN v_es_cobro
        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)
        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)
    END;

    v_counterpart := CASE WHEN v_es_cobro
        THEN v_rule.credit_account_code
        ELSE v_rule.debit_account_code
    END;

    IF v_money_account IS NULL THEN
        v_money_account := CASE WHEN v_es_cobro
            THEN v_rule.debit_account_code
            ELSE v_rule.credit_account_code
        END;
    END IF;

    IF v_counterpart LIKE '4%' THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            v_money_account, v_counterpart, NEW.amount,
            'no_rule',
            'La regla de ' || v_source_type || ' lleva el cobro a la cuenta de ingreso ' ||
            v_counterpart || '; el ingreso ya se devengó con la venta');
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.discount_amount, 0) > 0 AND v_rule.discount_account_code IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM chart_of_accounts
           WHERE organization_id = NEW.organization_id
             AND account_code = v_rule.discount_account_code
       ) THEN
        v_discount := NEW.discount_amount;
        v_discount_account := v_rule.discount_account_code;
    END IF;

    IF v_es_cobro THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_money_account,
            p_credit_account := v_counterpart,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := false,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_counterpart,
            p_credit_account := v_money_account,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := true,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tercero_de_documento(p_tipo text, p_id uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_sales i
      left join public.customers c
        on c.id = i.customer_id
       and c.organization_id = i.organization_id
     where i.id = p_id;

    -- El devengo del POS usa el id de la venta, que no es el id de la factura.
    if not found and p_tipo = 'venta' then
      select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
             nullif(btrim(c.full_name), ''),
             s.organization_id
        into nit, nombre, v_org
        from public.sales s
        left join public.customers c
          on c.id = s.customer_id
         and c.organization_id = s.organization_id
       where s.id = p_id;
    end if;

    if nit is null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_tercero_linea_asiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_fact text;
  v_nit text;
  v_nombre text;
  v_persona uuid;
  v_sale uuid;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id, e.fact_key
    into v_source, v_source_id, v_org, v_fact
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  if new.account_code like '138020%' and new.tercero_nombre is null then
    select p.nit, p.nombre into v_nit, v_nombre
      from public.fn_procesador_pago_por_cuenta(v_org, new.account_code) p;
    if v_nombre is not null then
      new.tercero_nit := v_nit;
      new.tercero_nombre := v_nombre;
      return new;
    end if;
  end if;
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                                          'tips', 'tip_settlements') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
  elsif v_source = 'tips' then
    select tp.sale_id into v_sale from public.tips tp
     where tp.id::text = v_source_id and tp.organization_id = v_org;
    if v_sale is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('venta', v_sale) t;
    end if;
  elsif v_source = 'tip_settlements' then
    begin
      v_persona := split_part(coalesce(v_fact, ''), ':', 3)::uuid;
    exception when others then
      v_persona := null;
    end;
    if v_persona is not null then
      select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
        into v_nit, v_nombre
        from public.hr_people hp
        left join public.hr_people_identification i on i.person_id = hp.id
       where hp.organization_id = v_org and hp.user_id = v_persona
       order by (i.doc_number is null), hp.created_at
       limit 1;
      if v_nombre is null then
        select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nombre
          from public.profiles p where p.id = v_persona;
      end if;
    end if;
    if v_nit is null then
      select nullif(btrim(coalesce(o.nit, o.tax_id)), ''),
             coalesce(nullif(btrim(o.legal_name), ''), o.name)
               || case when v_nombre is not null then ' · propinas de ' || v_nombre else '' end
        into v_nit, v_nombre
        from public.organizations o where o.id = v_org;
    end if;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

DROP FUNCTION IF EXISTS public.fn_anticipo_en_2805(uuid);
DROP FUNCTION IF EXISTS public.fn_anticipo_pedido_web_de_pago(uuid);
