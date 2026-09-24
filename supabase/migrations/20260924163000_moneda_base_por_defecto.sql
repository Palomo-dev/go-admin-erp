-- ============================================================================
-- Moneda base de la organización como valor por defecto de los documentos
-- ============================================================================
-- Contexto (2026-09-23/24). Las columnas de moneda de los documentos del ERP
-- tenían un DEFAULT literal: 'USD' en invoice_sales, invoice_purchase,
-- opportunities, bank_accounts, commissions, pipelines y sales_targets; 'COP'
-- en quotations, shipments, journal_entries, sales_team_members,
-- shipping_rates, support_documents, employments y el módulo de transporte.
-- Un documento creado sin moneda quedaba en una moneda que la organización
-- no había escogido: los cierres de folio del PMS y los pedidos web
-- (fn_auto_journal_folio_close, fn_auto_journal_web_order) crean facturas sin
-- moneda y quedaban en USD siendo de organizaciones que facturan en pesos.
--
-- Un DEFAULT no puede depender de otra columna de la fila, así que:
--   1. fn_moneda_base_organizacion(p_org): la MISMA cadena que
--      `resolveOrgCurrency` (src/lib/services/monedaOrganizacion.ts).
--      AMBAS DEBEN CAMBIAR JUNTAS. El test
--      src/__tests__/services/monedaBaseSql.test.ts compara la tabla de países
--      de aquí con la del código y el orden de los pasos.
--   2. fn_trg_moneda_base_por_defecto(): trigger BEFORE INSERT genérico; recibe
--      las columnas por argumento y rellena con la moneda base las que llegan
--      NULL. Una moneda explícita se respeta siempre.
--   3. Se quita el DEFAULT literal de esas columnas (DROP DEFAULT es solo
--      metadatos: no toca ninguna fila). Las NOT NULL siguen siéndolo: el
--      trigger BEFORE INSERT las rellena antes del chequeo.
--   4. Cuatro funciones escribían la moneda a mano ('USD' en la comisión de
--      venta del POS, 'COP' en el lead web y en el empleo de un miembro nuevo):
--      se cambia SOLO ese literal por la función, con reemplazo verificado
--      (si el cuerpo ya no es el esperado, la migración falla y no toca nada).
--
-- No se tocan (y por qué):
--   - Cobros del SaaS a la organización (ai_credit_purchases,
--     subscription_addons, domain_purchases, addon_pricing, pricing_config,
--     provider_pricing) y el costo del proveedor de telefonía (calls.cost_currency):
--     su moneda es la del proveedor, no la de la organización.
--   - Rieles de pago colombianos (payment_qr_sessions, organization_payouts) y
--     datos bancarios del agregador (open_finance_accounts,
--     open_finance_transactions): la moneda es la del riel o la del banco.
--   - Columnas de moneda sin DEFAULT (payments, journal_lines,
--     compensation_packages, employee_loans, exchange_rates, payroll_slips):
--     hoy exigen la moneda o la dejan NULL a propósito; rellenarlas cambiaría
--     un error visible (pago sin moneda) por un pago en una moneda supuesta.
--   - Ninguna fila existente cambia.
-- ============================================================================

-- ─── 1. La cadena de resolución ─────────────────────────────────────────────
create or replace function public.fn_moneda_base_organizacion(p_org integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
-- ESPEJO de resolveOrgCurrency (src/lib/services/monedaOrganizacion.ts).
-- Si cambia una, cambia la otra, y el test monedaBaseSql.test.ts lo vigila.
declare
  v_bases   integer;
  v_codigo  text;
  v_pref    text;
  v_codigos text[];
  v_cc      text;
  v_nombre  text;
  v_iso     text;
begin
  if p_org is null then
    return 'USD';
  end if;

  -- PASO 1: la moneda marcada is_base. Con dos marcadas, el código recibe un
  -- error de maybeSingle() y sigue al paso 2; aquí se replica igual.
  select count(*), min(btrim(oc.currency_code))
    into v_bases, v_codigo
    from public.organization_currencies oc
   where oc.organization_id = p_org
     and oc.is_base is true;
  if v_bases = 1 and coalesce(v_codigo, '') <> '' then
    return upper(v_codigo);
  end if;

  -- PASO 2: la preferencia settings.finance.default_currency, solo si la
  -- organización tiene esa moneda asignada.
  select nullif(btrim(op.settings -> 'finance' ->> 'default_currency'), '')
    into v_pref
    from public.organization_preferences op
   where op.organization_id = p_org;
  if v_pref is not null and exists (
       select 1 from public.organization_currencies oc
        where oc.organization_id = p_org
          and oc.currency_code::text = v_pref
     ) then
    return upper(v_pref);
  end if;

  -- PASO 3: USD si la tiene asignada. PASO 4: la primera asignada.
  select array_agg(btrim(oc.currency_code) order by oc.created_at asc)
    into v_codigos
    from public.organization_currencies oc
   where oc.organization_id = p_org
     and coalesce(btrim(oc.currency_code), '') <> '';
  if v_codigos is not null then
    if 'USD' = any (v_codigos) then
      return 'USD';
    end if;
    return upper(v_codigos[1]);
  end if;

  -- PASO 5: la moneda del país (organizations.country_code alfa-2 o alfa-3;
  -- si no, el nombre del país sin tildes). Tabla = MONEDA_POR_PAIS +
  -- ALFA3_A_ALFA2 + nombres de countryPhoneCodes.
  select upper(btrim(coalesce(o.country_code, ''))),
         lower(translate(btrim(coalesce(o.country, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
    into v_cc, v_nombre
    from public.organizations o
   where o.id = p_org;

  with paises(iso, alfa3, nombre, moneda) as (
    values
      -- PAISES_INICIO (el test lee este bloque)
      ('CO', 'COL', 'colombia', 'COP'),
      ('MX', 'MEX', 'mexico', 'MXN'),
      ('US', 'USA', 'estados unidos', 'USD'),
      ('CA', 'CAN', 'canada', 'CAD'),
      ('AR', 'ARG', 'argentina', 'ARS'),
      ('BO', 'BOL', 'bolivia', 'BOB'),
      ('BR', 'BRA', 'brasil', 'BRL'),
      ('CL', 'CHL', 'chile', 'CLP'),
      ('CR', 'CRI', 'costa rica', 'CRC'),
      ('CU', 'CUB', 'cuba', 'CUP'),
      ('DO', 'DOM', 'republica dominicana', 'DOP'),
      ('EC', 'ECU', 'ecuador', 'USD'),
      ('SV', 'SLV', 'el salvador', 'USD'),
      ('GT', 'GTM', 'guatemala', 'GTQ'),
      ('HN', 'HND', 'honduras', 'HNL'),
      ('NI', 'NIC', 'nicaragua', 'NIO'),
      ('PA', 'PAN', 'panama', 'USD'),
      ('PY', 'PRY', 'paraguay', 'PYG'),
      ('PE', 'PER', 'peru', 'PEN'),
      ('PR', 'PRI', 'puerto rico', 'USD'),
      ('UY', 'URY', 'uruguay', 'UYU'),
      ('VE', 'VEN', 'venezuela', 'VES'),
      ('ES', 'ESP', 'espana', 'EUR'),
      ('PT', 'PRT', 'portugal', 'EUR'),
      ('FR', 'FRA', 'francia', 'EUR'),
      ('DE', 'DEU', 'alemania', 'EUR'),
      ('IT', 'ITA', 'italia', 'EUR'),
      ('GB', 'GBR', 'reino unido', 'GBP')
      -- PAISES_FIN
  )
  select p.moneda
    into v_iso
    from paises p
   where case
           -- Un alfa-2 decide solo (aunque no tenga moneda en la tabla), igual
           -- que paisIsoDeOrganizacion. Diferencia teórica: el código valida
           -- el alfa-2 contra su catálogo de países y aquí basta con que tenga
           -- dos letras. No se da: organizations.country_code tiene FK a
           -- countries, cuyos códigos son todos alfa-3.
           when v_cc ~ '^[A-Z]{2}$' then p.iso = v_cc
           when length(v_cc) = 3 and exists (select 1 from paises x where x.alfa3 = v_cc) then p.alfa3 = v_cc
           else v_nombre <> '' and p.nombre = v_nombre
         end
   limit 1;
  if v_iso is not null then
    return v_iso;
  end if;

  -- PASO 6: respaldo.
  return 'USD';
exception
  when others then
    -- Como el código: que no se pueda leer la moneda no deja sin documento.
    return 'USD';
end;
$$;

comment on function public.fn_moneda_base_organizacion(integer) is
  'Moneda base de la organización (ISO 4217). ESPEJO de resolveOrgCurrency en src/lib/services/monedaOrganizacion.ts: si cambia una, cambia la otra (test monedaBaseSql.test.ts).';

-- Se ejecuta con los permisos de quien llama (sin SECURITY DEFINER): un
-- usuario solo ve la moneda de las organizaciones que la RLS le deja leer.
revoke all on function public.fn_moneda_base_organizacion(integer) from public, anon;
grant execute on function public.fn_moneda_base_organizacion(integer) to authenticated, service_role;

-- ─── 2. Trigger genérico ────────────────────────────────────────────────────
create or replace function public.fn_trg_moneda_base_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

comment on function public.fn_trg_moneda_base_por_defecto() is
  'BEFORE INSERT: rellena con fn_moneda_base_organizacion las columnas de moneda (argumentos del trigger) que llegan NULL. Sustituye los DEFAULT literales USD/COP.';

revoke all on function public.fn_trg_moneda_base_por_defecto() from public, anon, authenticated;

-- ─── 3. Triggers y DEFAULT literales ────────────────────────────────────────
do $$
declare
  r record;
  v_cols text;
begin
  for r in
    select * from (values
      ('invoice_sales',       array['currency']),
      ('invoice_purchase',    array['currency']),
      ('opportunities',       array['currency']),
      ('quotations',          array['currency']),
      ('shipments',           array['currency']),
      ('bank_accounts',       array['currency']),
      ('commissions',         array['currency']),
      ('journal_entries',     array['currency_code', 'base_currency_code']),
      ('pipelines',           array['goal_currency']),
      ('sales_targets',       array['target_currency']),
      ('sales_team_members',  array['quota_currency']),
      ('shipping_rates',      array['currency']),
      ('support_documents',   array['currency']),
      ('transport_fares',     array['currency']),
      ('transport_incidents', array['currency']),
      ('transport_routes',    array['currency']),
      ('trip_tickets',        array['currency']),
      ('trips',               array['currency']),
      ('employments',         array['currency_code'])
    ) as t(tabla, columnas)
  loop
    -- Las columnas deben existir: un nombre mal escrito sería un trigger mudo.
    if (select count(*) from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = r.tabla
           and c.column_name = any (r.columnas)) <> cardinality(r.columnas) then
      raise exception 'moneda_base: columnas % no existen en %', r.columnas, r.tabla;
    end if;

    for i in 1 .. cardinality(r.columnas) loop
      execute format('alter table public.%I alter column %I drop default', r.tabla, r.columnas[i]);
    end loop;

    select string_agg(quote_literal(c), ', ') into v_cols from unnest(r.columnas) c;
    execute format('drop trigger if exists trg_00_moneda_base_por_defecto on public.%I', r.tabla);
    execute format(
      'create trigger trg_00_moneda_base_por_defecto before insert on public.%I '
      'for each row execute function public.fn_trg_moneda_base_por_defecto(%s)',
      r.tabla, v_cols
    );
  end loop;
end;
$$;

-- ─── 4. Literales de moneda en funciones ────────────────────────────────────
-- Reemplazo quirúrgico sobre la definición viva: exactamente una ocurrencia
-- del fragmento esperado, o la migración falla. Idempotente: si el fragmento
-- nuevo ya está, no hace nada.
do $$
declare
  r record;
  v_def text;
  v_n integer;
begin
  for r in
    select * from (values
      ('public.fn_create_commission_on_sale()',
       E'        ''USD'', ''accrued'',',
       E'        public.fn_moneda_base_organizacion(NEW.organization_id), ''accrued'','),
      ('public.web_capture_lead(integer,text,text,text,text,text,text,text)',
       E'      0,\n      ''COP'',',
       E'      0,\n      public.fn_moneda_base_organizacion(v_org.id),'),
      ('public.create_employment_for_new_member()',
       E'      48,\n      ''COP'',',
       E'      48,\n      public.fn_moneda_base_organizacion(NEW.organization_id),'),
      ('public.complete_invitation_registration(text,uuid,text,text,text,text,text)',
       E'    ''COP'',                       -- Moneda por defecto',
       E'    public.fn_moneda_base_organizacion(invite_record.organization_id), -- Moneda base de la organización')
    ) as t(firma, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(r.firma::regprocedure);
    if position(r.nuevo in v_def) > 0 then
      continue;
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.viejo, ''))) / length(r.viejo);
    if v_n <> 1 then
      raise exception 'moneda_base: % tiene % ocurrencias del literal esperado (se esperaba 1)', r.firma, v_n;
    end if;
    execute replace(v_def, r.viejo, r.nuevo);
  end loop;
end;
$$;
