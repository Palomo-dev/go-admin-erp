-- Finanzas fase 1. No reescribe asientos, cuentas bancarias, mapeos ni períodos.
-- El backfill de datos históricos está en supabase/propuestas/ y no se aplica aquí.
--
-- 1. Una cuenta de título (clase, grupo, o cualquiera con hijas por prefijo o
--    parent_code) no recibe asientos manuales. Antes solo se miraba parent_code,
--    y 1.053 cuentas de 4 dígitos no apuntan a su padre: el grupo «2» sí recibía
--    movimientos.
-- 2. Una cuenta bancaria nueva exige PUC de detalle clase 11 (1110, 1120…).
--    La transferencia sin ese código deja un fallo, no un crédito a 5105.
-- 3. El egreso de caja ya no debita 4105. Va a la cuenta del concepto (clase 5,
--    proveedor, banco o préstamo). 4105 queda solo para la venta de contado.
-- 4. El ajuste de banco no usa 5105: la salida es gasto financiero y la entrada
--    acredita 4250.
-- 5. tax_account_mapping rechaza una cuenta que no está en el plan. El IVA se
--    vincula con fn_impuesto_vincular_cuenta.
-- 6. fn_alertas_contables lista los fallos abiertos y los asientos sin líneas.

-- ---------------------------------------------------------------------------
-- Cuentas de título
-- ---------------------------------------------------------------------------
create or replace function public.fn_es_cuenta_de_titulo(p_organization_id integer, p_cuenta text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select length(coalesce(p_cuenta, '')) < 4
      or exists (
        select 1
          from public.chart_of_accounts h
         where h.organization_id = p_organization_id
           and coalesce(h.is_active, true)
           and h.account_code <> p_cuenta
           and (
             h.parent_code = p_cuenta
             or left(h.account_code, length(p_cuenta)) = p_cuenta
           )
      );
$$;

comment on function public.fn_es_cuenta_de_titulo(integer, text) is
  'True si la cuenta es clase o grupo (menos de 4 dígitos) o agrupa a otra por parent_code o por prefijo del código.';

revoke all on function public.fn_es_cuenta_de_titulo(integer, text) from public, anon, authenticated;

create or replace function public.fn_primera_cuenta_detalle(p_organization_id integer, p_codigos text[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.account_code
    from unnest(p_codigos) with ordinality as preferida(codigo, orden)
    join public.chart_of_accounts c
      on c.organization_id = p_organization_id
     and c.account_code = preferida.codigo
     and coalesce(c.is_active, true)
   where not public.fn_es_cuenta_de_titulo(p_organization_id, c.account_code)
   order by preferida.orden
   limit 1;
$$;

comment on function public.fn_primera_cuenta_detalle(integer, text[]) is
  'Primera cuenta de la lista que existe, está activa y no es de título.';

revoke all on function public.fn_primera_cuenta_detalle(integer, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Asiento manual: también bloquea títulos por prefijo
-- ---------------------------------------------------------------------------
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
    if public.fn_es_cuenta_de_titulo(p_organization_id, v_cuenta) then
      raise exception 'CUENTA_DE_TITULO: % agrupa otras cuentas y no recibe movimientos', v_cuenta
        using errcode = '22023';
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

revoke all on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) from public, anon;
grant execute on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Movimiento de caja: el egreso no debita 4105
-- ---------------------------------------------------------------------------
create or replace function public.fn_asiento_movimiento_caja(
  p_organization_id integer,
  p_tipo text,
  p_concept_code text
)
returns table (accion text, debito text, credito text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  if v_clave = 'cambioEfectivo' then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_primera_cuenta_detalle(p_organization_id, array['1105']);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then public.fn_primera_cuenta_detalle(p_organization_id, array['2105', '2205'])
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then public.fn_primera_cuenta_detalle(p_organization_id, array['1110'])
      when 'retiroEfectivo' then public.fn_primera_cuenta_detalle(p_organization_id, array['1110'])
      -- gastosMenores, gastoOperativo, compraInsumos, otroEgreso y cualquier
      -- egreso sin concepto: clase 5. Nunca 4105.
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then public.fn_primera_cuenta_detalle(p_organization_id, array['4105'])
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then public.fn_primera_cuenta_detalle(p_organization_id, array['2105'])
    else public.fn_primera_cuenta_detalle(p_organization_id, array['4250', '4295', '4210'])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$$;

comment on function public.fn_asiento_movimiento_caja(integer, text, text) is
  'Débito y crédito de un movimiento de caja. El egreso va a clase 5 o a la cuenta del concepto; 4105 solo si el concepto es ventaContadoEspecial.';

revoke all on function public.fn_asiento_movimiento_caja(integer, text, text) from public, anon, authenticated;

create or replace function public.fn_auto_journal_cash_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry_id integer;
  v_session record;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
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
$$;

revoke all on function public.fn_auto_journal_cash_movement() from public, anon;
grant execute on function public.fn_auto_journal_cash_movement() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transferencia bancaria: sin PUC no se usa la regla que acredita 5105
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_journal_bank_transfer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry_id integer;
  v_origen record;
  v_destino record;
  v_debito text;
  v_credito text;
  v_anulada boolean;
begin
  v_anulada := false;
  if tg_op = 'UPDATE' then
    v_anulada := (new.status = 'cancelled'
                  and coalesce(old.status, '') in ('completed', 'confirmed'));
  end if;

  if not v_anulada and (new.status is null or new.status not in ('completed', 'confirmed')) then
    return new;
  end if;

  select account_code, branch_id into v_origen
    from public.bank_accounts where id = new.from_account_id and organization_id = new.organization_id;

  select account_code, branch_id into v_destino
    from public.bank_accounts where id = new.to_account_id and organization_id = new.organization_id;

  if v_origen is null or v_destino is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id,
      coalesce(new.transfer_date, new.created_at),
      'bank_transfers', new.id::text, 'transfer:bank:' || new.id::text,
      null, null, new.amount,
      'cuenta_banco_sin_puc',
      'La transferencia necesita el PUC de las dos cuentas bancarias (1110/1120). No se usa la regla de ajuste que acredita 5105.');
    return new;
  end if;

  v_debito := nullif(btrim(v_destino.account_code), '');
  v_credito := nullif(btrim(v_origen.account_code), '');

  if v_debito is null or v_credito is null or v_debito = v_credito
     or left(v_debito, 1) in ('4', '5') or left(v_credito, 1) in ('4', '5') then
    perform public.fn_log_journal_failure(
      new.organization_id, coalesce(v_destino.branch_id, new.branch_id),
      coalesce(new.transfer_date, new.created_at),
      'bank_transfers', new.id::text, 'transfer:bank:' || new.id::text,
      v_debito, v_credito, new.amount,
      'cuenta_banco_sin_puc',
      'La transferencia necesita el PUC de las dos cuentas bancarias (1110/1120). No se usa la regla de ajuste que acredita 5105.');
    return new;
  end if;

  if v_anulada then
    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := coalesce(v_origen.branch_id, new.branch_id, 0),
      p_entry_date := now(),
      p_memo := 'Anulación de transferencia bancaria - ' || coalesce(new.reference, new.id::text),
      p_source := 'bank_transfers',
      p_source_id := new.id::text,
      p_debit_account := v_credito,
      p_credit_account := v_debito,
      p_amount := abs(new.amount),
      p_created_by := new.created_by,
      p_fact_key := 'transfer:bank:' || new.id::text || ':void'
    );
  else
    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := coalesce(v_destino.branch_id, new.branch_id, 0),
      p_entry_date := coalesce(new.transfer_date, new.created_at, now()),
      p_memo := 'Transferencia bancaria - ' || coalesce(new.reference, new.id::text),
      p_source := 'bank_transfers',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := abs(new.amount),
      p_created_by := new.created_by,
      p_fact_key := 'transfer:bank:' || new.id::text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.fn_auto_journal_bank_transfer() from public, anon;
grant execute on function public.fn_auto_journal_bank_transfer() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ajuste / movimiento bancario: no acreditar 5105
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_importe numeric := abs(coalesce(new.amount, 0));
begin
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
    v_banco := public.fn_primera_cuenta_detalle(new.organization_id, array['1110', '1105']);
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
$$;

revoke all on function public.fn_auto_journal_bank() from public, anon;
grant execute on function public.fn_auto_journal_bank() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cuenta bancaria: el PUC es obligatorio al crear y se valida al asignarlo
-- ---------------------------------------------------------------------------
create or replace function public.fn_bank_account_exige_puc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := nullif(btrim(coalesce(new.account_code, '')), '');
  v_tipo text;
begin
  if tg_op = 'UPDATE' and v_codigo is not distinct from nullif(btrim(coalesce(old.account_code, '')), '') then
    return new;
  end if;
  if v_codigo is null then
    raise exception 'cuenta_contable_requerida' using errcode = '22023';
  end if;

  select c.type into v_tipo
    from public.chart_of_accounts c
   where c.organization_id = new.organization_id
     and c.account_code = v_codigo
     and coalesce(c.is_active, true);
  if not found then
    raise exception 'cuenta_no_existe' using errcode = '22023';
  end if;
  if v_tipo is distinct from 'asset' or left(v_codigo, 2) <> '11' then
    raise exception 'cuenta_no_es_bancaria' using errcode = '22023';
  end if;
  if public.fn_es_cuenta_de_titulo(new.organization_id, v_codigo) then
    raise exception 'cuenta_de_titulo' using errcode = '22023';
  end if;
  new.account_code := v_codigo;
  return new;
end;
$$;

revoke all on function public.fn_bank_account_exige_puc() from public, anon, authenticated;

drop trigger if exists trg_bank_accounts_exige_puc on public.bank_accounts;
create trigger trg_bank_accounts_exige_puc
  before insert or update of account_code on public.bank_accounts
  for each row execute function public.fn_bank_account_exige_puc();

-- ---------------------------------------------------------------------------
-- Impuestos: la cuenta del mapeo tiene que existir y no ser de título
-- ---------------------------------------------------------------------------
create or replace function public.fn_tax_account_mapping_validar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = new.organization_id
       and c.account_code = new.account_code
       and coalesce(c.is_active, true)
  ) then
    raise exception 'cuenta_no_existe: % no está en el plan de la organización', new.account_code
      using errcode = '22023';
  end if;
  if public.fn_es_cuenta_de_titulo(new.organization_id, new.account_code) then
    raise exception 'cuenta_de_titulo: % agrupa otras cuentas', new.account_code
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_tax_account_mapping_validar() from public, anon, authenticated;

drop trigger if exists trg_tax_account_mapping_validar on public.tax_account_mapping;
create trigger trg_tax_account_mapping_validar
  before insert or update of account_code on public.tax_account_mapping
  for each row execute function public.fn_tax_account_mapping_validar();

create or replace function public.fn_impuesto_vincular_cuenta(
  p_organization_id integer,
  p_id uuid,
  p_cuenta text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cuenta text := nullif(btrim(coalesce(p_cuenta, '')), '');
  v_tax record;
  v_tipo text;
begin
  perform public.fn_impuestos_exigir_gestion(p_organization_id);

  select ot.id, ot.template_id, ot.kind
    into v_tax
    from public.organization_taxes ot
   where ot.id = p_id
     and ot.organization_id = p_organization_id
     and ot.kind = 'tax';
  if v_tax.id is null then
    raise exception 'impuesto_no_encontrado' using errcode = 'P0002';
  end if;
  if v_cuenta is null then
    raise exception 'cuenta_requerida' using errcode = '22023';
  end if;

  select c.type into v_tipo
    from public.chart_of_accounts c
   where c.organization_id = p_organization_id
     and c.account_code = v_cuenta
     and coalesce(c.is_active, true);
  if not found then
    raise exception 'cuenta_no_existe' using errcode = '22023';
  end if;
  if v_tipo is distinct from 'liability' then
    raise exception 'cuenta_no_es_pasivo' using errcode = '22023';
  end if;

  if v_tax.template_id is not null then
    insert into public.tax_account_mapping (
      organization_id, tax_template_id, organization_tax_id, account_code, account_type, is_active
    ) values (
      p_organization_id, v_tax.template_id, p_id, v_cuenta, 'tax_payable', true
    )
    on conflict on constraint tax_account_mapping_organization_id_tax_template_id_key
    do update set account_code = excluded.account_code,
                  organization_tax_id = excluded.organization_tax_id,
                  account_type = excluded.account_type,
                  is_active = true,
                  updated_at = now();
  else
    insert into public.tax_account_mapping (
      organization_id, organization_tax_id, account_code, account_type, is_active
    ) values (
      p_organization_id, p_id, v_cuenta, 'tax_payable', true
    )
    on conflict on constraint tax_account_mapping_organization_id_organization_tax_id_key
    do update set account_code = excluded.account_code,
                  account_type = excluded.account_type,
                  is_active = true,
                  updated_at = now();
  end if;

  return jsonb_build_object('id', p_id, 'cuenta', v_cuenta);
end;
$$;

comment on function public.fn_impuesto_vincular_cuenta(integer, uuid, text) is
  'Vincula un impuesto (IVA) a una cuenta de pasivo que exista en el plan. El IVA por pagar es 2408.';

revoke all on function public.fn_impuesto_vincular_cuenta(integer, uuid, text) from public, anon;
grant execute on function public.fn_impuesto_vincular_cuenta(integer, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fallos abiertos y asientos sin líneas, de la organización de la sesión
-- ---------------------------------------------------------------------------
create or replace function public.fn_alertas_contables(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fallos jsonb;
  v_sin_lineas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select coalesce(jsonb_agg(x.fila), '[]'::jsonb) into v_fallos
    from (
      select jsonb_build_object(
        'id', f.id,
        'fecha', f.entry_date,
        'origen', f.source,
        'origen_id', f.source_id,
        'debito', f.debit_account,
        'credito', f.credit_account,
        'importe', f.amount,
        'motivo', f.reason,
        'detalle', f.detail
      ) as fila
        from public.journal_entry_failures f
       where f.organization_id = p_organization_id
         and f.resolved_at is null
       order by f.created_at desc
       limit 50
    ) x;

  select coalesce(jsonb_agg(x.fila), '[]'::jsonb) into v_sin_lineas
    from (
      select jsonb_build_object(
        'id', je.id,
        'fecha', je.entry_date,
        'memo', je.memo,
        'origen', je.source,
        'publicado', je.posted
      ) as fila
        from public.journal_entries je
       where je.organization_id = p_organization_id
         and not exists (
           select 1 from public.journal_lines jl where jl.journal_entry_id = je.id
         )
       order by je.id desc
       limit 50
    ) x;

  return jsonb_build_object(
    'fallos', v_fallos,
    'asientos_sin_lineas', v_sin_lineas
  );
end;
$$;

comment on function public.fn_alertas_contables(integer) is
  'Fallos contables sin resolver y asientos sin líneas de la organización. La pertenencia la exige fn_assert_acceso_org.';

revoke all on function public.fn_alertas_contables(integer) from public, anon;
grant execute on function public.fn_alertas_contables(integer) to authenticated, service_role;
