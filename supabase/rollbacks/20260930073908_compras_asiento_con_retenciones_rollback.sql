-- Rollback de 20260930073908_compras_asiento_con_retenciones.
--
-- Restaura fn_auto_journal_purchase y fn_retro_journal_purchases a su cuerpo
-- anterior (crédito al proveedor por el total) y retira las funciones nuevas.
--
-- ADVERTENCIA — datos: los asientos de compra ya publicados con líneas de
-- retención NO se tocan (son inmutables; se corrigen con contra-asiento). Las
-- cuentas 2365/2367/2368 creadas por la migración solo se borran si ninguna
-- línea contable ni subcuenta las usa y conservan la descripción con que se
-- crearon (la 2365 que ya existía en 1 organización tiene otra descripción).
-- La plantilla RETEIVA_15 solo se borra si ninguna organización la activó.

create or replace function public.fn_auto_journal_purchase()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_fact_key text;
BEGIN
    IF NEW.status IS DISTINCT FROM 'received' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:purchase:' || NEW.id::text;

    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE organization_id = NEW.organization_id
          AND source = 'invoice_purchase'
          AND source_id = NEW.id::text
          AND memo LIKE 'Compra %'
    ) THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule FROM fn_regla_devengo_compra(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_purchase', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de compra');
        RETURN NEW;
    END IF;

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

    RETURN NEW;
END;
$function$;

create or replace function public.fn_retro_journal_purchases()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
        WHERE inv.status IN ('received', 'partial', 'paid')
          AND NOT EXISTS (
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

drop function if exists public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text);
drop function if exists public.fn_cuenta_retencion_compra(integer, text, text);

drop trigger if exists tr_auto_create_chart_of_accounts_zz_retenciones on public.organizations;
drop function if exists public.trg_fn_asegurar_cuentas_retencion();
drop function if exists public.fn_asegurar_cuentas_retencion(integer);

delete from public.chart_of_accounts c
where c.account_code in ('2365', '2367', '2368')
  and c.description in ('Retenciones en la fuente practicadas a proveedores, por pagar a la DIAN',
                        'ReteIVA practicado a proveedores, por pagar a la DIAN',
                        'ReteICA practicado a proveedores, por pagar al municipio')
  and not exists (select 1 from public.journal_lines jl
                  where jl.organization_id = c.organization_id and jl.account_code = c.account_code)
  and not exists (select 1 from public.chart_of_accounts h
                  where h.organization_id = c.organization_id and h.parent_code = c.account_code);

delete from public.tax_templates t
where t.code = 'RETEIVA_15'
  and not exists (select 1 from public.organization_taxes ot where ot.template_id = t.id)
  and not exists (select 1 from public.tax_account_mapping m where m.tax_template_id = t.id);
