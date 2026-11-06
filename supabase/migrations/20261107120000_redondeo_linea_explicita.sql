-- Hallazgo 4 (auditoría del Contador, 2026-11-06): el redondeo deja de alterar en silencio otras líneas.
--
-- Antes:
--   * fn_redondear_asiento_pesos sumaba la diferencia a la línea de mayor valor del lado corto.
--   * Corría DESPUÉS de insertar líneas en un asiento ya publicado: su UPDATE choca con
--     trg_journal_lines_inmutable y tumba la transacción del documento (cuenta propia, INC+IVA mixto).
--   * fn_create_journal_entry calculaba el neto por diferencia: el residuo se iba al ingreso sin rastro.
--   * Sin cuenta configurada caía en dos códigos fijos o dejaba solo un NOTICE.
-- Ahora:
--   * Cada línea se redondea por sí sola a pesos ANTES de insertar nada.
--   * La diferencia va en su propia línea, a la cuenta de configuracion_contable: clave `redondeo`
--     (a favor) o `redondeo_en_contra`. Sin códigos fijos: la cuenta es la autorizada o no hay línea.
--   * Traza en journal_lines.redondeo_traza (clave, diferencia, totales exactos y en pesos).
--   * Sin cuenta válida NO se crea asiento: queda en journal_entry_failures con reason
--     `redondeo_sin_cuenta` y el asiento propuesto en asiento_propuesto, que es lo que muestra la
--     pantalla y lo que se publica al configurar la cuenta. Nada descuadrado, sin tolerancias.
--   * No toca asientos publicados: fn_redondear_asiento_pesos solo trabaja sobre borradores.
-- Rollback: supabase/rollbacks/20261107120000_redondeo_linea_explicita_rollback.sql

alter table public.journal_lines add column if not exists redondeo_traza jsonb;
comment on column public.journal_lines.redondeo_traza is
  'Línea explícita de redondeo a pesos: clave de configuración, diferencia y totales exactos y en pesos. NULL en las demás líneas.';

alter table public.journal_entry_failures add column if not exists asiento_propuesto jsonb;
comment on column public.journal_entry_failures.asiento_propuesto is
  'Asiento que no se publicó (encabezado y líneas en pesos) cuando falta la cuenta de redondeo. Se publica tal cual al configurarla.';

-- Cuenta autorizada de redondeo: la de la sede y, si no hay, la de la organización. Sin códigos fijos.
create or replace function public.fn_cuenta_redondeo(
  p_org integer, p_branch integer, p_clave text, out cuenta text, out fallo text
)
returns record
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cuenta text;
begin
  select c.account_code into v_cuenta
    from public.configuracion_contable c
   where c.organization_id = p_org
     and c.clave = p_clave
     and (c.branch_id is null or c.branch_id = p_branch)
   order by c.branch_id nulls last
   limit 1;

  if v_cuenta is null then
    fallo := case when p_clave = 'redondeo'
                  then 'Falta la cuenta de redondeo a favor en la configuración contable'
                  else 'Falta la cuenta de redondeo en contra en la configuración contable' end;
    return;
  end if;

  fallo := public.fn_validar_cuenta_movimiento(p_org, v_cuenta);
  if fallo is null then
    cuenta := v_cuenta;
  else
    fallo := 'La cuenta de redondeo no sirve: ' || fallo;
  end if;
end;
$function$;

-- La línea que hace falta para cuadrar, o NULL si ya cuadra. Si no hay cuenta, `pendiente` = true.
create or replace function public.fn_linea_redondeo(
  p_org integer, p_branch integer,
  p_debitos numeric, p_creditos numeric,
  p_exacto_debitos numeric, p_exacto_creditos numeric
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dif numeric := coalesce(p_debitos, 0) - coalesce(p_creditos, 0);
  v_clave text;
  v_cuenta text;
  v_fallo text;
begin
  if v_dif = 0 then
    return null;
  end if;
  -- Sobran débitos: falta un crédito, que es a favor. Sobran créditos: falta un débito, en contra.
  v_clave := case when v_dif > 0 then 'redondeo' else 'redondeo_en_contra' end;
  select r.cuenta, r.fallo into v_cuenta, v_fallo
    from public.fn_cuenta_redondeo(p_org, p_branch, v_clave) r;

  return jsonb_build_object(
    'pendiente', v_cuenta is null,
    'fallo', v_fallo,
    'clave', v_clave,
    'cuenta', v_cuenta,
    'diferencia', abs(v_dif),
    'debito', case when v_dif < 0 then abs(v_dif) else 0 end,
    'credito', case when v_dif > 0 then v_dif else 0 end,
    'traza', jsonb_build_object(
      'clave', v_clave,
      'diferencia', abs(v_dif),
      'debitos_exactos', p_exacto_debitos,
      'creditos_exactos', p_exacto_creditos,
      'debitos_en_pesos', coalesce(p_debitos, 0),
      'creditos_en_pesos', coalesce(p_creditos, 0)
    )
  );
end;
$function$;

create or replace function public.fn_redondeo_insertar_linea(
  p_entry_id integer, p_redondeo jsonb, p_centro uuid default null
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit, cost_center_id, redondeo_traza
  ) values (
    p_entry_id, p_redondeo->>'cuenta', 'Redondeo a pesos',
    (p_redondeo->>'debito')::numeric, (p_redondeo->>'credito')::numeric,
    p_centro, p_redondeo->'traza'
  );
end;
$function$;

-- Deja el asiento pendiente y visible, con lo que se habría publicado. Un solo pendiente abierto por hecho.
create or replace function public.fn_redondeo_pendiente_registrar(
  p_org integer, p_branch integer, p_fecha timestamptz, p_source text, p_source_id text, p_fact_key text,
  p_memo text, p_created_by uuid, p_lineas jsonb, p_redondeo jsonb,
  p_exacto_debitos numeric, p_exacto_creditos numeric
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_propuesto jsonb;
  v_detalle text;
  v_id bigint;
begin
  v_propuesto := jsonb_build_object(
    'memo', p_memo, 'source', p_source, 'source_id', p_source_id, 'fact_key', p_fact_key,
    'fecha', p_fecha, 'branch_id', p_branch, 'created_by', p_created_by,
    'lineas', p_lineas,
    'clave', p_redondeo->>'clave',
    'diferencia', (p_redondeo->>'diferencia')::numeric,
    'debitos_en_pesos', (p_redondeo->'traza'->>'debitos_en_pesos')::numeric,
    'creditos_en_pesos', (p_redondeo->'traza'->>'creditos_en_pesos')::numeric,
    'exacto_debitos', p_exacto_debitos,
    'exacto_creditos', p_exacto_creditos
  );
  v_detalle := coalesce(p_redondeo->>'fallo', 'Falta la cuenta de redondeo')
    || '. Diferencia de ' || (p_redondeo->>'diferencia') || ' por redondeo: el asiento queda pendiente y no se publica descuadrado.';

  select f.id into v_id
    from public.journal_entry_failures f
   where f.organization_id = p_org
     and f.reason = 'redondeo_sin_cuenta'
     and f.resolved_at is null
     and (case when p_fact_key is not null then f.fact_key = p_fact_key
               else f.source is not distinct from p_source and f.source_id is not distinct from p_source_id end)
   order by f.id
   limit 1
   for update;

  if v_id is null then
    insert into public.journal_entry_failures (
      organization_id, branch_id, entry_date, source, source_id, fact_key,
      amount, reason, detail, asiento_propuesto
    ) values (
      p_org, p_branch, p_fecha, p_source, p_source_id, p_fact_key,
      (p_redondeo->>'diferencia')::numeric, 'redondeo_sin_cuenta', v_detalle, v_propuesto
    );
  else
    update public.journal_entry_failures
       set amount = (p_redondeo->>'diferencia')::numeric, detail = v_detalle, asiento_propuesto = v_propuesto
     where id = v_id;
  end if;
end;
$function$;

-- Solo borradores: un asiento publicado no se toca. Redondea cada línea y la diferencia va en su línea.
create or replace function public.fn_redondear_asiento_pesos(p_entry_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_branch integer;
  v_posted boolean;
  v_exacto_d numeric;
  v_exacto_c numeric;
  v_d numeric;
  v_c numeric;
  v_n integer;
  v_red jsonb;
begin
  select organization_id, branch_id, coalesce(posted, false)
    into v_org, v_branch, v_posted
    from public.journal_entries where id = p_entry_id;
  if v_org is null then
    return;
  end if;
  if v_posted then
    raise exception 'ASIENTO_PUBLICADO_INMUTABLE: el asiento % está publicado y no se redondea', p_entry_id
      using errcode = 'P0001';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into v_exacto_d, v_exacto_c, v_n
    from public.journal_lines where journal_entry_id = p_entry_id;

  update public.journal_lines
     set debit = round(coalesce(debit, 0), 0),
         credit = round(coalesce(credit, 0), 0),
         debit_base = case when debit_base is null then debit_base else round(debit_base, 0) end,
         credit_base = case when credit_base is null then credit_base else round(credit_base, 0) end
   where journal_entry_id = p_entry_id;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_d, v_c
    from public.journal_lines where journal_entry_id = p_entry_id;

  if abs(v_d - v_c) > 0.5 * v_n then
    raise exception 'ASIENTO_DESCUADRADO: el asiento % difiere en %, más de lo que explica el redondeo', p_entry_id, v_d - v_c
      using errcode = '22023';
  end if;

  v_red := public.fn_linea_redondeo(v_org, v_branch, v_d, v_c, v_exacto_d, v_exacto_c);
  if v_red is null then
    return;
  end if;
  if coalesce((v_red->>'pendiente')::boolean, false) then
    raise exception 'REDONDEO_SIN_CUENTA: %', v_red->>'fallo' using errcode = '22023';
  end if;
  perform public.fn_redondeo_insertar_linea(p_entry_id, v_red);
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
  v_lineas jsonb;
  v_exacto_d numeric;
  v_exacto_c numeric;
  v_d numeric;
  v_c numeric;
  v_red jsonb;
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

  -- Cada línea queda en pesos por sí sola. La diferencia va en su propia línea, nunca en otra.
  select coalesce(sum(coalesce((l->>'debito')::numeric, 0)), 0),
         coalesce(sum(coalesce((l->>'credito')::numeric, 0)), 0)
    into v_exacto_d, v_exacto_c
    from jsonb_array_elements(coalesce(v_armado->'lineas', '[]'::jsonb)) l;

  select coalesce(jsonb_agg(x.l || jsonb_build_object('debito', x.d, 'credito', x.c) order by x.o), '[]'::jsonb),
         coalesce(sum(x.d), 0), coalesce(sum(x.c), 0)
    into v_lineas, v_d, v_c
    from (
      select e.l, e.o,
             round(coalesce((e.l->>'debito')::numeric, 0), 0) as d,
             round(coalesce((e.l->>'credito')::numeric, 0), 0) as c
        from jsonb_array_elements(coalesce(v_armado->'lineas', '[]'::jsonb)) with ordinality e(l, o)
    ) x
   where x.d <> 0 or x.c <> 0;

  v_red := public.fn_linea_redondeo(
    (v_armado->>'organization_id')::integer, (v_armado->>'branch_id')::integer,
    v_d, v_c, v_exacto_d, v_exacto_c
  );
  if coalesce((v_red->>'pendiente')::boolean, false) then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
    perform public.fn_redondeo_pendiente_registrar(
      (v_armado->>'organization_id')::integer, (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz, v_armado->>'source', p_id::text, p_fact_key,
      v_armado->>'memo', nullif(v_armado->>'created_by', '')::uuid,
      v_lineas, v_red, v_exacto_d, v_exacto_c
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

  for v_linea in select * from jsonb_array_elements(v_lineas) loop
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
  if v_red is not null then
    perform public.fn_redondeo_insertar_linea(v_entry_id, v_red);
  end if;
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

-- Un documento anulado mientras esperaba la cuenta ya no se contabiliza.
create or replace function public.fn_documento_anulado(p_org integer, p_source text, p_source_id text)
returns boolean
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_source = 'invoice_sales' then
    return exists (select 1 from public.invoice_sales d
                    where d.id::text = p_source_id and d.organization_id = p_org
                      and d.status in ('void', 'voided', 'cancelled'));
  elsif p_source = 'invoice_purchase' then
    return exists (select 1 from public.invoice_purchase d
                    where d.id::text = p_source_id and d.organization_id = p_org
                      and d.status in ('void', 'voided', 'cancelled'));
  elsif p_source = 'sales' then
    return exists (select 1 from public.sales d
                    where d.id::text = p_source_id and d.organization_id = p_org
                      and d.status in ('void', 'voided', 'cancelled'));
  elsif p_source = 'payments' then
    return exists (select 1 from public.payments d
                    where d.id::text = p_source_id and d.organization_id = p_org
                      and d.status in ('void', 'voided', 'cancelled'));
  end if;
  return false;
end;
$function$;

-- Publica el asiento propuesto de un pendiente. Interna: la llaman la RPC y el disparador de configuración.
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

-- Reintento desde la pantalla. La organización sale del pendiente y el permiso, de la sesión.
create or replace function public.fn_reintentar_redondeo_pendiente(p_failure_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_entry integer;
  v_fila public.journal_entry_failures%rowtype;
begin
  select organization_id into v_org from public.journal_entry_failures where id = p_failure_id;
  if v_org is null then
    raise exception 'NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if auth.uid() is not null and not public.fn_tiene_permiso(v_org, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  v_entry := public.fn_publicar_redondeo_pendiente(p_failure_id);
  select * into v_fila from public.journal_entry_failures where id = p_failure_id;
  return jsonb_build_object(
    'publicado', v_entry is not null,
    'journal_entry_id', v_entry,
    'resuelto', v_fila.resolved_at is not null,
    'detalle', v_fila.detail
  );
end;
$function$;

-- Al configurar la cuenta, los pendientes de la organización se publican solos.
create or replace function public.fn_trg_config_redondeo_reintentar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id bigint;
begin
  for v_id in
    select f.id
      from public.journal_entry_failures f
     where f.organization_id = new.organization_id
       and f.reason = 'redondeo_sin_cuenta'
       and f.resolved_at is null
       and f.asiento_propuesto->>'clave' = new.clave
     order by f.id
  loop
    begin
      perform public.fn_publicar_redondeo_pendiente(v_id);
    exception when others then
      -- Guardar la cuenta no se cae por un asiento: el motivo queda en el pendiente, a la vista.
      update public.journal_entry_failures
         set detail = 'No se pudo publicar: ' || sqlerrm
       where id = v_id;
    end;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_config_redondeo_reintentar on public.configuracion_contable;
create trigger trg_config_redondeo_reintentar
  after insert or update of account_code on public.configuracion_contable
  for each row
  when (new.clave in ('redondeo', 'redondeo_en_contra'))
  execute function public.fn_trg_config_redondeo_reintentar();

revoke all on function public.fn_cuenta_redondeo(integer, integer, text) from public, anon, authenticated;
revoke all on function public.fn_linea_redondeo(integer, integer, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.fn_redondeo_insertar_linea(integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_redondeo_pendiente_registrar(integer, integer, timestamptz, text, text, text, text, uuid, jsonb, jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public.fn_documento_anulado(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_publicar_redondeo_pendiente(bigint) from public, anon, authenticated;
revoke all on function public.fn_trg_config_redondeo_reintentar() from public, anon, authenticated;
revoke all on function public.fn_reintentar_redondeo_pendiente(bigint) from public, anon;

grant execute on function public.fn_cuenta_redondeo(integer, integer, text) to service_role;
grant execute on function public.fn_linea_redondeo(integer, integer, numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.fn_redondeo_insertar_linea(integer, jsonb, uuid) to service_role;
grant execute on function public.fn_redondeo_pendiente_registrar(integer, integer, timestamptz, text, text, text, text, uuid, jsonb, jsonb, numeric, numeric) to service_role;
grant execute on function public.fn_documento_anulado(integer, text, text) to service_role;
grant execute on function public.fn_publicar_redondeo_pendiente(bigint) to service_role;
grant execute on function public.fn_reintentar_redondeo_pendiente(bigint) to authenticated, service_role;
