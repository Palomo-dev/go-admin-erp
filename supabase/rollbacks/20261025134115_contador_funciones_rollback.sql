-- Rollback de 20261025134115: vuelven las versiones anteriores (vivas / 134075 / 134105). Revertir ANTES 134110.

CREATE OR REPLACE FUNCTION public.fn_propuesta_configuracion_sector(p_type_id integer)
 RETURNS TABLE(clave text, account_code text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '414015'
        when 2 then '41400501'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '41400501'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '61400501' else '61350501' end
      when 'faltante_inventario' then case when p_type_id in (1, 2) then '61400502' else v.defecto end
      -- Inventario: nunca 1405 ni el título 1435 (título en 55 de 56 orgs H/R): auxiliar de movimiento
      -- 14350101, igual que el TS (QA 25-oct). fn_sembrar_configuracion_contable puede afinarlo por sede.
      when 'inventario' then '14350101'
      -- Hoteles (134070): 4175 es título; devoluciones y descuentos en sus auxiliares.
      when 'devoluciones' then case when p_type_id = 2 then '41750101' else v.defecto end
      when 'descuentos' then case when p_type_id = 2 then '41750102' else v.defecto end
      else v.defecto
    end
  from (values
    ('caja', '1105'),
    ('bancos', '1110'),
    ('clientes', '1305'),
    ('proveedores', '2205'),
    ('ventas_productos', '4135'),
    ('ventas_servicios', '4235'),
    ('devoluciones', '4175'),
    ('descuentos', '4175'),
    ('costo_ventas', '61350501'),
    ('inventario', '14350101'),
    ('iva_generado', '24080501'),
    ('iva_descontable', '24081001'),
    ('retefuente', '2365'),
    ('reteiva', '2367'),
    ('reteica', '2368'),
    ('propinas', '5105'),
    ('comisiones', '529505'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370'),
    ('faltante_inventario', '519595'),
    ('gastos_extraordinarios', '5315'),
    ('consumo_interno', '519595'),
    ('manifiesto_por_pagar', '2205'),
    ('manifiesto_transporte', '2335'),
    ('saldo_inicial', '3105'),
    ('impuesto_consumo', '2495'),
    ('redondeo', '42958101'),
    ('ingresos_diversos', '42959501'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$function$;

CREATE OR REPLACE FUNCTION public.fn_cuenta_iva(p_organization_id integer, p_branch_id integer, p_source text, p_cuenta_regla text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_map text;
  v_clave text;
  v_conf text;
begin
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
      ]) then '2405'
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_regla_devengo_venta(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recv text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.credit_account_code into v_recv
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select coalesce(v_recv, r.debit_account_code),
         r.credit_account_code,
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
    and r.credit_account_code like '4%'
  order by
    (r.debit_account_code = v_recv) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_credit is null and v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if coalesce(v_type, 3) in (1, 2, 3)
       and v_credit in ('4105', '4110', '4115', '4135', '4140', '414005', '414015', '414095') then
      v_destino := public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos');
      if v_destino is null then
        v_destino := case
          when v_type = 1 then '414015'
          when v_type = 2 and exists (
            select 1 from public.chart_of_accounts c
            where c.organization_id = p_organization_id and c.account_code = '4140'
              and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
          ) then '4140'
          when v_type = 2 then '414005'
          else '4135'
        end;
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_generado'),
        public.fn_cuenta_auxiliar_de_titulo(p_organization_id, null, '240805', null, 'generado'));
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule record;
  v_entry_id integer;
  v_fact_key text;
  v_debito text;
  v_credito text;
  v_aux text;
  v_impuesto text;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'received' then
    return new;
  end if;

  if coalesce(new.total, 0) >= 0 and round(coalesce(new.total, 0), 0) <= 0 then
    return new;
  end if;

  v_fact_key := 'accrual:purchase:' || new.id::text;

  if exists (
    select 1 from journal_entries
    where organization_id = new.organization_id
      and source = 'invoice_purchase'
      and source_id = new.id::text
      and memo like 'Compra %'
  ) then
    return new;
  end if;

  select * into v_rule from fn_regla_devengo_compra(new.organization_id);

  if v_rule.debit_account_code is null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key, null, null, new.total,
      'no_rule', 'Sin regla contable activa de compra');
    return new;
  end if;

  v_debito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.debit_account_code
  );
  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  v_aux := public.fn_asegurar_auxiliar_1435(new.organization_id, new.branch_id);
  if v_aux is not null and (
       v_debito is null
       or v_debito in ('1405', '1435')
       or v_debito like '1405%'
       or v_debito like '1435%'
       or left(v_debito, 1) = '6'
     ) then
    v_debito := v_aux;
  end if;

  if v_credito is null
     or v_credito in ('2105', '1405', '1435')
     or v_credito like '1405%'
     or v_credito like '1435%'
     or left(v_credito, 1) = '6' then
    v_credito := coalesce(
      public.fn_puc_cuenta_para_asiento(new.organization_id, '2205', 'Proveedores nacionales'),
      v_credito
    );
  end if;

  -- IVA descontable (QA 25-oct: antes '240810' fijo sin mirar es_movimiento, 64 reglas). Ahora:
  -- mapeo de impuesto / clave iva_descontable (fn_cuenta_iva) y, si no, el auxiliar de 240810 de la
  -- sede (tarifa 19% si la línea no la trae). La cuenta de la regla, si es título, pasa por el resolver.
  v_impuesto := nullif(btrim(v_rule.tax_account_code), '');
  if v_impuesto like '2405%' then
    v_impuesto := null;
  end if;
  if v_impuesto is not null and v_impuesto <> '2408' then
    v_impuesto := public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id, v_impuesto, null, 'descontable');
  else
    v_impuesto := coalesce(
      public.fn_cuenta_iva(new.organization_id, new.branch_id, 'invoice_purchase', null),
      public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id, '240810', null, 'descontable')
    );
  end if;
  if btrim(coalesce(v_rule.tax_account_code, '')) = '2408' then
    perform public.fn_marcar_revision_iva(new.organization_id, 'invoice_purchase', new.id::text, '2408', v_impuesto);
  end if;

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then
    v_entry_id := public.fn_asiento_documento_por_lineas(new.id, 'compra', v_fact_key);
  elsif public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id) is not null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'tercero_requerido',
      public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id));
  else
    v_entry_id := fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := new.branch_id,
      p_entry_date := coalesce(new.issue_date, now()),
      p_memo := 'Compra ' || coalesce(new.number_ext, new.id::text),
      p_source := 'invoice_purchase',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := new.total,
      p_tax_account := v_impuesto,
      p_tax_amount := case when v_rule.use_tax_from_document then new.tax_total else 0 end,
      p_tax_is_credit := false,
      p_fact_key := v_fact_key
    );
  end if;

  perform fn_asiento_compra_aplicar_retenciones(v_entry_id, new.id, v_credito);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_folio_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rule RECORD;
    v_folio RECORD;
    v_reservation RECORD;
    v_amount numeric;
    v_description text;
    v_source text;
    v_priority smallint;
BEGIN
    v_amount := COALESCE(NEW.amount, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Obtener folio y reserva para organization_id y branch_id
    SELECT f.id, f.reservation_id INTO v_folio
    FROM folios f
    WHERE f.id = NEW.folio_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT r.organization_id, r.branch_id INTO v_reservation
    FROM reservations r
    WHERE r.id = v_folio.reservation_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Determinar prioridad segun el source del folio_item
    v_source := NEW.source;
    v_priority := CASE
        WHEN v_source = 'room' OR v_source = 'hospedaje' THEN 10
        WHEN v_source = 'pos' OR v_source = 'food' OR v_source = 'minibar' THEN 11
        ELSE 12
    END;

    -- Buscar regla contable por prioridad
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_reservation.organization_id
      AND source_type = 'folio_item'
      AND event_type = 'created'
      AND priority = v_priority
      AND is_active = true
    LIMIT 1;

    -- Fallback: cualquier regla de folio_item
    IF NOT FOUND THEN
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_reservation.organization_id
          AND source_type = 'folio_item'
          AND event_type = 'created'
          AND is_active = true
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_description := 'Cargo Folio - ' || COALESCE(NEW.description, v_source);

    -- CORREGIDO: orden correcto de parámetros
    PERFORM fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id := COALESCE(v_reservation.branch_id, 0),
        p_entry_date := COALESCE(NEW.created_at, now()),
        p_memo := v_description,
        p_source := 'folio_items',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_amount
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_correccion_flujo_borradores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_editar integer := 0;
  v_org integer;
  v_grupo text;
  v_key text;
  v_entry integer;
  v_posted boolean;
  v_branch integer;
  v_tz text;
  v_fecha timestamptz;
  v_memo text;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  r record;
  v_solape numeric;
  v_debito numeric;
  v_linea integer;
  v_credito numeric;
  v_quitar numeric;
begin
  if auth.role() in ('anon', 'authenticated') then
    raise exception 'sin_permiso';
  end if;

  if not exists (
    select 1 from public.journal_entries
    where id = 811 and organization_id = 130 and source = 'invoice_sales'
      and memo = 'Venta HB-0012' and posted is true
  ) then
    raise exception 'el asiento 811 no es la factura anulada de la org 130';
  end if;

  if exists (
    select 1 from public.journal_entries
    where fact_key = 'reversal:811' and organization_id = 130 and posted is true
  ) then
    raise exception 'el asiento 811 ya tiene un reverso publicado';
  end if;

  if (
    select round(sum(case when account_code = '2405' then debit else 0 end), 2)
         + round(sum(case when account_code = '4105' then credit else 0 end), 2)
         + round(sum(case when account_code = '1305' then debit else 0 end), 2)
    from public.journal_lines
    where journal_entry_id = 811
  ) is distinct from 1000000.00 then
    raise exception 'las lineas del asiento 811 no coinciden con el comprobante a revertir';
  end if;

  drop table if exists pg_temp._corr_dobles;
  create temporary table _corr_dobles as
  select ia.organization_id, ia.id
  from public.inventory_adjustments ia
  where ia.organization_id <> 149
    and ia.type = 'gain'
    and exists (
      select 1 from public.journal_entries je
      where je.organization_id = ia.organization_id
        and je.source = 'inventory_adjustment'
        and je.source_id = ia.id::text
        and je.posted is true
    )
    and exists (
      select 1
      from public.stock_movements sm
      join public.journal_entries jes
        on jes.organization_id = sm.organization_id
       and jes.source = 'stock_movements'
       and jes.source_id = sm.id::text
       and jes.posted is true
      where sm.organization_id = ia.organization_id
        and sm.source = 'adjustment'
        and sm.source_id = ia.id::text
    );

  drop table if exists pg_temp._corr_solape;
  create temporary table _corr_solape as
  select d.organization_id, jl.account_code, sum(jl.debit) as monto
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
   and sm.direction = 'out'
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl
    on jl.journal_entry_id = je.id
   and jl.debit > 0
   and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
  group by d.organization_id, jl.account_code
  having sum(jl.debit) >= 0.01;

  with marca as (
    insert into public.correccion_flujo_linea_respaldo (accion)
    values ('edicion_borradores')
    on conflict (accion) where journal_line_id is null do nothing
    returning id
  )
  select count(*) into v_editar from marca;

  if v_editar = 1 then
    if exists (
      select 1
      from public.journal_entries je
      where je.posted is true
        and je.fact_key like 'regla_contable:%'
        and je.organization_id <> 149
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    ) then
      raise exception 'un comprobante regla_contable ya esta publicado';
    end if;

    for r in
      select je.id as entry_id, je.organization_id
      from public.journal_entries je
      where je.posted is false
        and je.organization_id <> 149
        and je.fact_key = 'regla_contable:' || je.organization_id::text
        and (
          exists (
            select 1 from public.journal_lines jl
            where jl.journal_entry_id = je.id
              and (jl.account_code = '5150' or jl.account_code like '5150-%')
              and jl.credit > 0
          )
          or exists (
            select 1 from pg_temp._corr_solape s
            where s.organization_id = je.organization_id
          )
        )
    loop
      select coalesce(sum(jl.credit), 0) into v_quitar
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      select coalesce(sum(monto), 0) into v_solape
      from pg_temp._corr_solape
      where organization_id = r.organization_id;

      select count(*), coalesce(sum(debit), 0)
        into v_linea, v_debito
      from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit > 0;

      if v_linea <> 1 or v_debito + 0.02 < v_quitar + v_solape then
        raise exception 'la org % no puede absorber el credito de 5150 o el solape', r.organization_id;
      end if;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'debito_original', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and jl.account_code = '519595'
        and jl.debit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      insert into public.correccion_flujo_linea_respaldo (
        accion, journal_line_id, journal_entry_id, organization_id, account_code,
        description, debit, credit, debit_base, credit_base
      )
      select 'quitar_5150', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
             jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
      from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0
      on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

      delete from public.journal_lines jl
      where jl.journal_entry_id = r.entry_id
        and (jl.account_code = '5150' or jl.account_code like '5150-%')
        and jl.credit > 0;

      for v_cuenta in
        select account_code from pg_temp._corr_solape where organization_id = r.organization_id
      loop
        select coalesce(sum(monto), 0) into v_solape
        from pg_temp._corr_solape
        where organization_id = r.organization_id
          and account_code = v_cuenta;

        select jl.id, jl.credit into v_linea, v_credito
        from public.journal_lines jl
        where jl.journal_entry_id = r.entry_id
          and jl.account_code = v_cuenta
          and jl.credit > 0
        order by jl.credit desc, jl.id
        limit 1;

        if v_linea is null or v_credito + 0.02 < v_solape then
          raise exception 'la org % no tiene credito suficiente en %', r.organization_id, v_cuenta;
        end if;

        insert into public.correccion_flujo_linea_respaldo (
          accion, journal_line_id, journal_entry_id, organization_id, account_code,
          description, debit, credit, debit_base, credit_base
        )
        select 'quitar_solape_6105', jl.id, jl.journal_entry_id, jl.organization_id, jl.account_code,
               jl.description, jl.debit, jl.credit, jl.debit_base, jl.credit_base
        from public.journal_lines jl
        where jl.id = v_linea
        on conflict (accion, journal_line_id) where journal_line_id is not null do nothing;

        if v_credito - v_solape <= 0.005 then
          delete from public.journal_lines where id = v_linea;
        else
          update public.journal_lines
             set credit = credit - v_solape,
                 credit_base = credit - v_solape,
                 updated_at = now()
           where id = v_linea;
        end if;
      end loop;

      update public.journal_lines
         set debit = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             debit_base = debit - v_quitar - (
               select coalesce(sum(monto), 0) from pg_temp._corr_solape where organization_id = r.organization_id
             ),
             updated_at = now()
       where journal_entry_id = r.entry_id
         and account_code = '519595'
         and debit > 0;

      delete from public.journal_lines
      where journal_entry_id = r.entry_id
        and account_code = '519595'
        and debit <= 0.005
        and credit <= 0.005;
    end loop;
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d, coalesce(sum(credit), 0) as c
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where je.fact_key like 'regla_contable:%'
      and je.posted is false
      and l.d is distinct from l.c
  ) then
    raise exception 'el borrador regla_contable quedo descuadrado';
  end if;

  drop table if exists pg_temp._corr_cruda;
  create temporary table _corr_cruda (
    organization_id integer,
    grupo text,
    clase text,
    cuenta text,
    debito numeric,
    credito numeric
  );

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_masivo', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.stock_movements sm
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where sm.organization_id in (137, 338)
    and sm.organization_id <> 149
    and sm.source = 'adjustment'
    and sm.source_id is null
    and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    and not exists (
      select 1 from public.journal_entries rev
      where rev.organization_id = je.organization_id
        and rev.posted is true
        and rev.fact_key = 'reversal:' || je.id::text
    )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select je.organization_id, 'reversion', 'reversion_sobrante', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from pg_temp._corr_dobles d
  join public.stock_movements sm
    on sm.organization_id = d.organization_id
   and sm.source = 'adjustment'
   and sm.source_id = d.id::text
  join public.journal_entries je
    on je.organization_id = sm.organization_id
   and je.source = 'stock_movements'
   and je.source_id = sm.id::text
   and je.posted is true
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where not exists (
    select 1 from public.journal_entries rev
    where rev.organization_id = je.organization_id
      and rev.posted is true
      and rev.fact_key = 'reversal:' || je.id::text
  )
  group by je.organization_id, jl.account_code
  having round(sum(jl.debit), 0) <> 0 or round(sum(jl.credit), 0) <> 0;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reversion', 'reversion_factura_anulada', jl.account_code,
         round(sum(jl.credit), 0), round(sum(jl.debit), 0)
  from public.journal_lines jl
  where jl.journal_entry_id = 811
  group by jl.account_code;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2105', '2105', s.neto, 0
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2105', s.destino, 0, s.neto
  from (
    select je.organization_id,
           round(sum(jl.credit) - sum(jl.debit), 0) as neto,
           case when o.type_id in (4, 6) then '2335' else '2205' end as destino
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.organizations o on o.id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.account_code = '2105'
    group by je.organization_id, o.type_id
    having round(sum(jl.credit) - sum(jl.debit), 0) >= 1
  ) s;

  drop table if exists pg_temp._corr_2405;
  create temporary table _corr_2405 as
  with recursive caminata as (
    select je.id, je.organization_id, je.source, je.fact_key, je.source as raiz, 0 as nivel
    from public.journal_entries je
    where je.posted is true
      and je.organization_id <> 149
      and je.id <> 811
      and exists (
        select 1 from public.journal_lines jl
        where jl.journal_entry_id = je.id
          and jl.account_code = '2405'
      )
    union all
    select c.id, c.organization_id, c.source, padre.fact_key, padre.source, c.nivel + 1
    from caminata c
    join public.journal_entries padre
      on c.raiz = 'reversal'
     and padre.id::text = regexp_replace(coalesce(c.fact_key, ''), '^reversal:', '')
     and c.nivel < 4
  ),
  raices as (
    select distinct on (c.id) c.id, c.raiz
    from caminata c
    order by c.id, c.nivel desc
  )
  select je.organization_id, je.id as entry_id, je.source, ra.raiz, jl.debit, jl.credit
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join raices ra on ra.id = je.id
  where jl.account_code = '2405';

  if exists (
    select 1 from pg_temp._corr_2405
    where raiz not in (
      'invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable',
      'invoice_sales', 'sales', 'reservation', 'credit_note'
    )
  ) then
    raise exception 'hay 2405 sin clasificar';
  end if;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', public.fn_cuenta_auxiliar_de_titulo(s.organization_id, null, '240810', null, 'descontable'), s.neto, 0
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_descontable', '2405', 0, s.neto
  from (
    select organization_id, round(sum(debit - credit), 0) as neto
    from pg_temp._corr_2405
    where raiz in ('invoice_purchase', 'purchase', 'purchase_order', 'accounts_payable')
    group by organization_id
    having round(sum(debit - credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then '2405' else public.fn_cuenta_auxiliar_de_titulo(s.organization_id, null, '240805', null, 'generado') end,
         abs(s.neto), 0
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_2405_generado',
         case when s.neto >= 0 then public.fn_cuenta_auxiliar_de_titulo(s.organization_id, null, '240805', null, 'generado') else '2405' end,
         0, abs(s.neto)
  from (
    select organization_id, round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0) as neto
    from pg_temp._corr_2405
    group by organization_id
    having abs(round(sum(
      case
        when credit > 0 and (
          source in ('invoice_sales', 'sales', 'reservation')
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then credit
        when debit > 0 and (
          source = 'credit_note'
          or (source = 'reversal' and raiz in ('invoice_sales', 'sales', 'reservation', 'credit_note'))
        ) then -debit
        else 0
      end
    ), 0)) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_5150', '5145', s.neto, 0
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s
  union all
  select s.organization_id, 'reclasificacion', 'reclas_5150', s.account_code, 0, s.neto
  from (
    select je.organization_id, jl.account_code,
           round(sum(jl.debit) - sum(jl.credit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.posted is true
      and je.organization_id <> 149
      and (jl.account_code = '5150' or jl.account_code like '5150-%')
    group by je.organization_id, jl.account_code
    having round(sum(jl.debit) - sum(jl.credit), 0) >= 1
  ) s;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.account_code, s.monto, 0
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else public.fn_cuenta_auxiliar_de_titulo(ia.organization_id, null, '4295')
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null
  union all
  select s.organization_id, 'reclasificacion', 'reclas_4250', s.destino, 0, s.monto
  from (
    select ia.organization_id, jl.account_code,
           case
             when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
             when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
             when lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit') then null
             else public.fn_cuenta_auxiliar_de_titulo(ia.organization_id, null, '4295')
           end as destino,
           round(sum(jl.credit), 0) as monto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    join public.inventory_adjustments ia
      on je.source = 'inventory_adjustment'
     and je.source_id = ia.id::text
     and ia.organization_id = je.organization_id
    where je.posted is true
      and je.organization_id <> 149
      and jl.credit > 0
      and (jl.account_code = '4250' or jl.account_code like '4250-%')
      and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
    group by ia.organization_id, jl.account_code, 3
    having round(sum(jl.credit), 0) >= 1
  ) s
  where s.destino is not null;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select 130, 'reclasificacion', 'reclas_4105', '4105', s.neto, 0
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1
  union all
  select 130, 'reclasificacion', 'reclas_4105', '4140', 0, s.neto
  from (
    select round(sum(jl.credit) - sum(jl.debit), 0) as neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = 130
      and je.posted is true
      and je.id <> 811
      and jl.account_code = '4105'
  ) s
  where s.neto >= 1;

  insert into pg_temp._corr_cruda (organization_id, grupo, clase, cuenta, debito, credito)
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.destino, s.residual, 0
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and (c.account_code in ('6135', '6140') or c.account_code ~ '^61(35|40)05[0-9]{2}$')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then public.fn_cuenta_auxiliar_de_titulo(base.organization_id, null, '6140') else public.fn_cuenta_auxiliar_de_titulo(base.organization_id, null, '6135') end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto
             + coalesce(g.neto, 0)
             + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code
  union all
  select s.organization_id, 'reclasificacion', 'reclas_6105_01', s.account_code, 0, s.residual
  from (
    select base.organization_id, base.account_code,
           round(base.neto, 0) as residual,
           coalesce(
             (
               select c.account_code
               from public.configuracion_contable c
               join public.chart_of_accounts a
                 on a.organization_id = c.organization_id
                and a.account_code = c.account_code
               where c.organization_id = base.organization_id
                 and c.clave = 'costo_ventas'
                 and c.branch_id is null
                 and (c.account_code in ('6135', '6140') or c.account_code ~ '^61(35|40)05[0-9]{2}$')
                 and coalesce(a.is_active, true)
                 and a.es_movimiento is distinct from false
               limit 1
             ),
             case when o.type_id in (1, 2) then public.fn_cuenta_auxiliar_de_titulo(base.organization_id, null, '6140') else public.fn_cuenta_auxiliar_de_titulo(base.organization_id, null, '6135') end
           ) as destino
    from (
      select p.organization_id, p.account_code,
             p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
      from (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is true
          and je.organization_id <> 149
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) p
      left join (
        select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
        from public.journal_lines jl
        join public.journal_entries je on je.id = jl.journal_entry_id
        where je.posted is false
          and je.fact_key like 'regla_contable:%'
          and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
        group by je.organization_id, jl.account_code
      ) g
        on g.organization_id = p.organization_id
       and g.account_code = p.account_code
      left join (
        select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
        from pg_temp._corr_cruda c
        where c.grupo = 'reversion'
          and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
        group by c.organization_id, c.cuenta
      ) v
        on v.organization_id = p.organization_id
       and v.account_code = p.account_code
    ) base
    join public.organizations o on o.id = base.organization_id
    where base.organization_id not in (137, 338, 149)
      and round(base.neto, 0) >= 1
  ) s
  where s.destino is distinct from s.account_code;

  if not exists (
    select 1 from pg_temp._corr_cruda
    where organization_id = 137 and clase = 'reversion_masivo'
  ) then
    raise exception 'no se encontro el ajuste masivo pendiente de la org 137';
  end if;

  drop table if exists pg_temp._corr_neta;
  create temporary table _corr_neta as
  select organization_id, grupo, cuenta,
         case when round(sum(debito), 0) > round(sum(credito), 0)
              then round(sum(debito), 0) - round(sum(credito), 0) else 0 end as debito,
         case when round(sum(credito), 0) > round(sum(debito), 0)
              then round(sum(credito), 0) - round(sum(debito), 0) else 0 end as credito
  from pg_temp._corr_cruda
  group by organization_id, grupo, cuenta
  having abs(round(sum(debito), 0) - round(sum(credito), 0)) >= 1;

  drop table if exists pg_temp._corr_estado;
  create temporary table _corr_estado (
    organization_id integer,
    grupo text,
    nota text,
    journal_entry_id integer
  );

  for v_org, v_grupo in
    select distinct n.organization_id, n.grupo
    from pg_temp._corr_neta n
    where n.organization_id <> 149
    order by 1, 2
  loop
    v_key := case when v_grupo = 'reversion'
      then 'correccion_reversion:'
      else 'correccion_reclasificacion:'
    end || v_org::text;
    v_memo := case when v_grupo = 'reversion'
      then 'Reversión por corrección de regla contable'
      else 'Reclasificación por corrección de regla contable'
    end;

    select je.id, coalesce(je.posted, false)
      into v_entry, v_posted
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = v_key;
    if not found then
      v_entry := null;
      v_posted := false;
    end if;

    if v_posted then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'ya_publicado', v_entry);
      continue;
    end if;

    select b.id into v_branch
    from public.branches b
    where b.organization_id = v_org
      and b.is_main is true
      and b.is_active is true
    order by b.id
    limit 1;
    if v_branch is null then
      select min(b.id) into v_branch
      from public.branches b
      where b.organization_id = v_org;
    end if;
    if v_branch is null then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_sucursal', null);
      continue;
    end if;

    if exists (
      select 1
      from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and not exists (
          select 1 from public.chart_of_accounts c
          where c.organization_id = n.organization_id
            and c.account_code = n.cuenta
            and coalesce(c.is_active, true)
            and c.es_movimiento is distinct from false
        )
    ) then
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_cuenta', null);
      continue;
    end if;

    select coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota')
      into v_tz
    from public.organizations o
    where o.id = v_org;
    v_fecha := date_trunc('month', now() at time zone v_tz) at time zone v_tz;

    -- corr_sin_lineas: sin pesos no hay cabecera.
    if not exists (
      select 1 from pg_temp._corr_neta n
      where n.organization_id = v_org
        and n.grupo = v_grupo
        and (round(coalesce(n.debito, 0), 0) >= 1 or round(coalesce(n.credito, 0), 0) >= 1)
    ) then
      if v_entry is not null and v_posted is not true then
        delete from public.journal_lines where journal_entry_id = v_entry;
        delete from public.journal_entries where id = v_entry and posted is false;
      end if;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    if v_entry is null then
      insert into public.journal_entries (
        organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key
      ) values (
        v_org, v_branch, v_fecha, v_memo, 'manual', v_org::text, false, v_key
      )
      returning id into v_entry;
    else
      delete from public.journal_lines where journal_entry_id = v_entry;
      update public.journal_entries
         set entry_date = v_fecha,
             memo = v_memo,
             posted = false,
             updated_at = now()
       where id = v_entry;
    end if;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    select v_entry, n.cuenta, v_memo, n.debito, n.credito, v_org, n.debito, n.credito
    from pg_temp._corr_neta n
    where n.organization_id = v_org
      and n.grupo = v_grupo;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;

    if v_d <> v_c then
      if abs(v_d - v_c) > 5 then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
      perform public.fn_redondear_asiento_pesos(v_entry);
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_d, v_c
      from public.journal_lines
      where journal_entry_id = v_entry;
      if v_d <> v_c then
        raise exception 'descuadre org % % debito % credito %', v_org, v_grupo, v_d, v_c;
      end if;
    end if;

    if not exists (
      select 1 from public.journal_lines
      where journal_entry_id = v_entry
        and (coalesce(debit, 0) <> 0 or coalesce(credit, 0) <> 0)
    ) then
      delete from public.journal_lines where journal_entry_id = v_entry;
      delete from public.journal_entries where id = v_entry and posted is false;
      insert into pg_temp._corr_estado values (v_org, v_grupo, 'sin_movimiento', null);
      continue;
    end if;

    insert into pg_temp._corr_estado values (v_org, v_grupo, null, v_entry);
  end loop;

  delete from public.journal_lines jl
  using public.journal_entries je
  where je.id = jl.journal_entry_id
    and je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.journal_entries je
  where je.posted is false
    and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
    and not exists (
      select 1 from pg_temp._corr_estado e
      where e.journal_entry_id = je.id
        and e.nota is null
    );

  delete from public.correccion_flujo_aviso;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select c.organization_id, c.clase, e.journal_entry_id, round(sum(c.debito), 0),
         jsonb_build_object('cuentas', jsonb_agg(distinct c.cuenta)),
         e.nota
  from pg_temp._corr_cruda c
  left join pg_temp._corr_estado e
    on e.organization_id = c.organization_id
   and e.grupo = c.grupo
  where c.clase <> 'reversion_masivo'
  group by c.organization_id, c.clase, e.journal_entry_id, e.nota
  having round(sum(c.debito), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, journal_entry_id, monto, detalle, nota)
  select m.organization_id, 'reversion_masivo', e.journal_entry_id, m.pendiente,
         jsonb_build_object('pendiente', m.pendiente, 'ya_revertido', m.ya, 'asientos', m.asientos),
         case when m.pendiente = 0 and m.ya > 0 then 'ya_revertido' else e.nota end
  from (
    select je.organization_id,
           coalesce(round(sum(jl.debit) filter (
             where not exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as pendiente,
           coalesce(round(sum(jl.debit) filter (
             where exists (
               select 1 from public.journal_entries rev
               where rev.organization_id = je.organization_id
                 and rev.posted is true
                 and rev.fact_key = 'reversal:' || je.id::text
             )
           ), 0), 0) as ya,
           count(distinct je.id) as asientos
    from public.stock_movements sm
    join public.journal_entries je
      on je.organization_id = sm.organization_id
     and je.source = 'stock_movements'
     and je.source_id = sm.id::text
     and je.posted is true
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where sm.organization_id in (137, 338)
      and sm.source = 'adjustment'
      and sm.source_id is null
      and coalesce(sm.note, '') ilike 'Ajuste masivo%'
    group by je.organization_id
  ) m
  left join pg_temp._corr_estado e
    on e.organization_id = m.organization_id
   and e.grupo = 'reversion';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select ia.organization_id, 'reclas_4250_se_queda', round(sum(jl.credit), 0),
         jsonb_build_object('motivo', lower(btrim(coalesce(ia.reason, '')))),
         'se_queda'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.posted is true
    and je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and lower(btrim(coalesce(ia.reason, ''))) in ('physical_count', 'audit')
    and not (ia.organization_id = 204 and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$')
  group by ia.organization_id, lower(btrim(coalesce(ia.reason, '')))
  having round(sum(jl.credit), 0) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select 204, 'pendiente_confirmacion', round(sum(jl.credit), 0),
         jsonb_build_object('codigos', 'AJ-0201 a AJ-0207', 'motivo', 'physical_count'),
         'en_espera_de_confirmacion'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where ia.organization_id = 204
    and je.posted is true
    and upper(btrim(ia.code)) ~ '^AJ-020[1-7]$'
    and jl.credit > 0
    and jl.account_code = '4250';

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select t.organization_id, 'reclas_2405_pendiente', t.monto,
         jsonb_build_object('debito_factura', t.monto),
         'pendiente'
  from (
    select organization_id, round(sum(debit), 0) as monto
    from pg_temp._corr_2405
    where source in ('invoice_sales', 'sales')
      and debit > 0
    group by organization_id
    having round(sum(debit), 0) >= 1
  ) t;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, 'reclas_6105_01', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         case
           when base.organization_id in (137, 338) then 'excluida_reversion_masiva'
           else 'saldo_credito'
         end
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(g.neto, 0) + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is false
        and je.fact_key like 'regla_contable:%'
        and (jl.account_code = '6105-01' or jl.account_code like '6105-01-%')
      group by je.organization_id, jl.account_code
    ) g
      on g.organization_id = p.organization_id and g.account_code = p.account_code
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
        and (c.cuenta = '6105-01' or c.cuenta like '6105-01-%')
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where base.organization_id in (137, 338)
     or round(base.neto, 0) <= -1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select base.organization_id, '6105_sin_mover', round(abs(base.neto), 0),
         jsonb_build_object('cuenta', base.account_code, 'neto', round(base.neto, 0)),
         'sin_reclasificar'
  from (
    select p.organization_id, p.account_code,
           p.neto + coalesce(v.neto, 0) as neto
    from (
      select je.organization_id, jl.account_code, sum(jl.debit) - sum(jl.credit) as neto
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id
      where je.posted is true
        and je.organization_id <> 149
        and (
          jl.account_code = '6105'
          or (jl.account_code like '6105-%' and jl.account_code not like '6105-01' and jl.account_code not like '6105-01-%')
        )
      group by je.organization_id, jl.account_code
    ) p
    left join (
      select c.organization_id, c.cuenta as account_code, sum(c.debito) - sum(c.credito) as neto
      from pg_temp._corr_cruda c
      where c.grupo = 'reversion'
      group by c.organization_id, c.cuenta
    ) v
      on v.organization_id = p.organization_id and v.account_code = p.account_code
  ) base
  where abs(round(base.neto, 0)) >= 1;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  select nom.organization_id, 'renombre', 0,
         jsonb_build_object('cuenta', nom.account_code, 'nombre_anterior', nom.name),
         'sin_comprobante'
  from public.correccion_flujo_nombre_respaldo nom;

  insert into public.correccion_flujo_aviso (organization_id, clase, monto, detalle, nota)
  values (null, 'renombre', 0, jsonb_build_object('cuenta', '2495'), 'sin_lineas_impuesto_consumo');

  if exists (
    select 1
    from public.journal_entries je
    join lateral (
      select coalesce(sum(debit), 0) as d,
             coalesce(sum(credit), 0) as c,
             bool_or(debit <> round(debit, 0) or credit <> round(credit, 0)) as fraccion
      from public.journal_lines jl
      where jl.journal_entry_id = je.id
    ) l on true
    where (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%')
      and (
        je.posted is true
        or je.organization_id = 149
        or l.d <> l.c
        or l.fraccion
      )
  ) then
    raise exception 'borrador de correccion descuadrado, publicado o de la org 149';
  end if;

  return jsonb_build_object(
    'borradores', (
      select count(*) from public.journal_entries
      where (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%')
        and posted is false
    ),
    'avisos', (select count(*) from public.correccion_flujo_aviso),
    'editados', v_editar
  );
end;
$function$
;

-- M8: con comisiones (134095) aplicado se restaura su versión sin hoteles (134075 + comisiones); si no, la de 134075.
do $cond$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261025134095') then
    execute $q1$CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type integer;
  v_inv text;
  v_cmv text;
  v_merma text;
  v_prod text;
  v_serv text;
  v_noshow text;
  v_manifiesto text;
  v_folio_alim text;
  v_folio_serv text;
  v_dev text;
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.accounting_rules where organization_id = org_id) then
    return;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = org_id;
  select s.account_code into v_inv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'inventario';
  select s.account_code into v_cmv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'costo_ventas';
  select s.account_code into v_prod
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_productos';
  select s.account_code into v_serv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_servicios';
  -- Siempre auxiliares de movimiento (P1 25-oct-2026): el plan de la org nueva sale de puc_plantilla,
  -- que ya trae 14350101 (vía trg_sede_auxiliar_1435), 61350501/61350502, 37050501, 42959501, IVA 19%/5%.
  v_inv := '14350101';
  -- Costo según sector (regla del contador, decisión de Juan 22-oct): hoteles/restaurantes 61400501,
  -- el resto 61350501. Mermas: 61400502 (cocina) o 61350502.
  v_cmv := case
             when v_type in (1, 2) then '61400501'
             when v_cmv = '6135' or v_cmv is null then '61350501'
             else v_cmv end;
  v_merma := case when v_type in (1, 2) then '61400502' else '61350502' end;
  v_prod := coalesce(v_prod, '4135');
  v_serv := coalesce(v_serv, '4235');
  v_folio_alim := v_prod;
  v_folio_serv := v_serv;
  v_dev := '4175';
  -- Hoteles (type_id 2, contador 25-oct-2026): ingresos y devoluciones en auxiliares de movimiento (134070).
  --   ventas/caja/viaje/no-show 41400501 (alojamiento), folio alimentos 41401501, folio servicios 41409501,
  --   devoluciones/anulación/reembolso 41750101. Nunca 4140/4175 (títulos en hoteles).
  if v_type = 2 then
    v_prod := '41400501';
    v_serv := '41400501';
    v_folio_alim := '41401501';
    v_folio_serv := '41409501';
    v_dev := '41750101';
  end if;
  v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '24080501', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '24080501', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '24081001', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '2205', '24081001', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', v_dev, '1305', '24080501', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', v_dev, '1305', '24080501', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', v_dev, '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '42959501', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', v_merma, v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '24081001', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si es de contado.', 'manifest', 'created', v_inv, v_manifiesto, null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '523550', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', v_folio_alim, null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', v_folio_serv, null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '52950501', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5145', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '2805', null, false, 30, true),
    (org_id, 'Reserva no presentada', 'El anticipo pasa al ingreso del sector', 'reservation', 'no_show', '2805', v_noshow, null, false, 32, true),
    (org_id, 'Costo Patronal', 'Provision de seguridad social patronal al aprobar el periodo', 'payroll_period', 'created', '5105', '2370', null, false, 5, true),
    (org_id, 'Pago Costo Patronal', 'Pago de obligaciones patronales al cerrar el periodo', 'payroll_period', 'paid', '2370', '1110', null, false, 5, true),
    (org_id, 'Inventario apertura', 'Apertura de inventario contra saldos iniciales (37050501)', 'inventory', 'opening', v_inv, '37050501', null, false, 40, true),
    (org_id, 'Inventario venta', 'Costo de la venta', 'inventory', 'sale', v_cmv, v_inv, null, false, 41, true),
    (org_id, 'Inventario devolucion', 'Devolucion al inventario', 'inventory', 'return', v_inv, v_cmv, null, false, 42, true),
    (org_id, 'Inventario compra', 'Entrada de compra', 'inventory', 'purchase', v_inv, '2205', null, false, 43, true),
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', v_merma, v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '42959501', null, false, 45, true);

  -- Comisiones de vendedor (contador 25-oct-2026), todos los tipos. fn_auto_journal_commission elige por
  -- conditions.vinculo (empleado/externo) y usa el auxiliar si existe; si no, su cuenta de 4 dígitos.
  --   Empleado: causación D52051801 / C25050501; pago D(pasivo de la causación) / C dinero.
  --   Externo:  causación D52950501 / C23359501, retención 23652001 (tarifa/umbral en conditions); pago igual.
  insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
  select org_id, v.n, v.d, 'commission', v.ev, v.deb, v.cre, v.tax, false, v.p, true, v.cond::jsonb
    from (values
      ('Comisión Causada Empleado', 'Comisión de vendedor empleado', 'accrued', '52051801', '25050501', null::text, 1,
       '{"vinculo": "empleado"}'),
      ('Comisión Causada Externo', 'Comisión de vendedor externo, con retención en la fuente sobre el umbral', 'accrued',
       '52950501', '23359501', '23652001', 2, '{"vinculo": "externo", "retencion_tarifa": 10, "retencion_umbral": 0}'),
      ('Pago Comisión Empleado', 'Pago de comisión a vendedor empleado', 'paid', '25050501', '1110', null, 1,
       '{"vinculo": "empleado"}'),
      ('Pago Comisión Externo', 'Pago de comisión a vendedor externo (neto de retención)', 'paid', '23359501', '1110', null, 2,
       '{"vinculo": "externo"}')
    ) v(n, d, ev, deb, cre, tax, p, cond)
   where not exists (select 1 from public.accounting_rules x where x.organization_id = org_id
                       and x.source_type = 'commission' and x.name = v.n);

  -- Hoteles (QA Soporte 25-oct): fn_auto_journal_folio_item elige la regla de folio por PRIORIDAD según el origen
  -- del cargo (10 = room/hospedaje, 11 = pos/food/minibar, 12 = resto). Con 30/31 caía al fallback "cualquier regla".
  -- Hospedaje 41400501 (prioridad 10, regla nueva), alimentos 41401501 (11), otros servicios 41409501 (12).
  if v_type = 2 then
    update public.accounting_rules set priority = 11, conditions = '{"source": "pos"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Alimentos';
    update public.accounting_rules set priority = 12, conditions = '{"source": "service"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Servicios';
    insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
      debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
    values (org_id, 'Cargo Folio Hospedaje', 'Cargo a folio por alojamiento', 'folio_item', 'created',
      '1305', '41400501', null, false, 10, true, '{"source": "room"}'::jsonb);
  end if;
end;
$function$$q1$;
  else
    execute $q2$CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type integer;
  v_inv text;
  v_cmv text;
  v_merma text;
  v_prod text;
  v_serv text;
  v_noshow text;
  v_manifiesto text;
  v_folio_alim text;
  v_folio_serv text;
  v_dev text;
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.accounting_rules where organization_id = org_id) then
    return;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = org_id;
  select s.account_code into v_inv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'inventario';
  select s.account_code into v_cmv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'costo_ventas';
  select s.account_code into v_prod
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_productos';
  select s.account_code into v_serv
  from public.fn_propuesta_configuracion_sector(v_type) s where s.clave = 'ventas_servicios';
  -- Siempre auxiliares de movimiento (P1 25-oct-2026): el plan de la org nueva sale de puc_plantilla,
  -- que ya trae 14350101 (vía trg_sede_auxiliar_1435), 61350501/61350502, 37050501, 42959501, IVA 19%/5%.
  v_inv := '14350101';
  -- Costo según sector (regla del contador, decisión de Juan 22-oct): hoteles/restaurantes 61400501,
  -- el resto 61350501. Mermas: 61400502 (cocina) o 61350502.
  v_cmv := case
             when v_type in (1, 2) then '61400501'
             when v_cmv = '6135' or v_cmv is null then '61350501'
             else v_cmv end;
  v_merma := case when v_type in (1, 2) then '61400502' else '61350502' end;
  v_prod := coalesce(v_prod, '4135');
  v_serv := coalesce(v_serv, '4235');
  v_folio_alim := v_prod;
  v_folio_serv := v_serv;
  v_dev := '4175';
  -- Hoteles (type_id 2, contador 25-oct-2026): ingresos y devoluciones en auxiliares de movimiento (134070).
  --   ventas/caja/viaje/no-show 41400501 (alojamiento), folio alimentos 41401501, folio servicios 41409501,
  --   devoluciones/anulación/reembolso 41750101. Nunca 4140/4175 (títulos en hoteles).
  if v_type = 2 then
    v_prod := '41400501';
    v_serv := '41400501';
    v_folio_alim := '41401501';
    v_folio_serv := '41409501';
    v_dev := '41750101';
  end if;
  v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else '4235' end;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, '24080501', true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, '24080501', true, 11, true),
    (org_id, 'Cobro de Factura', 'Cobro de factura de cliente', 'sale_payment', 'paid', '1110', '1305', null, false, 20, true),
    (org_id, 'Cobro Parcial', 'Cobro parcial de factura', 'sale_payment', 'partial_paid', '1110', '1305', null, false, 21, true),
    (org_id, 'Compra a Credito', 'Compra de mercancia a credito', 'purchase', 'created', v_inv, '2205', '24081001', true, 10, true),
    (org_id, 'Compra de Contado', 'Compra de mercancia al contado', 'purchase', 'created', v_inv, '2205', '24081001', true, 11, true),
    (org_id, 'Pago a Proveedor', 'Pago a proveedor', 'purchase_payment', 'paid', '2205', '1110', null, false, 20, true),
    (org_id, 'Salida de inventario', 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.', 'inventory', 'adjusted', '519595', v_inv, null, false, 30, true),
    (org_id, 'Pago de Nomina', 'Pago de nomina (cancela pasivo)', 'payroll', 'paid', '2505', '1110', null, false, 10, true),
    (org_id, 'Nomina por Pagar', 'Provision de nomina', 'payroll', 'created', '5105', '2505', null, false, 11, true),
    (org_id, 'Seguridad Social Empleador', 'Aportes a seguridad social (patronal)', 'payroll', 'created', '5105', '2370', null, false, 12, true),
    (org_id, 'Gasto Administrativo', 'Registro de gasto administrativo', 'expense', 'created', '5105', '1110', null, false, 13, true),
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', v_dev, '1305', '24080501', true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', v_dev, '1305', '24080501', true, 26, true),
    (org_id, 'Reembolso a Cliente', 'Reembolso de pago a cliente', 'refund', 'refunded', v_dev, '1110', null, false, 27, true),
    (org_id, 'Conciliacion Bancaria', 'Ajuste por conciliacion bancaria', 'bank', 'adjusted', '1110', '4250', null, false, 28, true),
    (org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true),
    (org_id, 'Movimiento de Caja', 'Movimiento de caja', 'cash_movement', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Ajuste Inventario Ganancia', 'Ajuste positivo de inventario', 'inventory_adjustment', 'gain', v_inv, '42959501', null, false, 30, true),
    (org_id, 'Ajuste Inventario Perdida', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory_adjustment', 'loss', v_merma, v_inv, null, false, 31, true),
    (org_id, 'Orden de Compra Recibida', 'Recepcion de orden de compra', 'purchase_order', 'received', v_inv, '2205', '24081001', true, 30, true),
    (org_id, 'Membresia', 'Ingreso por membresia', 'membership', 'created', '1105', '4250', null, false, 30, true),
    (org_id, 'Sesion Parqueadero', 'Ingreso por sesion de parqueadero', 'parking', 'closed', '1105', '4235', null, false, 30, true),
    (org_id, 'Pase Parqueadero', 'Ingreso por pase de parqueadero', 'parking_pass', 'paid', '1105', '4235', null, false, 30, true),
    (org_id, 'Prestamo Empleado', 'Desembolso de prestamo a trabajador', 'loan', 'paid', '1365', '1105', null, false, 30, true),
    (org_id, 'Cuota Prestamo', 'Abono de prestamo a trabajador', 'installment', 'paid', '1105', '1365', null, false, 30, true),
    (org_id, 'Manifiesto Despacho', 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si es de contado.', 'manifest', 'created', v_inv, v_manifiesto, null, false, 30, true),
    (org_id, 'Envio', 'Costo de envio', 'shipment', 'created', '523550', '1110', null, false, 30, true),
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_prod, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', v_folio_alim, null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', v_folio_serv, null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '529505', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5145', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '2805', null, false, 30, true),
    (org_id, 'Reserva no presentada', 'El anticipo pasa al ingreso del sector', 'reservation', 'no_show', '2805', v_noshow, null, false, 32, true),
    (org_id, 'Costo Patronal', 'Provision de seguridad social patronal al aprobar el periodo', 'payroll_period', 'created', '5105', '2370', null, false, 5, true),
    (org_id, 'Pago Costo Patronal', 'Pago de obligaciones patronales al cerrar el periodo', 'payroll_period', 'paid', '2370', '1110', null, false, 5, true),
    (org_id, 'Inventario apertura', 'Apertura de inventario contra saldos iniciales (37050501)', 'inventory', 'opening', v_inv, '37050501', null, false, 40, true),
    (org_id, 'Inventario venta', 'Costo de la venta', 'inventory', 'sale', v_cmv, v_inv, null, false, 41, true),
    (org_id, 'Inventario devolucion', 'Devolucion al inventario', 'inventory', 'return', v_inv, v_cmv, null, false, 42, true),
    (org_id, 'Inventario compra', 'Entrada de compra', 'inventory', 'purchase', v_inv, '2205', null, false, 43, true),
    (org_id, 'Inventario faltante', 'Faltante de inventario. El robo y el siniestro debitan 5315.', 'inventory', 'loss', v_merma, v_inv, null, false, 44, true),
    (org_id, 'Inventario sobrante', 'Sobrante de inventario', 'inventory', 'gain', v_inv, '42959501', null, false, 45, true);

  -- Hoteles (QA Soporte 25-oct): fn_auto_journal_folio_item elige la regla de folio por PRIORIDAD según el origen
  -- del cargo (10 = room/hospedaje, 11 = pos/food/minibar, 12 = resto). Con 30/31 caía al fallback "cualquier regla".
  -- Hospedaje 41400501 (prioridad 10, regla nueva), alimentos 41401501 (11), otros servicios 41409501 (12).
  if v_type = 2 then
    update public.accounting_rules set priority = 11, conditions = '{"source": "pos"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Alimentos';
    update public.accounting_rules set priority = 12, conditions = '{"source": "service"}'::jsonb
     where organization_id = org_id and source_type = 'folio_item' and name = 'Cargo Folio Servicios';
    insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
      debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
    values (org_id, 'Cargo Folio Hospedaje', 'Cargo a folio por alojamiento', 'folio_item', 'created',
      '1305', '41400501', null, false, 10, true, '{"source": "room"}'::jsonb);
  end if;
end;
$function$$q2$;
  end if;
end $cond$;

-- M8: idem (134095 aplicado → 134075 + comisiones; si no, 134075).
do $cond$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261025134095') then
    execute $q1$CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo integer;
  v_inv text;
  v_nivel integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Hoteles y restaurantes (type_id 1/2, regla del contador): plan propio de A&B, SOLO en esas orgs
  -- (no va a puc_plantilla, que es de todas): 1405/140505/14050501 insumos de cocina y
  -- 6140/614005/61400501 costo A&B, 61400502 mermas de cocina. En comercio no se crea nada.
  if v_tipo in (1, 2) then
   for v_nivel in 1..3 loop  -- por nivel: el hijo necesita al padre ya insertado
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, t.codigo, t.nombre, p.type, t.padre, true, p.naturaleza, t.mov,
           coalesce(p.requiere_tercero, false), p.requiere_centro_costo, p.centro_costo_modo,
           p.presentacion_niif, now(), now()
      from (values
        ('1405',     '14',     'Materias primas',              false, 1),
        ('140505',   '1405',   'Insumos de cocina',            false, 2),
        ('14050501', '140505', 'Insumos de cocina',            true,  3),
        ('6140',     '61',     'Hoteles y restaurantes',       false, 1),
        ('614005',   '6140',   'Restaurantes',                 false, 2),
        ('61400501', '614005', 'Costo de alimentos y bebidas', true,  3),
        ('61400502', '614005', 'Mermas de cocina',             true,  3)
      ) as t(codigo, padre, nombre, mov, orden)
      join public.chart_of_accounts p on p.organization_id = p_org and p.account_code = t.padre
     where t.orden = v_nivel
    on conflict (organization_id, account_code) do nothing;
   end loop;
  end if;

  -- Hoteles (type_id 2): auxiliares de ingresos/devoluciones (134070). Con el trigger activo, 4140, 414005,
  -- 414015, 414095 y 4175 pasan a título solos al nacer su auxiliar (org nueva: sin saldos).
  if v_tipo = 2 then
    perform public.fn_hoteles_asegurar_cuentas_ingreso(p_org, null);
  end if;

  -- Comisiones (134090): 520518/52051801 y 529505/52950501. Con el trigger activo 5205 y 529505 pasan a título;
  -- la clave 'comisiones' (529505 en la propuesta) cae a su único auxiliar 52950501 más abajo.
  perform public.fn_comisiones_asegurar_cuentas(p_org, null);

  -- Inventario va SIEMPRE a un auxiliar 143501xx (regla de Juan: nunca 1435 sola ni 1405).
  -- Si aún no hay sede (la org se acaba de crear), fn_inventario_auxiliar_1435 devuelve null
  -- y la clave no se siembra: el resolver usa el auxiliar de la sede en tiempo de asiento.
  v_inv := public.fn_inventario_auxiliar_1435(p_org, null);

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, x.codigo
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  cross join lateral (
    select case
      when p.clave = 'inventario' then v_inv
      -- Auxiliares del contador (P1 25-oct-2026), si existen y son de movimiento en la org.
      when exists (
        select 1 from public.chart_of_accounts a
        where a.organization_id = p_org and a.es_movimiento is true
          and a.account_code = case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' when p.account_code = '6135' then '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      ) then case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' else '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      -- Cuenta de título: su único auxiliar de movimiento, si lo hay.
      when p.account_code not like '24%' and exists (
        select 1 from public.chart_of_accounts t
        where t.organization_id = p_org and t.account_code = p.account_code and t.es_movimiento is false
      ) then (
        select min(h.account_code) from public.chart_of_accounts h
        where h.organization_id = p_org
          and h.account_code like p.account_code || '_%'
          and h.es_movimiento is true
        having count(*) = 1
      )
      else p.account_code
    end as codigo
  ) x
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = x.codigo
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Ingresos diversos: 42959501 explícito (QA 25-oct), no solo el respaldo del resolver.
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'ingresos_diversos', '42959501'
  where exists (select 1 from public.chart_of_accounts a
                 where a.organization_id = p_org and a.account_code = '42959501' and a.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Redondeo en contra (Ajuste al peso): 53959501 (clave creada en 134020).
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'redondeo_en_contra', '53959501'
  where exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '53959501' and c.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Hoteles: la categoría de tesorería «Devoluciones a clientes» (sembrada antes por tr_zzz_categorias_tesoreria
  -- con 4175) pasa al auxiliar 41750101; 4175 es título en hoteles.
  if v_tipo = 2 and exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org
                              and c.account_code = '41750101' and c.es_movimiento is true) then
    update public.categorias_tesoreria set cuenta_sugerida = '41750101'
     where organization_id = p_org and cuenta_sugerida = '4175';
  end if;

  -- Costo de ventas por sede: 6135 -> 61350501 (igual que el Bloque B), si el auxiliar existe.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6135', '61350501', now()
  from public.branches b
  where b.organization_id = p_org
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61350501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6135');

  -- Hoteles y restaurantes: costo por sede 6140 -> 61400501.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6140', '61400501', now()
  from public.branches b
  where b.organization_id = p_org and v_tipo in (1, 2)
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61400501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6140');
end;
$function$$q1$;
  else
    execute $q2$CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo integer;
  v_inv text;
  v_nivel integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  -- Hoteles y restaurantes (type_id 1/2, regla del contador): plan propio de A&B, SOLO en esas orgs
  -- (no va a puc_plantilla, que es de todas): 1405/140505/14050501 insumos de cocina y
  -- 6140/614005/61400501 costo A&B, 61400502 mermas de cocina. En comercio no se crea nada.
  if v_tipo in (1, 2) then
   for v_nivel in 1..3 loop  -- por nivel: el hijo necesita al padre ya insertado
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, t.codigo, t.nombre, p.type, t.padre, true, p.naturaleza, t.mov,
           coalesce(p.requiere_tercero, false), p.requiere_centro_costo, p.centro_costo_modo,
           p.presentacion_niif, now(), now()
      from (values
        ('1405',     '14',     'Materias primas',              false, 1),
        ('140505',   '1405',   'Insumos de cocina',            false, 2),
        ('14050501', '140505', 'Insumos de cocina',            true,  3),
        ('6140',     '61',     'Hoteles y restaurantes',       false, 1),
        ('614005',   '6140',   'Restaurantes',                 false, 2),
        ('61400501', '614005', 'Costo de alimentos y bebidas', true,  3),
        ('61400502', '614005', 'Mermas de cocina',             true,  3)
      ) as t(codigo, padre, nombre, mov, orden)
      join public.chart_of_accounts p on p.organization_id = p_org and p.account_code = t.padre
     where t.orden = v_nivel
    on conflict (organization_id, account_code) do nothing;
   end loop;
  end if;

  -- Hoteles (type_id 2): auxiliares de ingresos/devoluciones (134070). Con el trigger activo, 4140, 414005,
  -- 414015, 414095 y 4175 pasan a título solos al nacer su auxiliar (org nueva: sin saldos).
  if v_tipo = 2 then
    perform public.fn_hoteles_asegurar_cuentas_ingreso(p_org, null);
  end if;

  -- Inventario va SIEMPRE a un auxiliar 143501xx (regla de Juan: nunca 1435 sola ni 1405).
  -- Si aún no hay sede (la org se acaba de crear), fn_inventario_auxiliar_1435 devuelve null
  -- y la clave no se siembra: el resolver usa el auxiliar de la sede en tiempo de asiento.
  v_inv := public.fn_inventario_auxiliar_1435(p_org, null);

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, x.codigo
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  cross join lateral (
    select case
      when p.clave = 'inventario' then v_inv
      -- Auxiliares del contador (P1 25-oct-2026), si existen y son de movimiento en la org.
      when exists (
        select 1 from public.chart_of_accounts a
        where a.organization_id = p_org and a.es_movimiento is true
          and a.account_code = case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' when p.account_code = '6135' then '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      ) then case p.clave
            when 'costo_ventas' then case when v_tipo in (1, 2) then '61400501' else '61350501' end
            when 'saldo_inicial' then '37050501'
            when 'faltante_inventario' then case when v_tipo in (1, 2) then '61400502' else '61350502' end
            when 'redondeo' then '42958101'
            when 'ingresos_diversos' then '42959501'
            when 'iva_generado' then '24080501'
            when 'iva_descontable' then '24081001'
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' end
            when 'ventas_servicios' then case when v_tipo = 2 then '41400501' end
            when 'devoluciones' then case when v_tipo = 2 then '41750101' end
            when 'descuentos' then case when v_tipo = 2 then '41750102' end
          end
      -- Cuenta de título: su único auxiliar de movimiento, si lo hay.
      when p.account_code not like '24%' and exists (
        select 1 from public.chart_of_accounts t
        where t.organization_id = p_org and t.account_code = p.account_code and t.es_movimiento is false
      ) then (
        select min(h.account_code) from public.chart_of_accounts h
        where h.organization_id = p_org
          and h.account_code like p.account_code || '_%'
          and h.es_movimiento is true
        having count(*) = 1
      )
      else p.account_code
    end as codigo
  ) x
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = x.codigo
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Ingresos diversos: 42959501 explícito (QA 25-oct), no solo el respaldo del resolver.
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'ingresos_diversos', '42959501'
  where exists (select 1 from public.chart_of_accounts a
                 where a.organization_id = p_org and a.account_code = '42959501' and a.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Redondeo en contra (Ajuste al peso): 53959501 (clave creada en 134020).
  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, 'redondeo_en_contra', '53959501'
  where exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '53959501' and c.es_movimiento is true)
  on conflict (organization_id, branch_id, clave) do nothing;

  -- Hoteles: la categoría de tesorería «Devoluciones a clientes» (sembrada antes por tr_zzz_categorias_tesoreria
  -- con 4175) pasa al auxiliar 41750101; 4175 es título en hoteles.
  if v_tipo = 2 and exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org
                              and c.account_code = '41750101' and c.es_movimiento is true) then
    update public.categorias_tesoreria set cuenta_sugerida = '41750101'
     where organization_id = p_org and cuenta_sugerida = '4175';
  end if;

  -- Costo de ventas por sede: 6135 -> 61350501 (igual que el Bloque B), si el auxiliar existe.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6135', '61350501', now()
  from public.branches b
  where b.organization_id = p_org
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61350501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6135');

  -- Hoteles y restaurantes: costo por sede 6140 -> 61400501.
  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code, created_at)
  select p_org, b.id, '6140', '61400501', now()
  from public.branches b
  where b.organization_id = p_org and v_tipo in (1, 2)
    and exists (select 1 from public.chart_of_accounts c
                where c.organization_id = p_org and c.account_code = '61400501' and c.es_movimiento is true)
    and not exists (select 1 from public.branch_account_mappings m
                    where m.organization_id = p_org and m.branch_id = b.id and m.base_account_code = '6140');
end;
$function$$q2$;
  end if;
end $cond$;

-- FIX (A): versiones vivas de las funciones de venta/armado y fuera las auxiliares nuevas.
CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_base_key text;
    v_fact_key text;
    v_prev_id integer;
    v_i integer;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type NOT IN ('invoice', 'debit_note') THEN
        RETURN NEW;
    END IF;
    -- fase5-cuenta-linea venta

    IF NEW.status IS NULL OR NEW.status NOT IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;

    -- Ya hay un devengo vivo de esta factura (con la clave de la factura o con
    -- la de su venta): no se crea otro.
    IF EXISTS (
        SELECT 1 FROM journal_entries je
         WHERE je.organization_id = NEW.organization_id
           AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
                OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%'))
           AND NOT EXISTS (SELECT 1 FROM journal_entries r
                            WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id)
    ) THEN
        RETURN NEW;
    END IF;

    v_base_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    v_fact_key := v_base_key;
    FOR v_i IN 1..20 LOOP
        SELECT id INTO v_prev_id FROM journal_entries
        WHERE organization_id = NEW.organization_id AND fact_key = v_fact_key;
        EXIT WHEN v_prev_id IS NULL;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE organization_id = NEW.organization_id AND fact_key = 'reversal:' || v_prev_id);
        v_fact_key := v_base_key || ':reemision:' || v_i;
    END LOOP;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
        RETURN NEW;
    END IF;

    if public.fn_documento_tiene_cuenta_propia(NEW.organization_id, NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end) then
      v_entry_id := public.fn_asiento_documento_por_lineas(NEW.id, case when NEW.document_type = 'debit_note' then 'nota_debito' else 'venta' end, v_fact_key);
    elsif public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id) is not null then
      perform fn_log_journal_failure(
        NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
        'invoice_sales', NEW.id::text, v_fact_key,
        v_rule.debit_account_code, v_rule.credit_account_code, NEW.total,
        'tercero_requerido',
        public.fn_bloqueo_tercero_documento(NEW.organization_id, NEW.branch_id, 'invoice_sales', NEW.id));
    else
      -- configuracion_antes_de_sede: sin cuenta propia, primero la configuración.
      v_branch := NEW.branch_id;
      IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
      ) THEN
        SELECT id INTO v_branch FROM branches
        WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
        LIMIT 1;
        IF v_branch IS NULL THEN
          SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
        END IF;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'debito', v_rule.debit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
      FROM public.fn_cuenta_configurada_de_sede(
        NEW.organization_id, v_branch, 'invoice_sales', 'credito', v_rule.credit_account_code
      ) r;
      IF v_fallo IS NOT NULL THEN
        PERFORM fn_log_journal_failure(
          NEW.organization_id, v_branch, COALESCE(NEW.issue_date, now()),
          'invoice_sales', NEW.id::text, v_fact_key, v_debito, v_credito, NEW.total,
          'cuenta_no_configurada', v_fallo);
        RETURN NEW;
      END IF;

      -- fase5-cuenta-linea: sin cuenta propia, el asiento sale igual que antes.
      v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := case when NEW.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
      );
    end if;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_fact_key text;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
BEGIN
    IF NEW.status NOT IN ('paid', 'partial', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:sale:' || NEW.id::text;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
        RETURN NEW;
    END IF;

    -- configuracion_antes_de_sede: la misma sede que usará el asiento.
    v_branch := NEW.branch_id;
    IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
      SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
    ) THEN
      SELECT id INTO v_branch FROM branches
      WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
      LIMIT 1;
      IF v_branch IS NULL THEN
        SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
      END IF;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'debito', v_rule.debit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, NEW.total,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'credito', v_rule.credit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_credito, NEW.total,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(v_branch, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_armar_asiento_documento(p_tipo text, p_id uuid, p_lineas jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_branch integer;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_neto numeric := 0;
  v_fecha timestamptz;
  v_memo text;
  v_source text;
  v_created_by uuid;
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_rol text;
  v_impuesto_al_credito boolean;
  v_lineas jsonb := '[]'::jsonb;
  v_pesos numeric := 0;
  v_asignado numeric := 0;
  v_parte numeric;
  v_cuenta text;
  v_fallo text;
  v_exige record;
  v_i integer := 0;
  v_n integer := 0;
  v_base numeric := 0;
  v_reparto jsonb := '[]'::jsonb;
  v_suma_debe numeric := 0;
  v_suma_haber numeric := 0;
  v_fila record;
begin
  if p_tipo = 'compra' then
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           'Compra ' || coalesce(i.number_ext, i.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_purchase i where i.id = p_id;
    v_source := 'invoice_purchase';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'documento_soporte' then
    select d.organization_id, d.branch_id, abs(coalesce(d.total, 0)), abs(coalesce(d.tax_total, 0)),
           coalesce(d.issue_date, now()), d.created_by,
           'Documento soporte ' || coalesce(d.number, d.reference_code, d.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.support_documents d where d.id = p_id;
    v_source := 'support_documents';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'nota_credito' and p_lineas is not null then
    select coalesce(sum(abs(coalesce((l->>'total_line')::numeric, 0))), 0)
      into v_total
      from jsonb_array_elements(p_lineas) l;
    select i.organization_id, i.branch_id, coalesce(i.issue_date, now()), i.created_by,
           abs(coalesce(i.tax_total, 0)), abs(coalesce(i.total, 0))
      into v_org, v_branch, v_fecha, v_created_by, v_tax, v_base
      from public.invoice_sales i where i.id = p_id;
    if v_base > 0 then
      v_tax := least(v_total, round(v_tax * v_total / v_base, 2));
    else
      v_tax := 0;
    end if;
    v_memo := 'Nota crédito';
    v_source := 'invoice_sales';
    v_impuesto_al_credito := false;
  else
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           case
             when i.document_type = 'credit_note' then 'Nota crédito ' || coalesce(i.number, i.id::text)
             when i.document_type = 'debit_note' then 'Nota débito ' || coalesce(i.number, i.id::text)
             else 'Venta ' || coalesce(i.number, i.id::text)
           end
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_sales i where i.id = p_id;
    v_source := 'invoice_sales';
    v_impuesto_al_credito := p_tipo is distinct from 'nota_credito';
  end if;

  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;

  if p_tipo in ('compra', 'documento_soporte') then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(v_org) r;
  elsif p_tipo = 'nota_credito' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = v_org
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(v_org) r;
  end if;

  if v_debito is null then
    return jsonb_build_object('ok', false, 'fallo', 'No hay regla contable activa para este documento', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      v_org, v_branch,
      case when p_tipo = 'nota_credito' then 'sale_credit_note' else v_source end,
      v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_cfg.fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  if not coalesce(v_usa_impuesto, false) then
    v_tax := 0;
  end if;
  v_total := round(coalesce(v_total, 0), 2);
  v_tax := round(coalesce(v_tax, 0), 2);
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := round(v_total - v_tax, 2);

  if round(coalesce(v_total, 0), 0) <= 0 then
    return jsonb_build_object(
      'ok', true, 'sin_importe', true, 'fallo', null,
      'lineas', '[]'::jsonb, 'debitos', 0,
      'organization_id', v_org, 'branch_id', v_branch, 'source', v_source
    );
  end if;

  select t.nit, t.nombre into v_nit, v_nombre
    from public.fn_tercero_de_documento(
      case when p_tipo = 'nota_debito' then 'venta' else p_tipo end,
      p_id
    ) t;

  if p_lineas is not null and p_tipo = 'nota_credito' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over () as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(v_org, nullif(l->>'product_id', '')::integer, 'devolucion', l->>'cuenta_contable'),
                 v_cfg.debito
               ) as cuenta,
               abs(coalesce((l->>'total_line')::numeric, 0)) as monto,
               coalesce(nullif(btrim(l->>'descripcion'), ''), 'Nota crédito') as descripcion
          from jsonb_array_elements(p_lineas) l
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(
                   v_org,
                   ii.product_id,
                   case
                     when p_tipo in ('compra', 'documento_soporte') and coalesce(pr.track_stock, false) then 'inventario'
                     when p_tipo in ('compra', 'documento_soporte') then 'costo'
                     when p_tipo = 'nota_credito' then 'devolucion'
                     else 'ingreso'
                   end,
                   ii.cuenta_contable
                 ),
                 case when v_impuesto_al_credito then v_cfg.credito else v_cfg.debito end
               ) as cuenta,
               abs(coalesce(ii.total_line, 0)) as monto,
               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii
          left join public.products pr on pr.id = ii.product_id and pr.organization_id = v_org
         where case p_tipo
                 when 'compra' then ii.invoice_purchase_id = p_id
                 when 'documento_soporte' then ii.support_document_id = p_id
                 else ii.invoice_sales_id = p_id
               end
      ) s;
  end if;

  select coalesce(sum((e->>'monto')::numeric), 0), count(*)
    into v_pesos, v_n
    from jsonb_array_elements(v_reparto) e;
  v_asignado := 0;

  for v_fila in
    select (e->>'cuenta') as cuenta,
           (e->>'monto')::numeric as monto,
           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e
     order by (e->>'orden')::integer
  loop
    v_i := v_i + 1;
    if v_pesos = 0 then
      v_parte := case when v_i = 1 then v_neto else 0 end;
    elsif v_i = v_n then
      v_parte := round(v_neto - v_asignado, 2);
    else
      v_parte := round(v_neto * v_fila.monto / v_pesos, 2);
      v_asignado := v_asignado + v_parte;
    end if;
    if v_parte = 0 then
      continue;
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
      'descripcion', v_fila.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre,
      'cost_center_id', public.fn_centro_documento(v_org, v_branch, p_tipo, p_id)
    ));
  end loop;

  if v_tax > 0 and v_cfg.impuesto is not null then
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
  end if;

  v_cuenta := public.fn_cuenta_movimiento_o_detalle(
    v_org, v_branch,
    case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end
  );
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
    'descripcion', v_memo,
    'debito', case when v_impuesto_al_credito then v_total else 0 end,
    'credito', case when v_impuesto_al_credito then 0 else v_total end,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre
  ));

  select coalesce(sum((l->>'debito')::numeric), 0), coalesce(sum((l->>'credito')::numeric), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(v_lineas) l;
  if round(v_suma_debe, 2) <> round(v_suma_haber, 2) or v_suma_debe = 0 then
    return jsonb_build_object(
      'ok', false,
      'fallo', 'El asiento no cuadra con las líneas del documento',
      'lineas', '[]'::jsonb,
      'organization_id', v_org
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'fallo', null,
    'organization_id', v_org,
    'branch_id', v_branch,
    'fecha', v_fecha,
    'memo', v_memo,
    'source', v_source,
    'source_id', p_id,
    'created_by', v_created_by,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre,
    'lineas', v_lineas,
    'debitos', v_total,
    'creditos', v_total,
    'cuadra', true
  );
end;
$function$
;

drop function if exists public.fn_revertir_asiento_en_fecha(integer, timestamptz, text, text);
drop function if exists public.fn_impuesto_inc_parte(text, text, numeric);
drop function if exists public.fn_cuenta_inc(integer);
drop function if exists public.fn_cuenta_iva_generado(integer);

-- fn_nc_asiento_devolucion: versión viva (prod) previa a 134115.
CREATE OR REPLACE FUNCTION public.fn_nc_asiento_devolucion(p_org integer, p_nc uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nc public.invoice_sales%rowtype;
  v_rule record;
  v_total numeric;
  v_tax numeric;
  v_neto numeric;
  v_cfg text;
  v_n integer;
  v_cuenta text;
  v_entry integer;
  v_asignado numeric := 0;
  v_monto numeric;
  v_i integer := 0;
  v_grupo record;
begin
  if p_nc is null then
    return;
  end if;
  select * into v_nc
    from public.invoice_sales
   where id = p_nc and organization_id = p_org and document_type = 'credit_note';
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.journal_entries je
     where je.organization_id = p_org
       and je.fact_key = 'accrual:credit_note:' || p_nc::text
  ) then
    return;
  end if;

  select * into v_rule
    from public.accounting_rules
   where organization_id = p_org
     and source_type = 'sale_credit_note'
     and event_type = 'created'
     and is_active
   order by priority
   limit 1;
  if v_rule is null then
    perform public.fn_log_journal_failure(
      p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
      'invoice_sales', p_nc::text, 'accrual:credit_note:' || p_nc::text,
      null, null, abs(coalesce(v_nc.total, 0)),
      'no_rule', 'Sin regla contable activa de nota crédito');
    return;
  end if;

  v_total := abs(coalesce(v_nc.total, 0));
  v_tax := case when coalesce(v_rule.use_tax_from_document, false)
                then abs(coalesce(v_nc.tax_total, 0)) else 0 end;
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := v_total - v_tax;
  if v_total <= 0 then
    return;
  end if;

  select c.account_code into v_cfg
    from public.configuracion_contable c
   where c.organization_id = p_org
     and c.clave = 'devoluciones'
     and (c.branch_id = v_nc.branch_id or c.branch_id is null)
   order by c.branch_id nulls last
   limit 1;

  select count(*) into v_n
    from (
      select coalesce(
               nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
               nullif(v_cfg, ''),
               v_rule.debit_account_code
             ) as cuenta
        from public.invoice_items ii
       where ii.invoice_sales_id = p_nc
       group by 1
    ) g;

  if coalesce(v_n, 0) <= 1 then
    select coalesce(
             nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
             nullif(v_cfg, ''),
             v_rule.debit_account_code
           ) into v_cuenta
      from public.invoice_items ii
     where ii.invoice_sales_id = p_nc
     limit 1;
    v_cuenta := coalesce(v_cuenta, v_rule.debit_account_code);
    perform public.fn_create_journal_entry(
      p_organization_id := p_org,
      p_branch_id := v_nc.branch_id,
      p_entry_date := coalesce(v_nc.issue_date, now()),
      p_memo := 'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      p_source := 'invoice_sales',
      p_source_id := p_nc::text,
      p_debit_account := v_cuenta,
      p_credit_account := v_rule.credit_account_code,
      p_amount := v_total,
      p_tax_account := v_rule.tax_account_code,
      p_tax_amount := v_tax,
      p_tax_is_credit := false,
      p_fact_key := 'accrual:credit_note:' || p_nc::text,
      p_created_by := auth.uid()
    );
    return;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values (
    p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    'invoice_sales', p_nc::text, true, auth.uid(),
    'accrual:credit_note:' || p_nc::text
  ) returning id into v_entry;

  for v_grupo in
    select g.cuenta, g.peso, row_number() over (order by g.cuenta) as nro,
           count(*) over () as cuantos
      from (
        select coalesce(
                 nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
                 nullif(v_cfg, ''),
                 v_rule.debit_account_code
               ) as cuenta,
               sum(abs(coalesce(ii.total_line, 0))) as peso
          from public.invoice_items ii
         where ii.invoice_sales_id = p_nc
         group by 1
      ) g
     order by g.cuenta
  loop
    v_i := v_i + 1;
    if v_i = v_grupo.cuantos then
      v_monto := v_neto - v_asignado;
    elsif coalesce((select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0) = 0 then
      v_monto := round(v_neto / v_grupo.cuantos, 2);
    else
      v_monto := round(v_neto * v_grupo.peso / nullif(
        (select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0), 2);
    end if;
    v_asignado := v_asignado + coalesce(v_monto, 0);
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_grupo.cuenta),
      'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      coalesce(v_monto, 0), 0, coalesce(v_monto, 0), 0
    );
  end loop;

  if v_tax > 0 and v_rule.tax_account_code is not null then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(
        p_org, v_nc.branch_id,
        public.fn_cuenta_iva(p_org, v_nc.branch_id, 'invoice_sales', v_rule.tax_account_code)),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      v_tax, 0, v_tax, 0
    );
  end if;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
  ) values (
    v_entry,
    public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_rule.credit_account_code),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    0, v_total, 0, v_total
  );
end;
$function$
;

-- Versiones vivas (QA 8c405138): pos_anular_venta_v1 y fn_auto_journal_void.
CREATE OR REPLACE FUNCTION public.pos_anular_venta_v1(p_sale_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_motivo     text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_sale       public.sales%rowtype;
  v_inv        public.invoice_sales%rowtype;
  v_modo       text;
  v_pago       record;
  v_je         record;
  v_mov        record;
  v_serial     record;
  v_tip        record;
  v_nc_id      uuid;
  v_nc_numero  text;
  v_n_pagos    integer := 0;
  v_n_asientos integer := 0;
  v_n_propinas integer := 0;
  v_n_stock    integer := 0;
  v_n_seriales integer := 0;
  v_n_comision integer := 0;
  v_avisos     text[] := '{}';
  v_periodo_ok boolean;
  v_mem_si     record;                   -- Membresías (20260929001100)
  v_n_membresias integer := 0;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;

  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- El permiso se resuelve en el servidor (nunca por nombre de rol).
  if not public.fn_tiene_permiso(v_sale.organization_id, 'pos.void') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Idempotente: anular dos veces no revierte dos veces.
  if v_sale.status = 'void' then
    return jsonb_build_object('sale_id', v_sale.id, 'ya_anulada', true);
  end if;

  if exists (select 1 from public.returns r where r.sale_id = v_sale.id and r.status = 'processed') then
    raise exception 'venta_con_devoluciones' using errcode = '22023',
      hint = 'La venta tiene devoluciones: siga con devoluciones.';
  end if;
  if exists (select 1 from public.table_sessions ts
              where ts.sale_id = v_sale.id and ts.status in ('active', 'bill_requested')) then
    raise exception 'mesa_abierta' using errcode = '22023',
      hint = 'La mesa sigue abierta: anúlela desde «Liberar mesa».';
  end if;

  select * into v_inv from public.invoice_sales i
   where i.sale_id = v_sale.id and i.organization_id = v_sale.organization_id
     and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
   order by i.created_at limit 1;

  -- ── Pagos: se anulan solo si la caja en que entraron sigue abierta ──────
  v_modo := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = v_sale.organization_id and os.key = 'pos_cash_session_mode'),
    'branch');
  for v_pago in
    select p.* from public.payments p
     where p.organization_id = v_sale.organization_id and p.status = 'completed'
       and ((p.source = 'sale' and p.source_id = v_sale.id::text)
         or (p.source = 'invoice_sales' and p.source_id in (
               select i.id::text from public.invoice_sales i
                where i.sale_id = v_sale.id and coalesce(i.document_type, 'invoice') = 'invoice')))
     for update
  loop
    if not exists (
      select 1 from public.cash_sessions cs
       where cs.organization_id = v_sale.organization_id and cs.status = 'open'
         and cs.opened_at <= v_pago.created_at
         and case when v_modo = 'user'
                  then cs.opened_by = v_pago.created_by and cs.branch_id is not distinct from v_pago.branch_id
                  else (cs.branch_id = v_pago.branch_id or cs.branch_id is null) end
    ) then
      raise exception 'caja_cerrada' using errcode = '22023',
        hint = 'El pago entró en una caja ya cerrada: registre una devolución.';
    end if;

    if v_periodo_ok is null and exists (
      select 1 from public.journal_entries je
       where je.organization_id = v_sale.organization_id
         and je.fact_key = 'settlement:payment:' || v_pago.id::text
         and coalesce(je.posted, false)
    ) then
      v_periodo_ok := public.fn_is_period_open(v_sale.organization_id, public.fn_today_for(v_sale.organization_id, v_sale.branch_id));
      if not v_periodo_ok then
        raise exception 'periodo_cerrado' using errcode = '22023';
      end if;
    end if;

    -- La anulación del pago es la única del sistema (fn_anular_pago): estado
    -- 'void', contra-asiento del cobro, cuotas, recibo y auditoría financiera.
    select public.fn_anular_pago(v_pago.id, v_motivo) as r into v_je;
    if (v_je.r->>'contra_asiento') is not null then
      v_n_asientos := v_n_asientos + 1;
    end if;
    v_n_pagos := v_n_pagos + 1;
  end loop;

  -- ── Propinas: la anulación existente (revierte su asiento; pos.void) ────
  for v_tip in select t.id from public.tips t where t.sale_id = v_sale.id and t.voided_at is null loop
    perform public.fn_propina_anular(v_tip.id, v_motivo);
    v_n_propinas := v_n_propinas + 1;
  end loop;

  -- ── Comisiones devengadas ───────────────────────────────────────────────
  with c as (
    update public.commissions set status = 'cancelled', updated_at = now()
     where organization_id = v_sale.organization_id and status = 'accrued'
       and ((source_type = 'sale' and source_id = v_sale.id::text)
         or (v_inv.id is not null and source_type = 'invoice_sale' and source_id = v_inv.id::text))
    returning 1
  ) select count(*) into v_n_comision from c;
  if exists (select 1 from public.commissions
              where organization_id = v_sale.organization_id and status = 'paid'
                and source_type = 'sale' and source_id = v_sale.id::text) then
    v_avisos := array_append(v_avisos, 'comision_ya_pagada');
  end if;

  -- ── Stock: vuelve exactamente lo que salió por la venta (kardex) ────────
  for v_mov in
    select sm.branch_id, sm.product_id, sum(sm.qty) as qty,
           max(sm.unit_cost) as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_sale.organization_id
       and sm.source in ('sale', 'mesa_sale')
       and sm.source_id = v_sale.id::text
       and sm.direction = 'out'
     group by sm.branch_id, sm.product_id
  loop
    perform public.fn_stock_entrada_devolucion(
      v_sale.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.qty, v_mov.unit_cost,
      'anulacion:' || v_sale.id::text, 'Anulación de la venta ' || v_sale.id::text || ' - ' || v_motivo, v_uid);
    v_n_stock := v_n_stock + 1;
  end loop;

  -- ── Seriales vendidos vuelven a stock ───────────────────────────────────
  for v_serial in
    select sn.* from public.serial_numbers sn
     where sn.organization_id = v_sale.organization_id and sn.sale_id = v_sale.id::text and sn.status = 'sold'
  loop
    update public.serial_numbers set
      status = 'in_stock', sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
      web_order_id = null, invoice_sale_id = null, sale_channel = 'in_stock', sale_date = null,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status,
      from_branch_id, to_branch_id, source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, v_sale.organization_id, 'returned', 'sold', 'in_stock',
      v_serial.current_branch_id, v_serial.current_branch_id, 'sales', v_sale.id::text, v_sale.id,
      v_sale.customer_id, v_uid, 'Anulación: ' || v_motivo
    );
    v_n_seriales := v_n_seriales + 1;
  end loop;

  -- ── Factura: nota crédito por lo facturado y factura anulada ────────────
  -- La cartera la ajustan los disparadores (nunca a mano). La nota crédito
  -- ELECTRÓNICA no se envía a Factus todavía: si la factura salió a la DIAN,
  -- queda el aviso para enviarla a mano (docs/design/POS-COBRO-SERVIDOR.md §6).
  if v_inv.id is not null then
    if v_inv.einvoice_status in ('pending', 'processing', 'sent', 'accepted') then
      v_avisos := array_append(v_avisos, 'factura_electronica_sin_nota_credito_dian');
    end if;
    v_nc_numero := public.fn_pos_numero_nota_credito(v_sale.organization_id, v_inv.branch_id);
    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
      currency, subtotal, tax_total, total, balance, status, document_type,
      related_invoice_id, tax_included, payment_method, description, created_by
    ) values (
      v_sale.organization_id, v_inv.branch_id, v_inv.customer_id, v_sale.id, v_nc_numero, now(), now(),
      v_inv.currency, -coalesce(v_inv.subtotal, 0), -coalesce(v_inv.tax_total, 0), -coalesce(v_inv.total, 0), 0,
      'issued', 'credit_note', v_inv.id, v_inv.tax_included, coalesce(v_inv.payment_method, 'credit'),
      'Nota crédito por anulación de la factura ' || v_inv.number || ' - ' || v_motivo, v_uid
    ) returning id into v_nc_id;

    insert into public.invoice_items (
      invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
      total_line, tax_rate, tax_code, discount_amount, tax_included, serial_ids
    )
    select v_nc_id, v_nc_id, 'sale', ii.product_id, coalesce(ii.description, 'Anulación'),
           -ii.qty, ii.unit_price, -ii.total_line, coalesce(ii.tax_rate, 0), ii.tax_code,
           -coalesce(ii.discount_amount, 0), coalesce(ii.tax_included, v_inv.tax_included),
           coalesce(ii.serial_ids, '{}')
      from public.invoice_items ii
     where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id
     order by ii.created_at, ii.id;

    update public.invoice_sales set status = 'void', balance = 0, updated_at = now() where id = v_inv.id;
  end if;

  -- Membresías (20260929001100): la anulación cancela las membresías de sus líneas.
  for v_mem_si in
    select si.id, si.quantity from public.sale_items si where si.sale_id = v_sale.id and si.quantity > 0
  loop
    if (public.fn_membresias_revertir_linea(v_mem_si.id, v_mem_si.quantity, v_motivo,
          jsonb_build_object('tipo', 'anulacion', 'id', v_sale.id))->>'accion') is not null then
      v_n_membresias := v_n_membresias + 1;
    end if;
  end loop;

  update public.sales set
    status         = 'void',
    balance        = 0,
    payment_status = case when v_n_pagos > 0 then 'refunded' else payment_status end,
    notes          = coalesce(notes || E'\n', '') || '[ANULADA] ' || v_motivo,
    updated_at     = now()
  where id = v_sale.id;

  insert into public.ops_audit_log (
    organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, new_data, metadata
  ) values (
    v_sale.organization_id, v_sale.branch_id, v_uid, 'sales', v_sale.id::text, 'VOID',
    jsonb_build_object('status', v_sale.status, 'payment_status', v_sale.payment_status, 'total', v_sale.total, 'balance', v_sale.balance),
    jsonb_build_object('status', 'void'),
    jsonb_build_object('motivo', v_motivo, 'factura', v_inv.number, 'nota_credito', v_nc_numero,
                       'pagos_anulados', v_n_pagos, 'asientos_revertidos', v_n_asientos,
                       'propinas_anuladas', v_n_propinas, 'comisiones_canceladas', v_n_comision,
                       'productos_devueltos', v_n_stock, 'seriales_devueltos', v_n_seriales,
                       'avisos', to_jsonb(v_avisos))
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'ya_anulada', false,
    'nota_credito_id', v_nc_id,
    'nota_credito_numero', v_nc_numero,
    'pagos_anulados', v_n_pagos,
    'asientos_revertidos', v_n_asientos,
    'propinas_anuladas', v_n_propinas,
    'comisiones_canceladas', v_n_comision,
    'productos_devueltos', v_n_stock,
    'seriales_devueltos', v_n_seriales,
    'avisos', to_jsonb(v_avisos),
    'membresias_canceladas', v_n_membresias
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_vivos integer;
BEGIN
    IF (NEW.status IN ('void','voided','cancelled'))
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND (OLD.status NOT IN ('void','voided','cancelled')) THEN

        IF NEW.document_type = 'credit_note' THEN
            RETURN NEW;
        END IF;

        IF EXISTS (
            SELECT 1 FROM invoice_sales cn
            WHERE cn.related_invoice_id = NEW.id
              AND cn.document_type = 'credit_note'
        ) THEN
            RETURN NEW;
        END IF;

        SELECT count(*) INTO v_vivos
        FROM journal_entries je
        WHERE je.organization_id = NEW.organization_id
          AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
               OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%')
               OR (je.fact_key IS NULL AND je.source = 'invoice_sales' AND je.source_id = NEW.id::text))
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries r
              WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id);
        IF v_vivos = 0 THEN
            RETURN NEW;
        END IF;

        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = NEW.organization_id
          AND source_type = 'sale'
          AND event_type = 'voided'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            PERFORM fn_log_journal_failure(
                NEW.organization_id, NEW.branch_id, now(),
                'invoice_sales', NEW.id::text || ':void', 'void:invoice:' || NEW.id::text,
                NULL, NULL, ABS(COALESCE(NEW.total, 0)),
                'no_rule', 'Sin regla contable activa de anulación de venta');
            RETURN NEW;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := now(),
            p_memo := 'Anulación Factura ' || COALESCE(NEW.number, NEW.id::text),
            p_source := 'invoice_sales',
            p_source_id := NEW.id::text || ':void',
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := ABS(COALESCE(NEW.total, 0)),
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN ABS(COALESCE(NEW.tax_total, 0)) ELSE 0 END,
            p_tax_is_credit := false,
            p_fact_key := 'void:invoice:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

delete from supabase_migrations.schema_migrations where version = '20261025134115';
