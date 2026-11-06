-- Prueba aislada de los hallazgos 7 (edades) y 9 (nómina y depreciación) de la auditoría del Contador.
-- Se corre SOLO en un clúster local, nunca en producción, desde la raíz del repositorio:
--
--   psql -h 127.0.0.1 -p <puerto> -U postgres -c "drop database if exists contador_h79"
--   psql -h 127.0.0.1 -p <puerto> -U postgres -c "create database contador_h79"
--   psql -h 127.0.0.1 -p <puerto> -U postgres -d contador_h79 -v ON_ERROR_STOP=1 -f supabase/tests/contador/edades_nomina_depreciacion.sql
--
-- Estructura: columnas y disparadores leídos de producción con SELECT; datos inventados, sin clientes.
-- Las migraciones se cargan tal cual con \i: se prueba lo que se aplica.
-- Las funciones ajenas a la prueba son dobles. Las de los disparadores contables son las reales.

set client_min_messages = warning;

create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
grant usage on schema auth, public to anon, authenticated, service_role;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('test.role', true), '') $$;

create table public.organizations (id integer primary key, owner_user_id uuid, created_by uuid, country_code text default 'COL', type_id integer);
create table public.branches (id integer primary key, organization_id integer not null, is_main boolean, is_active boolean default true, timezone text);
create table public.organization_members (id bigserial primary key, user_id uuid, organization_id integer, is_active boolean default true, is_super_admin boolean default false, role_id integer default 3);
create table public.member_branches (organization_member_id bigint, branch_id integer);
create table public.cost_centers (id uuid primary key, organization_id integer not null, is_active boolean default true);

create table public.chart_of_accounts (
  account_code text not null, organization_id integer not null, name text not null default 'cuenta',
  type text not null default 'asset', parent_code text, is_active boolean default true,
  es_movimiento boolean, requiere_tercero boolean not null default false,
  centro_costo_modo text not null default 'no_aplica',
  activa boolean generated always as (coalesce(is_active, true)) stored,
  primary key (organization_id, account_code)
);

create table public.accounting_rules (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, name text not null default 'regla',
  source_type text not null, event_type text not null, debit_account_code text not null, credit_account_code text not null,
  is_active boolean not null default true, priority smallint default 1
);

create table public.journal_entries (
  id serial primary key, organization_id integer not null, branch_id integer not null,
  entry_date timestamptz default now(), memo text, posted boolean default false, source text, source_id text,
  created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  currency_code varchar, exchange_rate numeric default 1.0, base_currency_code varchar, fact_key text
);
create unique index uq_journal_entries_fact_key on public.journal_entries (organization_id, fact_key) where fact_key is not null;

create table public.journal_lines (
  id serial primary key,
  journal_entry_id integer not null references public.journal_entries (id) on delete cascade,
  account_code text not null, description text, debit numeric default 0, credit numeric default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  organization_id integer not null default 0, currency_code varchar, exchange_rate numeric,
  debit_base numeric default 0, credit_base numeric default 0, cost_center_id uuid,
  tercero_nit text, tercero_nombre text,
  constraint check_debit_credit check (
    ((debit > 0) and (credit = 0)) or ((credit > 0) and (debit = 0)) or ((debit = 0) and (credit = 0))),
  constraint journal_lines_account_code_fkey foreign key (organization_id, account_code)
    references public.chart_of_accounts (organization_id, account_code) on delete restrict
);

create table public.journal_entry_failures (
  id bigserial primary key, organization_id integer not null, branch_id integer, entry_date timestamptz,
  source text, source_id text, fact_key text, debit_account text, credit_account text, amount numeric,
  reason text not null, detail text, created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_entry_id integer, resolution text,
  asiento_propuesto jsonb, attempts integer not null default 1, last_attempt_at timestamptz
);
create unique index journal_entry_failures_abierto_uq
  on public.journal_entry_failures (organization_id, fact_key, reason)
  where resolved_at is null and fact_key is not null;

create table public.finance_audit_log (
  id serial primary key, organization_id integer, entity text, entity_id text, action text, user_id uuid,
  diff jsonb, "timestamp" timestamptz default now(), reason text
);

create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, period_type text, start_date date, end_date date, status text
);

-- Cartera
create table public.customers (
  id uuid primary key, organization_id integer not null, first_name text, last_name text, company_name text, customer_type text,
  full_name text generated always as (btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) stored
);
create table public.suppliers (id integer primary key, organization_id integer not null, name text);
create table public.invoice_sales (
  id uuid primary key, organization_id integer not null, branch_id integer, customer_id uuid, sale_id uuid, number text,
  issue_date timestamptz, due_date timestamptz, total numeric, balance numeric, status text, document_type text,
  related_invoice_id uuid, created_at timestamptz default now()
);
create table public.invoice_purchase (
  id uuid primary key, organization_id integer not null, branch_id integer, supplier_id integer, number_ext text,
  issue_date timestamptz, due_date timestamptz, total numeric, balance numeric, status text, created_at timestamptz default now()
);
create table public.accounts_receivable (
  id uuid primary key, organization_id integer not null, customer_id uuid, invoice_id uuid, sale_id uuid, amount numeric, balance numeric,
  due_date timestamptz, status text, days_overdue integer default 0, branch_id integer,
  created_at timestamptz default now(), updated_at timestamptz default now(), discount_amount numeric not null default 0
);
create table public.accounts_payable (
  id uuid primary key, organization_id integer not null, supplier_id integer not null, invoice_id uuid, amount numeric, balance numeric,
  due_date timestamptz, status text, days_overdue integer default 0, branch_id integer,
  created_at timestamptz default now(), updated_at timestamptz default now(), discount_amount numeric not null default 0
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), organization_id integer, branch_id integer, source text, source_id text,
  method text default 'cash', amount numeric, status text, payment_date timestamptz, created_at timestamptz default now(),
  discount_amount numeric not null default 0, voided_at timestamptz
);
create table public.credit_notes (
  id uuid primary key, organization_id integer not null, customer_id uuid not null, amount numeric not null, balance numeric not null,
  status text not null default 'active', branch_id integer, created_at timestamptz default now()
);
create table public.credit_note_applications (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, credit_note_id uuid not null, invoice_id uuid not null,
  amount numeric not null, created_at timestamptz default now()
);

-- Nómina
create table public.payroll_periods (
  id uuid primary key, organization_id integer not null, name text, period_start date, period_end date, payment_date date,
  frequency text default 'monthly', status text, total_employees integer, total_gross numeric, total_deductions numeric,
  total_net numeric, total_employer_cost numeric, approved_at timestamptz, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.payroll_runs (
  id uuid primary key, payroll_period_id uuid not null, run_number integer not null, executed_by uuid, status text,
  is_final boolean default false
);
create table public.payroll_slips (
  id uuid primary key, payroll_run_id uuid not null, employment_id uuid not null, currency_code char(3) default 'COP',
  base_salary numeric default 0, salary_period text default 'monthly', gross_pay numeric not null,
  health_deduction numeric default 0, pension_deduction numeric default 0, solidarity_fund numeric default 0,
  tax_withholding numeric default 0, loan_deductions numeric default 0, advance_deductions numeric default 0, other_deductions numeric default 0,
  total_deductions numeric not null, net_pay numeric not null,
  employer_health numeric default 0, employer_pension numeric default 0, employer_arl numeric default 0, employer_parafiscales numeric default 0,
  employer_severance numeric default 0, employer_severance_interest numeric default 0, employer_vacation_provision numeric default 0,
  employer_bonus_provision numeric default 0, total_employer_cost numeric, status text, paid_at timestamptz, metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Activos
create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, code text not null, name text not null, description text,
  asset_type text not null default 'equipment', acquisition_date date not null, acquisition_cost numeric not null default 0,
  salvage_value numeric not null default 0, useful_life_months integer not null default 12, depreciation_method text not null default 'straight_line',
  accumulated_depreciation numeric not null default 0, current_value numeric not null default 0, status text not null default 'active',
  account_asset_code text, account_depreciation_code text, account_expense_code text, cost_center_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code),
  constraint fixed_assets_status_check check (status in ('active', 'disposed', 'fully_depreciated', 'sold')),
  constraint fixed_assets_depreciation_method_check check (depreciation_method in ('straight_line', 'declining_balance', 'units_of_production'))
);
create table public.asset_depreciations (
  id uuid primary key default gen_random_uuid(), organization_id integer not null,
  fixed_asset_id uuid not null references public.fixed_assets (id) on delete cascade, period_date date not null,
  depreciation_amount numeric not null default 0, accumulated_after numeric not null default 0,
  journal_entry_id integer references public.journal_entries (id) on delete set null, created_at timestamptz not null default now()
);

create table public.prueba_permiso (user_id uuid, organization_id integer, code text);
create table public.prueba_hoy (dia date);
insert into public.prueba_hoy values ('2026-11-06');

-- Dobles.
create function public.fn_timezone_for(p_org integer, p_branch integer default null) returns text language sql stable as $$ select 'America/Bogota'::text $$;
create function public.fn_today_for(p_org integer, p_branch integer default null) returns date language sql stable as $$ select dia from public.prueba_hoy $$;
create function public.fn_aplicar_configuracion_contable(
  p_org integer, p_branch integer, p_source text, p_debito text, p_credito text, p_impuesto text,
  out debito text, out credito text, out impuesto text, out fallo text)
  language sql stable as $$ select p_debito, p_credito, p_impuesto, null::text $$;
create function public.fn_cuenta_iva(p_org integer, p_branch integer, p_source text, p_cuenta text) returns text language sql stable as $$ select p_cuenta $$;
create function public.fn_puc_cuenta_de_sede(p_org integer, p_branch integer, p_cuenta text) returns text language sql stable as $$ select p_cuenta $$;
create function public.get_user_permission_codes(p_uid uuid, p_org integer) returns text[] language sql stable as
  $$ select coalesce(array_agg(code), array[]::text[]) from public.prueba_permiso where user_id = p_uid and organization_id = p_org $$;
create function public.fn_cuenta_por_clave(p_org integer, p_branch integer, p_clave text) returns text language sql stable as
  $$ select '25050501'::text $$;

-- Reales, leídas de producción.
CREATE OR REPLACE FUNCTION public.monto_base_asiento(p_monto numeric, p_monto_base numeric, p_tasa numeric)
 RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$
  SELECT coalesce(nullif(p_monto_base, 0), coalesce(p_monto, 0) * coalesce(nullif(p_tasa, 0), 1))
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_period_open(p_organization_id integer, p_date date)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  select status into v_status from public.fiscal_periods
   where organization_id = p_organization_id and p_date between start_date and end_date
     and period_type = 'monthly' limit 1;
  if v_status is not null and v_status <> 'open' then
    return false;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_exigir_alcance_sucursal(p_organization_id bigint, p_branch_id bigint)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_member_id bigint;
  v_es_admin boolean;
  v_asignadas integer[];
begin
  select om.id, (om.is_super_admin = true or om.role_id in (1, 2))
    into v_member_id, v_es_admin
  from public.organization_members om
  where om.user_id = (select auth.uid())
    and om.organization_id = p_organization_id
    and om.is_active = true;
  if v_member_id is null then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
  end if;
  if v_es_admin then
    return;
  end if;
  select coalesce(array_agg(mb.branch_id), '{}') into v_asignadas
  from public.member_branches mb
  join public.branches b on b.id = mb.branch_id
  where mb.organization_member_id = v_member_id and b.organization_id = p_organization_id;
  if cardinality(v_asignadas) = 0 then
    return;
  end if;
  if p_branch_id is null then
    if exists (select 1 from public.branches b where b.organization_id = p_organization_id
                and b.is_active = true and b.id <> all (v_asignadas)) then
      raise exception 'BRANCH_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return;
  end if;
  if not (p_branch_id::integer = any (v_asignadas)) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
  end if;
end;
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_modo_centro(p_org integer, p_cuenta text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select a.centro_costo_modo
       from public.chart_of_accounts a
      where a.organization_id = p_org
        and a.account_code = nullif(btrim(p_cuenta), '')),
    'no_aplica'
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_centro_para_cuenta(p_org integer, p_branch integer, p_cuenta text, p_centro uuid, p_cuenta_sin_centro text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_cuenta_sin_centro is not null
     and p_cuenta is not distinct from p_cuenta_sin_centro then null
    when public.fn_modo_centro(p_org, p_cuenta) = 'no_aplica' then null
    else p_centro
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_asiento_publicado_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_entry integer;
begin
  if coalesce(current_setting('app.contabilidad_mantenimiento', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'journal_entries' then
    if coalesce(old.posted, false) then
      raise exception 'ASIENTO_PUBLICADO_INMUTABLE: el asiento % está publicado; se revierte con un contra-asiento', old.id
        using errcode = 'P0001';
    end if;
  else
    v_entry := old.journal_entry_id;
    if exists (select 1 from public.journal_entries e where e.id = v_entry and coalesce(e.posted, false))
       or (tg_op = 'UPDATE' and exists (select 1 from public.journal_entries e
                                         where e.id = new.journal_entry_id and coalesce(e.posted, false))) then
      raise exception 'ASIENTO_PUBLICADO_INMUTABLE: las líneas del asiento % no se editan ni se borran', v_entry
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_asiento_cuadrado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id integer;
  v_d numeric;
  v_c numeric;
begin
  if tg_table_name = 'journal_entries' then v_id := new.id;
  elsif tg_op = 'DELETE' then v_id := old.journal_entry_id;
  else v_id := new.journal_entry_id; end if;
  if not exists (select 1 from public.journal_entries e where e.id = v_id and e.posted is true) then
    return null;
  end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_d, v_c
    from public.journal_lines where journal_entry_id = v_id;
  if v_d <> v_c then
    raise exception 'asiento_descuadrado: asiento % D % / C %', v_id, v_d, v_c using errcode = '23514';
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_puc_linea_solo_movimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_mov boolean;
begin
  v_org := new.organization_id;
  if v_org is null then
    select organization_id into v_org
    from public.journal_entries
    where id = new.journal_entry_id;
  end if;
  if v_org is null then
    return new;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = v_org
    and account_code = new.account_code;

  -- Sin fila en el plan, o con es_movimiento null: no es un rechazo nuevo.
  if v_mov is false then
    raise exception 'cuenta_no_es_de_movimiento: la cuenta % es de título y no recibe asientos', new.account_code;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_journal_line_org_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT organization_id INTO NEW.organization_id
  FROM public.journal_entries
  WHERE id = NEW.journal_entry_id;
  
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar organization_id para journal_entry_id %', NEW.journal_entry_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fase6_exigir_periodo_abierto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dia date;
begin
  if tg_table_name = 'bank_transactions' then
    v_dia := coalesce(new.trans_date, now())::date;
  elsif tg_table_name = 'bank_transfers' then
    v_dia := coalesce(new.transfer_date, now())::date;
  else
    v_dia := coalesce(new.entry_date, now())::date;
  end if;
  if not public.fn_is_period_open(new.organization_id, v_dia) then
    raise exception 'periodo_cerrado' using errcode = '23514';
  end if;
  return new;
end;
$function$;

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


create trigger trg_fase6_periodo_journal before insert on public.journal_entries
  for each row execute function fn_fase6_exigir_periodo_abierto();
create trigger trg_journal_entries_inmutable before delete or update on public.journal_entries
  for each row execute function fn_asiento_publicado_inmutable();
create constraint trigger trg_zz_asiento_cuadrado after insert or update on public.journal_entries
  deferrable initially deferred for each row execute function fn_trg_asiento_cuadrado();
create trigger tr_set_journal_line_org_id before insert on public.journal_lines
  for each row execute function set_journal_line_org_id();
create trigger trg_journal_lines_inmutable before delete or update on public.journal_lines
  for each row execute function fn_asiento_publicado_inmutable();
create constraint trigger trg_zz_asiento_cuadrado after insert or delete or update on public.journal_lines
  deferrable initially deferred for each row execute function fn_trg_asiento_cuadrado();
create trigger zz_trg_puc_linea_solo_movimiento before insert on public.journal_lines
  for each row execute function fn_puc_linea_solo_movimiento();

-- Las funciones anteriores (leídas de producción), para medir el daño y probar las reversiones.
create or replace function public.fn_auto_journal_payroll() returns trigger language plpgsql as $f$ begin return new; end $f$;
create or replace function public.fn_auto_journal_payroll_period() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger trg_auto_journal_payroll after update on public.payroll_slips
  for each row execute function fn_auto_journal_payroll();
create trigger trg_auto_journal_payroll_period after update on public.payroll_periods
  for each row execute function fn_auto_journal_payroll_period();

-- Datos inventados: org 1 (sede 10 y 11) y org 2. Hoy es 2026-11-06.
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.organizations (id) values (1), (2);
insert into public.branches (id, organization_id, is_main) values (10, 1, true), (11, 1, false), (20, 2, true);
insert into public.organization_members (user_id, organization_id, role_id) values
  ('00000000-0000-0000-0000-00000000000a', 1, 2),
  ('00000000-0000-0000-0000-00000000000b', 2, 2),
  ('00000000-0000-0000-0000-00000000000c', 1, 3);
insert into public.prueba_permiso values
  ('00000000-0000-0000-0000-00000000000a', 1, 'finance.view'),
  ('00000000-0000-0000-0000-00000000000a', 1, 'finance.create'),
  ('00000000-0000-0000-0000-00000000000a', 1, 'hr.payroll.process'),
  ('00000000-0000-0000-0000-00000000000b', 2, 'finance.view'),
  ('00000000-0000-0000-0000-00000000000b', 2, 'finance.create');

insert into public.chart_of_accounts (organization_id, account_code, es_movimiento, type)
select o, c.codigo, c.mov, c.tipo
  from (values (1), (2)) as org(o),
       (values ('1305', true, 'asset'), ('1330', true, 'asset'), ('2205', false, 'liability'), ('22050501', true, 'liability'),
               ('2805', true, 'liability'), ('4135', true, 'income'), ('1110', true, 'asset'), ('1592', true, 'asset'),
               ('5160', true, 'expense'), ('5105', true, 'expense'), ('5195', false, 'expense'), ('519595', true, 'expense'),
               ('25050501', true, 'liability'), ('2370', true, 'liability'), ('1524', true, 'asset')) as c(codigo, mov, tipo);

insert into public.accounting_rules (organization_id, source_type, event_type, debit_account_code, credit_account_code)
select o, r.s, r.e, r.d, r.c
  from (values (1), (2)) as org(o),
       (values ('payroll', 'created', '5105', '25050501'), ('payroll', 'paid', '25050501', '1110'),
               ('payroll_period', 'created', '5105', '2370'), ('payroll_period', 'paid', '2370', '1110')) as r(s, e, d, c);

insert into public.customers (id, organization_id, first_name, last_name) values
  ('c0000000-0000-0000-0000-000000000001', 1, 'Cliente', 'Uno'),
  ('c0000000-0000-0000-0000-000000000002', 1, 'Cliente', 'Dos'),
  ('c0000000-0000-0000-0000-000000000003', 2, 'Cliente', 'Otra');
insert into public.suppliers values (1, 1, 'Proveedor Uno'), (2, 2, 'Proveedor Otra');

-- Facturas de venta. Corte de la prueba: 2026-10-31.
--  f1 corriente (vence el 15-nov)                                  100.000
--  f2 vencida 10 días al corte                                     200.000, abono 50.000 el 05-oct y otro 30.000 el 05-nov (posterior)
--  f3 vencida 45 días                                              300.000
--  f4 vencida 75 días                                              400.000
--  f5 vencida 120 días                                             500.000
--  f6 vence en 2027 (el código viejo la dejaba fuera de las bandas) 600.000
--  f7 emitida después del corte                                    700.000
--  f8 sede 11, vencida 5 días, con days_overdue almacenado errado    80.000, nota crédito 20.000 y saldo a favor aplicado 10.000
--  f9 otra organización                                            900.000
insert into public.invoice_sales (id, organization_id, branch_id, customer_id, number, issue_date, due_date, total, balance, status) values
  ('f0000000-0000-0000-0000-000000000001', 1, 10, 'c0000000-0000-0000-0000-000000000001', 'F1', '2026-10-01 12:00-05', '2026-11-15 12:00-05', 100000, 100000, 'issued'),
  ('f0000000-0000-0000-0000-000000000002', 1, 10, 'c0000000-0000-0000-0000-000000000001', 'F2', '2026-09-01 12:00-05', '2026-10-21 12:00-05', 200000, 120000, 'partial'),
  ('f0000000-0000-0000-0000-000000000003', 1, 10, 'c0000000-0000-0000-0000-000000000002', 'F3', '2026-08-01 12:00-05', '2026-09-16 12:00-05', 300000, 300000, 'issued'),
  ('f0000000-0000-0000-0000-000000000004', 1, 10, 'c0000000-0000-0000-0000-000000000002', 'F4', '2026-07-01 12:00-05', '2026-08-17 12:00-05', 400000, 400000, 'issued'),
  ('f0000000-0000-0000-0000-000000000005', 1, 10, 'c0000000-0000-0000-0000-000000000002', 'F5', '2026-06-01 12:00-05', '2026-07-03 12:00-05', 500000, 500000, 'issued'),
  ('f0000000-0000-0000-0000-000000000006', 1, 10, 'c0000000-0000-0000-0000-000000000001', 'F6', '2026-10-15 12:00-05', '2027-03-01 12:00-05', 600000, 600000, 'issued'),
  ('f0000000-0000-0000-0000-000000000007', 1, 10, 'c0000000-0000-0000-0000-000000000001', 'F7', '2026-11-02 12:00-05', '2026-12-01 12:00-05', 700000, 700000, 'issued'),
  ('f0000000-0000-0000-0000-000000000008', 1, 11, 'c0000000-0000-0000-0000-000000000002', 'F8', '2026-10-01 12:00-05', '2026-10-26 12:00-05', 80000, 50000, 'partial'),
  ('f0000000-0000-0000-0000-000000000009', 2, 20, 'c0000000-0000-0000-0000-000000000003', 'F9', '2026-10-01 12:00-05', '2026-10-20 12:00-05', 900000, 900000, 'issued');
insert into public.invoice_sales (id, organization_id, branch_id, customer_id, number, issue_date, total, balance, status, document_type, related_invoice_id) values
  ('f0000000-0000-0000-0000-00000000000a', 1, 11, 'c0000000-0000-0000-0000-000000000002', 'NC1', '2026-10-20 12:00-05', 20000, 0, 'issued', 'credit_note', 'f0000000-0000-0000-0000-000000000008');

insert into public.accounts_receivable (id, organization_id, customer_id, invoice_id, amount, balance, due_date, status, days_overdue, branch_id, created_at)
select ('a' || substr(i.id::text, 2))::uuid, i.organization_id, i.customer_id, i.id, i.total, i.balance, i.due_date,
       case when i.balance < i.total then 'partial' else 'current' end,
       0, i.branch_id, i.issue_date
  from public.invoice_sales i where coalesce(i.document_type, 'invoice') = 'invoice';

-- Pagos. Cada uno cuenta una vez, sea por factura o por cartera.
insert into public.payments (organization_id, branch_id, source, source_id, amount, status, payment_date) values
  (1, 10, 'invoice_sales', 'f0000000-0000-0000-0000-000000000002', 50000, 'completed', '2026-10-05 12:00-05'),
  (1, 10, 'account_receivable', 'a0000000-0000-0000-0000-000000000002', 30000, 'completed', '2026-11-05 12:00-05');
-- Un pago anulado después del corte sí contaba al corte; uno anulado antes no.
insert into public.payments (organization_id, branch_id, source, source_id, amount, status, payment_date, voided_at) values
  (1, 10, 'invoice_sales', 'f0000000-0000-0000-0000-000000000003', 40000, 'void', '2026-10-10 12:00-05', '2026-11-03 12:00-05'),
  (1, 10, 'invoice_sales', 'f0000000-0000-0000-0000-000000000004', 25000, 'void', '2026-10-10 12:00-05', '2026-10-12 12:00-05');
update public.invoice_sales set balance = 300000 where number = 'F3';

-- Saldo a favor: uno aplicado a F8 y otro sin aplicar.
insert into public.credit_notes (id, organization_id, customer_id, amount, balance, status, branch_id, created_at) values
  ('e0000000-0000-0000-0000-000000000001', 1, 'c0000000-0000-0000-0000-000000000002', 50000, 40000, 'active', 11, '2026-10-02 12:00-05'),
  ('e0000000-0000-0000-0000-000000000002', 1, 'c0000000-0000-0000-0000-000000000001', 70000, 70000, 'active', 10, '2026-11-01 12:00-05'),
  ('e0000000-0000-0000-0000-000000000003', 2, 'c0000000-0000-0000-0000-000000000003', 11000, 11000, 'active', 20, '2026-10-02 12:00-05');
insert into public.credit_note_applications (organization_id, credit_note_id, invoice_id, amount, created_at) values
  (1, 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000008', 10000, '2026-10-03 12:00-05');

-- Proveedores.
insert into public.invoice_purchase (id, organization_id, branch_id, supplier_id, number_ext, issue_date, due_date, total, balance, status) values
  ('b0000000-0000-0000-0000-000000000001', 1, 10, 1, 'C1', '2026-09-01 12:00-05', '2026-10-01 12:00-05', 500000, 300000, 'partial'),
  ('b0000000-0000-0000-0000-000000000002', 1, 10, 1, 'C2', '2026-10-01 12:00-05', '2027-06-01 12:00-05', 250000, 250000, 'issued'),
  ('b0000000-0000-0000-0000-000000000003', 2, 20, 2, 'C3', '2026-10-01 12:00-05', '2026-10-01 12:00-05', 99000, 99000, 'issued');
insert into public.accounts_payable (id, organization_id, supplier_id, invoice_id, amount, balance, due_date, status, branch_id, created_at)
select ('d' || substr(i.id::text, 2))::uuid, i.organization_id, i.supplier_id, i.id, i.total, i.balance, i.due_date, 'pending', i.branch_id, i.issue_date
  from public.invoice_purchase i;
insert into public.payments (organization_id, branch_id, source, source_id, amount, status, payment_date) values
  (1, 10, 'invoice_purchase', 'b0000000-0000-0000-0000-000000000001', 150000, 'completed', '2026-10-15 12:00-05'),
  (1, 10, 'account_payable', 'd0000000-0000-0000-0000-000000000001', 50000, 'completed', '2026-11-02 12:00-05');

-- Mayor al corte. Los asientos posteriores no cuentan.
create function public.prueba_asiento(p_org integer, p_branch integer, p_fecha timestamptz, p_d text, p_c text, p_monto numeric)
returns void language plpgsql as $f$
declare v integer;
begin
  insert into public.journal_entries (organization_id, branch_id, entry_date, posted, source)
  values (p_org, p_branch, p_fecha, true, 'prueba') returning id into v;
  insert into public.journal_lines (journal_entry_id, organization_id, account_code, debit, credit) values
    (v, p_org, p_d, p_monto, 0), (v, p_org, p_c, 0, p_monto);
end $f$;
select public.prueba_asiento(1, 10, '2026-10-20 12:00-05', '1305', '4135', 1990000);
select public.prueba_asiento(1, 10, '2026-11-02 12:00-05', '1305', '4135', 700000);
select public.prueba_asiento(1, 10, '2026-10-20 12:00-05', '1110', '22050501', 600000);
select public.prueba_asiento(1, 10, '2026-10-20 12:00-05', '1330', '1110', 33000);

-- Nómina: periodo con dos colillas.
insert into public.payroll_periods (id, organization_id, name, period_start, period_end, status, total_gross, total_employer_cost) values
  ('90000000-0000-0000-0000-000000000001', 1, 'Octubre', '2026-10-01', '2026-10-31', 'reviewing', 8500000, 11900000);
insert into public.payroll_runs (id, payroll_period_id, run_number, status) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 1, 'completed');

\set ON_ERROR_STOP on
set client_min_messages = notice;
\echo '=== Antes de las correcciones: las funciones viejas, en las mismas filas ==='
\i supabase/rollbacks/20261107130000_cartera_edades_al_corte_rollback.sql
\i supabase/rollbacks/20261107132000_nomina_asiento_sin_titulo_ni_doble_costo_rollback.sql
update public.accounts_receivable set days_overdue = 0;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false), set_config('test.role', 'authenticated', false);
select 'viejo cxc' as caso,
       (r->>'total')::numeric as total,
       (select sum((b->>'total')::numeric) from jsonb_array_elements(r->'buckets') b) as suma_bandas
  from public.fn_reporte_cxc_aging(1, '2026-10-31', null) r;

insert into public.payroll_slips (id, payroll_run_id, employment_id, gross_pay, total_deductions, net_pay, employer_health, employer_pension, total_employer_cost, status)
values ('92000000-0000-0000-0000-000000000099', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000099', 1000000, 80000, 920000, 85000, 120000, 1205000, 'draft');
do $$
begin
  update public.payroll_slips set status = 'approved' where id = '92000000-0000-0000-0000-000000000099';
  raise exception 'viejo: se aprobó sin error';
exception when others then
  raise notice 'viejo: aprobar colilla => %', sqlerrm;
  if sqlerrm not like 'cuenta_no_es_de_movimiento%' then raise; end if;
end $$;
delete from public.payroll_slips where id = '92000000-0000-0000-0000-000000000099';

insert into public.payroll_periods (id, organization_id, name, status, total_gross, total_employer_cost)
values ('90000000-0000-0000-0000-000000000099', 1, 'Medición', 'reviewing', 1000000, 1205000);
do $$
declare v numeric;
begin
  update public.payroll_periods set status = 'approved', approved_at = '2026-10-15 12:00-05' where id = '90000000-0000-0000-0000-000000000099';
  select sum(l.debit) into v from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.source = 'payroll_periods' and l.account_code = '5105';
  raise exception 'medido %', v;
exception when others then
  raise notice 'viejo: aprobar periodo => %', sqlerrm;
end $$;
delete from public.payroll_periods where id = '90000000-0000-0000-0000-000000000099';

\echo '=== Se aplican las migraciones tal cual ==='
set client_min_messages = warning;
\i supabase/migrations/20261107130000_cartera_edades_al_corte.sql
\i supabase/migrations/20261107131000_nomina_deducciones_sin_calcular.sql
\i supabase/migrations/20261107132000_nomina_asiento_sin_titulo_ni_doble_costo.sql
\i supabase/migrations/20261107133000_depreciacion_linea_recta.sql
\echo '=== Dos veces: idempotentes ==='
\i supabase/migrations/20261107130000_cartera_edades_al_corte.sql
\i supabase/migrations/20261107131000_nomina_deducciones_sin_calcular.sql
\i supabase/migrations/20261107132000_nomina_asiento_sin_titulo_ni_doble_costo.sql
\i supabase/migrations/20261107133000_depreciacion_linea_recta.sql

insert into public.payroll_slips (id, payroll_run_id, employment_id, gross_pay, health_deduction, pension_deduction, total_deductions, net_pay,
    employer_health, employer_pension, employer_arl, total_employer_cost, tax_withholding, status) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001',
   6000000.40, 240000, 240000, 480000, 5520000.40, 510000, 720000.25, 31320, 7261320.65, null, 'draft'),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002',
   2500000, 100000, 100000, 200000, 2300000, 212500, 300000, 13050, 3025550, null, 'draft');

create function public.prueba(p_nombre text, p_ok boolean) returns void language plpgsql as $f$
begin
  if p_ok is not true then
    raise exception 'FALLA: %', p_nombre;
  end if;
  raise notice 'ok - %', p_nombre;
end $f$;

create function public.prueba_error(p_nombre text, p_sql text, p_patron text) returns void language plpgsql as $f$
declare v_err text;
begin
  begin
    execute p_sql;
    raise exception 'FALLA (no dio error): %', p_nombre using errcode = 'ZZ001';
  exception
    when sqlstate 'ZZ001' then raise;
    when others then v_err := sqlerrm;
  end;
  if v_err not like p_patron then
    raise exception 'FALLA: % -> %', p_nombre, v_err;
  end if;
  raise notice 'ok - % (%)', p_nombre, v_err;
end $f$;

set client_min_messages = notice;
\echo '=== Hallazgo 7: edades ==='
do $$
declare
  r jsonb := public.fn_reporte_cxc_aging(1, '2026-10-31', null);
  b jsonb := r->'buckets';
  banda text;
begin
  perform public.prueba('cinco bandas en orden',
    (select array_agg(x->>'bucket' order by o) from jsonb_array_elements(b) with ordinality t(x, o))
      = array['corriente', '1-30', '31-60', '61-90', '+90']);
  perform public.prueba('las bandas suman el total',
    (select sum((x->>'total')::numeric) from jsonb_array_elements(b) x) = (r->>'total')::numeric);
  -- f1 100.000 + f6 600.000 corriente; f2 150.000 + f8 50.000 en 1-30; f3 300.000; f4 400.000; f5 500.000
  perform public.prueba('total al corte', (r->>'total')::numeric = 2100000 - 40000);
  perform public.prueba('mora a la fecha de corte, no days_overdue',
    (select (x->>'total')::numeric from jsonb_array_elements(b) x where x->>'bucket' = '31-60') = 260000);
  perform public.prueba('corriente con vencimiento lejano en la banda',
    (select (x->>'total')::numeric from jsonb_array_elements(b) x where x->>'bucket' = 'corriente') = 700000);
  perform public.prueba('91 días o más',
    (select (x->>'total')::numeric from jsonb_array_elements(b) x where x->>'bucket' = '+90') = 500000);
  perform public.prueba('abono posterior al corte no cuenta',
    (select (x->>'saldo')::numeric from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'F2') = 150000);
  perform public.prueba('nota crédito y saldo a favor aplicado, una vez cada uno',
    (select (x->>'saldo')::numeric from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'F8') = 50000);
  perform public.prueba('pago anulado después del corte sí contaba',
    (select (x->>'saldo')::numeric from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'F3') = 260000);
  perform public.prueba('pago anulado antes del corte no cuenta',
    (select (x->>'saldo')::numeric from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'F4') = 400000);
  perform public.prueba('documento posterior al corte no existe',
    not exists (select 1 from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'F7'));
  perform public.prueba('la nota crédito no es cartera',
    not exists (select 1 from jsonb_array_elements(r->'detalle') x where x->>'numero' = 'NC1'));
  perform public.prueba('por tercero suma el total',
    (select sum((x->>'total')::numeric) from jsonb_array_elements(r->'terceros') x) = (r->>'total')::numeric);
  perform public.prueba('anticipo aparte: el saldo al corte, sin el posterior',
    (r->'anticipos'->>'total')::numeric = 40000 and (r->'anticipos'->>'origen') = 'saldos_a_favor');
  perform public.prueba('el mayor no incluye lo posterior', (r->'mayor'->>'saldo')::numeric = 1990000);
  perform public.prueba('diferencia con el mayor a la vista',
    (r->'mayor'->>'diferencia')::numeric = 1990000 - (r->>'total')::numeric and (r->'mayor'->>'cuadra')::boolean is false);
end $$;

do $$
declare r jsonb;
begin
  perform public.prueba_asiento(1, 10, '2026-10-21 12:00-05', '1305', '4135', 70000);
  r := public.fn_reporte_cxc_aging(1, '2026-10-31', null);
  perform public.prueba('cuando el mayor coincide, cuadra',
    (r->'mayor'->>'diferencia')::numeric = 0 and (r->'mayor'->>'cuadra')::boolean);
end $$;

do $$
declare r jsonb := public.fn_reporte_cxc_aging(1, '2026-11-06', null);
begin
  perform public.prueba('al corte de hoy coincide con el saldo vivo',
    (r->>'total')::numeric = (select sum(ar.balance) from public.accounts_receivable ar where ar.organization_id = 1));
end $$;

do $$
declare
  r jsonb := public.fn_reporte_cxc_aging(1, '2026-10-31', 11);
begin
  perform public.prueba('filtro por sucursal', (r->>'total')::numeric = 50000);
  perform public.prueba('anticipos de la sucursal', (r->'anticipos'->>'total')::numeric = 40000);
end $$;

do $$
declare
  r jsonb := public.fn_reporte_cxp_aging(1, '2026-10-31', null);
begin
  -- C1 500.000 - 150.000 = 350.000 (30 días); C2 250.000 corriente, fuera de corte+90.
  perform public.prueba('proveedores: total al corte', (r->>'total')::numeric = 600000);
  perform public.prueba('proveedores: bandas suman',
    (select sum((x->>'total')::numeric) from jsonb_array_elements(r->'buckets') x) = 600000);
  perform public.prueba('proveedores: mora al corte',
    (select (x->>'total')::numeric from jsonb_array_elements(r->'buckets') x where x->>'bucket' = '1-30') = 350000);
  perform public.prueba('proveedores: cuadra con 2205 y sus auxiliares',
    (r->'mayor'->>'saldo')::numeric = 600000 and (r->'mayor'->>'cuadra')::boolean);
  perform public.prueba('proveedores: anticipos del mayor 1330',
    (r->'anticipos'->>'total')::numeric = 33000 and r->'anticipos'->>'origen' = 'mayor');
end $$;

\echo '=== Aislamiento entre empresas ==='
select public.prueba_error('otra empresa no lee cartera', $q$select public.fn_reporte_cxc_aging(2, '2026-10-31', null)$q$, 'ORG_FORBIDDEN%');
select public.prueba_error('otra empresa no lee proveedores', $q$select public.fn_reporte_cxp_aging(2, '2026-10-31', null)$q$, 'ORG_FORBIDDEN%');
select public.prueba_error('sucursal ajena', $q$select public.fn_reporte_cxc_aging(1, '2026-10-31', 20)$q$, 'BRANCH_FORBIDDEN%');
do $$
declare r jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', true);
  r := public.fn_reporte_cxc_aging(2, '2026-10-31', null);
  perform public.prueba('cada empresa ve lo suyo',
    (r->>'total')::numeric = 900000 and (r->'anticipos'->>'total')::numeric = 11000);
end $$;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000c', true);
  perform public.prueba_error('sin finance.view no lee', $q$select public.fn_reporte_cxc_aging(1, '2026-10-31', null)$q$, 'sin_permiso%');
end $$;
select public.prueba('anon no ejecuta edades', not has_function_privilege('anon', 'public.fn_reporte_cxc_aging(bigint,date,bigint)', 'execute'));
select public.prueba('authenticated no llama el núcleo', not has_function_privilege('authenticated', 'public.fn_cartera_edades_json(text,integer,date,integer)', 'execute'));

\echo '=== Hallazgo 9: nómina ==='
select public.prueba('la columna ya no tiene default 0',
  (select column_default from information_schema.columns where table_name = 'payroll_slips' and column_name = 'tax_withholding') is null);
select public.prueba_error('retención sin calcular bloquea la colilla',
  $q$update public.payroll_slips set status = 'approved' where id = '92000000-0000-0000-0000-000000000001'$q$, 'NOMINA_DEDUCCION_SIN_CALCULAR%');
select public.prueba_error('retención sin calcular bloquea el periodo',
  $q$update public.payroll_periods set status = 'approved' where id = '90000000-0000-0000-0000-000000000001'$q$, 'NOMINA_CIERRE_BLOQUEADO%');
select public.prueba_error('tampoco se cierra por closed',
  $q$update public.payroll_periods set status = 'closed' where id = '90000000-0000-0000-0000-000000000001'$q$, 'NOMINA_CIERRE_BLOQUEADO%');
select public.prueba_error('no se escribe directo sobre la tabla',
  $q$update public.payroll_slips set tax_withholding = 0 where id = '92000000-0000-0000-0000-000000000001'$q$, 'NOMINA_DEDUCCION_SOLO_POR_RPC%');
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000c', true);
  perform public.prueba_error('sin hr.payroll.process no se escribe',
    $q$select public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000001', 'retencion', 1000)$q$, 'sin_permiso%');
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', true);
  perform public.prueba_error('otra empresa no escribe',
    $q$select public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000001', 'retencion', 1000)$q$, 'Acceso denegado%');
end $$;
select public.prueba_error('valor negativo',
  $q$select public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000001', 'retencion', -1)$q$, 'valor_invalido%');
select public.prueba_error('neto negativo',
  $q$select public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000001', 'retencion', 99000000)$q$, 'neto_negativo%');

do $$
declare
  r jsonb := public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000001', 'retencion', 320000, 'Certificado del contador');
  s public.payroll_slips%rowtype;
begin
  select * into s from public.payroll_slips where id = '92000000-0000-0000-0000-000000000001';
  perform public.prueba('retención a mano recalcula deducciones y neto',
    s.tax_withholding = 320000 and s.total_deductions = 800000 and s.net_pay = 5200000.40);
  perform public.prueba('queda rastro de quién la escribió',
    s.metadata->'deducciones_manuales'->'retencion'->>'por' = '00000000-0000-0000-0000-00000000000a');
  perform public.prueba('aún falta una colilla', (r->>'pendientes')::integer = 1);
  perform public.prueba('auditoría', exists (select 1 from public.finance_audit_log a where a.entity = 'payroll_slips'));
end $$;
select public.prueba_error('una colilla pendiente sigue bloqueando el periodo',
  $q$update public.payroll_periods set status = 'approved' where id = '90000000-0000-0000-0000-000000000001'$q$, 'NOMINA_CIERRE_BLOQUEADO%');
do $$
declare
  r jsonb := public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000002', 'retencion', 0, 'No aplica');
  p public.payroll_periods%rowtype;
begin
  perform public.prueba('0 escrito a mano no es NULL',
    (select tax_withholding from public.payroll_slips where id = '92000000-0000-0000-0000-000000000002') = 0);
  perform public.prueba('sin pendientes', (r->>'pendientes')::integer = 0);
  select * into p from public.payroll_periods where id = '90000000-0000-0000-0000-000000000001';
  perform public.prueba('totales del periodo al día', p.total_deductions = 1000000 and p.total_net = 7500000.40);
end $$;

\echo '--- Asientos: colilla ---'
update public.payroll_slips set status = 'approved', updated_at = '2026-10-31 12:00-05' where id = '92000000-0000-0000-0000-000000000001';
do $$
declare
  v_d numeric; v_c numeric;
begin
  perform public.prueba('aprobar ya no falla y deja un asiento',
    (select count(*) from public.journal_entries where source = 'payroll_slips') = 1);
  select sum(debit), sum(credit) into v_d, v_c
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id where e.source = 'payroll_slips';
  perform public.prueba('asiento cuadrado', v_d = v_c and v_d > 0);
  perform public.prueba('sin 5195 ni cuentas de título',
    not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                  join public.chart_of_accounts c on c.organization_id = l.organization_id and c.account_code = l.account_code
                 where e.source = 'payroll_slips' and c.es_movimiento is not true));
  perform public.prueba('el gasto va a la cuenta de la regla',
    (select count(distinct l.account_code) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
      where e.source = 'payroll_slips' and l.debit > 0) = 1
    and exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                 where e.source = 'payroll_slips' and l.debit > 0 and l.account_code = '5105'));
  perform public.prueba('pesos enteros',
    not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                 where e.source = 'payroll_slips' and (l.debit <> round(l.debit, 0) or l.credit <> round(l.credit, 0))));
end $$;
-- Volver a aprobar no duplica.
update public.payroll_slips set status = 'draft' where id = '92000000-0000-0000-0000-000000000001';
update public.payroll_slips set status = 'approved' where id = '92000000-0000-0000-0000-000000000001';
select public.prueba('reaprobar no duplica', (select count(*) from public.journal_entries where source = 'payroll_slips') = 1);
update public.payroll_slips set status = 'approved', updated_at = '2026-10-31 12:00-05' where id = '92000000-0000-0000-0000-000000000002';

\echo '--- Asientos: periodo ---'
update public.payroll_periods set status = 'approved', approved_at = '2026-10-31 13:00-05' where id = '90000000-0000-0000-0000-000000000001';
select public.prueba('aprobar el periodo no devenga otra vez el costo patronal',
  (select count(*) from public.journal_entries where source = 'payroll_periods') = 0);
update public.payroll_periods set status = 'paid' where id = '90000000-0000-0000-0000-000000000001';
select public.prueba('el pago de aportes no se inventa un destino',
  (select count(*) from public.journal_entries where source = 'payroll_periods') = 0);
select public.prueba('queda pendiente del Contador con su importe',
  (select amount from public.journal_entry_failures where reason = 'criterio_contador' and resolved_at is null) = 3400000);
select public.prueba_error('ya cerrado no se edita',
  $q$select public.fn_nomina_fijar_deduccion('92000000-0000-0000-0000-000000000002', 'retencion', 1)$q$, 'colilla_no_editable%');

-- Cuenta de título en la regla: pendiente, no excepción.
insert into public.payroll_periods (id, organization_id, name, status) values ('90000000-0000-0000-0000-000000000002', 1, 'Nov', 'reviewing');
insert into public.payroll_runs (id, payroll_period_id, run_number, status) values ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 1, 'completed');
update public.accounting_rules set debit_account_code = '5195' where organization_id = 1 and source_type = 'payroll' and event_type = 'created';
insert into public.payroll_slips (id, payroll_run_id, employment_id, gross_pay, total_deductions, net_pay, tax_withholding, status)
values ('92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 1000000, 0, 1000000, 0, 'draft');
update public.payroll_slips set status = 'approved' where id = '92000000-0000-0000-0000-000000000003';
select public.prueba('cuenta de título en la regla: pendiente visible',
  exists (select 1 from public.journal_entry_failures where fact_key = 'payroll_slip:92000000-0000-0000-0000-000000000003:created' and reason = 'cuenta_no_es_de_movimiento'));
update public.accounting_rules set debit_account_code = '5105' where organization_id = 1 and source_type = 'payroll' and event_type = 'created';

\echo '=== Hallazgo 9: depreciación ==='
insert into public.fixed_assets (id, organization_id, code, name, acquisition_date, acquisition_cost, salvage_value, useful_life_months,
    current_value, account_asset_code, account_depreciation_code, account_expense_code) values
  ('a1000000-0000-0000-0000-000000000001', 1, 'A1', 'Vitrina', '2026-07-15', 1000000, 100000, 7, 1000000, '1524', '1592', '5160'),
  ('a1000000-0000-0000-0000-000000000002', 1, 'A2', 'Sin cuentas', '2026-09-01', 500000, 0, 10, 500000, '1524', null, null),
  ('a1000000-0000-0000-0000-000000000003', 1, 'A3', 'Título', '2026-09-01', 500000, 0, 10, 500000, '1524', '1592', '5195'),
  ('a1000000-0000-0000-0000-000000000004', 1, 'A4', 'Terreno', '2026-01-01', 900000, 0, 12, 900000, '1524', '1592', '5160'),
  ('a1000000-0000-0000-0000-000000000005', 2, 'B1', 'Otra empresa', '2026-07-01', 1000000, 0, 10, 1000000, '1524', '1592', '5160');
update public.fixed_assets set asset_type = 'land' where code = 'A4';

select public.prueba_error('método no disponible: no se puede crear',
  $q$insert into public.fixed_assets (organization_id, code, name, acquisition_date, depreciation_method) values (1, 'A9', 'x', '2026-01-01', 'declining_balance')$q$,
  '%fixed_assets_metodo_disponible_check%');
select public.prueba_error('método no disponible: unidades de producción tampoco',
  $q$update public.fixed_assets set depreciation_method = 'units_of_production' where code = 'A1'$q$,
  '%fixed_assets_metodo_disponible_check%');
select public.prueba_error('mes futuro', $q$select public.fn_depreciar_mes(1, '2026-12-01')$q$, 'mes_futuro%');
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000c', true);
  perform public.prueba_error('sin permiso no deprecia', $q$select public.fn_depreciar_mes(1, '2026-10-01')$q$, 'sin_permiso%');
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', true);
  perform public.prueba_error('otra empresa no deprecia', $q$select public.fn_depreciar_mes(1, '2026-10-01')$q$, 'Acceso denegado%');
end $$;

do $$
declare
  r jsonb := public.fn_depreciar_mes(1, '2026-10-15');
  a public.fixed_assets%rowtype;
begin
  select * into a from public.fixed_assets where code = 'A1';
  -- 900.000 / 7: agosto, septiembre y octubre.
  perform public.prueba('meses atrasados en orden', (r->>'asientos')::integer = 3
    and (select array_agg(period_date order by period_date) from public.asset_depreciations where fixed_asset_id = a.id)
        = array['2026-08-31', '2026-09-30', '2026-10-31']::date[]);
  perform public.prueba('acumulada redondeada a pesos', a.accumulated_depreciation = 385714 and a.current_value = 614286);
  perform public.prueba('asiento por mes con su fecha',
    (select count(*) from public.journal_entries e where e.source = 'asset_depreciations') = 3
    and exists (select 1 from public.journal_entries e where e.fact_key = 'depreciacion:' || a.id || ':2026-08'
                 and (e.entry_date at time zone 'America/Bogota')::date = '2026-08-31'));
  perform public.prueba('gasto contra depreciación acumulada',
    (select sum(l.debit) from public.journal_lines l where l.account_code = '5160') = 385714
    and (select sum(l.credit) from public.journal_lines l where l.account_code = '1592') = 385714);
  perform public.prueba('pendientes visibles: sin cuentas y cuenta de título',
    jsonb_array_length(r->'pendientes') = 2
    and exists (select 1 from jsonb_array_elements(r->'pendientes') p where p->>'codigo' = 'A2' and p->>'motivo' = 'faltan_cuentas')
    and exists (select 1 from jsonb_array_elements(r->'pendientes') p where p->>'codigo' = 'A3' and p->>'motivo' = 'cuenta_no_es_de_movimiento'));
  perform public.prueba('los pendientes quedan en la bandeja',
    (select count(*) from public.journal_entry_failures f where f.source = 'asset_depreciations' and f.resolved_at is null) = 2);
  perform public.prueba('terreno no se deprecia',
    not exists (select 1 from public.asset_depreciations d join public.fixed_assets x on x.id = d.fixed_asset_id where x.code = 'A4'));
  perform public.prueba('otra empresa intacta',
    not exists (select 1 from public.asset_depreciations d where d.organization_id = 2));
end $$;

do $$
declare
  r jsonb := public.fn_depreciar_mes(1, '2026-10-15');
begin
  perform public.prueba('segunda pasada: idempotente', (r->>'asientos')::integer = 0 and (r->>'ya_depreciados')::integer = 1);
  perform public.prueba('sin asientos nuevos', (select count(*) from public.journal_entries e where e.source = 'asset_depreciations') = 3);
  perform public.prueba('sin pendientes repetidos',
    (select count(*) from public.journal_entry_failures f where f.source = 'asset_depreciations' and f.resolved_at is null) = 2);
end $$;

select public.prueba_error('con depreciación no se cambia el costo',
  $q$update public.fixed_assets set acquisition_cost = 5 where code = 'A1'$q$, 'ACTIVO_CON_DEPRECIACION%');
select public.prueba_error('con depreciación no se borra',
  $q$delete from public.fixed_assets where code = 'A1'$q$, 'ACTIVO_CON_DEPRECIACION%');

-- Periodo cerrado: pendiente, no asiento, y sin saltarse el mes.
insert into public.fiscal_periods (organization_id, period_type, start_date, end_date, status) values (1, 'monthly', '2026-10-01', '2026-10-31', 'closed');
update public.fixed_assets set account_depreciation_code = '1592', account_expense_code = '5160' where code in ('A2', 'A3');
do $$
declare
  r jsonb := public.fn_depreciar_mes(1, '2026-10-15');
begin
  perform public.prueba('periodo cerrado: pendiente y no salta el mes',
    exists (select 1 from jsonb_array_elements(r->'pendientes') p where p->>'codigo' = 'A2' and p->>'motivo' = 'period_closed' and p->>'mes' = '2026-10'));
  perform public.prueba('sin saltos', not exists (select 1 from public.asset_depreciations d join public.fixed_assets x on x.id = d.fixed_asset_id where x.code = 'A2'));
  perform public.prueba('el bloqueo corregido se resuelve solo',
    not exists (select 1 from public.journal_entry_failures f where f.source = 'asset_depreciations' and f.resolved_at is null and f.reason in ('faltan_cuentas', 'cuenta_no_es_de_movimiento')));
end $$;
delete from public.fiscal_periods;

do $$
declare
  r jsonb;
begin
  update public.prueba_hoy set dia = '2027-06-01';
  r := public.fn_depreciar_mes(1, '2027-05-15');
  perform public.prueba('al final de la vida útil suma la base exacta',
    (select accumulated_depreciation from public.fixed_assets where code = 'A1') = 900000
    and (select sum(depreciation_amount) from public.asset_depreciations d join public.fixed_assets x on x.id = d.fixed_asset_id where x.code = 'A1') = 900000);
  perform public.prueba('activo terminado', (select status from public.fixed_assets where code = 'A1') = 'fully_depreciated');
  perform public.prueba('valor en libros igual al residual', (select current_value from public.fixed_assets where code = 'A1') = 100000);
  perform public.prueba('siete cuotas', (select count(*) from public.asset_depreciations d join public.fixed_assets x on x.id = d.fixed_asset_id where x.code = 'A1') = 7);
  perform public.prueba('el pendiente de periodo se resolvió',
    not exists (select 1 from public.journal_entry_failures f where f.source = 'asset_depreciations' and f.resolved_at is null));
  r := public.fn_depreciar_mes(1, '2027-05-15');
  perform public.prueba('terminado no vuelve a depreciar', (r->>'asientos')::integer = 0);
end $$;

\echo '=== Garantías del mayor ==='
select public.prueba('todos los asientos cuadran',
  not exists (select 1 from public.journal_lines group by journal_entry_id having sum(debit) <> sum(credit)));
select public.prueba('sin asientos vacíos',
  not exists (select 1 from public.journal_entries e where not exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id)));
select public.prueba('sin líneas en cuentas de título',
  not exists (select 1 from public.journal_lines l join public.chart_of_accounts c on c.organization_id = l.organization_id and c.account_code = l.account_code where c.es_movimiento is false));
select public.prueba('sin fact_key duplicada',
  not exists (select 1 from public.journal_entries where fact_key is not null group by organization_id, fact_key having count(*) > 1));

\echo '=== Reversiones ==='
\i supabase/rollbacks/20261107133000_depreciacion_linea_recta_rollback.sql
\i supabase/rollbacks/20261107132000_nomina_asiento_sin_titulo_ni_doble_costo_rollback.sql
\i supabase/rollbacks/20261107131000_nomina_deducciones_sin_calcular_rollback.sql
\i supabase/rollbacks/20261107130000_cartera_edades_al_corte_rollback.sql
select public.prueba('reversión limpia',
  not exists (select 1 from pg_proc where proname in ('fn_depreciar_mes', 'fn_nomina_fijar_deduccion', 'fn_cartera_edades_json'))
  and (select column_default from information_schema.columns where table_name = 'payroll_slips' and column_name = 'tax_withholding') = '0');
\echo '=== TODO OK ==='
