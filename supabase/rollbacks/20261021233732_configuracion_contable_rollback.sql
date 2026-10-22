-- Rollback de 20261021233732_configuracion_contable.sql
--
-- Devuelve las tres funciones de asiento a la definición que estaba viva
-- antes de esta migración. El md5 de pg_get_functiondef era:
--   fn_create_journal_entry                      95d4dba4e6df7e43f3b9a90a9ec48c4f
--   fn_create_journal_entry_with_discount        06c27e72123bc456b0458cb9bb3fdcad
--   fn_asiento_compra_aplicar_retenciones        4913b61e2a5eb5555112e0b32ad28ce5
--
-- No restaura datos. Si ya se guardaron filas en configuracion_contable,
-- este script las borra con la tabla y no hay forma de recuperarlas.
-- No reescribe planes, reglas ni asientos: un documento ya contabilizado
-- queda con la cuenta que se usó.
--
-- Hay que ejecutarlo en una sola transacción. set local solo vale ahí.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_create_journal_entry(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text, p_amount numeric, p_tax_account text DEFAULT NULL::text, p_tax_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid, p_tax_is_credit boolean DEFAULT false, p_fact_key text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_entry_id integer;
  v_branch_id integer;
begin
  if p_fact_key is not null then
    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;

    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'Importe nulo o no positivo');
    return null;
  end if;

  if p_debit_account is null or p_credit_account is null then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'account_null', 'La regla contable no trae cuenta de debito o de credito');
    return null;
  end if;

  if p_debit_account = p_credit_account then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'same_account', 'Debito y credito sobre la misma cuenta ' || p_debit_account);
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_debit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'debit_account_missing', 'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_credit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'credit_account_missing', 'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 and not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_tax_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not fn_is_period_open(p_organization_id, p_entry_date::date) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
    return null;
  end if;

  if p_branch_id is null or p_branch_id = 0 or not exists (
    select 1 from branches where id = p_branch_id and organization_id = p_organization_id
  ) then
    select id into v_branch_id
    from branches
    where organization_id = p_organization_id and is_main = true and is_active = true
    limit 1;

    if v_branch_id is null then
      select min(id) into v_branch_id from branches where organization_id = p_organization_id;
    end if;
  else
    v_branch_id := p_branch_id;
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);
  p_credit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_credit_account);
  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  if exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in (p_debit_account, p_credit_account)
      and es_movimiento is false
  ) or (
    p_tax_account is not null and coalesce(p_tax_amount, 0) > 0 and exists (
      select 1 from chart_of_accounts
      where organization_id = p_organization_id
        and account_code = p_tax_account
        and es_movimiento is false
    )
  ) then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  begin
    insert into journal_entries (
      organization_id, branch_id, entry_date, memo,
      source, source_id, posted, created_by, fact_key
    ) values (
      p_organization_id, v_branch_id, p_entry_date, p_memo,
      p_source, p_source_id, true, p_created_by, p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    if p_fact_key is null then
      raise;
    end if;

    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;
    return v_entry_id;
  end;

  if p_tax_is_credit then
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount);
  end if;

  return v_entry_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_journal_entry_with_discount(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text, p_amount numeric, p_discount_account text, p_discount_amount numeric, p_discount_on_debit boolean, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry_id integer;
    v_branch_id integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'amount_invalid', 'Importe nulo o no positivo (con descuento)');
        RETURN NULL;
    END IF;

    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'account_null', 'La regla contable no trae cuenta de debito o de credito (con descuento)');
        RETURN NULL;
    END IF;

    IF p_discount_amount IS NULL OR p_discount_amount <= 0 OR p_discount_account IS NULL THEN
        RETURN fn_create_journal_entry(
            p_organization_id := p_organization_id,
            p_branch_id := p_branch_id,
            p_entry_date := p_entry_date,
            p_memo := p_memo,
            p_source := p_source,
            p_source_id := p_source_id,
            p_debit_account := p_debit_account,
            p_credit_account := p_credit_account,
            p_amount := p_amount,
            p_created_by := p_created_by
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_debit_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'debit_account_missing',
            'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_credit_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'credit_account_missing',
            'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_discount_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'discount_account_missing',
            'La cuenta de descuento ' || p_discount_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT fn_is_period_open(p_organization_id, p_entry_date::date) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'period_closed',
            'Periodo contable cerrado para la fecha ' || p_entry_date::date);
        RETURN NULL;
    END IF;

    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = p_organization_id;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    INSERT INTO journal_entries (
        organization_id, branch_id, entry_date, memo,
        source, source_id, posted, created_by
    ) VALUES (
        p_organization_id, v_branch_id, p_entry_date, p_memo,
        p_source, p_source_id, true, p_created_by
    ) RETURNING id INTO v_entry_id;

    IF p_discount_on_debit THEN
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, p_discount_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount + p_discount_amount);
    ELSE
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount + p_discount_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, 0, p_discount_amount);
    END IF;

    RETURN v_entry_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_asiento_compra_aplicar_retenciones(p_entry_id integer, p_invoice_id uuid, p_credit_account text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv record;
  v_ret numeric;
  v_linea integer;
  v_memo text;
  v_prev text;
  v_w record;
  v_descuadre numeric;
begin
  if p_entry_id is null then
    return;
  end if;

  select id, organization_id, branch_id, issue_date, total into v_inv
  from invoice_purchase where id = p_invoice_id;

  select coalesce(sum(w.amount), 0) into v_ret
  from invoice_purchase_withholdings w
  where w.invoice_id = p_invoice_id and w.amount > 0;

  if v_inv.id is null or v_ret <= 0 then
    return;
  end if;

  -- Solo el asiento que fn_create_journal_entry acaba de crear en esta
  -- transacción, con el crédito al proveedor todavía por el total. Un asiento
  -- publicado antes no se toca (se corrige con contra-asiento).
  select jl.id, e.memo into v_linea, v_memo
  from journal_entries e
  join journal_lines jl on jl.journal_entry_id = e.id
  where e.id = p_entry_id
    and e.organization_id = v_inv.organization_id
    and e.source = 'invoice_purchase'
    and e.source_id = p_invoice_id::text
    and e.created_at = now()
    and jl.account_code = p_credit_account
    and jl.debit = 0
    and jl.credit = v_inv.total
  order by jl.id
  limit 1;

  if v_linea is null then
    return;
  end if;

  if v_ret >= v_inv.total then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id, null, p_credit_account, v_ret,
      'withholding_exceeds_total', 'Las retenciones igualan o superan el total de la factura; el asiento queda por el total');
    return;
  end if;

  perform fn_asegurar_cuentas_retencion(v_inv.organization_id);

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  update journal_lines
     set credit = v_inv.total - v_ret, updated_at = now()
   where id = v_linea;
  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (p_entry_id, v_w.cuenta, v_w.concept || ' - ' || v_memo, 0, v_w.amount);
  end loop;

  select round(coalesce(sum(debit), 0) - coalesce(sum(credit), 0), 2) into v_descuadre
  from journal_lines where journal_entry_id = p_entry_id;
  if v_descuadre <> 0 then
    raise exception 'ASIENTO_DESCUADRADO: el asiento % de la compra % queda descuadrado en %', p_entry_id, p_invoice_id, v_descuadre
      using errcode = '22023';
  end if;
end;
$function$
;

revoke all on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) to service_role;

revoke all on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) to service_role;

revoke all on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) to service_role;

drop trigger if exists tr_zz_configuracion_contable on public.organizations;

drop function if exists public.trg_fn_sembrar_configuracion_contable();
drop function if exists public.fn_sembrar_configuracion_contable(integer);
drop function if exists public.fn_aplicar_configuracion_contable(integer, integer, text, text, text, text);
drop function if exists public.fn_resolver_cuenta_configurada(integer, integer, text, text, text);
drop function if exists public.fn_clave_cuenta_configurable(text, text, text);
drop function if exists public.fn_nombre_clave_contable(text);
drop function if exists public.fn_propuesta_configuracion_sector(integer);

drop table if exists public.configuracion_contable;
drop function if exists public.fn_configuracion_contable_validar();
