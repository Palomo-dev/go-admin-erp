-- Devuelve la caja, el banco y la vista previa al lookup anterior.
-- La caja de concepto vuelve a fn_cuenta_por_clave / 1105, sin crear auxiliar.
-- No borra asientos ya contabilizados por el reintento.

do $rb_caja$
declare
  v_src text;
  v_nuevo text;
  v_actual text := $old$
  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);$old$;
  v_anterior text := $new$
  v_caja := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'caja'),
    public.fn_primera_cuenta_detalle(p_organization_id, array['1105'])
  );$new$;
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_asiento_movimiento_caja'
     and pg_get_function_identity_arguments(p.oid) = 'p_organization_id integer, p_tipo text, p_concept_code text';
  if v_src is null then
    raise exception 'fn_asiento_movimiento_caja no está';
  end if;
  if position(v_actual in v_src) = 0 then
    if position('fn_cuenta_por_clave(p_organization_id, null, ''caja'')' in v_src) > 0 then
      return;
    end if;
    raise exception 'no está el lookup nuevo de caja';
  end if;
  v_nuevo := replace(v_src, v_actual, v_anterior);
  execute 'create or replace function public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text) returns table(accion text, debito text, credito text) language plpgsql stable security definer set search_path to public, pg_temp as $fn$'
    || v_nuevo || '$fn$';
end;
$rb_caja$;

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_session record;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
  v_tesoreria text;
  v_debito text;
  v_credito text;
  v_fallo text;
begin
  if new.return_id is not null then
    return new;
  end if;

  select cs.organization_id, cs.branch_id
    into v_session
    from public.cash_sessions cs
   where cs.id = new.cash_session_id;

  if v_session is null then
    return new;
  end if;

  v_es_entrada := coalesce(new.type, 'in') in ('in', 'deposit', 'income');
  v_importe := abs(coalesce(new.amount, 0));
  if coalesce(new.amount, 0) < 0 then
    v_es_entrada := not v_es_entrada;
  end if;
  if v_importe <= 0 then
    return new;
  end if;

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_tesoreria := public.fn_primera_cuenta_detalle(v_session.organization_id, array['1105']);
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
      from public.fn_asiento_tesoreria_elegido(
        v_session.organization_id,
        case when v_es_entrada then 'in' else 'out' end,
        new.cuenta_contable,
        v_tesoreria
      ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        v_session.organization_id, v_session.branch_id, new.created_at,
        'cash_movements', new.id::text, 'cash_move:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := v_session.organization_id,
      p_branch_id := v_session.branch_id,
      p_entry_date := new.created_at,
      p_memo := 'Mov. Caja: ' || coalesce(new.type, '') || ' - ' || coalesce(new.concept, ''),
      p_source := 'cash_movements',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'cash_move:' || new.id::text,
      p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)) end,
      p_cuenta_sin_centro := v_tesoreria
    );
    return new;
  end if;

  select a.accion, a.debito, a.credito
    into v_asiento
    from public.fn_asiento_movimiento_caja(
      v_session.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.concept_code
    ) a;

  if v_asiento.accion = 'omitir' then
    return new;
  end if;

  if v_asiento.accion is distinct from 'asiento' or v_asiento.debito is null or v_asiento.credito is null then
    perform public.fn_log_journal_failure(
      v_session.organization_id, v_session.branch_id, new.created_at,
      'cash_movements', new.id::text, 'cash_move:' || new.id::text,
      v_asiento.debito, v_asiento.credito, v_importe,
      'sin_cuenta', 'El egreso no tiene cuenta de gasto (clase 5) ni la del concepto; no se debita 4105');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := v_session.organization_id,
    p_branch_id := v_session.branch_id,
    p_entry_date := new.created_at,
    p_memo := 'Mov. Caja: ' || coalesce(new.type, '') || ' - ' || coalesce(new.concept, ''),
    p_source := 'cash_movements',
    p_source_id := new.id::text,
    p_debit_account := v_asiento.debito,
    p_credit_account := v_asiento.credito,
    p_amount := v_importe,
    p_fact_key := 'cash_move:' || new.id::text
  );

  return new;
end;
$fn$;

create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_importe numeric := abs(coalesce(new.amount, 0));
  v_es_entrada boolean;
begin
  if new.organization_id is not null then
    perform public.fn_assert_acceso_org(new.organization_id);
  end if;
  if v_importe <= 0 then
    return new;
  end if;

  select branch_id, nullif(btrim(account_code), '')
    into v_branch_id, v_banco
  from public.bank_accounts
  where id = new.bank_account_id
    and organization_id = new.organization_id;

  select min(id) into v_default_branch from public.branches where organization_id = new.organization_id;
  v_branch_id := coalesce(v_branch_id, v_default_branch);

  if v_banco is null or public.fn_es_cuenta_de_titulo(new.organization_id, v_banco) then
    v_banco := coalesce(
      public.fn_cuenta_por_clave(new.organization_id, v_branch_id, 'bancos'),
      public.fn_primera_cuenta_detalle(new.organization_id, array['1110', '1105'])
    );
  end if;

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_es_entrada := case
      when new.transaction_type in ('deposit', 'interest') then true
      when new.transaction_type in ('withdrawal', 'fee') then false
      else coalesce(new.amount, 0) >= 0
    end;
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
    from public.fn_asiento_tesoreria_elegido(
      new.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.cuenta_contable,
      v_banco
    ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
        'bank_transactions', new.id::text, 'bank:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := coalesce(new.trans_date, new.created_at, now()),
      p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
      p_source := 'bank_transactions',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'bank:' || new.id::text,
      p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)) end,
      p_cuenta_sin_centro := v_banco
    );
    return new;
  end if;

  if new.amount < 0 then
    v_debito := public.fn_primera_cuenta_detalle(new.organization_id, array['5305', '5195', '5135']);
    v_credito := v_banco;
  else
    v_debito := v_banco;
    v_credito := public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']);
  end if;

  if v_debito is null or v_credito is null
     or left(v_debito, 1) = '4'
     or left(v_credito, 1) = '5' then
    perform public.fn_log_journal_failure(
      new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
      'bank_transactions', new.id::text, 'bank:' || new.id::text,
      v_debito, v_credito, v_importe,
      'sin_cuenta', 'El ajuste de banco no usa 5105 ni 4105 y no encontró cuenta de detalle');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch_id,
    p_entry_date := coalesce(new.trans_date, new.created_at, now()),
    p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
    p_source := 'bank_transactions',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := v_importe,
    p_fact_key := 'bank:' || new.id::text
  );

  return new;
end;
$fn$;

create or replace function public.fn_vista_previa_asiento_tesoreria(
  p_organization_id integer,
  p_tipo text,
  p_fuente text,
  p_bank_account_id integer,
  p_cuenta text
)
returns table (debito text, credito text, fallo text, cuenta_tesoreria text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tesoreria text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_fuente = 'bank' then
    select nullif(btrim(account_code), '')
      into v_tesoreria
      from public.bank_accounts
     where id = p_bank_account_id
       and organization_id = p_organization_id;
    if v_tesoreria is null or public.fn_es_cuenta_de_titulo(p_organization_id, v_tesoreria) then
      v_tesoreria := public.fn_primera_cuenta_detalle(p_organization_id, array['1110', '1105']);
    end if;
  else
    v_tesoreria := public.fn_primera_cuenta_detalle(p_organization_id, array['1105']);
  end if;

  return query
  select a.debito, a.credito, a.fallo, v_tesoreria
    from public.fn_asiento_tesoreria_elegido(
      p_organization_id, p_tipo, p_cuenta, v_tesoreria
    ) a;
end;
$fn$;
