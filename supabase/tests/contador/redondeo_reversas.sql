-- Prueba aislada de los hallazgos 4 (redondeo) y 5 (reversas) de la auditoría del Contador, 2026-11-06.
-- Se corre SOLO en un clúster local, nunca en producción, desde la raíz del repositorio:
--
--   psql -h 127.0.0.1 -p <puerto> -U postgres -c "drop database if exists contador_h45"
--   psql -h 127.0.0.1 -p <puerto> -U postgres -c "create database contador_h45"
--   psql -h 127.0.0.1 -p <puerto> -U postgres -d contador_h45 -v ON_ERROR_STOP=1 -f supabase/tests/contador/redondeo_reversas.sql
--
-- Estructura: columnas y disparadores leídos de producción con SELECT; datos inventados, sin clientes.
-- Las funciones de negocio ajenas a la prueba son dobles. Las de los disparadores son las reales.

create extension if not exists dblink;

create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('test.role', true), '') $$;

create table public.organizations (id integer primary key, owner_user_id uuid, created_by uuid);
create table public.branches (id integer primary key, organization_id integer not null, is_main boolean, is_active boolean default true);
create table public.organization_members (user_id uuid, organization_id integer, is_active boolean default true);
create table public.cost_centers (id uuid primary key, organization_id integer not null, is_active boolean default true);

create table public.chart_of_accounts (
  account_code text not null, organization_id integer not null, name text not null default 'cuenta',
  type text not null default 'asset', parent_code text, is_active boolean default true,
  es_movimiento boolean, requiere_tercero boolean not null default false,
  centro_costo_modo text not null default 'no_aplica',
  activa boolean generated always as (coalesce(is_active, true)) stored,
  primary key (organization_id, account_code)
);

create table public.configuracion_contable (
  id bigint generated always as identity primary key,
  organization_id integer not null, branch_id integer, clave text not null, account_code text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint configuracion_contable_unica unique nulls not distinct (organization_id, branch_id, clave),
  constraint configuracion_contable_plan_fkey foreign key (organization_id, account_code)
    references public.chart_of_accounts (organization_id, account_code) on update cascade on delete restrict
);

create table public.journal_entries (
  id serial primary key, organization_id integer not null, branch_id integer not null,
  entry_date timestamptz default now(), memo text, posted boolean default false, source text, source_id text,
  created_by uuid references auth.users (id), created_at timestamptz default now(), updated_at timestamptz default now(),
  currency_code varchar, exchange_rate numeric default 1.0, base_currency_code varchar, fact_key text,
  comprobante_tipo text, comprobante_prefijo text, comprobante_numero integer
);
create unique index uq_journal_entries_fact_key on public.journal_entries (organization_id, fact_key) where fact_key is not null;
create unique index uq_journal_entries_comprobante on public.journal_entries (organization_id, comprobante_tipo, comprobante_numero) where comprobante_numero is not null;

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
  resolved_at timestamptz, resolved_entry_id integer, resolution text
);

create table public.journal_reversa_pendiente (
  entry_id integer primary key, organization_id integer not null, failure_fact_key text not null,
  fecha_anulacion timestamptz not null, categoria text, lote text, cuentas jsonb not null default '{}'::jsonb,
  reversal_entry_id integer, created_at timestamptz not null default now(), resolved_at timestamptz
);

create table public.journal_reversals (
  id bigint generated always as identity primary key, created_at timestamptz not null default now(),
  organization_id integer not null, lote text not null, categoria text not null, original_entry_id integer not null,
  reversal_entry_id integer not null, repost_entry_id integer, restored_entry_id integer, restore_reason text,
  motivo text, created_by uuid
);

create table public.invoice_sales (id uuid primary key, organization_id integer, status text);
create table public.invoice_purchase (id uuid primary key, organization_id integer, status text, distribucion_id uuid, cost_center_id uuid);
create table public.sales (id uuid primary key, organization_id integer, status text);
create table public.payments (id uuid primary key, organization_id integer, status text, source text);

-- Dobles de lo que no se prueba aquí.
create table public.prueba_periodo_cerrado (organization_id integer, dia date);
create table public.prueba_armado (id uuid primary key, armado jsonb);
create table public.prueba_centro_defecto (organization_id integer primary key, centro uuid);
create table public.prueba_permiso (user_id uuid, organization_id integer, code text);
create table public.prueba_retenciones (entry_id integer, cuenta text);
create sequence public.prueba_consecutivo;

create function public.fn_is_period_open(p_org integer, p_dia date) returns boolean language sql stable as
  $$ select not exists (select 1 from public.prueba_periodo_cerrado c where c.organization_id = p_org and c.dia = p_dia) $$;
create function public.fn_centro_defecto(p_org integer, p_branch integer) returns uuid language sql stable as
  $$ select centro from public.prueba_centro_defecto where organization_id = p_org $$;
create function public.fn_moneda_base_organizacion(p_org integer) returns text language sql stable as $$ select 'COP'::text $$;
create function public.fn_timezone_for(p_org integer, p_branch integer) returns text language sql stable as $$ select 'America/Bogota'::text $$;
create function public.fn_today_for(p_org integer, p_branch integer) returns date language sql stable as $$ select current_date $$;
create function public.fn_tomar_consecutivo_comprobante(p_org integer, p_tipo text, p_prefijo text, out numero integer, out prefijo text)
  language sql as $$ select nextval('public.prueba_consecutivo')::integer, p_prefijo $$;
create function public.fn_aplicar_configuracion_contable(
  p_org integer, p_branch integer, p_source text, p_debito text, p_credito text, p_impuesto text,
  out debito text, out credito text, out impuesto text, out fallo text)
  language sql stable as $$ select p_debito, p_credito, p_impuesto, null::text $$;
create function public.fn_cuenta_iva(p_org integer, p_branch integer, p_source text, p_cuenta text) returns text language sql stable as $$ select p_cuenta $$;
create function public.fn_puc_cuenta_de_sede(p_org integer, p_branch integer, p_cuenta text) returns text language sql stable as $$ select p_cuenta $$;
create function public.fn_armar_asiento_documento(p_tipo text, p_id uuid, p_lineas jsonb default null) returns jsonb language sql stable as
  $$ select armado from public.prueba_armado where id = p_id $$;
create function public.get_user_permission_codes(p_uid uuid, p_org integer) returns text[] language sql stable as
  $$ select coalesce(array_agg(code), array[]::text[]) from public.prueba_permiso where user_id = p_uid and organization_id = p_org $$;
create function public.fn_cuenta_retencion_exige_nit(p_cuenta text) returns boolean language sql immutable as
  $$ select p_cuenta ~ '^236[578]' $$;
create function public.fn_asiento_compra_aplicar_retenciones(p_entry_id integer, p_invoice_id uuid, p_credit_account text) returns void language sql as
  $$ insert into public.prueba_retenciones values (p_entry_id, p_credit_account) $$;
create function public.fn_repartir_monto(p_org integer, p_branch integer, p_cuenta text, p_centro uuid, p_dist uuid,
  p_d numeric, p_c numeric, p_db numeric, p_cb numeric)
  returns table (debito numeric, credito numeric, debito_base numeric, credito_base numeric, cost_center_id uuid)
  language sql stable as
  $$ select p_d / 2, p_c / 2, p_db / 2, p_cb / 2, gen_random_uuid() union all select p_d / 2, p_c / 2, p_db / 2, p_cb / 2, gen_random_uuid() $$;
create function public.fn_tercero_de_documento(p_tipo text, p_id uuid, out nit text, out nombre text)
  language sql stable as $$ select null::text, null::text $$;

-- Funciones y disparadores reales de producción.

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

CREATE OR REPLACE FUNCTION public.fn_es_cuenta_de_titulo(p_organization_id integer, p_cuenta text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_validar_cuenta_movimiento(p_organization_id integer, p_cuenta text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text := nullif(btrim(p_cuenta), '');
  v_activa boolean;
  v_mov boolean;
begin
  if v_cuenta is null then
    return 'Elige una cuenta de movimiento';
  end if;
  select a.is_active, a.es_movimiento
    into v_activa, v_mov
    from public.chart_of_accounts a
   where a.organization_id = p_organization_id
     and a.account_code = v_cuenta;
  if not found then
    return 'La cuenta ' || v_cuenta || ' no está en el plan contable';
  end if;
  if v_activa is false then
    return 'La cuenta ' || v_cuenta || ' no está activa';
  end if;
  if v_mov is false or public.fn_es_cuenta_de_titulo(p_organization_id, v_cuenta) then
    return 'La cuenta ' || v_cuenta || ' no es de movimiento';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_exigencias_cuenta(p_organization_id integer, p_cuenta text, OUT requiere_tercero boolean, OUT requiere_centro_costo boolean)
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(a.requiere_tercero, false) or public.fn_cuenta_retencion_exige_nit(a.account_code),
    coalesce(a.centro_costo_modo, 'no_aplica') = 'obligatorio'
      and exists (
        select 1
          from public.cost_centers c
         where c.organization_id = p_organization_id
           and c.is_active
      )
  from public.chart_of_accounts a
  where a.organization_id = p_organization_id
    and a.account_code = nullif(btrim(p_cuenta), '');
$function$;

CREATE OR REPLACE FUNCTION public.fn_tipo_comprobante_de_asiento(p_organization_id integer, p_source text, p_source_id text, OUT tipo text, OUT prefijo text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_mov text;
  v_pago text;
  v_monto numeric;
  v_banco text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_source in ('invoice_sales', 'invoice_purchase', 'credit_note', 'support_documents', 'sales', 'sale') then
    tipo := 'factura';
    prefijo := 'FV';
    return;
  end if;

  if p_source = 'cash_movements' and p_source_id is not null then
    select cm.type into v_mov
      from public.cash_movements cm
     where cm.id::text = p_source_id
       and cm.organization_id = p_organization_id;
    if v_mov = 'in' then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    elsif v_mov = 'out' then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    end if;
  end if;

  if p_source = 'payments' and p_source_id is not null then
    select p.source into v_pago
      from public.payments p
     where p.id::text = p_source_id
       and p.organization_id = p_organization_id;
    if v_pago in ('invoice_sales', 'account_receivable', 'sale', 'web_order') then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    elsif v_pago in ('invoice_purchase', 'account_payable') then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    end if;
  end if;

  if p_source = 'bank_transactions' and p_source_id is not null then
    select bt.amount, bt.transaction_type into v_monto, v_banco
      from public.bank_transactions bt
     where bt.id::text = p_source_id
       and bt.organization_id = p_organization_id;
    if v_monto < 0 or (coalesce(v_monto, 0) = 0 and v_banco in ('withdrawal', 'out', 'debit', 'egreso')) then
      tipo := 'comprobante_egreso';
      prefijo := 'CE';
      return;
    elsif v_monto > 0 or v_banco in ('deposit', 'in', 'credit', 'consignacion') then
      tipo := 'recibo_caja';
      prefijo := 'RC';
      return;
    end if;
  end if;

  -- manual, stock_movements y el resto de los publicados (reversión, cartera,
  -- comisión, ajuste) comparten la nota contable.
  tipo := 'nota_contable';
  prefijo := 'NA';
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_configuracion_contable_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'La sede no pertenece a la organización'
      using errcode = '23514';
  end if;

  -- Solo en alta o cambio de cuenta (QA Soporte 25-oct): reguardar una fila heredada sin cambiarle la cuenta
  -- (p.ej. comisiones -> 5235, NULL con hijos) no debe tumbar el upsert de toda la pantalla.
  -- El upsert de PostgREST (INSERT ... ON CONFLICT DO UPDATE) dispara primero el BEFORE INSERT con la fila
  -- propuesta: si ya existe la misma (org, sede, clave) con la MISMA cuenta, no es un alta real.
  if (
       (tg_op = 'INSERT' and not exists (
          select 1 from public.configuracion_contable x
          where x.organization_id = new.organization_id
            and x.branch_id is not distinct from new.branch_id
            and x.clave = new.clave
            and x.account_code = new.account_code))
       or (tg_op = 'UPDATE' and new.account_code is distinct from old.account_code)
     ) and not exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = new.organization_id
      and c.account_code = new.account_code
      and coalesce(c.is_active, true) and coalesce(c.activa, true)
      and (
        c.es_movimiento is true
        or (c.es_movimiento is null and not exists (
              select 1 from public.chart_of_accounts h
              where h.organization_id = c.organization_id and h.parent_code = c.account_code))
      )
  ) then
    raise exception 'La cuenta % no es de movimiento (o está inactiva) en el plan de la organización', new.account_code
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
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
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales') then
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

CREATE OR REPLACE FUNCTION public.fn_trg_comprobante_al_insertar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text;
  v_prefijo text;
  v_num integer;
  v_pref text;
begin
  if new.comprobante_numero is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.posted, false) or coalesce(new.posted, false) is not true then
      return new;
    end if;
  elsif coalesce(new.posted, false) is not true then
    return new;
  end if;

  select c.tipo, c.prefijo into v_tipo, v_prefijo
    from public.fn_tipo_comprobante_de_asiento(new.organization_id, new.source, new.source_id) c;

  if v_tipo is null then
    return new;
  end if;

  select c.numero, c.prefijo into v_num, v_pref
    from public.fn_tomar_consecutivo_comprobante(new.organization_id, v_tipo, v_prefijo) c;
  new.comprobante_tipo := v_tipo;
  new.comprobante_prefijo := v_pref;
  new.comprobante_numero := v_num;
  return new;
end;
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

CREATE OR REPLACE FUNCTION public.fn_trg_moneda_base_por_defecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- Argumentos del trigger: los nombres de las columnas de moneda. La que llegue
-- NULL toma la moneda base de la organización de la fila (organization_id o,
-- en employments, la del organization_member_id). SECURITY DEFINER para que la
-- RLS de quien inserta (una RPC pública, un trigger de otra tabla) no oculte
-- la configuración de monedas; no es invocable como RPC (returns trigger).
declare
  v_fila    jsonb := to_jsonb(new);
  v_cambios jsonb := '{}'::jsonb;
  v_org     integer;
  v_moneda  text;
  i         integer;
begin
  for i in 0 .. tg_nargs - 1 loop
    if (v_fila ->> tg_argv[i]) is null then
      if v_moneda is null then
        if v_fila ? 'organization_id' then
          v_org := (v_fila ->> 'organization_id')::integer;
        elsif v_fila ? 'organization_member_id' then
          select om.organization_id into v_org
            from public.organization_members om
           where om.id = (v_fila ->> 'organization_member_id')::bigint;
        end if;
        v_moneda := public.fn_moneda_base_organizacion(v_org);
      end if;
      v_cambios := v_cambios || jsonb_build_object(tg_argv[i], v_moneda);
    end if;
  end loop;

  if v_cambios <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_cambios);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento(p_entry_id integer, p_categoria text, p_lote text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not v_orig.posted then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'Asiento % ya tiene contra-asiento', p_entry_id;
  end if;

  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, v_orig.entry_date,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  -- Copia exacta con débito y crédito intercambiados: nunca la fórmula vigente.
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
  from journal_lines jl
  where jl.journal_entry_id = p_entry_id;

  -- Original + contra-asiento = 0 por cuenta.
  if exists (
    select 1 from journal_lines jl
    where jl.journal_entry_id in (p_entry_id, v_rev_id)
    group by jl.account_code
    having sum(jl.debit) <> sum(jl.credit)
  ) then
    raise exception 'El contra-asiento de % no neutraliza alguna cuenta', p_entry_id;
  end if;

  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_categoria text, p_lote text, p_fecha timestamp with time zone, p_created_by uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig public.journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not coalesce(v_orig.posted, false) then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from public.journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'ASIENTO_YA_REVERTIDO: el asiento % ya tiene contra-asiento', p_entry_id using errcode = '23505';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, p_fecha,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, p_created_by,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
    from public.journal_lines jl
   where jl.journal_entry_id = p_entry_id;

  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_en_fecha(p_entry_id integer, p_fecha timestamp with time zone, p_categoria text, p_lote text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig journal_entries%rowtype;
  v_det text;
  v_monto numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id for update;
  if not found then raise exception 'Asiento % no existe', p_entry_id; end if;
  if not v_orig.posted then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from journal_entries
              where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'Asiento % ya tiene contra-asiento', p_entry_id;
  end if;

  -- Líneas sin cuenta y con valor: el contra-asiento COMPLETO queda pendiente (no se publica nada).
  select string_agg('línea ' || jl.id || ' ' || case when coalesce(jl.debit, 0) <> 0 then 'débito ' || jl.debit
                    else 'crédito ' || jl.credit end || coalesce(' tercero ' || jl.tercero_nit, '')
                    || coalesce(' «' || jl.description || '»', ''), '; ' order by jl.id),
         sum(abs(coalesce(jl.debit, 0) - coalesce(jl.credit, 0)))
    into v_det, v_monto
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id and nullif(btrim(jl.account_code), '') is null
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0);
  if v_det is not null then
    insert into journal_reversa_pendiente (entry_id, organization_id, failure_fact_key, fecha_anulacion, categoria, lote)
    values (p_entry_id, v_orig.organization_id, 'reversal:pendiente:' || p_entry_id, coalesce(p_fecha, now()), p_categoria, p_lote)
    on conflict (entry_id) do update set fecha_anulacion = excluded.fecha_anulacion, categoria = excluded.categoria,
      lote = excluded.lote, resolved_at = null, reversal_entry_id = null;
    perform public.fn_log_journal_failure(
      v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
      'reversal', p_entry_id::text, 'reversal:pendiente:' || p_entry_id,
      null, null, v_monto, 'linea_sin_cuenta',
      'Reversión ' || p_lote || ': contra-asiento COMPLETO del asiento ' || p_entry_id
        || ' pendiente por líneas sin cuenta (' || v_det
        || '). Asignar cuentas con fn_reversar_linea_sin_cuenta(id, {"<línea>":"<cuenta>"})');
    return null;
  end if;

  return public.fn_revertir_asiento_publicar(p_entry_id, p_fecha, p_categoria, p_lote, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_publicar(p_entry_id integer, p_fecha timestamp with time zone, p_categoria text, p_lote text, p_cuentas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id;
  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, coalesce(p_fecha, now()),
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code, 'reversal:' || p_entry_id)
  returning id into v_rev_id;
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id,
                             tercero_nit, tercero_nombre)
  select v_rev_id, coalesce(nullif(btrim(jl.account_code), ''), coalesce(p_cuentas, '{}'::jsonb) ->> jl.id::text),
         'REVERSION ' || coalesce(jl.description, ''), coalesce(jl.credit, 0), coalesce(jl.debit, 0),
         coalesce(jl.organization_id, v_orig.organization_id), jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base,
         jl.cost_center_id, jl.tercero_nit, jl.tercero_nombre
    from journal_lines jl
   where jl.journal_entry_id = p_entry_id
     and (nullif(btrim(jl.account_code), '') is not null or coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
   order by jl.id;
  if exists (select 1 from journal_lines where journal_entry_id = v_rev_id and nullif(btrim(account_code), '') is null) then
    raise exception 'Contra-asiento de % con líneas sin cuenta', p_entry_id;
  end if;
  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;
  return v_rev_id;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_reversar_linea_sin_cuenta(p_failure_id bigint, p_cuentas jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f journal_entry_failures%rowtype;
  p journal_reversa_pendiente%rowtype;
  v_k text;
  v_faltan integer;
  v_fecha timestamptz;
  v_rev integer;
begin
  select * into f from journal_entry_failures where id = p_failure_id for update;
  if not found or f.reason <> 'linea_sin_cuenta' or f.fact_key not like 'reversal:pendiente:%' then
    raise exception 'Pendiente % no es un contra-asiento pendiente por líneas sin cuenta', p_failure_id;
  end if;
  if f.resolved_at is not null then raise exception 'Pendiente % ya resuelto', p_failure_id; end if;
  select * into p from journal_reversa_pendiente
   where entry_id = substr(f.fact_key, length('reversal:pendiente:') + 1)::integer for update;
  if not found then raise exception 'Sin estado de reversa pendiente para %', f.fact_key; end if;
  if jsonb_typeof(coalesce(p_cuentas, '{}'::jsonb)) <> 'object' then
    raise exception 'p_cuentas debe ser {"<id_línea>":"<cuenta>"}';
  end if;
  for v_k in select jsonb_object_keys(coalesce(p_cuentas, '{}'::jsonb)) loop
    if not exists (select 1 from journal_lines jl where jl.id = v_k::integer and jl.journal_entry_id = p.entry_id
                     and nullif(btrim(jl.account_code), '') is null) then
      raise exception 'La línea % no es una línea sin cuenta del asiento %', v_k, p.entry_id;
    end if;
    if nullif(btrim(p_cuentas ->> v_k), '') is null then raise exception 'Cuenta vacía para la línea %', v_k; end if;
  end loop;
  update journal_reversa_pendiente set cuentas = cuentas || coalesce(p_cuentas, '{}'::jsonb)
   where entry_id = p.entry_id returning * into p;

  select count(*) into v_faltan from journal_lines jl
   where jl.journal_entry_id = p.entry_id and nullif(btrim(jl.account_code), '') is null
     and (coalesce(jl.debit, 0) <> 0 or coalesce(jl.credit, 0) <> 0)
     and nullif(btrim(p.cuentas ->> jl.id::text), '') is null;
  if v_faltan > 0 then
    update journal_entry_failures set detail = detail || ' | asignadas: ' || p.cuentas::text || ', faltan ' || v_faltan
     where id = p_failure_id;
    return null;
  end if;

  v_fecha := case when fn_is_period_open(p.organization_id, p.fecha_anulacion::date) then p.fecha_anulacion else now() end;
  v_rev := public.fn_revertir_asiento_publicar(p.entry_id, v_fecha, coalesce(p.categoria, 'anulacion'),
                                              coalesce(p.lote, p.entry_id::text), p.cuentas);
  update journal_reversa_pendiente set reversal_entry_id = v_rev, resolved_at = now() where entry_id = p.entry_id;
  update journal_entry_failures set resolved_at = now(), resolution = 'reversa_publicada:' || v_rev where id = p_failure_id;
  return v_rev;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_revertir_asiento_manual(p_entry_id integer, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_je public.journal_entries%rowtype;
  v_tz text;
  v_fecha timestamptz;
  v_rev integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_je from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'ASIENTO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'accounting.reverse') then
    raise exception 'SIN_PERMISO: revertir asientos requiere el permiso «Revertir asientos»' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'MOTIVO_REQUERIDO: explique en al menos 5 caracteres por qué se revierte' using errcode = '22023';
  end if;
  if v_je.source = 'reversal' then
    raise exception 'ES_CONTRA_ASIENTO: un contra-asiento no se revierte; registre un asiento manual nuevo' using errcode = '22023';
  end if;
  if v_je.source is distinct from 'manual' then
    raise exception 'AUTOMATICO_SE_REVIERTE_ANULANDO_DOCUMENTO: el asiento % viene de % y se revierte anulando ese documento',
      p_entry_id, coalesce(v_je.source, 'un documento') using errcode = '22023';
  end if;
  if not coalesce(v_je.posted, false) then
    raise exception 'ES_BORRADOR: un borrador se descarta, no se revierte' using errcode = '22023';
  end if;

  v_tz := public.fn_timezone_for(v_je.organization_id, v_je.branch_id);
  if public.fn_is_period_open(v_je.organization_id, (v_je.entry_date at time zone v_tz)::date) then
    v_fecha := v_je.entry_date;
  elsif public.fn_is_period_open(v_je.organization_id, public.fn_today_for(v_je.organization_id, v_je.branch_id)) then
    v_fecha := now();
  else
    raise exception 'PERIODO_CERRADO: ni el periodo del asiento ni el actual están abiertos' using errcode = '22023';
  end if;

  v_rev := public.fn_revertir_asiento_en_fecha(p_entry_id, 'manual',
             'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), v_fecha, v_uid);

  insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
  values (v_je.organization_id, 'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), 'manual',
          p_entry_id, v_rev, trim(p_motivo), v_uid);

  return v_rev;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_journal_linea_heredar_centro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_modo text;
  v_org integer;
  v_branch integer;
  v_source text;
  v_source_id text;
  v_centro uuid;
  v_slip text;
  v_dist uuid;
  v_i integer := 0;
  v_parte record;
begin
  select e.organization_id, e.branch_id, e.source, e.source_id
    into v_org, v_branch, v_source, v_source_id
    from public.journal_entries e
   where e.id = new.journal_entry_id;

  if new.organization_id is null or new.organization_id = 0 then
    new.organization_id := coalesce(v_org, new.organization_id);
  end if;
  v_org := coalesce(nullif(new.organization_id, 0), v_org);

  v_modo := public.fn_modo_centro(v_org, new.account_code);
  if v_modo = 'no_aplica' then
    new.cost_center_id := null;
    return new;
  end if;
  if new.cost_center_id is not null then
    return new;
  end if;

  if v_source = 'bank_transactions' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select b.distribucion_id into v_dist
      from public.bank_transactions b
     where b.id = v_source_id::integer
       and b.organization_id = v_org;
  elsif v_source = 'cash_movements' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select m.distribucion_id into v_dist
      from public.cash_movements m
     where m.id = v_source_id::integer
       and m.organization_id = v_org;
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.distribucion_id into v_dist
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
  end if;

  if v_dist is not null then
    for v_parte in
      select *
        from public.fn_repartir_monto(
          v_org, v_branch, new.account_code, null::uuid, v_dist,
          coalesce(new.debit, 0), coalesce(new.credit, 0),
          coalesce(new.debit_base, 0), coalesce(new.credit_base, 0)
        )
    loop
      v_i := v_i + 1;
      if v_i = 1 then
        new.debit := v_parte.debito;
        new.credit := v_parte.credito;
        new.debit_base := v_parte.debito_base;
        new.credit_base := v_parte.credito_base;
        new.cost_center_id := v_parte.cost_center_id;
      else
        insert into public.journal_lines (
          journal_entry_id, account_code, description, debit, credit,
          organization_id, currency_code, exchange_rate, debit_base, credit_base,
          cost_center_id, tercero_nit, tercero_nombre
        ) values (
          new.journal_entry_id, new.account_code, new.description,
          v_parte.debito, v_parte.credito,
          coalesce(nullif(new.organization_id, 0), v_org),
          new.currency_code, new.exchange_rate,
          v_parte.debito_base, v_parte.credito_base,
          v_parte.cost_center_id, new.tercero_nit, new.tercero_nombre
        );
      end if;
    end loop;
    if v_i > 0 then
      return new;
    end if;
  end if;

  v_slip := split_part(coalesce(v_source_id, ''), ':', 1);
  if v_source = 'payroll_slips'
     and v_slip ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.cost_center_id into v_centro
      from public.payroll_slips s
      join public.employments e on e.id = s.employment_id
     where s.id = v_slip::uuid
       and (
         e.branch_id is null
         or exists (
           select 1 from public.branches b
            where b.id = e.branch_id and b.organization_id = v_org
         )
       );
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.cost_center_id into v_centro
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
    if v_centro is null then
      select case when count(distinct ii.cost_center_id) = 1 then min(ii.cost_center_id::text)::uuid end
        into v_centro
        from public.invoice_items ii
       where ii.invoice_purchase_id = v_source_id::uuid
         and ii.cost_center_id is not null;
    end if;
  end if;

  new.cost_center_id := coalesce(v_centro, public.fn_centro_defecto(v_org, v_branch));
  if new.cost_center_id is null then
    raise warning 'centro_costo_omitido: la cuenta % quedó sin centro', new.account_code;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_redondear_asiento_pesos(p_entry_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_diff numeric;
  v_line integer;
  v_cuenta text;
begin
  select organization_id into v_org from public.journal_entries where id = p_entry_id;
  if v_org is null then
    return;
  end if;

  update public.journal_lines
     set debit = round(coalesce(debit, 0), 0),
         credit = round(coalesce(credit, 0), 0),
         debit_base = case when debit_base is null then debit_base else round(debit_base, 0) end,
         credit_base = case when credit_base is null then credit_base else round(credit_base, 0) end
   where journal_entry_id = p_entry_id;

  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0)
    into v_diff
  from public.journal_lines
  where journal_entry_id = p_entry_id;

  if v_diff = 0 then
    return;
  end if;

  if v_diff > 0 then
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and credit > 0
    order by credit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set credit = credit + v_diff,
             credit_base = case when credit_base is null then credit_base else credit_base + v_diff end
       where id = v_line;
      return;
    end if;
  else
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and debit > 0
    order by debit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set debit = debit + abs(v_diff),
             debit_base = case when debit_base is null then debit_base else debit_base + abs(v_diff) end
       where id = v_line;
      return;
    end if;
  end if;

  select c.account_code into v_cuenta
  from public.configuracion_contable c
  join public.chart_of_accounts a
    on a.organization_id = c.organization_id and a.account_code = c.account_code
  where c.organization_id = v_org
    and c.clave = case when v_diff > 0 then 'redondeo' else 'redondeo_en_contra' end
    and c.branch_id is null
    and coalesce(a.is_active, true)
    and a.es_movimiento is true
  limit 1;
  -- Ajuste al peso (contador, 25-oct): a favor 42958101, en contra 53959501. Nunca 4295/5395 (pasan a
  -- título en 134060): si la org no tiene el auxiliar, el asiento queda sin redondear y con aviso.
  if v_cuenta is null then
    select a.account_code into v_cuenta
    from public.chart_of_accounts a
    where a.organization_id = v_org and a.es_movimiento is true and coalesce(a.is_active, true)
      and a.account_code = case when v_diff > 0 then '42958101' else '53959501' end;
  end if;
  if v_cuenta is null then
    raise notice 'redondeo_sin_cuenta: org % asiento % sin auxiliar %', v_org, p_entry_id,
      case when v_diff > 0 then '42958101' else '53959501' end;
    return;
  end if;

  if v_diff > 0 then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', 0, v_diff, v_org, 0, v_diff);
  else
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', abs(v_diff), 0, v_org, abs(v_diff), 0);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_asiento_documento_por_lineas(p_id uuid, p_tipo text, p_fact_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_armado jsonb;
  v_entry_id integer;
  v_linea jsonb;
begin
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, null);
  if coalesce((v_armado->>'ok')::boolean, false) is not true then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'cuenta_linea',
      coalesce(v_armado->>'fallo', 'No se pudo armar el asiento')
    );
    return null;
  end if;

  if not public.fn_is_period_open(
    (v_armado->>'organization_id')::integer,
    ((v_armado->>'fecha')::timestamptz)::date
  ) then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'period_closed',
      'Periodo contable cerrado para la fecha ' || (((v_armado->>'fecha')::timestamptz)::date)
    );
    return null;
  end if;

  begin
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
    ) values (
      (v_armado->>'organization_id')::integer,
      (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz,
      v_armado->>'memo',
      v_armado->>'source',
      p_id::text,
      true,
      nullif(v_armado->>'created_by', '')::uuid,
      p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    return v_entry_id;
  end;

  for v_linea in select * from jsonb_array_elements(v_armado->'lineas') loop
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id, tercero_nit, tercero_nombre, cost_center_id
    ) values (
      v_entry_id,
      v_linea->>'cuenta',
      v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      (v_armado->>'organization_id')::integer,
      nullif(v_linea->>'tercero_nit', ''),
      nullif(v_linea->>'tercero_nombre', ''),
      case when p_tipo = 'compra' and exists (select 1 from public.invoice_purchase ip where ip.id = p_id and ip.organization_id = (v_armado->>'organization_id')::integer and ip.distribucion_id is not null) then null else nullif(v_linea->>'cost_center_id', '')::uuid end
    );
  end loop;
  perform public.fn_redondear_asiento_pesos(v_entry_id);
  return v_entry_id;
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

  -- redondeo_pesos: el total y el impuesto quedan en pesos y la diferencia va a la otra línea.
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
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0), public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_debit_account, p_cost_center_id, p_cuenta_sin_centro));

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_credit_account, p_cost_center_id, p_cuenta_sin_centro));
  end if;

  return v_entry_id;
end;
$function$;


create trigger trg_configuracion_contable_validar before insert or update on public.configuracion_contable
  for each row execute function fn_configuracion_contable_validar();
create trigger trg_00_moneda_base_por_defecto before insert on public.journal_entries
  for each row execute function fn_trg_moneda_base_por_defecto('currency_code', 'base_currency_code');
create trigger trg_comprobante_al_insertar before insert or update of posted on public.journal_entries
  for each row execute function fn_trg_comprobante_al_insertar();
create trigger trg_fase6_periodo_journal before insert on public.journal_entries
  for each row execute function fn_fase6_exigir_periodo_abierto();
create trigger trg_journal_entries_inmutable before delete or update on public.journal_entries
  for each row execute function fn_asiento_publicado_inmutable();
create constraint trigger trg_zz_asiento_cuadrado after insert or update on public.journal_entries
  deferrable initially deferred for each row execute function fn_trg_asiento_cuadrado();
create trigger tr_set_journal_line_org_id before insert on public.journal_lines
  for each row execute function set_journal_line_org_id();
create trigger trg_journal_linea_heredar_centro before insert on public.journal_lines
  for each row execute function fn_journal_linea_heredar_centro();
create trigger trg_journal_lines_inmutable before delete or update on public.journal_lines
  for each row execute function fn_asiento_publicado_inmutable();
create trigger trg_tercero_linea_asiento before insert on public.journal_lines
  for each row execute function fn_trg_tercero_linea_asiento();
create constraint trigger trg_zz_asiento_cuadrado after insert or delete or update on public.journal_lines
  deferrable initially deferred for each row execute function fn_trg_asiento_cuadrado();
create trigger zz_trg_puc_linea_solo_movimiento before insert on public.journal_lines
  for each row execute function fn_puc_linea_solo_movimiento();

-- Datos inventados.
insert into auth.users values ('00000000-0000-0000-0000-00000000000a');
insert into public.organizations (id) values (1), (2), (3);
insert into public.branches (id, organization_id, is_main) values (10, 1, true), (11, 1, false), (20, 2, true), (30, 3, true);
insert into public.organization_members values ('00000000-0000-0000-0000-00000000000a', 1, true);
insert into public.prueba_permiso values
  ('00000000-0000-0000-0000-00000000000a', 1, 'finance.create'),
  ('00000000-0000-0000-0000-00000000000a', 1, 'accounting.reverse');
insert into public.cost_centers (id, organization_id) values
  ('00000000-0000-0000-0000-0000000000c1', 1), ('00000000-0000-0000-0000-0000000000c2', 1);
insert into public.prueba_centro_defecto values (1, '00000000-0000-0000-0000-0000000000c1');

insert into public.chart_of_accounts (organization_id, account_code, es_movimiento, centro_costo_modo)
select o, c, m, cc from (values (1), (2), (3)) x(o), (values
  ('13050501', true, 'no_aplica'), ('41359501', true, 'obligatorio'), ('24080501', true, 'no_aplica'),
  ('11050501', true, 'no_aplica'), ('22050501', true, 'no_aplica'), ('51359501', true, 'obligatorio'),
  ('42958101', true, 'no_aplica'), ('53959501', true, 'no_aplica'),
  ('5195', false, 'no_aplica'), ('51950501', true, 'no_aplica'), ('51951001', true, 'no_aplica'), ('61350501', true, 'no_aplica')
) y(c, m, cc);

-- Organización 1: con las dos cuentas. Organización 2: sin cuenta. Organización 3: con una de título.
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values
  (1, null, 'redondeo', '42958101'), (1, null, 'redondeo_en_contra', '53959501');

\set ON_ERROR_STOP on

create function public.prueba_ok(p_nombre text, p_condicion boolean) returns void language plpgsql as $$
begin
  if p_condicion is not true then
    raise exception 'FALLO: %', p_nombre;
  end if;
  raise notice 'ok - %', p_nombre;
end $$;

create function public.prueba_doc(p_org integer, p_lineas jsonb, p_id uuid default gen_random_uuid()) returns uuid language plpgsql as $$
begin
  insert into public.prueba_armado values (p_id, jsonb_build_object(
    'ok', true, 'organization_id', p_org, 'branch_id', (select min(id) from public.branches where organization_id = p_org),
    'fecha', '2026-11-05T12:00:00-05:00', 'memo', 'Factura FV-1051', 'source', 'invoice_sales', 'lineas', p_lineas));
  return p_id;
end $$;

-- Las migraciones bajo prueba, aplicadas dos veces: tienen que ser idempotentes.
\i supabase/migrations/20261107120000_redondeo_linea_explicita.sql
\i supabase/migrations/20261107121000_reversa_una_sola_implementacion.sql
\i supabase/migrations/20261107120000_redondeo_linea_explicita.sql
\i supabase/migrations/20261107121000_reversa_una_sola_implementacion.sql

-- ============================================================
-- Redondeo por líneas (fn_asiento_documento_por_lineas)
-- ============================================================
begin;
do $$
declare
  v_doc uuid;
  v_e integer;
  v_d numeric; v_c numeric;
begin
  -- 119.000,80 = 100.000,40 + 19.000,40: en pesos da 119.001 contra 119.000. Falta un crédito: a favor.
  v_doc := public.prueba_doc(1, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'Factura FV-1051', 'debito', 0, 'credito', 100000.40),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'IVA 19 %', 'debito', 0, 'credito', 19000.40),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'Factura FV-1051', 'debito', 119000.80, 'credito', 0)));
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-favor');
  perform public.prueba_ok('a favor: se publica', v_e is not null);
  perform public.prueba_ok('a favor: las otras líneas quedan en su redondeo propio',
    (select bool_and(case account_code when '41359501' then credit = 100000 when '24080501' then credit = 19000
                                       when '13050501' then debit = 119001 else true end)
       from public.journal_lines where journal_entry_id = v_e));
  perform public.prueba_ok('a favor: línea explícita de 1 al crédito en la cuenta autorizada',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '42958101'
             and credit = 1 and debit = 0 and description = 'Redondeo a pesos'
             and redondeo_traza->>'clave' = 'redondeo' and (redondeo_traza->>'diferencia')::numeric = 1
             and (redondeo_traza->>'debitos_exactos')::numeric = 119000.80));
  perform public.prueba_ok('a favor: exactamente una línea con traza',
    (select count(*) from public.journal_lines where journal_entry_id = v_e and redondeo_traza is not null) = 1);
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_e;
  perform public.prueba_ok('a favor: asiento cuadrado', v_d = v_c and v_d = 119001);
end $$;
commit;

begin;
do $$
declare
  v_doc uuid;
  v_e integer;
  v_d numeric; v_c numeric;
begin
  -- 100,00 = 60,50 + 39,50: en pesos da 100 contra 61 + 40 = 101. Falta un débito: en contra.
  v_doc := public.prueba_doc(1, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'Línea A', 'debito', 0, 'credito', 60.50),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'Línea B', 'debito', 0, 'credito', 39.50),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'Total', 'debito', 100, 'credito', 0)));
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-contra');
  perform public.prueba_ok('en contra: línea explícita de 1 al débito en la cuenta autorizada',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '53959501'
             and debit = 1 and credit = 0 and redondeo_traza->>'clave' = 'redondeo_en_contra'));
  perform public.prueba_ok('en contra: el total del documento no se toca',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '13050501' and debit = 100));
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_e;
  perform public.prueba_ok('en contra: asiento cuadrado', v_d = v_c and v_d = 101);
end $$;
commit;

begin;
do $$
declare v_doc uuid; v_e integer;
begin
  v_doc := public.prueba_doc(1, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'Sin residuo', 'debito', 0, 'credito', 100.30),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'Total', 'debito', 100.30, 'credito', 0)));
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-sin-residuo');
  perform public.prueba_ok('sin residuo: no hay línea de redondeo',
    (select count(*) from public.journal_lines where journal_entry_id = v_e) = 2
    and not exists (select 1 from public.journal_lines where journal_entry_id = v_e and redondeo_traza is not null));
end $$;
commit;

-- Sin cuenta: pendiente visible, sin asiento y sin nada descuadrado.
do $$
declare v_doc uuid; v_e integer; f public.journal_entry_failures%rowtype;
begin
  v_doc := public.prueba_doc(2, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'Venta V-20881', 'debito', 0, 'credito', 42016.50),
    jsonb_build_object('cuenta', '24080501', 'descripcion', '19 %', 'debito', 0, 'credito', 7983.50),
    jsonb_build_object('cuenta', '11050501', 'descripcion', 'Venta V-20881', 'debito', 50000, 'credito', 0)),
    '00000000-0000-0000-0000-0000000000d1');
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-sin-cuenta');
  perform public.prueba_ok('sin cuenta: no devuelve asiento', v_e is null);
  perform public.prueba_ok('sin cuenta: no se creó ningún asiento',
    not exists (select 1 from public.journal_entries where fact_key = 'accrual:sale:prueba-sin-cuenta'));
  select * into f from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-sin-cuenta';
  perform public.prueba_ok('sin cuenta: pendiente con motivo y diferencia',
    f.reason = 'redondeo_sin_cuenta' and f.amount = 1 and f.resolved_at is null and f.detail like 'Falta la cuenta de redondeo%');
  perform public.prueba_ok('sin cuenta: guarda las líneas propuestas en pesos',
    jsonb_array_length(f.asiento_propuesto->'lineas') = 3 and f.asiento_propuesto->>'clave' = 'redondeo_en_contra');
  -- Repetir no duplica el pendiente.
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-sin-cuenta');
  perform public.prueba_ok('sin cuenta: repetir no duplica el pendiente',
    (select count(*) from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-sin-cuenta') = 1);
end $$;

-- Con una cuenta inválida configurada (de título) tampoco se publica.
alter table public.configuracion_contable disable trigger trg_configuracion_contable_validar;
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (3, null, 'redondeo_en_contra', '5195');
alter table public.configuracion_contable enable trigger trg_configuracion_contable_validar;
do $$
declare v_doc uuid; v_e integer;
begin
  v_doc := public.prueba_doc(3, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'A', 'debito', 0, 'credito', 60.50),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'B', 'debito', 0, 'credito', 39.50),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'T', 'debito', 100, 'credito', 0)));
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-cuenta-titulo');
  perform public.prueba_ok('cuenta de título en la configuración: pendiente, sin asiento',
    v_e is null and exists (select 1 from public.journal_entry_failures
      where fact_key = 'accrual:sale:prueba-cuenta-titulo' and reason = 'redondeo_sin_cuenta'
        and detail like 'La cuenta de redondeo no sirve%'));
end $$;

-- Configurar la cuenta publica el pendiente, con su fecha y su línea explícita.
insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (2, null, 'redondeo_en_contra', '53959501');
do $$
declare f public.journal_entry_failures%rowtype; v_d numeric; v_c numeric;
begin
  select * into f from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-sin-cuenta';
  perform public.prueba_ok('al configurar: el pendiente se resuelve solo', f.resolved_at is not null and f.resolved_entry_id is not null);
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = f.resolved_entry_id;
  perform public.prueba_ok('al configurar: asiento cuadrado con su línea de redondeo',
    v_d = v_c and exists (select 1 from public.journal_lines where journal_entry_id = f.resolved_entry_id
                           and account_code = '53959501' and debit = 1 and redondeo_traza is not null));
  perform public.prueba_ok('al configurar: conserva la fecha del documento',
    (select (entry_date at time zone 'America/Bogota')::date from public.journal_entries where id = f.resolved_entry_id) = date '2026-11-05');
end $$;

-- Documento anulado mientras esperaba: no se contabiliza.
do $$
declare v_doc uuid := '00000000-0000-0000-0000-0000000000d2'; v_e integer; v_f bigint;
begin
  delete from public.configuracion_contable where organization_id = 2 and clave = 'redondeo_en_contra';
  perform public.prueba_doc(2, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'A', 'debito', 0, 'credito', 60.50),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'B', 'debito', 0, 'credito', 39.50),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'T', 'debito', 100, 'credito', 0)), v_doc);
  insert into public.invoice_sales values (v_doc, 2, 'issued');
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-anulado');
  select id into v_f from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-anulado';
  update public.invoice_sales set status = 'void' where id = v_doc;
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (2, null, 'redondeo_en_contra', '53959501');
  perform public.prueba_ok('documento anulado: se resuelve sin asiento',
    not exists (select 1 from public.journal_entries where fact_key = 'accrual:sale:prueba-anulado')
    and (select resolution from public.journal_entry_failures where id = v_f) = 'documento_anulado');
  delete from public.configuracion_contable where organization_id = 2 and clave = 'redondeo_en_contra';
end $$;

-- Periodo cerrado al configurar: sigue pendiente, con el motivo a la vista.
do $$
declare v_doc uuid := '00000000-0000-0000-0000-0000000000d3'; v_e integer; v_f bigint; r jsonb;
begin
  perform public.prueba_doc(2, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'A', 'debito', 0, 'credito', 60.50),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'B', 'debito', 0, 'credito', 39.50),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'T', 'debito', 100, 'credito', 0)), v_doc);
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-cerrado');
  select id into v_f from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-cerrado';
  insert into public.prueba_periodo_cerrado values (2, date '2026-11-05');
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (2, null, 'redondeo_en_contra', '53959501');
  perform public.prueba_ok('periodo cerrado: sigue pendiente con el motivo',
    (select resolved_at is null and detail like '%está cerrado%' from public.journal_entry_failures where id = v_f));
  delete from public.prueba_periodo_cerrado;
  perform set_config('test.role', 'service_role', true);
  r := public.fn_reintentar_redondeo_pendiente(v_f);
  perform set_config('test.role', '', true);
  perform public.prueba_ok('periodo reabierto: el reintento publica', (r->>'publicado')::boolean and (r->>'resuelto')::boolean);
end $$;

-- La RPC: organización y permiso.
do $$
declare v_doc uuid := '00000000-0000-0000-0000-0000000000d4'; v_e integer; v_f bigint; r jsonb; v_err text;
begin
  delete from public.configuracion_contable where organization_id = 1 and clave = 'redondeo';
  perform public.prueba_doc(1, jsonb_build_array(
    jsonb_build_object('cuenta', '41359501', 'descripcion', 'A', 'debito', 0, 'credito', 100000.40),
    jsonb_build_object('cuenta', '24080501', 'descripcion', 'B', 'debito', 0, 'credito', 19000.40),
    jsonb_build_object('cuenta', '13050501', 'descripcion', 'T', 'debito', 119000.80, 'credito', 0)), v_doc);
  v_e := public.fn_asiento_documento_por_lineas(v_doc, 'venta', 'accrual:sale:prueba-rpc');
  select id into v_f from public.journal_entry_failures where fact_key = 'accrual:sale:prueba-rpc';

  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', true);
  perform set_config('test.role', 'authenticated', true);
  begin
    r := public.fn_reintentar_redondeo_pendiente(v_f);
    perform public.prueba_ok('RPC: otra organización no entra', false);
  exception when insufficient_privilege then
    perform public.prueba_ok('RPC: otra organización no entra', true);
  end;

  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', true);
  alter table public.configuracion_contable disable trigger trg_config_redondeo_reintentar;
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (1, null, 'redondeo', '42958101');
  alter table public.configuracion_contable enable trigger trg_config_redondeo_reintentar;
  r := public.fn_reintentar_redondeo_pendiente(v_f);
  perform public.prueba_ok('RPC: el miembro con permiso publica', (r->>'publicado')::boolean);
  perform set_config('test.uid', '', true);
  perform set_config('test.role', '', true);
end $$;

-- Un publicado no se redondea; un borrador sí, con línea explícita.
begin;
do $$
declare v_e integer; v_d numeric; v_c numeric;
begin
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, posted)
  values (1, 10, '2026-11-05', 'Borrador', 'manual', false) returning id into v_e;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit) values
    (v_e, '41359501', 'A', 0, 100000.40), (v_e, '24080501', 'B', 0, 19000.40), (v_e, '13050501', 'C', 119000.80, 0);
  perform public.fn_redondear_asiento_pesos(v_e);
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_e;
  perform public.prueba_ok('borrador: línea explícita y cuadrado',
    v_d = v_c and exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '42958101' and credit = 1));
end $$;
commit;

do $$
declare v_e integer;
begin
  select id into v_e from public.journal_entries where fact_key = 'accrual:sale:prueba-favor';
  begin
    perform public.fn_redondear_asiento_pesos(v_e);
    perform public.prueba_ok('publicado: no se redondea', false);
  exception when raise_exception then
    perform public.prueba_ok('publicado: no se redondea', sqlerrm like 'ASIENTO_PUBLICADO_INMUTABLE%');
  end;
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  begin
    perform public.fn_redondear_asiento_pesos(v_e);
    perform public.prueba_ok('publicado: ni con la bandera de mantenimiento', false);
  exception when raise_exception then
    perform public.prueba_ok('publicado: ni con la bandera de mantenimiento', true);
  end;
  perform set_config('app.contabilidad_mantenimiento', '', true);
end $$;

-- ============================================================
-- Redondeo en fn_create_journal_entry
-- ============================================================
begin;
do $$
declare v_e integer; v_d numeric; v_c numeric;
begin
  -- Total 119.000,80, IVA 19.000,40, neto 100.000,40. Antes el neto daba 100.001 sin rastro.
  v_e := public.fn_create_journal_entry(
    p_organization_id := 1, p_branch_id := 10, p_entry_date := '2026-11-05T12:00:00-05:00', p_memo := 'Venta V-1',
    p_source := 'sales', p_source_id := 'v1', p_debit_account := '11050501', p_credit_account := '41359501',
    p_amount := 119000.80, p_tax_account := '24080501', p_tax_amount := 19000.40, p_tax_is_credit := true,
    p_fact_key := 'accrual:sale:v1');
  perform public.prueba_ok('create (impuesto al crédito): el neto queda en su propio redondeo',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '41359501' and credit = 100000));
  perform public.prueba_ok('create (impuesto al crédito): línea de redondeo a favor',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '42958101' and credit = 1 and redondeo_traza is not null));
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_e;
  perform public.prueba_ok('create (impuesto al crédito): cuadrado', v_d = v_c and v_d = 119001);

  -- Compra: los débitos son neto e IVA y el crédito es el total. Aquí faltan débitos: en contra.
  v_e := public.fn_create_journal_entry(
    p_organization_id := 1, p_branch_id := 10, p_entry_date := '2026-11-05T12:00:00-05:00', p_memo := 'Compra C-1',
    p_source := 'invoice_purchase', p_source_id := 'c1', p_debit_account := '51359501', p_credit_account := '22050501',
    p_amount := 119000.80, p_tax_account := '24080501', p_tax_amount := 19000.40, p_tax_is_credit := false,
    p_fact_key := 'accrual:purchase:c1');
  perform public.prueba_ok('create (compra): línea de redondeo en contra',
    exists (select 1 from public.journal_lines where journal_entry_id = v_e and account_code = '53959501' and debit = 1 and redondeo_traza is not null));
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_e;
  perform public.prueba_ok('create (compra): cuadrado', v_d = v_c and v_d = 119001);

  -- Sin residuo: igual que siempre.
  v_e := public.fn_create_journal_entry(
    p_organization_id := 1, p_branch_id := 10, p_entry_date := '2026-11-05T12:00:00-05:00', p_memo := 'Venta V-2',
    p_source := 'sales', p_source_id := 'v2', p_debit_account := '11050501', p_credit_account := '41359501',
    p_amount := 119000, p_tax_account := '24080501', p_tax_amount := 19000, p_tax_is_credit := true,
    p_fact_key := 'accrual:sale:v2');
  perform public.prueba_ok('create sin residuo: tres líneas y ninguna de redondeo',
    (select count(*) from public.journal_lines where journal_entry_id = v_e) = 3
    and not exists (select 1 from public.journal_lines where journal_entry_id = v_e and redondeo_traza is not null));

  -- Sin impuesto: dos líneas con el mismo total, sin redondeo.
  v_e := public.fn_create_journal_entry(
    p_organization_id := 1, p_branch_id := 10, p_entry_date := '2026-11-05T12:00:00-05:00', p_memo := 'Pago',
    p_source := 'payments', p_source_id := 'p1', p_debit_account := '11050501', p_credit_account := '13050501',
    p_amount := 1000.60, p_fact_key := 'settlement:p1');
  perform public.prueba_ok('create sin impuesto: dos líneas cuadradas',
    (select count(*) = 2 and sum(debit) = 1001 and sum(credit) = 1001 from public.journal_lines where journal_entry_id = v_e));
end $$;
commit;

do $$
declare v_e integer; v_f public.journal_entry_failures%rowtype; v_d numeric; v_c numeric;
begin
  delete from public.configuracion_contable where organization_id = 3;
  v_e := public.fn_create_journal_entry(
    p_organization_id := 3, p_branch_id := 30, p_entry_date := '2026-11-05T12:00:00-05:00', p_memo := 'Venta V-3',
    p_source := 'sales', p_source_id := 'v3', p_debit_account := '11050501', p_credit_account := '41359501',
    p_amount := 119000.80, p_tax_account := '24080501', p_tax_amount := 19000.40, p_tax_is_credit := true,
    p_fact_key := 'accrual:sale:v3');
  perform public.prueba_ok('create sin cuenta: sin asiento',
    v_e is null and not exists (select 1 from public.journal_entries where fact_key = 'accrual:sale:v3'));
  select * into v_f from public.journal_entry_failures where fact_key = 'accrual:sale:v3';
  perform public.prueba_ok('create sin cuenta: pendiente con tres líneas propuestas',
    v_f.reason = 'redondeo_sin_cuenta' and jsonb_array_length(v_f.asiento_propuesto->'lineas') = 3);
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (3, null, 'redondeo', '42958101');
  select * into v_f from public.journal_entry_failures where fact_key = 'accrual:sale:v3';
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_f.resolved_entry_id;
  perform public.prueba_ok('create sin cuenta: al configurar queda publicado y cuadrado', v_f.resolved_at is not null and v_d = v_c and v_d = 119001);
end $$;

-- ============================================================
-- Reversas
-- ============================================================
-- Asiento completo: tercero, centro, sede, moneda extranjera y base.
create function public.prueba_asiento(p_clave text, p_org integer default 1, p_branch integer default 11) returns integer language plpgsql as $$
declare v_e integer;
begin
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key, currency_code, exchange_rate, base_currency_code)
  values (p_org, p_branch, '2026-11-02T12:00:00-05:00', 'Pago proveedor', 'manual', p_clave, true, p_clave, 'USD', 4100.5, 'COP') returning id into v_e;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, currency_code, exchange_rate, debit_base, credit_base, cost_center_id, tercero_nit, tercero_nombre)
  values
   (v_e, '22050501', 'Proveedor', 100, 0, 'USD', 4100.5, 410050, 0, '00000000-0000-0000-0000-0000000000c2', '900123456', 'Proveedor de prueba'),
   (v_e, '11050501', 'Banco', 0, 100, 'USD', 4100.5, 0, 410050, null, null, null);
  return v_e;
end $$;

do $$
declare
  v_o integer; v_r integer; v_r2 integer; v_r3 integer; v_rr integer;
  v_n integer;
begin
  v_o := public.prueba_asiento('pago:1');
  v_r := public.fn_revertir_asiento_en_fecha(v_o, 'anulacion_pago', 'pago:1', '2026-11-06T12:00:00-05:00'::timestamptz, '00000000-0000-0000-0000-00000000000a');
  perform public.prueba_ok('reversa: se publica con clave única',
    exists (select 1 from public.journal_entries where id = v_r and posted and fact_key = 'reversal:' || v_o and source = 'reversal' and source_id = v_o::text));
  perform public.prueba_ok('reversa: conserva sede, moneda y autor',
    exists (select 1 from public.journal_entries r join public.journal_entries o on o.id = v_o
             where r.id = v_r and r.branch_id = o.branch_id and r.currency_code = 'USD' and r.exchange_rate = 4100.5
               and r.base_currency_code = 'COP' and r.created_by = '00000000-0000-0000-0000-00000000000a'));
  select count(*) into v_n
    from public.journal_lines o
    join public.journal_lines r on r.journal_entry_id = v_r
     and r.account_code = o.account_code
     and r.debit = o.credit and r.credit = o.debit
     and r.debit_base = o.credit_base and r.credit_base = o.debit_base
     and r.currency_code is not distinct from o.currency_code
     and r.exchange_rate is not distinct from o.exchange_rate
     and r.cost_center_id is not distinct from o.cost_center_id
     and r.tercero_nit is not distinct from o.tercero_nit
     and r.tercero_nombre is not distinct from o.tercero_nombre
   where o.journal_entry_id = v_o;
  perform public.prueba_ok('reversa: cada línea copia tercero, centro, moneda y base, invertida',
    v_n = 2 and (select count(*) from public.journal_lines where journal_entry_id = v_r) = 2);
  perform public.prueba_ok('reversa: la línea sin centro sigue sin centro',
    exists (select 1 from public.journal_lines where journal_entry_id = v_r and account_code = '11050501' and cost_center_id is null));

  -- Las cuatro puertas devuelven el mismo contra-asiento.
  v_r2 := public.fn_revertir_asiento_en_fecha(v_o, now(), 'otra', 'lote');
  v_r3 := public.fn_revertir_asiento(v_o, 'otra', 'lote');
  v_rr := public.fn_revertir_asiento_publicar(v_o, now(), 'otra', 'lote', '{}'::jsonb);
  perform public.prueba_ok('doble reversa: idempotente en todas las variantes', v_r2 = v_r and v_r3 = v_r and v_rr = v_r);
  perform public.prueba_ok('doble reversa: un solo contra-asiento',
    (select count(*) from public.journal_entries where fact_key = 'reversal:' || v_o) = 1);
end $$;

-- fn_revertir_asiento usa la fecha del original.
do $$
declare v_o integer; v_r integer;
begin
  v_o := public.prueba_asiento('pago:2');
  v_r := public.fn_revertir_asiento(v_o, 'correccion_conteo', 'conteo:1');
  perform public.prueba_ok('fn_revertir_asiento: fecha del original y tercero copiado',
    (select r.entry_date = o.entry_date from public.journal_entries r, public.journal_entries o where r.id = v_r and o.id = v_o)
    and exists (select 1 from public.journal_lines where journal_entry_id = v_r and tercero_nit = '900123456'));
end $$;

-- La línea de redondeo también se revierte, y sigue siendo visible como tal.
do $$
declare v_o integer; v_r integer;
begin
  select id into v_o from public.journal_entries where fact_key = 'accrual:sale:prueba-favor';
  v_r := public.fn_revertir_asiento_en_fecha(v_o, now(), 'anulacion-factura', 'FV-1051');
  perform public.prueba_ok('reversa de un asiento con redondeo: la línea va invertida y con traza',
    exists (select 1 from public.journal_lines where journal_entry_id = v_r and account_code = '42958101' and debit = 1 and redondeo_traza is not null));
end $$;

-- Atomicidad: sin periodo abierto no queda nada, ni encabezado ni líneas.
do $$
declare v_o integer; v_r integer;
begin
  v_o := public.prueba_asiento('pago:3');
  insert into public.prueba_periodo_cerrado values (1, date '2026-11-07');
  begin
    v_r := public.fn_revertir_asiento_en_fecha(v_o, '2026-11-07T12:00:00+00:00'::timestamptz, 'anulacion', 'lote');
    perform public.prueba_ok('atómica: periodo cerrado falla', false);
  exception when others then
    perform public.prueba_ok('atómica: periodo cerrado falla sin dejar nada',
      not exists (select 1 from public.journal_entries where fact_key = 'reversal:' || v_o));
  end;
  delete from public.prueba_periodo_cerrado;
end $$;

-- Cuenta que hoy es de título: nada se publica, nada falla en silencio, y se resuelve con un auxiliar.
do $$
declare v_o integer; v_r integer; v_l integer; v_f public.journal_entry_failures%rowtype; v_n integer;
begin
  insert into public.chart_of_accounts (organization_id, account_code, es_movimiento) values (1, '519599', true);
  v_o := public.prueba_asiento('gasto:1');
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key)
  values (1, 10, '2026-11-02T12:00:00-05:00', 'Gasto', 'manual', 'gasto:2', false, 'gasto:2') returning id into v_o;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
  values (v_o, '519599', 'Gasto', 500, 0, '800', 'Tercero'), (v_o, '11050501', 'Caja', 0, 500, null, null);
  update public.journal_entries set posted = true where id = v_o;
  -- La cuenta pasó a título después de publicado el asiento.
  update public.chart_of_accounts set es_movimiento = false where organization_id = 1 and account_code = '519599';
  insert into public.chart_of_accounts (organization_id, account_code, es_movimiento) values (1, '51959901', true);

  v_r := public.fn_revertir_asiento_en_fecha(v_o, '2026-11-06T12:00:00-05:00'::timestamptz, 'anulacion_pago', 'pago:gasto');
  perform public.prueba_ok('título: la reversa devuelve NULL y no publica nada',
    v_r is null and not exists (select 1 from public.journal_entries where fact_key = 'reversal:' || v_o));
  select * into v_f from public.journal_entry_failures where fact_key = 'reversal:pendiente:' || v_o;
  perform public.prueba_ok('título: pendiente visible con el motivo y la línea',
    v_f.reason = 'reversa_cuenta_titulo' and v_f.amount = 500 and v_f.detail like '%519599%' and v_f.resolved_at is null);

  -- Repetir no duplica el pendiente.
  v_r := public.fn_revertir_asiento_en_fecha(v_o, '2026-11-06T12:00:00-05:00'::timestamptz, 'anulacion_pago', 'pago:gasto');
  perform public.prueba_ok('título: repetir no duplica el pendiente',
    (select count(*) from public.journal_entry_failures where fact_key = 'reversal:pendiente:' || v_o) = 1);

  select id into v_l from public.journal_lines where journal_entry_id = v_o and account_code = '519599';
  begin
    perform public.fn_reversar_linea_sin_cuenta(v_f.id, jsonb_build_object(v_l::text, '11050501'));
    perform public.prueba_ok('título: una cuenta de otro árbol no vale', false);
  exception when invalid_parameter_value then
    perform public.prueba_ok('título: una cuenta de otro árbol no vale', sqlerrm like 'CUENTA_NO_ES_DE_DETALLE%');
  end;
  begin
    perform public.fn_reversar_linea_sin_cuenta(v_f.id, jsonb_build_object(v_l::text, '519599'));
    perform public.prueba_ok('título: el mismo título no vale', false);
  exception when invalid_parameter_value then
    perform public.prueba_ok('título: el mismo título no vale', sqlerrm like 'CUENTA_DE_TITULO%');
  end;

  v_r := public.fn_reversar_linea_sin_cuenta(v_f.id, jsonb_build_object(v_l::text, '51959901'));
  perform public.prueba_ok('título: con el auxiliar se publica completa',
    v_r is not null and (select count(*) from public.journal_lines where journal_entry_id = v_r) = 2);
  perform public.prueba_ok('título: la línea va al auxiliar y conserva el tercero',
    exists (select 1 from public.journal_lines where journal_entry_id = v_r and account_code = '51959901' and credit = 500 and tercero_nit = '800'));
  perform public.prueba_ok('título: pendiente resuelto y enlazado',
    (select resolved_at is not null and resolved_entry_id = v_r from public.journal_entry_failures where id = v_f.id)
    and (select reversal_entry_id = v_r from public.journal_reversa_pendiente where entry_id = v_o));
  perform public.prueba_ok('título: resolver dos veces devuelve el mismo',
    public.fn_reversar_linea_sin_cuenta(v_f.id, '{}'::jsonb) = v_r);
end $$;

-- Reversa manual: guarda de permiso, motivo y pendiente.
do $$
declare v_o integer; v_r integer; v_r2 integer; v_f bigint; v_l integer;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', true);
  perform set_config('test.role', 'authenticated', true);
  v_o := public.prueba_asiento('manual:1', 1, 10);
  v_r := public.fn_revertir_asiento_manual(v_o, 'Error de digitación');
  v_r2 := public.fn_revertir_asiento_manual(v_o, 'Error de digitación');
  perform public.prueba_ok('manual: idempotente, un solo registro de reversa',
    v_r = v_r2 and (select count(*) from public.journal_reversals where original_entry_id = v_o) = 1);

  -- Pendiente por cuenta de título: el motivo espera y llega a journal_reversals al publicarse.
  update public.chart_of_accounts set es_movimiento = true where organization_id = 1 and account_code = '519599';
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key)
  values (1, 10, '2026-11-02T12:00:00-05:00', 'Gasto 3', 'manual', 'gasto:3', false, 'gasto:3') returning id into v_o;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (v_o, '519599', 'Gasto', 70, 0), (v_o, '11050501', 'Caja', 0, 70);
  update public.journal_entries set posted = true where id = v_o;
  update public.chart_of_accounts set es_movimiento = false where organization_id = 1 and account_code = '519599';

  v_r := public.fn_revertir_asiento_manual(v_o, 'Cuenta equivocada');
  perform public.prueba_ok('manual pendiente: NULL y sin registro de reversa',
    v_r is null and not exists (select 1 from public.journal_reversals where original_entry_id = v_o));
  select id into v_f from public.journal_entry_failures where fact_key = 'reversal:pendiente:' || v_o;
  select id into v_l from public.journal_lines where journal_entry_id = v_o and account_code = '519599';
  v_r := public.fn_reversar_linea_sin_cuenta(v_f, jsonb_build_object(v_l::text, '51959901'));
  perform public.prueba_ok('manual pendiente: al publicar conserva motivo y autor',
    exists (select 1 from public.journal_reversals where original_entry_id = v_o and reversal_entry_id = v_r
             and motivo = 'Cuenta equivocada' and created_by = '00000000-0000-0000-0000-00000000000a')
    and (select created_by from public.journal_entries where id = v_r) = '00000000-0000-0000-0000-00000000000a');

  insert into public.prueba_permiso values ('00000000-0000-0000-0000-00000000000a', 1, 'finance.view');
  perform public.prueba_ok('motivo: el miembro lo lee', public.fn_asiento_motivo_reversa(v_r) = 'Cuenta equivocada');
  delete from public.prueba_permiso where code = 'finance.view';
  perform public.prueba_ok('motivo: sin permiso no se muestra', public.fn_asiento_motivo_reversa(v_r) is null);
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', true);
  begin
    perform public.fn_asiento_motivo_reversa(v_r);
    perform public.prueba_ok('motivo: otra organización no entra', false);
  exception when insufficient_privilege then
    perform public.prueba_ok('motivo: otra organización no entra', true);
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', true);

  -- Sin permiso, no resuelve.
  delete from public.prueba_permiso where code = 'accounting.reverse';
  insert into public.journal_entry_failures (organization_id, source, fact_key, reason) values (1, 'reversal', 'reversal:pendiente:999999', 'reversa_cuenta_titulo') returning id into v_f;
  begin
    perform public.fn_reversar_linea_sin_cuenta(v_f, '{}'::jsonb);
    perform public.prueba_ok('resolver sin permiso se rechaza', false);
  exception when insufficient_privilege then
    perform public.prueba_ok('resolver sin permiso se rechaza', true);
  end;
  insert into public.prueba_permiso values ('00000000-0000-0000-0000-00000000000a', 1, 'accounting.reverse');
  perform set_config('test.uid', '', true);
  perform set_config('test.role', '', true);
  delete from public.journal_entry_failures where id = v_f;
end $$;

-- Permisos de ejecución.
do $$
begin
  perform public.prueba_ok('el núcleo no lo llama un usuario',
    not has_function_privilege('authenticated', 'public.fn_revertir_asiento_nucleo(integer,timestamptz,text,text,uuid,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.fn_revertir_asiento_nucleo(integer,timestamptz,text,text,uuid,jsonb)', 'execute'));
  perform public.prueba_ok('publicar un pendiente no lo llama un usuario',
    not has_function_privilege('authenticated', 'public.fn_publicar_redondeo_pendiente(bigint)', 'execute'));
  perform public.prueba_ok('las RPC con guarda las llama authenticated y no anon',
    has_function_privilege('authenticated', 'public.fn_reintentar_redondeo_pendiente(bigint)', 'execute')
    and not has_function_privilege('anon', 'public.fn_reintentar_redondeo_pendiente(bigint)', 'execute')
    and has_function_privilege('authenticated', 'public.fn_reversar_linea_sin_cuenta(bigint,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.fn_reversar_linea_sin_cuenta(bigint,jsonb)', 'execute'));
end $$;

-- Concurrencia: dos sesiones sobre el mismo asiento. La segunda espera el bloqueo y devuelve el mismo.
select public.prueba_asiento('concurrente:1') as original \gset
select dblink_connect('a', 'dbname=' || current_database() || ' host=127.0.0.1 port=' || current_setting('port') || ' user=postgres');
select dblink_connect('b', 'dbname=' || current_database() || ' host=127.0.0.1 port=' || current_setting('port') || ' user=postgres');
select dblink_exec('a', 'begin');
select * from dblink('a', format($$select public.fn_revertir_asiento_en_fecha(%s, now(), 'c', 'sesion-a')$$, :original)) as t(id integer);
select dblink_send_query('b', format($$select public.fn_revertir_asiento_en_fecha(%s, now(), 'c', 'sesion-b')$$, :original));
select pg_sleep(0.7);
do $$
begin
  perform public.prueba_ok('concurrencia: la segunda sesión espera el bloqueo', dblink_is_busy('b') = 1);
end $$;
select dblink_exec('a', 'commit');
create temp table resultado_b as select * from dblink_get_result('b') as t(id integer);
do $$
declare v_o integer := (select id from public.journal_entries where fact_key = 'concurrente:1');
begin
  perform public.prueba_ok('concurrencia: un solo contra-asiento y la segunda sesión lo devuelve',
    (select count(*) from public.journal_entries where fact_key = 'reversal:' || v_o) = 1
    and (select id from resultado_b) = (select id from public.journal_entries where fact_key = 'reversal:' || v_o));
end $$;

-- Ráfaga simultánea sin orden fijo.
select public.prueba_asiento('concurrente:2') as original2 \gset
select * from dblink_get_result('b') as t(id integer);
select dblink_send_query('a', format($$select public.fn_revertir_asiento_en_fecha(%s, now(), 'c', 'r-a')$$, :original2));
select dblink_send_query('b', format($$select public.fn_revertir_asiento(%s, 'c', 'r-b')$$, :original2));
select pg_sleep(0.5);
create temp table res_a as select * from dblink_get_result('a') as t(id integer);
create temp table res_b as select * from dblink_get_result('b') as t(id integer);
do $$
declare v_o integer := (select id from public.journal_entries where fact_key = 'concurrente:2');
begin
  perform public.prueba_ok('ráfaga: dos variantes a la vez, un solo contra-asiento',
    (select count(*) from public.journal_entries where fact_key = 'reversal:' || v_o) = 1
    and (select id from res_a) = (select id from res_b));
end $$;
select dblink_disconnect('a');
select dblink_disconnect('b');

-- Garantías finales sobre todo lo que dejó la prueba.
do $$
begin
  perform public.prueba_ok('garantía: todo asiento publicado cuadra',
    not exists (select 1 from public.journal_entries e join public.journal_lines l on l.journal_entry_id = e.id
                 where e.posted group by e.id having sum(l.debit) <> sum(l.credit)));
  perform public.prueba_ok('garantía: ninguna línea publicada nueva en cuenta de título salvo las previas al cambio',
    not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                  join public.chart_of_accounts c on c.organization_id = l.organization_id and c.account_code = l.account_code
                 where e.source = 'reversal' and c.es_movimiento is false));
  perform public.prueba_ok('garantía: sin fact_key duplicada',
    not exists (select 1 from public.journal_entries where fact_key is not null group by organization_id, fact_key having count(*) > 1));
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
