-- Base mínima para probar en aislado conciliación y pendientes contables.
-- Estructura leída de producción con SELECT. Sin datos de clientes.
-- Funciones reales: fn_assert_acceso_org, fn_tiene_permiso, fn_is_period_open,
-- fn_create_journal_entry, fn_publicar_redondeo_pendiente y fn_reversar_linea_sin_cuenta
-- (su md5 se compara con producción en la prueba).
-- El resto de dependencias son stubs mínimos, marcados como tales.

create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;

create table public.organizations (id integer primary key, owner_user_id uuid, created_by uuid);
create table public.organization_members (
  id bigserial primary key, organization_id integer not null, user_id uuid not null,
  is_active boolean default true, is_super_admin boolean default false, role_id integer not null default 3
);
create table public.profiles (id uuid primary key, email varchar not null, first_name varchar, last_name varchar);
create table public.branches (id integer primary key, organization_id integer not null, name varchar not null, is_main boolean default false, is_active boolean default true);
create table public.bank_accounts (
  id integer primary key, organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null, name text not null, currency char(3) default 'COP', account_code text
);
create table public.bank_transactions (
  id integer primary key, organization_id integer not null, bank_account_id integer not null,
  trans_date timestamptz, description text, amount numeric not null, reference text,
  matched_journal_line_id integer, transaction_type text not null default 'other', status text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  cuenta_contable text, centro_costo_id uuid, distribucion_id uuid
);
create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  bank_account_id integer not null references public.bank_accounts(id) on delete cascade,
  period_start date not null, period_end date not null,
  opening_balance numeric not null default 0, closing_balance numeric not null default 0,
  statement_balance numeric,
  difference numeric generated always as (closing_balance - coalesce(statement_balance, closing_balance)) stored,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'closed')),
  notes text, created_by uuid, closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint bank_reconciliations_period_unique unique (bank_account_id, period_start, period_end)
);
create table public.bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  bank_transaction_id integer references public.bank_transactions(id) on delete set null,
  match_type text not null, matched_payment_id uuid, matched_journal_line_id integer,
  amount numeric not null, is_matched boolean not null default false, match_date timestamptz,
  notes text, created_at timestamptz not null default now(),
  constraint bank_reconciliation_items_transaction_unique unique (reconciliation_id, bank_transaction_id)
);
create function public.fn_bank_reconciliations_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_bank_reconciliations_updated_at before update on public.bank_reconciliations
  for each row execute function public.fn_bank_reconciliations_updated_at();

create table public.chart_of_accounts (organization_id integer not null, account_code text not null, es_movimiento boolean default true, primary key (organization_id, account_code));
create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, year smallint not null,
  month smallint, period_type text not null, start_date date not null, end_date date not null, status text not null
);
create table public.journal_entries (
  id serial primary key, organization_id integer not null, branch_id integer, entry_date timestamptz, memo text,
  source text, source_id text, posted boolean default true, created_by uuid, fact_key text
);
create unique index journal_entries_fact_key_uq on public.journal_entries (organization_id, fact_key) where fact_key is not null;
create table public.journal_lines (
  id serial primary key, journal_entry_id integer not null references public.journal_entries(id),
  account_code text, description text, debit numeric default 0, credit numeric default 0, cost_center_id uuid,
  tercero_nit text, tercero_nombre text
);
create table public.journal_entry_failures (
  id bigserial primary key, organization_id integer not null, branch_id integer, entry_date timestamptz,
  source text, source_id text, fact_key text, debit_account text, credit_account text, amount numeric,
  reason text not null, detail text, created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_entry_id integer, resolution text, asiento_propuesto jsonb
);
alter table public.journal_entry_failures enable row level security;
create policy "Los miembros ven los rechazos de su organizacion" on public.journal_entry_failures
  for select to authenticated using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

create table public.cash_sessions (id integer primary key, organization_id integer not null, branch_id integer not null, account_code text);
create table public.cash_movements (
  id integer primary key, organization_id integer not null, cash_session_id integer not null, type text not null,
  concept text not null, amount numeric not null, created_at timestamptz default now(), return_id integer,
  concept_code text, cuenta_contable text, centro_costo_id uuid, distribucion_id uuid
);
create table public.stock_movements (id integer primary key, organization_id integer not null, branch_id integer not null);
create table public.invoice_sales (id uuid primary key, organization_id integer not null, number text, total numeric);
create table public.invoice_purchase (id uuid primary key, organization_id integer not null, branch_id integer, number_ext text, total numeric, tax_total numeric, issue_date timestamptz);

-- Stubs: permisos por tabla de prueba y dependencias contables transparentes.
create table public.permisos_prueba (user_id uuid, organization_id integer, code text);
create function public.get_user_permission_codes(p_user_id uuid, p_organization_id integer) returns text[]
language sql stable as $$
  select coalesce(array_agg(code), array[]::text[]) from public.permisos_prueba
   where user_id = p_user_id and organization_id = p_organization_id $$;
create function public.fn_timezone_for(p_organization_id integer, p_branch_id integer default null) returns text
language sql stable as $$ select 'America/Bogota'::text $$;
create function public.fn_aplicar_configuracion_contable(p_organization_id integer, p_branch_id integer, p_source text, p_debit text, p_credit text, p_tax text)
returns table (debito text, credito text, impuesto text, fallo text) language sql stable as $$
  select p_debit, p_credit, p_tax,
    case when exists (select 1 from public.chart_of_accounts c where c.organization_id = p_organization_id and c.account_code = p_debit and c.es_movimiento) then null else 'cuenta sin configurar' end $$;
create function public.fn_cuenta_iva(p_o integer, p_b integer, p_s text, p_c text) returns text language sql stable as $$ select p_c $$;
create function public.fn_puc_cuenta_de_sede(p_o integer, p_b integer, p_c text) returns text language sql stable as $$ select p_c $$;
create function public.fn_centro_para_cuenta(p_o integer, p_b integer, p_c text, p_cc uuid, p_sin text) returns uuid language sql stable as $$ select p_cc $$;
create function public.fn_centro_defecto(p_o integer, p_b integer) returns uuid language sql stable as $$ select null::uuid $$;
create function public.fn_cuenta_caja(p_o integer, p_b integer, p_c text) returns text language sql stable as $$ select '110505'::text $$;
create function public.fn_asiento_movimiento_caja(p_o integer, p_t text, p_c text)
returns table (accion text, debito text, credito text) language sql stable as $$
  select 'asentar'::text,
    case when p_t = 'out' then '519595'::text end,
    case when p_t = 'in' then '519595'::text end $$;
create function public.fn_asiento_stock_movement(p_sm public.stock_movements)
returns table (entry_id integer, fallo text, ya_existia boolean) language plpgsql as $$
declare v integer;
begin
  v := public.fn_create_journal_entry(p_sm.organization_id, p_sm.branch_id, now(), 'stock', 'stock_movements', p_sm.id::text,
    '143505', '519595', 1000::numeric, p_fact_key := 'stock_movement:' || p_sm.id);
  return query select v, case when v is null then 'sin asiento' end, false;
end $$;

-- Reversa pendiente y dobles del frente de redondeo y reversas. El doble de la línea de
-- redondeo responde según prueba_redondeo; el del núcleo de reversa conserva sus dos
-- garantías: una sola reversa por asiento y el pendiente resuelto con ella.
create table public.journal_reversa_pendiente (
  entry_id integer primary key, organization_id integer not null, failure_fact_key text not null,
  fecha_anulacion timestamptz not null, categoria text, lote text, cuentas jsonb not null default '{}'::jsonb,
  reversal_entry_id integer, created_at timestamptz not null default now(), resolved_at timestamptz,
  motivo text, created_by uuid
);
create table public.prueba_redondeo (organization_id integer primary key, cuenta text);
create function public.fn_documento_anulado(p_o integer, p_s text, p_id text) returns boolean language sql stable as $$ select false $$;
create function public.fn_validar_cuenta_movimiento(p_o integer, p_c text) returns text language sql stable as $$ select null::text $$;
create function public.fn_linea_redondeo(p_o integer, p_b integer, p_d numeric, p_c numeric, p_xd numeric, p_xc numeric) returns jsonb
language sql stable as $$
  select case
    when p_d = p_c then null
    when exists (select 1 from public.prueba_redondeo r where r.organization_id = p_o and r.cuenta is not null)
      then jsonb_build_object('pendiente', false, 'cuenta', (select cuenta from public.prueba_redondeo where organization_id = p_o), 'diferencia', p_d - p_c)
    else jsonb_build_object('pendiente', true, 'fallo', 'Falta la cuenta de redondeo')
  end $$;
create function public.fn_redondeo_insertar_linea(p_entry integer, p_red jsonb) returns void language plpgsql as $$
begin
  if p_red is null then return; end if;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (p_entry, p_red ->> 'cuenta', 'Redondeo a pesos',
          greatest(-(p_red ->> 'diferencia')::numeric, 0), greatest((p_red ->> 'diferencia')::numeric, 0));
end $$;
create function public.fn_redondeo_pendiente_registrar(p_org integer, p_branch integer, p_fecha timestamptz, p_memo text, p_source text, p_source_id text, p_fact_key text, p_created_by uuid, p_lineas jsonb, p_redondeo jsonb, p_exacto_debitos numeric, p_exacto_creditos numeric)
returns void language sql as $$ select $$;
create function public.fn_asiento_compra_aplicar_retenciones(p_entry integer, p_doc uuid, p_cuenta text) returns void language sql as $$ select $$;
create function public.fn_revertir_asiento_nucleo(p_entry_id integer, p_fecha timestamptz, p_categoria text, p_lote text, p_autor uuid, p_cuentas jsonb)
returns integer language plpgsql as $$
declare
  v_orig public.journal_entries%rowtype;
  v_rev integer;
  l record;
begin
  select * into v_orig from public.journal_entries where id = p_entry_id;
  select id into v_rev from public.journal_entries
   where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id;
  if v_rev is null then
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, fact_key)
    values (v_orig.organization_id, v_orig.branch_id, p_fecha, 'REVERSION', 'reversal', p_entry_id::text, 'reversal:' || p_entry_id)
    returning id into v_rev;
    for l in select * from public.journal_lines where journal_entry_id = p_entry_id loop
      insert into public.journal_lines (journal_entry_id, account_code, debit, credit)
      values (v_rev, coalesce(p_cuentas ->> l.id::text, l.account_code), l.credit, l.debit);
    end loop;
  end if;
  update public.journal_reversa_pendiente set reversal_entry_id = v_rev, resolved_at = now() where entry_id = p_entry_id and resolved_at is null;
  update public.journal_entry_failures set resolved_at = now(), resolved_entry_id = v_rev, resolution = 'reversa_publicada:' || v_rev
   where organization_id = v_orig.organization_id and fact_key = 'reversal:pendiente:' || p_entry_id and resolved_at is null;
  return v_rev;
end $$;

-- Función real (producción, md5 c820eddc21751c15304dffbf2877f81a).
CREATE OR REPLACE FUNCTION public.fn_assert_acceso_org(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Acceso denegado a la organización' using errcode = '42501';
    end if;
    return;
  end if;
  if p_org is not null and (
       exists (select 1 from public.organization_members om
               where om.user_id = v_uid and om.organization_id = p_org and om.is_active = true)
    or exists (select 1 from public.organizations o
               where o.id = p_org and (o.owner_user_id = v_uid or o.created_by = v_uid))
  ) then
    return;
  end if;
  raise exception 'Acceso denegado a la organización' using errcode = '42501';
end;
$function$
;

-- Función real (producción, md5 4b414948b7e275e37cfc5f4b7c151bfa).
CREATE OR REPLACE FUNCTION public.fn_tiene_permiso(p_organization_id integer, p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active)
     and p_code = any (coalesce(public.get_user_permission_codes(auth.uid(), p_organization_id), array[]::text[]));
$function$
;

-- Función real (producción, md5 184952375ef427a03d43f5bbf8d51781).
CREATE OR REPLACE FUNCTION public.fn_is_period_open(p_organization_id integer, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);

  select status into v_status
    from public.fiscal_periods
   where organization_id = p_organization_id
     and p_date between start_date and end_date
     and period_type = 'monthly'
   limit 1;

  -- Sin periodo mensual se considera abierto, salvo que lo cierre uno mayor.
  if v_status is not null and v_status <> 'open' then
    return false;
  end if;

  if exists (select 1 from public.fiscal_periods
              where organization_id = p_organization_id
                and p_date between start_date and end_date
                and period_type in ('quarterly', 'yearly')
                and status <> 'open') then
    return false;
  end if;

  return true;
end;
$function$
;

-- Función anterior a la migración (producción, md5 446cfc00b668ab52c61049c5c9a22759).
CREATE OR REPLACE FUNCTION public.fn_log_journal_failure(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_source text, p_source_id text, p_fact_key text, p_debit_account text, p_credit_account text, p_amount numeric, p_reason text, p_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO journal_entry_failures (
        organization_id, branch_id, entry_date, source, source_id, fact_key,
        debit_account, credit_account, amount, reason, detail
    ) VALUES (
        p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_debit_account, p_credit_account, p_amount, p_reason, p_detail
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo registrar el rechazo contable (%): %', p_reason, SQLERRM;
END;
$function$
;

-- Función real (producción, md5 dc75a640b2e0ced58e266e8b526c5298).
CREATE OR REPLACE FUNCTION public.fn_create_journal_entry(p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone, p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text, p_amount numeric, p_tax_account text DEFAULT NULL::text, p_tax_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid, p_tax_is_credit boolean DEFAULT false, p_fact_key text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_cuenta_sin_centro text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
  v_iva_regla text;
  v_monto_exacto numeric;
  v_impuesto_exacto numeric;
  v_neto numeric;
  v_d numeric;
  v_c numeric;
  v_red jsonb;
  v_lineas jsonb;
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

  v_iva_regla := p_tax_account;
  select * into v_cfg
  from public.fn_aplicar_configuracion_contable(
    p_organization_id, v_branch_id, p_source,
    p_debit_account, p_credit_account, p_tax_account
  );

  if v_cfg.fallo is not null then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, v_cfg.debito, v_cfg.credito, p_amount,
      'cuenta_no_configurada', v_cfg.fallo);
    return null;
  end if;

  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);
  p_credit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_credit_account);
  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  -- centro_costo_en_linea: la cuenta de banco o caja no lleva centro.
  if p_cuenta_sin_centro is not null then
    p_cuenta_sin_centro := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_cuenta_sin_centro);
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

  -- redondeo_pesos: total, impuesto y neto quedan en pesos cada uno. La diferencia va en su propia línea.
  v_monto_exacto := p_amount;
  v_impuesto_exacto := coalesce(p_tax_amount, 0);
  p_amount := round(p_amount, 0);
  p_tax_amount := round(coalesce(p_tax_amount, 0), 0);
  if p_tax_amount < 0 then
    p_tax_amount := 0;
  end if;
  if p_tax_amount > p_amount then
    p_tax_amount := p_amount;
  end if;
  if p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'El importe redondeado a pesos quedo en cero');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 then
    v_neto := greatest(round(v_monto_exacto - v_impuesto_exacto, 0), 0);
    if p_tax_is_credit then
      v_d := p_amount;
      v_c := v_neto + p_tax_amount;
    else
      v_d := v_neto + p_tax_amount;
      v_c := p_amount;
    end if;
    v_red := public.fn_linea_redondeo(p_organization_id, v_branch_id, v_d, v_c, v_monto_exacto, v_monto_exacto);
    if coalesce((v_red->>'pendiente')::boolean, false) then
      v_lineas := jsonb_build_array(
        jsonb_build_object('cuenta', p_debit_account, 'descripcion', p_memo,
          'debito', case when p_tax_is_credit then p_amount else v_neto end, 'credito', 0,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro)),
        jsonb_build_object('cuenta', p_tax_account, 'descripcion', 'IVA - ' || p_memo,
          'debito', case when p_tax_is_credit then 0 else p_tax_amount end,
          'credito', case when p_tax_is_credit then p_tax_amount else 0 end,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro)),
        jsonb_build_object('cuenta', p_credit_account, 'descripcion', p_memo, 'debito', 0,
          'credito', case when p_tax_is_credit then v_neto else p_amount end,
          'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro))
      );
      perform public.fn_redondeo_pendiente_registrar(
        p_organization_id, v_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_memo, p_created_by, v_lineas, v_red, v_monto_exacto, v_monto_exacto
      );
      return null;
    end if;
  else
    -- Sin línea de impuesto no hay nada que repartir: las dos líneas llevan el mismo total en pesos.
    v_neto := p_amount - coalesce(p_tax_amount, 0);
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
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro));

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_credit_account, p_memo, 0, v_neto, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_debit_account, p_memo, v_neto, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro));

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  end if;

  if v_red is not null then
    perform public.fn_redondeo_insertar_linea(
      v_entry_id, v_red,
      public.fn_centro_para_cuenta(p_organization_id, p_branch_id, v_red->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
    );
  end if;

  return v_entry_id;
end;
$function$;

-- Función real (producción, md5 24e61d252eb4d48a064766f7b98b4412).
create or replace function public.fn_publicar_redondeo_pendiente(p_failure_id bigint)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f public.journal_entry_failures%rowtype;
  p jsonb;
  v_entry integer;
  v_red jsonb;
  v_linea jsonb;
  v_fecha timestamptz;
  v_org integer;
  v_branch integer;
  v_credito text;
begin
  select * into f from public.journal_entry_failures where id = p_failure_id for update;
  if not found or f.reason <> 'redondeo_sin_cuenta' then
    return null;
  end if;
  if f.resolved_at is not null then
    return f.resolved_entry_id;
  end if;
  p := f.asiento_propuesto;
  if p is null then
    return null;
  end if;
  v_org := f.organization_id;
  v_branch := (p->>'branch_id')::integer;
  v_fecha := (p->>'fecha')::timestamptz;

  if f.fact_key is not null then
    select e.id into v_entry
      from public.journal_entries e
     where e.organization_id = v_org and e.fact_key = f.fact_key
     limit 1;
    if v_entry is not null then
      update public.journal_entry_failures
         set resolved_at = now(), resolved_entry_id = v_entry, resolution = 'asiento_ya_publicado'
       where id = f.id;
      return v_entry;
    end if;
  end if;

  if public.fn_documento_anulado(v_org, p->>'source', p->>'source_id') then
    update public.journal_entry_failures
       set resolved_at = now(), resolution = 'documento_anulado'
     where id = f.id;
    return null;
  end if;

  v_red := public.fn_linea_redondeo(
    v_org, v_branch,
    (p->>'debitos_en_pesos')::numeric, (p->>'creditos_en_pesos')::numeric,
    (p->>'exacto_debitos')::numeric, (p->>'exacto_creditos')::numeric
  );
  if v_red is null or coalesce((v_red->>'pendiente')::boolean, false) then
    update public.journal_entry_failures
       set detail = coalesce(v_red->>'fallo', 'El asiento propuesto ya no necesita redondeo: revísalo')
     where id = f.id;
    return null;
  end if;

  -- La fecha es la del documento. Si su periodo se cerró, sigue pendiente: no se traslada en silencio.
  if not public.fn_is_period_open(v_org, v_fecha::date) then
    update public.journal_entry_failures
       set detail = 'El periodo contable de la fecha ' || (v_fecha::date) || ' está cerrado. Reábrelo para publicar este asiento.'
     where id = f.id;
    return null;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values (
    v_org, v_branch, v_fecha, p->>'memo', p->>'source', p->>'source_id', true,
    nullif(p->>'created_by', '')::uuid, nullif(p->>'fact_key', '')
  ) returning id into v_entry;

  for v_linea in select * from jsonb_array_elements(p->'lineas') loop
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre, cost_center_id
    ) values (
      v_entry, v_linea->>'cuenta', v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0), coalesce((v_linea->>'credito')::numeric, 0),
      nullif(v_linea->>'tercero_nit', ''), nullif(v_linea->>'tercero_nombre', ''),
      nullif(v_linea->>'cost_center_id', '')::uuid
    );
  end loop;
  perform public.fn_redondeo_insertar_linea(v_entry, v_red);

  if p->>'source' = 'invoice_purchase' then
    select l->>'cuenta' into v_credito
      from jsonb_array_elements(p->'lineas') l
     order by coalesce((l->>'credito')::numeric, 0) desc
     limit 1;
    perform public.fn_asiento_compra_aplicar_retenciones(v_entry, (p->>'source_id')::uuid, v_credito);
  end if;

  update public.journal_entry_failures
     set resolved_at = now(), resolved_entry_id = v_entry, resolution = 'Publicado al configurar la cuenta de redondeo.'
   where id = f.id;
  return v_entry;
end;
$function$;

-- Función real (producción, md5 5875a191cc3af345b0908e31ec5a3260).
create or replace function public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuentas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f public.journal_entry_failures%rowtype;
  p public.journal_reversa_pendiente%rowtype;
  v_entry integer;
  v_k text;
  v_cuenta text;
  v_actual text;
  v_titulo boolean;
  v_fallo text;
  v_faltan integer;
  v_fecha timestamptz;
begin
  select * into f from public.journal_entry_failures where id = p_failure_id;
  if not found or f.reason not in ('linea_sin_cuenta', 'reversa_cuenta_titulo')
     or f.fact_key not like 'reversal:pendiente:%' then
    raise exception 'Pendiente % no es un contra-asiento pendiente', p_failure_id using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(f.organization_id);
  if auth.uid() is not null and not public.fn_tiene_permiso(f.organization_id, 'accounting.reverse') then
    raise exception 'SIN_PERMISO: resolver una reversa requiere el permiso «Revertir asientos»' using errcode = '42501';
  end if;

  v_entry := substr(f.fact_key, length('reversal:pendiente:') + 1)::integer;
  -- Mismo orden de bloqueo que el núcleo: primero el asiento.
  perform 1 from public.journal_entries where id = v_entry for update;
  select * into f from public.journal_entry_failures where id = p_failure_id for update;
  if f.resolved_at is not null then
    return f.resolved_entry_id;
  end if;
  select * into p from public.journal_reversa_pendiente where entry_id = v_entry for update;
  if not found then
    raise exception 'Sin estado de reversa pendiente para %', f.fact_key;
  end if;
  if jsonb_typeof(coalesce(p_cuentas, '{}'::jsonb)) <> 'object' then
    raise exception 'p_cuentas debe ser {"<id_línea>":"<cuenta>"}' using errcode = '22023';
  end if;

  for v_k in select jsonb_object_keys(coalesce(p_cuentas, '{}'::jsonb)) loop
    v_cuenta := nullif(btrim(p_cuentas ->> v_k), '');
    if v_cuenta is null then
      raise exception 'Cuenta vacía para la línea %', v_k using errcode = '22023';
    end if;
    select jl.account_code, c.es_movimiento is false into v_actual, v_titulo
      from public.journal_lines jl
      left join public.chart_of_accounts c
        on c.organization_id = p.organization_id and c.account_code = jl.account_code
     where jl.id = v_k::integer and jl.journal_entry_id = p.entry_id;
    if not found or not (nullif(btrim(v_actual), '') is null or v_titulo) then
      raise exception 'La línea % no está pendiente de cuenta en el asiento %', v_k, p.entry_id using errcode = '22023';
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(p.organization_id, v_cuenta);
    if v_fallo is not null then
      raise exception 'CUENTA_DE_TITULO: %', v_fallo using errcode = '22023';
    end if;
    -- Sigue siendo la misma cuenta: un auxiliar del título que tenía la línea, no otro destino.
    if v_titulo and left(v_cuenta, length(v_actual)) <> v_actual then
      raise exception 'CUENTA_NO_ES_DE_DETALLE: la cuenta % no es un auxiliar de %', v_cuenta, v_actual using errcode = '22023';
    end if;
  end loop;

  update public.journal_reversa_pendiente
     set cuentas = cuentas || coalesce(p_cuentas, '{}'::jsonb)
   where entry_id = p.entry_id
  returning * into p;

  select count(*) into v_faltan
    from public.journal_lines jl
    left join public.chart_of_accounts c
      on c.organization_id = p.organization_id and c.account_code = jl.account_code
   where jl.journal_entry_id = p.entry_id
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
     and (nullif(btrim(jl.account_code), '') is null or c.es_movimiento is false)
     and nullif(btrim(p.cuentas ->> jl.id::text), '') is null;
  if v_faltan > 0 then
    return null;
  end if;

  v_fecha := case when public.fn_is_period_open(p.organization_id, p.fecha_anulacion::date)
                  then p.fecha_anulacion else now() end;
  return public.fn_revertir_asiento_nucleo(
    p.entry_id, v_fecha, coalesce(p.categoria, 'anulacion'), coalesce(p.lote, p.entry_id::text),
    p.created_by, p.cuentas
  );
end;
$function$;

-- El md5 de cada función real debe ser el de producción, o la prueba no vale.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('fn_assert_acceso_org', 'c820eddc21751c15304dffbf2877f81a'),
      ('fn_tiene_permiso', '4b414948b7e275e37cfc5f4b7c151bfa'),
      ('fn_is_period_open', '184952375ef427a03d43f5bbf8d51781'),
      ('fn_log_journal_failure', '446cfc00b668ab52c61049c5c9a22759'),
      ('fn_create_journal_entry', 'dc75a640b2e0ced58e266e8b526c5298'),
      ('fn_publicar_redondeo_pendiente', '24e61d252eb4d48a064766f7b98b4412'),
      ('fn_reversar_linea_sin_cuenta', '5875a191cc3af345b0908e31ec5a3260')
    ) as v(nombre, esperado)
  loop
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.proname = r.nombre and p.pronamespace = 'public'::regnamespace) <> r.esperado then
      raise exception 'La copia de % no es la de producción', r.nombre;
    end if;
  end loop;
end $$;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.bank_reconciliations, public.bank_reconciliation_items to authenticated;
grant all on all tables in schema public to service_role;
alter table public.bank_reconciliations enable row level security;
create policy bank_reconciliations_org_isolation on public.bank_reconciliations
  using (organization_id in (select organization_id from public.organization_members
                              where user_id = auth.uid() and is_active = true));
alter table public.bank_reconciliation_items enable row level security;
create policy bank_reconciliation_items_org_isolation on public.bank_reconciliation_items
  using (reconciliation_id in (select id from public.bank_reconciliations));
