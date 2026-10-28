-- Restaura las definiciones anteriores (contrapartida 3105).
CREATE OR REPLACE FUNCTION public.fn_carga_inicial_cuentas(p_org integer, p_branch integer, OUT debito text, OUT credito text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base text;
begin
  select cc.account_code into v_base
  from public.configuracion_contable cc
  where cc.organization_id = p_org
    and cc.clave = 'inventario'
    and cc.account_code like '1435%'
    and (cc.branch_id = p_branch or cc.branch_id is null)
  order by case when cc.branch_id = p_branch then 0 else 1 end, cc.id
  limit 1;

  if v_base is not null then
    debito := public.fn_carga_inicial_cuenta(p_org, p_branch, v_base);
  end if;
  if debito is null or debito !~ '^143501[0-9]{2}$' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;

  credito := public.fn_cuenta_configurada(p_org, p_branch, 'saldo_inicial', '3105');
  if credito is null or left(credito, 4) = '4250' then
    credito := public.fn_carga_inicial_cuenta(p_org, p_branch, '3105');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_inventory_adjustment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule record;
  v_neto numeric;
  v_amount numeric;
  v_event_type text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_description text;
  v_nprod integer;
  v_prod integer;
  v_explicita boolean;
  v_razon text;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(sum(case when sm.direction = 'in' then 1 else -1 end * abs(sm.qty)
                      * coalesce(nullif(sm.unit_cost, 0),
                                 (select sl.avg_cost from stock_levels sl
                                   where sl.product_id = sm.product_id and sl.branch_id = sm.branch_id
                                     and sl.lot_id is not distinct from sm.lot_id
                                   order by sl.id limit 1), 0)), 0),
         count(distinct sm.product_id),
         min(sm.product_id)
    into v_neto, v_nprod, v_prod
    from stock_movements sm
   where sm.source = 'adjustment'
     and sm.source_id = new.id::text
     and sm.organization_id = new.organization_id;

  v_amount := round(abs(v_neto), 2);
  if v_amount <= 0 then
    return new;
  end if;
  v_event_type := case when v_neto > 0 then 'gain' else 'loss' end;

  select je.id into v_existing_entry
    from journal_entries je
   where je.source = 'inventory_adjustment'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;
  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory_adjustment'
     and event_type = v_event_type
     and is_active = true
   order by priority
   limit 1;

  v_credit_account := public.fn_cuenta_inventario_producto(
    new.organization_id,
    new.branch_id,
    case when v_nprod = 1 then v_prod else null end
  );

  v_razon := lower(btrim(coalesce(new.reason, '')));
  if v_razon = 'correccion_conteo' then
    return new;
  end if;

  if v_event_type = 'gain' then
    v_debit_account := public.fn_inventario_auxiliar_1435(new.organization_id, new.branch_id);
    if v_razon in ('initial_setup', 'saldo_inicial') then
      v_credit_account := public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'saldo_inicial', '3105');
    elsif v_razon in ('compra_sin_orden', 'compra sin orden') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'proveedores'),
        '2205'
      );
    else
      v_credit_account := public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id,
        public.fn_cuenta_configurada(new.organization_id, new.branch_id, 'ingresos_diversos',
          public.fn_cuenta_auxiliar_de_titulo(new.organization_id, new.branch_id, '4295')));
    end if;
    if left(coalesce(v_credit_account, ''), 4) = '4250'
       or v_debit_account is null
       or left(v_debit_account, 4) <> '1435' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'sobrante_cuenta', 'El sobrante debita el auxiliar de 1435 y no acredita 4250');
      return new;
    end if;
  else
    v_explicita := v_rule.debit_account_code is not null
      and v_rule.debit_account_code not in ('5150', '6105', '519595', '5315')
      and left(v_rule.debit_account_code, 1) <> '6'
      and coalesce(new.motivo_ajuste, '') = ''
      and lower(coalesce(new.reason, '')) not in ('robo', 'siniestro', 'theft', 'consumo_interno', 'consumo interno');
    if v_explicita then
      v_debit_account := v_rule.debit_account_code;
    else
      v_debit_account := public.fn_debito_salida_inventario(
        new.organization_id, new.branch_id, new.motivo_ajuste, new.reason
      );
    end if;
    if left(coalesce(v_debit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'salida_clase_6', 'Un faltante o un consumo interno no debita la clase 6');
      return new;
    end if;
  end if;

  if v_debit_account is null or v_credit_account is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
      'inventory_adjustment', new.id::text, null, v_debit_account, v_credit_account, v_amount,
      'no_rule', 'Sin cuenta de inventario o de gasto para el ajuste');
    return new;
  end if;

  v_description := 'Ajuste de inventario ' || coalesce(new.code, new.id::text)
    || ' - ' || coalesce(new.motivo_ajuste, new.reason, 'N/A')
    || coalesce(' - ' || nullif(new.notes, ''), '');

  perform public.fn_create_journal_entry(
    p_organization_id => new.organization_id,
    p_branch_id => new.branch_id,
    p_entry_date => coalesce(new.posted_at, new.updated_at, now()),
    p_memo => v_description,
    p_source => 'inventory_adjustment',
    p_source_id => new.id::text,
    p_debit_account => v_debit_account,
    p_credit_account => v_credit_account,
    p_amount => v_amount,
    p_fact_key => 'inventory_adjustment:' || new.id::text
  );
  return new;
end;
$function$;

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
        when 2 then '4140'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '4140'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '61400501' else '61350501' end
      when 'faltante_inventario' then case when p_type_id in (1, 2) then '61400502' else v.defecto end
      -- Inventario: nunca 1405 ni el título 1435 (título en 55 de 56 orgs H/R): auxiliar de movimiento
      -- 14350101, igual que el TS (QA 25-oct). fn_sembrar_configuracion_contable puede afinarlo por sede.
      when 'inventario' then '14350101'
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

drop function if exists public.fn_carga_inicial_contrapartida(integer, integer, boolean);
delete from supabase_migrations.schema_migrations where version = '20261027215000';
