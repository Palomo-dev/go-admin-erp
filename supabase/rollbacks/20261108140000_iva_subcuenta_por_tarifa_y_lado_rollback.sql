-- Reversión de supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql (H1).
--
-- Deshace los reemplazos verificados en el orden inverso (cada texto NUEVO debe aparecer exactamente una vez;
-- si la marca iva_tarifa_lado_20261108 / fn_cuenta_iva_tarifa ya no está, ese bloque no hace nada), restaura el
-- cuerpo anterior de fn_cuenta_iva (copiado de pg_get_functiondef el 2026-11-07) y borra las cuatro funciones nuevas.
-- CREATE OR REPLACE conserva dueño y ACL de las funciones existentes.
--
-- NO revierte datos: los asientos que se publicaron con una línea de IVA por tarifa mientras la migración estuvo
-- aplicada siguen publicados (los asientos publicados son inmutables; se corrigen con contra-asiento). Los pendientes
-- contables 'cuenta_no_configurada' con «Falta la subcuenta de IVA…» quedan en la bandeja y, al reintentarse
-- tras la reversión, se contabilizan con la lógica anterior.

create or replace function pg_temp.fn_reemplazo_verificado(p_def text, p_viejo text, p_nuevo text, p_etiqueta text)
returns text
language plpgsql
as $function$
declare
  v_veces integer := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
begin
  if v_veces <> 1 then
    raise exception '%: se esperaba 1 aparición del texto a reemplazar y hay %', p_etiqueta, v_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$function$;


do $do$
declare
  v_firma constant regprocedure := 'public.fn_create_journal_entry(integer,integer,timestamp with time zone,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) = 0 then
    raise notice 'public.fn_create_journal_entry: nada que revertir';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es p_tax_amount).
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      select v_entry_id, x.e->>'cuenta', 'IVA - ' || p_memo, (x.e->>'iva')::numeric, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
        from jsonb_array_elements(case when jsonb_array_length(v_iva_lineas) > 0 then v_iva_lineas
               else jsonb_build_array(jsonb_build_object('cuenta', p_tax_account, 'iva', p_tax_amount)) end) with ordinality x(e, o)
       order by x.o;$v$,
$v$      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));$v$, 'fn_create_journal_entry/iva_debito (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es p_tax_amount).
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      select v_entry_id, x.e->>'cuenta', 'IVA - ' || p_memo, 0, (x.e->>'iva')::numeric, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
        from jsonb_array_elements(case when jsonb_array_length(v_iva_lineas) > 0 then v_iva_lineas
               else jsonb_build_array(jsonb_build_object('cuenta', p_tax_account, 'iva', p_tax_amount)) end) with ordinality x(e, o)
       order by x.o;$v$,
$v$      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));$v$, 'fn_create_journal_entry/iva_credito (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      -- iva_tarifa_lado_20261108: la línea de IVA del pendiente se abre por tarifa, igual que en el asiento.
      if p_tax_account is not null and p_tax_amount > 0 and jsonb_array_length(v_iva_lineas) > 0 then
        v_lineas := jsonb_build_array(v_lineas->0)
          || (select jsonb_agg(jsonb_build_object('cuenta', x.e->>'cuenta', 'descripcion', 'IVA - ' || p_memo,
                 'debito', case when p_tax_is_credit then 0 else (x.e->>'iva')::numeric end,
                 'credito', case when p_tax_is_credit then (x.e->>'iva')::numeric else 0 end,
                 'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro))
                 order by x.o)
                from jsonb_array_elements(v_iva_lineas) with ordinality x(e, o))
          || jsonb_build_array(v_lineas->2);
      end if;
      perform public.fn_redondeo_pendiente_registrar($v$,
$v$      perform public.fn_redondeo_pendiente_registrar($v$, 'fn_create_journal_entry/pendiente (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  -- iva_tarifa_lado_20261108 (H1): la subcuenta de IVA sale de la TARIFA de las líneas del documento y del
  -- LADO (generado / descontable); una línea de IVA por tarifa. Sin subcuenta: pendiente contable, sin asiento.
  if v_iva_regla is not null or p_tax_account is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarifa', r.tarifa, 'lado', r.lado, 'motivo', r.motivo, 'iva', r.iva,
             'cuenta', public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, r.cuenta)) order by r.orden), '[]'::jsonb)
      into v_iva_lineas
      from public.fn_iva_reparto(
             p_organization_id, v_branch_id, p_source, p_source_id, coalesce(v_iva_regla, p_tax_account),
             least(greatest(round(coalesce(p_tax_amount, 0), 0), 0), round(p_amount, 0)),
             null, 0) r;
    if exists (select 1 from jsonb_array_elements(v_iva_lineas) e where nullif(e->>'cuenta', '') is null) then
      perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
        p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
        'cuenta_no_configurada',
        (select string_agg(e->>'motivo', ' · ') from jsonb_array_elements(v_iva_lineas) e
          where nullif(e->>'cuenta', '') is null));
      return null;
    end if;
    p_tax_account := coalesce(v_iva_lineas->0->>'cuenta',
      public.fn_cuenta_iva_tarifa(p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account), null, null));
  end if;$v$,
$v$  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;$v$, 'fn_create_journal_entry/cuenta (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_red jsonb;
  v_lineas jsonb;
  v_iva_lineas jsonb := '[]'::jsonb;
begin$v$,
$v$  v_red jsonb;
  v_lineas jsonb;
begin$v$, 'fn_create_journal_entry/declare (reversión)');

  execute v_def;
end;
$do$;


do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) = 0 then
    raise notice 'public.fn_armar_asiento_documento: nada que revertir';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  -- iva_tarifa_lado_20261108 (H1): una línea de IVA por tarifa; la subcuenta sale de la tarifa y del lado.
  if v_tax > 0 and v_cfg.impuesto is not null then
    for v_fila in
      select r.cuenta, r.iva, r.motivo
        from public.fn_iva_reparto(v_org, v_branch, v_source, p_id::text, v_cfg.impuesto, v_tax,
               case when p_tipo in ('compra', 'documento_soporte') then 'descontable' else 'generado' end, 2) r
       order by r.orden
    loop
    if v_fila.cuenta is null then
      return jsonb_build_object('ok', false, 'fallo', v_fila.motivo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_fila.cuenta);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_fila.iva end,
      'credito', case when v_impuesto_al_credito then v_fila.iva else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
    end loop;
  end if;$v$,
$v$  if v_tax > 0 and v_cfg.impuesto is not null then
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_cfg.impuesto);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_tax end,
      'credito', case when v_impuesto_al_credito then v_tax else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;$v$, 'fn_armar_asiento_documento/iva (reversión)');

  execute v_def;
end;
$do$;


do $do$
declare
  v_firma constant regprocedure := 'public.fn_nc_asiento_devolucion(integer,uuid)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) = 0 then
    raise notice 'public.fn_nc_asiento_devolucion: nada que revertir';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es v_tax).
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    )
    select v_entry,
      public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, coalesce(v_tax_cta, r.cuenta)),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      r.iva, 0, r.iva, 0
      from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
             coalesce(v_tax_cta, v_rule.tax_account_code), v_tax, 'generado', 2) r
     order by r.orden;$v$,
$v$    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(
        p_org, v_nc.branch_id,
        coalesce(v_tax_cta, public.fn_cuenta_iva(p_org, v_nc.branch_id, 'invoice_sales', v_rule.tax_account_code))),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      v_tax, 0, v_tax, 0
    );$v$, 'fn_nc_asiento_devolucion/iva (reversión)');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  -- iva_tarifa_lado_20261108 (H1): sin la subcuenta de una tarifa no se crea el asiento; queda el pendiente.
  if v_tax > 0 and v_rule.tax_account_code is not null and v_tax_cta is null and exists (
    select 1 from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
                                        v_rule.tax_account_code, v_tax, 'generado', 2) r
     where r.cuenta is null) then
    perform public.fn_log_journal_failure(
      p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
      'invoice_sales', p_nc::text, 'accrual:credit_note:' || p_nc::text,
      null, v_rule.credit_account_code, v_total,
      'cuenta_no_configurada',
      (select string_agg(r.motivo, ' · ') from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
                                        v_rule.tax_account_code, v_tax, 'generado', 2) r where r.cuenta is null));
    return;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values ($v$,
$v$  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values ($v$, 'fn_nc_asiento_devolucion/guarda (reversión)');

  execute v_def;
end;
$do$;


do $do$
declare
  v_firma constant regprocedure := 'public.fn_auto_journal_purchase()'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('fn_cuenta_iva_tarifa(new.organization_id' in v_def) = 0 then
    raise notice 'public.fn_auto_journal_purchase: nada que revertir';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$public.fn_cuenta_iva_tarifa(new.organization_id, new.branch_id, 'invoice_purchase', null, null, 'descontable')$v$,
$v$public.fn_cuenta_iva(new.organization_id, new.branch_id, 'invoice_purchase', null)$v$, 'fn_auto_journal_purchase/iva (reversión)');

  execute v_def;
end;
$do$;


drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);

-- fn_cuenta_iva: cuerpo anterior (última cuenta de IVA mapeada; el error H1).
create or replace function public.fn_cuenta_iva(p_organization_id integer, p_branch_id integer, p_source text, p_cuenta_regla text)
 returns text
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_map text;
  v_clave text;
  v_conf text;
begin
  -- Contador 25-oct-2026 (134115): el INC (2495xx) NO es IVA. Si la regla trae un auxiliar de INC de movimiento,
  -- se usa tal cual (ni el mapeo de IVA ni la clave iva_generado lo pisan).
  if nullif(btrim(p_cuenta_regla), '') like '2495%' and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = btrim(p_cuenta_regla)
       and c.es_movimiento is true) then
    return btrim(p_cuenta_regla);
  end if;

  select tam.account_code into v_map
    from public.tax_account_mapping tam
    left join public.organization_taxes ot
      on ot.id = tam.organization_tax_id
     and ot.organization_id = p_organization_id
    left join public.tax_templates tt
      on tt.id = tam.tax_template_id
   where tam.organization_id = p_organization_id
     and coalesce(tam.is_active, true)
     and (
       (ot.id is not null and coalesce(ot.is_active, true) and ot.kind = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%')
       or (tt.id is not null and coalesce(tt.kind, 'tax') = 'tax'
         and (coalesce(tt.code, '') ilike '%iva%' or coalesce(tt.name, '') ilike '%iva%')
         and coalesce(tt.code, '') not ilike '%rete%'
         and coalesce(tt.name, '') not ilike '%rete%')
     )
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = tam.account_code
          and c.es_movimiento is distinct from false
     )
   order by tam.updated_at desc nulls last, tam.id desc
   limit 1;
  if v_map is not null then
    return v_map;
  end if;

  v_clave := public.fn_clave_cuenta_configurable(
    p_source,
    'impuesto',
    case
      when coalesce(p_source, '') = any (array[
        'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
      ]) then '2408'  -- FIX (A): 2405 fuera de las reglas de impuesto
      else '2408'
    end
  );
  if v_clave is not null then
    select c.account_code into v_conf
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = v_clave
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    if v_conf is not null and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id
         and c.account_code = v_conf
         and c.es_movimiento is distinct from false
    ) then
      return v_conf;
    end if;
  end if;

  -- La cuenta de la regla puede ser un título (2408/240805/240810): auxiliar de sede/tarifa, sin tarifa 19%.
  return public.fn_cuenta_auxiliar_de_titulo(p_organization_id, p_branch_id, nullif(btrim(p_cuenta_regla), ''), null,
    case when coalesce(p_source, '') = any (array[
      'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
    ]) then 'descontable' else 'generado' end);
end;
$function$;

drop function if exists public.fn_iva_reparto(integer, integer, text, text, text, numeric, text, integer);
drop function if exists public.fn_iva_pesos_por_tarifa(integer, text, text);
drop function if exists public.fn_cuenta_iva_tarifa(integer, integer, text, text, numeric, text);
drop function if exists public.fn_iva_lado(text, text, text);
