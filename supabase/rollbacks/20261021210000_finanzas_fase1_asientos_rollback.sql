-- Rollback de 20261021210000_finanzas_fase1_asientos.sql
-- La migración no modificó filas. Esto devuelve las funciones a la versión
-- anterior y quita los disparadores y funciones nuevos.
-- Los cuerpos salen de:
--   fn_auto_journal_cash_movement: 20260925130300
--   fn_auto_journal_bank_transfer: 20260923070000
--   fn_asiento_manual_crear: 20260923223116
--   fn_auto_journal_bank: definición viva al 2026-10-21 (solo estaba en el baseline)

drop trigger if exists trg_bank_accounts_exige_puc on public.bank_accounts;
drop trigger if exists trg_tax_account_mapping_validar on public.tax_account_mapping;

create or replace function public.fn_auto_journal_cash_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_session RECORD;
    v_es_entrada boolean;
    v_importe numeric;
    v_debito text;
    v_credito text;
BEGIN
    -- La salida de una devolución la contabiliza procesar_devolucion contra la
    -- cartera de la nota crédito; con la regla genérica el ingreso se
    -- reversaba dos veces.
    IF NEW.return_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT cs.organization_id, cs.branch_id
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.id = NEW.cash_session_id;

    IF v_session IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_session.organization_id
      AND source_type = 'cash_movement'
      AND event_type = 'created'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            v_session.organization_id, v_session.branch_id, NEW.created_at,
            'cash_movements', NEW.id::text, 'cash_move:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de movimiento de caja');
        RETURN NEW;
    END IF;

    v_es_entrada := COALESCE(NEW.type, 'in') IN ('in', 'deposit', 'income');
    v_importe := ABS(COALESCE(NEW.amount, 0));

    IF COALESCE(NEW.amount, 0) < 0 THEN
        v_es_entrada := NOT v_es_entrada;
    END IF;

    IF v_es_entrada THEN
        v_debito  := v_rule.debit_account_code;
        v_credito := v_rule.credit_account_code;
    ELSE
        v_debito  := v_rule.credit_account_code;
        v_credito := v_rule.debit_account_code;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_session.organization_id,
        p_branch_id := v_session.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := 'Mov. Caja: ' || COALESCE(NEW.type, '') || ' - ' || COALESCE(NEW.concept, ''),
        p_source := 'cash_movements',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_importe,
        p_fact_key := 'cash_move:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;

create or replace function public.fn_auto_journal_bank_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_origen RECORD;
    v_destino RECORD;
    v_debito text;
    v_credito text;
    v_anulada boolean;
BEGIN
    -- OLD solo existe en UPDATE, y plpgsql evalúa la expresión entera: hay que
    -- separarlo en dos pasos o el disparador revienta en el INSERT.
    v_anulada := false;
    IF TG_OP = 'UPDATE' THEN
        v_anulada := (NEW.status = 'cancelled'
                      AND COALESCE(OLD.status, '') IN ('completed', 'confirmed'));
    END IF;

    IF NOT v_anulada AND (NEW.status IS NULL OR NEW.status NOT IN ('completed', 'confirmed')) THEN
        RETURN NEW;
    END IF;

    SELECT account_code, branch_id INTO v_origen
    FROM bank_accounts WHERE id = NEW.from_account_id;

    SELECT account_code, branch_id INTO v_destino
    FROM bank_accounts WHERE id = NEW.to_account_id;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'bank'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, COALESCE(v_destino.branch_id, NEW.branch_id),
            COALESCE(NEW.transfer_date, NEW.created_at),
            'bank_transfers', NEW.id::text, 'transfer:bank:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de bancos');
        RETURN NEW;
    END IF;

    -- Entra en la cuenta destino, sale de la origen.
    v_debito  := COALESCE(v_destino.account_code, v_rule.debit_account_code);
    v_credito := COALESCE(v_origen.account_code,  v_rule.credit_account_code);

    IF v_anulada THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(v_origen.branch_id, NEW.branch_id, 0),
            p_entry_date := now(),
            p_memo := 'Anulación de transferencia bancaria - ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'bank_transfers',
            p_source_id := NEW.id::text,
            p_debit_account := v_credito,
            p_credit_account := v_debito,
            p_amount := ABS(NEW.amount),
            p_created_by := NEW.created_by,
            p_fact_key := 'transfer:bank:' || NEW.id::text || ':void'
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := COALESCE(v_destino.branch_id, NEW.branch_id, 0),
            p_entry_date := COALESCE(NEW.transfer_date, NEW.created_at, now()),
            p_memo := 'Transferencia bancaria - ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'bank_transfers',
            p_source_id := NEW.id::text,
            p_debit_account := v_debito,
            p_credit_account := v_credito,
            p_amount := ABS(NEW.amount),
            p_created_by := NEW.created_by,
            p_fact_key := 'transfer:bank:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_default_branch integer;
BEGIN
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'bank'
      AND event_type = 'adjusted'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'bank'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;
    END IF;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')');
        RETURN NEW;
    END IF;

    SELECT branch_id INTO v_branch_id
    FROM bank_accounts
    WHERE id = NEW.bank_account_id;

    SELECT MIN(id) INTO v_default_branch FROM branches WHERE organization_id = NEW.organization_id;
    v_branch_id := COALESCE(v_branch_id, v_default_branch);

    IF NEW.amount > 0 THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.trans_date, NEW.created_at, now()),
            p_memo := 'Trans. Bancaria - ' || COALESCE(NEW.description, NEW.transaction_type),
            p_source := 'bank_transactions',
            p_source_id := NEW.id::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := ABS(NEW.amount)
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.trans_date, NEW.created_at, now()),
            p_memo := 'Trans. Bancaria - ' || COALESCE(NEW.description, NEW.transaction_type),
            p_source := 'bank_transactions',
            p_source_id := NEW.id::text,
            p_debit_account := v_rule.credit_account_code,
            p_credit_account := v_rule.debit_account_code,
            p_amount := ABS(NEW.amount)
        );
    END IF;

    RETURN NEW;
END;
$function$;

create or replace function public.fn_asiento_manual_crear(
  p_organization_id integer,
  p_branch_id integer,
  p_fecha timestamptz,
  p_memo text,
  p_lineas jsonb,
  p_publicar boolean default true,
  p_currency_code text default 'COP',
  p_exchange_rate numeric default 1,
  p_base_currency_code text default 'COP'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_entry_id integer;
  v_linea jsonb;
  v_debe numeric := 0;
  v_haber numeric := 0;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  v_tasa numeric := coalesce(nullif(p_exchange_rate, 0), 1);
  v_dia date;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: crear asientos manuales requiere el permiso finance.create' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b
                                         where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'LINEAS_INSUFICIENTES: un asiento necesita al menos dos líneas' using errcode = '22023';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cuenta := v_linea->>'account_code';
    v_d := coalesce((v_linea->>'debit')::numeric, 0);
    v_c := coalesce((v_linea->>'credit')::numeric, 0);
    if v_d < 0 or v_c < 0 or (v_d > 0 and v_c > 0) or (v_d = 0 and v_c = 0) then
      raise exception 'LINEA_INVALIDA: cada línea va al débito o al crédito, con importe positivo (cuenta %)', v_cuenta
        using errcode = '22023';
    end if;
    if not exists (select 1 from public.chart_of_accounts a
                    where a.organization_id = p_organization_id and a.account_code = v_cuenta
                      and coalesce(a.is_active, true)) then
      raise exception 'CUENTA_INEXISTENTE: %', v_cuenta using errcode = '22023';
    end if;
    if exists (select 1 from public.chart_of_accounts h
                where h.organization_id = p_organization_id and h.parent_code = v_cuenta) then
      raise exception 'CUENTA_NO_ES_DE_DETALLE: % tiene subcuentas; use una de ellas', v_cuenta using errcode = '22023';
    end if;
    v_debe := v_debe + v_d;
    v_haber := v_haber + v_c;
  end loop;

  if round(v_debe, 2) <> round(v_haber, 2) then
    raise exception 'ASIENTO_DESCUADRADO: débitos % y créditos %', v_debe, v_haber using errcode = '22023';
  end if;

  v_dia := (p_fecha at time zone public.fn_timezone_for(p_organization_id, p_branch_id))::date;
  if p_publicar and not public.fn_is_period_open(p_organization_id, v_dia) then
    raise exception 'PERIODO_CERRADO: el periodo del % está cerrado', v_dia using errcode = '22023';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (p_organization_id, p_branch_id, p_fecha, nullif(trim(p_memo), ''), 'manual', null, p_publicar,
          v_uid, coalesce(p_currency_code, 'COP'), v_tasa, coalesce(p_base_currency_code, 'COP'),
          'manual:' || gen_random_uuid())
  returning id into v_entry_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         coalesce((l->>'debit')::numeric, 0) * v_tasa, coalesce((l->>'credit')::numeric, 0) * v_tasa,
         nullif(l->>'cost_center_id', '')::uuid
    from jsonb_array_elements(p_lineas) l;

  return v_entry_id;
end;
$$;


revoke all on function public.fn_auto_journal_cash_movement() from public, anon;
grant execute on function public.fn_auto_journal_cash_movement() to authenticated, service_role;

revoke all on function public.fn_auto_journal_bank_transfer() from public, anon;
grant execute on function public.fn_auto_journal_bank_transfer() to authenticated, service_role;

revoke all on function public.fn_auto_journal_bank() from public, anon;
grant execute on function public.fn_auto_journal_bank() to authenticated, service_role;

revoke all on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) from public, anon;
grant execute on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) to authenticated;

drop function if exists public.fn_impuesto_vincular_cuenta(integer, uuid, text);
drop function if exists public.fn_alertas_contables(integer);
drop function if exists public.fn_asiento_movimiento_caja(integer, text, text);
drop function if exists public.fn_bank_account_exige_puc();
drop function if exists public.fn_tax_account_mapping_validar();
drop function if exists public.fn_primera_cuenta_detalle(integer, text[]);
drop function if exists public.fn_es_cuenta_de_titulo(integer, text);
