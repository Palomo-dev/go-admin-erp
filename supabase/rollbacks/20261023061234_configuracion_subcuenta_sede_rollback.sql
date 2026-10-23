-- Devuelve el orden anterior: el movimiento de inventario vuelve a mapear
-- 1405 y 6105 a la subcuenta de sucursal ANTES del asiento, y la venta POS y
-- la factura vuelven a pasar la cuenta de la regla sin esa resolución.
-- Con configuración distinta de la cuenta base, un movimiento nuevo vuelve a
-- ignorarla. No borra asientos, movimientos de inventario, ventas ni filas de
-- configuración. No reclasifica lo ya publicado.

create or replace function pg_temp.reemplazar_exacto(
  p_def text,
  p_viejo text,
  p_nuevo text,
  p_etiqueta text,
  p_veces integer
) returns text
language plpgsql
as $r$
declare
  v_veces integer;
begin
  if coalesce(p_viejo, '') = '' then
    raise exception 'fragmento vacío: %', p_etiqueta;
  end if;
  v_veces := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
  if v_veces is distinct from p_veces then
    raise exception 'fragmento % aparece % veces (se esperaban %)', p_etiqueta, v_veces, p_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$r$;

do $rb$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure);
  if position('configuracion_antes_de_sede' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$    v_debit_account text;
    v_credit_account text;
    v_fallo text;
BEGIN$old$,
      $new$    v_debit_account text;
    v_credit_account text;
BEGIN$new$,
      'variables inventario',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$    -- configuracion_antes_de_sede: primero la cuenta configurada, luego su subcuenta.
    SELECT r.cuenta, r.fallo INTO v_debit_account, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, NEW.branch_id, 'stock_movements', 'debito', v_rule.debit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
        'stock_movements', NEW.id::text, NULL, v_debit_account, v_rule.credit_account_code, v_amount,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_credit_account, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, NEW.branch_id, 'stock_movements', 'credito', v_rule.credit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
        'stock_movements', NEW.id::text, NULL, v_debit_account, v_credit_account, v_amount,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;$old$,
      $new$    -- Resolver sub-cuentas por sucursal (1405 → 1405-0X, 6105 → 6105-0X)
    SELECT sub_account_code INTO v_debit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.debit_account_code
    LIMIT 1;

    SELECT sub_account_code INTO v_credit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.credit_account_code
    LIMIT 1;

    -- Fallback a cuenta base si no hay sub-cuenta
    v_debit_account := COALESCE(v_debit_account, v_rule.debit_account_code);
    v_credit_account := COALESCE(v_credit_account, v_rule.credit_account_code);$new$,
      'mapeo inventario',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_auto_journal_sale_pos()'::regprocedure);
  if position('configuracion_antes_de_sede' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$    v_fact_key text;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
BEGIN$old$,
      $new$    v_fact_key text;
BEGIN$new$,
      'variables venta pos',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$    -- configuracion_antes_de_sede: la misma sede que usará el asiento.
    v_branch := NEW.branch_id;
    IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
      SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
    ) THEN
      SELECT id INTO v_branch FROM branches
      WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
      LIMIT 1;
      IF v_branch IS NULL THEN
        SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
      END IF;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'debito', v_rule.debit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, NEW.total,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'credito', v_rule.credit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_credito, NEW.total,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(v_branch, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,$old$,
      $new$    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(NEW.branch_id, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,$new$,
      'asiento venta pos',
      1);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.fn_auto_journal_sale()'::regprocedure);
  if position('configuracion_antes_de_sede' in v_def) > 0 then
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$    v_i integer;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
BEGIN$old$,
      $new$    v_i integer;
BEGIN$new$,
      'variables venta',
      1);
    v_def := pg_temp.reemplazar_exacto(
      v_def,
      $old$      -- configuracion_antes_de_sede: sin cuenta propia, primero la configuración.
      v_branch := NEW.branch_id;
      IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
      ) THEN
        SELECT id INTO v_branch FROM branches
        WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
        LIMIT 1;
        IF v_branch IS NULL THEN
          SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
        END IF;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'debito', v_rule.debit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'credito', v_rule.credit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_credito, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := case when NEW.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,$old$,
      $new$      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := case when NEW.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,$new$,
      'asiento venta',
      1);
    execute v_def;
  end if;

  drop function if exists public.fn_cuenta_configurada_de_sede(integer, integer, text, text, text);

  if position('configuracion_antes_de_sede' in pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure)) > 0
     or position('base_account_code = v_rule.debit_account_code' in pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure)) = 0
     or position('configuracion_antes_de_sede' in pg_get_functiondef('public.fn_auto_journal_sale_pos()'::regprocedure)) > 0
     or position('configuracion_antes_de_sede' in pg_get_functiondef('public.fn_auto_journal_sale()'::regprocedure)) > 0
     or to_regprocedure('public.fn_cuenta_configurada_de_sede(integer,integer,text,text,text)') is not null then
    raise exception 'el rollback no devolvió el mapeo anterior';
  end if;
end;
$rb$;

notify pgrst, 'reload schema';
