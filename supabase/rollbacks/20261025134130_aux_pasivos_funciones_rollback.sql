-- Rollback de 20261025134130. Revertir ANTES 134140 y 134135 (en ese orden); después 134125.
-- Restaura las 19 funciones a su versión viva tras 134070…134120 y la fn_comision_cuenta de 134095.
-- Las columnas nuevas de vendor_commission_rates (tipo_persona, retencion_tarifa, aplica_art383) se eliminan: lo que se
-- haya editado en ellas se pierde.
set constraints public.trg_chart_cuenta_titulo_configurada immediate;  -- QA 801206c2 BAJO: sin eventos diferidos heredados
CREATE OR REPLACE FUNCTION public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text)
 RETURNS TABLE(accion text, debito text, credito text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_clave = 'cambioEfectivo' then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
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
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array[public.fn_cuenta_ingresos_diversos(p_organization_id, null)])
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_run RECORD;
    v_org_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
    v_total_debit numeric := 0;
    v_country_code text;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Disparar cuando el slip cambia a 'approved' (devengo) o 'paid' (pago)
    IF (NEW.status = 'approved' OR NEW.status = 'paid')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN

        SELECT * INTO v_run
        FROM payroll_runs
        WHERE id = NEW.payroll_run_id;

        IF v_run IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT organization_id INTO v_org_id
        FROM payroll_periods
        WHERE id = v_run.payroll_period_id;

        IF v_org_id IS NULL THEN
            RETURN NEW;
        END IF;

        v_event_type := CASE NEW.status
            WHEN 'approved' THEN 'created'
            WHEN 'paid' THEN 'paid'
        END;

        -- Buscar regla contable
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_org_id
          AND source_type = 'payroll'
          AND event_type = v_event_type
          AND is_active = true
        ORDER BY priority LIMIT 1;

        IF v_rule IS NULL THEN
            SELECT * INTO v_rule
            FROM accounting_rules
            WHERE organization_id = v_org_id
              AND source_type = 'payroll'
              AND is_active = true
            ORDER BY priority LIMIT 1;
        END IF;

        IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(coalesce((to_jsonb(NEW)->>'organization_id')::integer, v_org_id), NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
        END IF;

        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = v_org_id;
        SELECT country_code INTO v_country_code FROM organizations WHERE id = v_org_id;

        v_memo := 'Nómina - Slip: ' || NEW.id::text || ' (' || v_event_type || ')';
        v_source_id := NEW.id::text || ':' || v_event_type;

        IF v_event_type = 'paid' THEN
            -- Pago: asiento simple pasivo → banco
            v_entry_id := fn_create_journal_entry(
                p_organization_id := v_org_id,
                p_branch_id := v_branch_id,
                p_entry_date := COALESCE(NEW.paid_at, NEW.updated_at, now()),
                p_memo := v_memo,
                p_source := 'payroll_slips',
                p_source_id := v_source_id,
                p_debit_account := v_rule.debit_account_code,
                p_credit_account := v_rule.credit_account_code,
                p_amount := NEW.net_pay
            );
        ELSE
            -- Devengo: asiento multi-línea con provisiones
            -- Solo si el país tiene plan PUC (COL), usar cuentas detalladas
            -- Para otros países, usar fn_create_journal_entry simple
            IF v_country_code = 'COL' THEN
                -- Crear cabecera
                INSERT INTO journal_entries (
                    organization_id, branch_id, entry_date, memo,
                    source, source_id, posted
                ) VALUES (
                    v_org_id, v_branch_id,
                    COALESCE(NEW.updated_at, now()),
                    v_memo, 'payroll_slips', v_source_id, true
                ) RETURNING id INTO v_entry_id;

                -- 1. Gasto salario base (5105)
                IF COALESCE(NEW.gross_pay, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5105', 'Salario base', NEW.gross_pay, 0);
                    v_total_debit := v_total_debit + NEW.gross_pay;
                END IF;

                -- 2. Salud patronal (5195) → pasivo (2370)
                IF COALESCE(NEW.employer_health, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Salud patronal', NEW.employer_health, 0);
                    v_total_debit := v_total_debit + NEW.employer_health;
                END IF;

                -- 3. Pensión patronal (5195) → pasivo (2370)
                IF COALESCE(NEW.employer_pension, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Pensión patronal', NEW.employer_pension, 0);
                    v_total_debit := v_total_debit + NEW.employer_pension;
                END IF;

                -- 4. ARL (5195)
                IF COALESCE(NEW.employer_arl, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'ARL patronal', NEW.employer_arl, 0);
                    v_total_debit := v_total_debit + NEW.employer_arl;
                END IF;

                -- 5. Parafiscales (5195)
                IF COALESCE(NEW.employer_parafiscales, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Parafiscales', NEW.employer_parafiscales, 0);
                    v_total_debit := v_total_debit + NEW.employer_parafiscales;
                END IF;

                -- 6. Cesantías (5195)
                IF COALESCE(NEW.employer_severance, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión cesantías', NEW.employer_severance, 0);
                    v_total_debit := v_total_debit + NEW.employer_severance;
                END IF;

                -- 7. Interés cesantías (5195)
                IF COALESCE(NEW.employer_severance_interest, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Interés cesantías', NEW.employer_severance_interest, 0);
                    v_total_debit := v_total_debit + NEW.employer_severance_interest;
                END IF;

                -- 8. Provisión vacaciones (5195)
                IF COALESCE(NEW.employer_vacation_provision, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión vacaciones', NEW.employer_vacation_provision, 0);
                    v_total_debit := v_total_debit + NEW.employer_vacation_provision;
                END IF;

                -- 9. Provisión prima (5195)
                IF COALESCE(NEW.employer_bonus_provision, 0) > 0 THEN
                    INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                    VALUES (v_entry_id, v_org_id, '5195', 'Provisión prima', NEW.employer_bonus_provision, 0);
                    v_total_debit := v_total_debit + NEW.employer_bonus_provision;
                END IF;

                -- Línea de crédito: pasivo nómina por pagar (2505)
                -- Total = net_pay (al empleado) + todas las provisiones patronales
                INSERT INTO journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit)
                VALUES (v_entry_id, v_org_id, '2505', 'Nómina por pagar', 0, v_total_debit);

            ELSE
                -- Para otros países, asiento simple con gross_pay
                v_entry_id := fn_create_journal_entry(
                    p_organization_id := v_org_id,
                    p_branch_id := v_branch_id,
                    p_entry_date := COALESCE(NEW.updated_at, now()),
                    p_memo := v_memo,
                    p_source := 'payroll_slips',
                    p_source_id := v_source_id,
                    p_debit_account := v_rule.debit_account_code,
                    p_credit_account := v_rule.credit_account_code,
                    p_amount := NEW.net_pay
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clave_cuenta_configurable(p_source text, p_lado text, p_codigo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when s.code is null then null
    when s.code = '240810' or s.code ~ '^240810[0-9]{2}$' then 'iva_descontable'
    when s.code = '240805' or s.code ~ '^240805[0-9]{2}$' then 'iva_generado'
    when p_lado = 'impuesto' and s.code in ('2408', '2405') then
      case when s.origen = any (array['purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'])
        then 'iva_descontable' else 'iva_generado' end
    when p_lado = 'descuento' and s.code = '4175' then 'descuentos'
    when s.code = '1105' then 'caja'
    when s.code = '1110' then 'bancos'
    when s.code = '1305' and s.origen <> all (array['loan', 'loans', 'employee_loans', 'installment', 'installments', 'loan_installments', 'ap_installments']) then 'clientes'
    when s.code in ('2105', '2205') then 'proveedores'
    when s.code in ('1405', '1435') then 'inventario'
    when s.code in ('6105', '6135', '6140') or s.code ~ '^61(35|40)05[0-9]{2}$' then 'costo_ventas'
    when s.code = '2365' then 'retefuente'
    when s.code = '2367' then 'reteiva'
    when s.code = '2368' then 'reteica'
    when s.code = '2805' then 'anticipos'
    when s.code in ('5235', '529505') then 'comisiones'
    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'
    when s.code = '5105' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina'
    when s.code = '2505' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_por_pagar'
    when s.code = '2370' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_aportes'
    when s.code in ('4175', '4705') then 'devoluciones'
    when p_lado = 'debito' and s.code in ('4105', '4135', '4110', '414015', '4145', '4235', '4115', '4140', '414005', '414095', '4155') then 'devoluciones'
    when s.code in ('4105', '4135', '4110', '414015', '4145') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '414005', '414095', '4155') then 'ventas_servicios'
    else null
  end
  from (select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen) s;
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
  select 130, 'reclasificacion', 'reclas_4105', '41400501', 0, s.neto
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

CREATE OR REPLACE FUNCTION public.fn_create_default_accounting_rules(org_id integer, country_code text)
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
  v_iva_venta text;
  v_anticipo text := '2805';
  v_viaje text;
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
  -- Contador 25-oct-2026 (134115): hoteles no-show 41409502 (IVA configurable: la regla no lleva impuesto
  -- automático), viaje/tour de contado 41409501; restaurantes: ventas 41401501 (propuesta).
  -- FIX (A): el IVA de la venta va siempre a 24080501 (también en restaurantes); el INC se decide por línea al
  -- contabilizar (fn_cuenta_inc). Hoteles: no-show debita 28050501 si la org ya lo tiene (si no 2805; nunca 2405).
  v_viaje := v_prod;
  v_iva_venta := '24080501';
  if v_type = 2 then
    v_noshow := '41409502';
    v_viaje := '41409501';
    if exists (select 1 from public.chart_of_accounts c where c.organization_id = org_id
                and c.account_code = '28050501' and c.es_movimiento is true) then
      v_anticipo := '28050501';
    end if;
  end if;
  v_manifiesto := case when v_type = 6 then '2335' else '2205' end;

  insert into public.accounting_rules (
    organization_id, name, description, source_type, event_type,
    debit_account_code, credit_account_code, tax_account_code,
    use_tax_from_document, priority, is_active
  ) values
    (org_id, 'Venta a Credito', 'Facturacion de venta a credito', 'sale', 'created', '1305', v_prod, v_iva_venta, true, 10, true),
    (org_id, 'Venta de Contado', 'Facturacion de venta al contado', 'sale', 'created', '1105', v_prod, v_iva_venta, true, 11, true),
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
    (org_id, 'Devolucion de Venta', 'Nota credito por devolucion', 'sale_credit_note', 'created', v_dev, '1305', v_iva_venta, true, 25, true),
    (org_id, 'Anulacion de Venta', 'Anulacion de factura', 'sale', 'voided', v_dev, '1305', v_iva_venta, true, 26, true),
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
    (org_id, 'Viaje', 'Ingreso por viaje', 'trip', 'created', '1105', v_viaje, null, false, 30, true),
    (org_id, 'Incidente Transporte', 'Gasto por incidente de transporte', 'transport_incident', 'created', '5105', '1110', null, false, 30, true),
    (org_id, 'Cargo Folio Alimentos', 'Cargo a folio por alimentos', 'folio_item', 'created', '1305', v_folio_alim, null, false, 30, true),
    (org_id, 'Cargo Folio Servicios', 'Cargo a folio por servicios', 'folio_item', 'created', '1305', v_folio_serv, null, false, 31, true),
    (org_id, 'Pago Folio', 'Pago de folio', 'folio_payment', 'paid', '1105', '1305', null, false, 30, true),
    (org_id, 'Comision OTA', 'Comision del canal: gasto contra cuenta por pagar al canal', 'ota_commission', 'confirmed', '52950501', '2335', null, false, 30, true),
    (org_id, 'Mantenimiento', 'Gasto de mantenimiento', 'maintenance', 'created', '5145', '1110', null, false, 30, true),
    (org_id, 'Reserva Confirmada', 'Reserva confirmada', 'reservation', 'confirmed', '1305', '2805', null, false, 30, true),
    (org_id, 'Reserva no presentada', 'El anticipo pasa al ingreso del sector', 'reservation', 'no_show', v_anticipo, v_noshow, null, false, 32, true),
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
    insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
      debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
    values (org_id, 'Cargo Folio Bar', 'Cargo a folio por bar y minibar', 'folio_item', 'created',
      '1305', '41402001', null, false, 13, true, '{"source": "minibar"}'::jsonb);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cuentas_manifiesto(p_organization_id integer, p_branch_id integer, p_pagado_contado boolean, OUT debito text, OUT credito text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;

  debito := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'inventario'),
    case when v_type = 1 then '1405' else '1435' end
  );

  if coalesce(p_pagado_contado, false) then
    credito := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'caja'), '1105');
  elsif v_type = 6 then
    credito := coalesce(
      public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'manifiesto_transporte'),
      '2335'
    );
  else
    credito := coalesce(
      public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'manifiesto_por_pagar'),
      '2205'
    );
  end if;

  if not coalesce(p_pagado_contado, false) and left(coalesce(credito, ''), 2) = '11' then
    credito := case when v_type = 6 then '2335' else '2205' end;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cuentas_movimiento_stock(p_organization_id integer, p_source text, p_direction text, OUT debito text, OUT credito text, OUT evento text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv text;
  v_cmv text;
  v_faltante text;
  v_tmp text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select o.type_id into v_type
  from public.organizations o
  where o.id = p_organization_id;

  select ar.credit_account_code
    into v_inv
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = 'adjusted'
    and ar.is_active
  order by ar.priority
  limit 1;
  -- QA 25-oct: nunca 1405 (ni 1435 de grupo). Respaldo: auxiliar 1435 de la org, si no 14350101.
  v_inv := coalesce(nullif(btrim(v_inv), ''), public.fn_inventario_auxiliar_1435(p_organization_id, null), '14350101');
  -- 6135 pasa a título en 134060: el respaldo es su auxiliar 61350501. Igual que con 1435, el auxiliar
  -- de la sede lo resuelve después fn_cuenta_configurada_de_sede (branch_account_mappings 6135->61350501).
  -- Hoteles y restaurantes (regla del contador): 61400501 / mermas de cocina 61400502.
  v_cmv := case when v_type in (1, 2) then '61400501' else '61350501' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    case when v_type in (1, 2) then '61400502' else '61350502' end
  );

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = evento
    and ar.is_active
  order by ar.priority
  limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '37050501';
    elsif evento = 'sale' then
      debito := v_cmv;
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := v_cmv;
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '2205';
    elsif evento = 'loss' then
      debito := v_faltante;
      credito := v_inv;
    else
      debito := v_inv;
      credito := '42959501';
    end if;
  end if;

  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '42959501';
  end if;

  -- Faltante: 61350502 (Mermas y faltantes) es la cuenta correcta desde el 25-oct; cualquier otra
  -- cuenta de costo (6xxx) o 5150/6105 se corrige al faltante configurado.
  if evento = 'loss' and debito is distinct from '61350502'
     and (left(coalesce(debito, ''), 1) = '6' or debito in ('5150', '6105')) then
    debito := v_faltante;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_liquidar_pago_ota(p_canal text, p_detail_id uuid, p_monto_bruto numeric, p_bank_account_id integer DEFAULT NULL::integer, p_fecha timestamp with time zone DEFAULT now(), p_referencia text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_det record;
  v_res record;
  v_rule record;
  v_branch integer;
  v_banco text;
  v_neto numeric;
  v_entry integer;
  v_fk text := 'settlement:ota_payout:' || p_detail_id;
  v_memo text;
begin
  if p_canal = 'booking' then
    select id, reservation_id, commission_amount into v_det from public.booking_reservation_details where id = p_detail_id;
  elsif p_canal = 'expedia' then
    select id, reservation_id, commission_amount into v_det from public.expedia_reservation_details where id = p_detail_id;
  else
    raise exception 'CANAL_INVALIDO: %', p_canal using errcode = '22023';
  end if;
  if v_det.id is null then
    raise exception 'RESERVA_OTA_INEXISTENTE' using errcode = 'P0002';
  end if;

  select r.organization_id, r.branch_id into v_res from public.reservations r where r.id = v_det.reservation_id;
  perform public.fn_assert_acceso_org(v_res.organization_id);
  if v_uid is not null and not public.fn_tiene_permiso(v_res.organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  select id into v_entry from public.journal_entries where organization_id = v_res.organization_id and fact_key = v_fk;
  if v_entry is not null then
    return v_entry;
  end if;

  if coalesce(p_monto_bruto, 0) <= coalesce(v_det.commission_amount, 0) then
    raise exception 'MONTO_INVALIDO: el bruto debe superar la comisión (%)', v_det.commission_amount using errcode = '22023';
  end if;

  select * into v_rule from public.accounting_rules
   where organization_id = v_res.organization_id and source_type = 'ota_commission' and is_active
   order by (event_type = 'confirmed') desc, priority limit 1;

  select b.id into v_branch from public.branches b
   where b.organization_id = v_res.organization_id
   order by (b.id = v_res.branch_id) desc, (b.is_main is true) desc, b.id limit 1;

  v_banco := coalesce(public.fn_money_account_code_pago(v_res.organization_id, v_branch, 'transfer', p_bank_account_id), '1110');
  v_neto := p_monto_bruto - coalesce(v_det.commission_amount, 0);
  v_memo := 'Pago neto ' || p_canal || ' - Reserva ' || v_det.reservation_id || coalesce(' - Ref: ' || p_referencia, '');

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (v_res.organization_id, v_branch, coalesce(p_fecha, now()), v_memo, 'ota_payout', p_detail_id::text, true, v_uid, v_fk)
  returning id into v_entry;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (v_entry, v_banco, 'Neto recibido del canal', v_neto, 0);
  if coalesce(v_det.commission_amount, 0) > 0 then
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry, coalesce(v_rule.credit_account_code, '2335'), 'Comisión descontada por el canal', v_det.commission_amount, 0);
  end if;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
  values (v_entry, '1305', 'Cobro de la reserva por el canal', 0, p_monto_bruto);

  return v_entry;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_propuesta_configuracion_sector(p_type_id integer)
 RETURNS TABLE(clave text, account_code text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '41401501'
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
      -- Contador 25-oct-2026 (134115): INC de restaurantes en su auxiliar (las comisiones van en su propio commit).
      when 'impuesto_consumo' then case when p_type_id = 1 then '24950501' else v.defecto end
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

CREATE OR REPLACE FUNCTION public.fn_puc_destino_reclass(p_type integer, p_codigo text, p_nombre text)
 RETURNS TABLE(destino text, motivo text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sufijo text;
begin
  if p_codigo ~ '^1405-[0-9]{1,2}$' then
    v_sufijo := lpad(substring(p_codigo from '[0-9]+$'), 2, '0');
    destino := case when p_type = 1 then '140505' else '143505' end || v_sufijo;
    motivo := 'Inventario de sede al auxiliar de 8 dígitos';
    return next;
    return;
  end if;
  if p_codigo ~ '^6105-[0-9]{1,2}$' then
    v_sufijo := lpad(substring(p_codigo from '[0-9]+$'), 2, '0');
    destino := case when p_type in (1, 2) then '614005' else '613505' end || v_sufijo;
    motivo := 'Costo de sede al auxiliar de 8 dígitos';
    return next;
    return;
  end if;
  if p_codigo = '1405' and p_type is distinct from 1 then
    destino := '1435';
    motivo := 'Inventario de comercio a 1435';
    return next;
    return;
  end if;
  if p_codigo = '6105' then
    destino := case when p_type in (1, 2) then '61400501' else '61350501' end;
    motivo := 'Costo a la cuenta del sector';
    return next;
    return;
  end if;
  if p_codigo = '2105' and coalesce(p_nombre, '') ~* 'proveedor' then
    destino := '2205';
    motivo := 'Proveedores a 2205';
    return next;
    return;
  end if;
  if p_codigo = '2405' then
    if coalesce(p_nombre, '') ~* 'anticipo|a favor' then
      destino := '2805';
      motivo := 'Anticipo a 2805';
    else
      destino := '24080501';
      motivo := 'Impuesto a 24080501 (IVA sin tarifa: 19%, revisar)';
    end if;
    return next;
    return;
  end if;
  if p_codigo = '4705' then
    destino := '4175';
    motivo := 'Devoluciones a 4175';
    return next;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_regla_devengo_compra(p_organization_id integer)
 RETURNS TABLE(debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payable text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.debit_account_code into v_payable
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select r.debit_account_code,
         coalesce(v_payable, r.credit_account_code),
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
  order by
    (r.credit_account_code = v_payable) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if v_credit = '2105' or (v_type in (4, 6) and v_credit in ('2105', '2205')) then
      if v_type in (4, 6) then
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'compra_servicio'), '2335');
      else
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'), '2205');
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      elsif v_credit = '2105' then
        v_credit := case when v_type in (4, 6) then '2335' else '2205' end;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_descontable'),
        public.fn_cuenta_auxiliar_de_titulo(p_organization_id, null, '240810', null, 'descontable'));
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

CREATE OR REPLACE FUNCTION public.fn_sembrar_categorias_tesoreria(p_org integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_insertadas integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  perform set_config('app.sembrar_categorias', '1', true);

  insert into public.categorias_tesoreria (
    organization_id, clave, tipo, nombre, icono, cuenta_sugerida, orden, activa, es_predefinida
  )
  select
    p_org,
    v.clave,
    v.tipo,
    v.nombre,
    v.icono,
    case
      when c.account_code is not null
       and c.is_active is distinct from false
       and c.es_movimiento is distinct from false
      then r.cuenta
      else null
    end,
    v.orden,
    true,
    true
  from (
    values
      ('ventas_productos', 'ingreso', 'Ventas de productos', 'shopping-bag', '4135', 10),
      ('servicios', 'ingreso', 'Servicios', 'wrench', '4155', 20),
      ('arriendos_recibidos', 'ingreso', 'Arriendos recibidos', 'home', '4220', 30),
      ('intereses_recibidos', 'ingreso', 'Intereses', 'percent', '421005', 40),
      ('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'badge-percent', '4225', 50),
      ('reintegros', 'ingreso', 'Reintegros y recuperaciones', 'rotate-ccw', '4250', 60),
      ('aportes_socios', 'ingreso', 'Aportes de socios', 'users', '3105', 70),
      ('prestamos_recibidos', 'ingreso', 'Préstamos recibidos', 'landmark', '2105', 80),
      ('anticipos_clientes', 'ingreso', 'Anticipos de clientes', 'wallet', '2805', 90),
      ('cobro_cartera', 'ingreso', 'Cobro de cartera', 'receipt', '1305', 100),
      ('devolucion_proveedores', 'ingreso', 'Devolución de proveedores', 'undo-2', '2205', 110),
      ('otros_ingresos', 'ingreso', 'Otros ingresos', 'circle-plus', '4295', 120),
      ('proveedores', 'egreso', 'Proveedores y compras', 'truck', '2205', 10),
      ('nomina', 'egreso', 'Nómina', 'users', '5105', 20),
      ('seguridad_social', 'egreso', 'Seguridad social y parafiscales', 'shield', '5105', 30),
      ('arriendo', 'egreso', 'Arriendo', 'home', '5120', 40),
      ('energia', 'egreso', 'Energía', 'zap', '513530', 50),
      ('agua', 'egreso', 'Agua', 'droplet', '513525', 60),
      ('gas', 'egreso', 'Gas', 'flame', '513555', 65),
      ('internet', 'egreso', 'Internet y telefonía', 'wifi', '513535', 70),
      ('transporte', 'egreso', 'Transporte y fletes', 'truck', '513550', 80),
      ('publicidad', 'egreso', 'Publicidad', 'megaphone', '523560', 90),
      ('mantenimiento', 'egreso', 'Mantenimiento', 'wrench', '5145', 100),
      ('papeleria', 'egreso', 'Papelería', 'file-text', '519530', 110),
      ('aseo', 'egreso', 'Aseo y cafetería', 'coffee', '519525', 120),
      ('honorarios', 'egreso', 'Honorarios', 'briefcase', '5110', 130),
      ('seguros', 'egreso', 'Seguros', 'shield-check', '5130', 140),
      ('impuestos', 'egreso', 'Impuestos', 'landmark', '5115', 150),
      ('impuestos_declarados', 'egreso', 'Pago de impuestos declarados', 'landmark', '2408', 155),
      ('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'landmark', '530515', 160),
      ('gmf', 'egreso', 'GMF 4x1000', 'banknote', '511595', 170),
      ('intereses_pagados', 'egreso', 'Intereses', 'percent', '530520', 180),
      ('software', 'egreso', 'Software y suscripciones', 'monitor', '513595', 190),
      ('combustible', 'egreso', 'Combustible', 'fuel', '519545', 200),
      ('viaticos', 'egreso', 'Viáticos', 'plane', '5155', 210),
      ('domicilios', 'egreso', 'Domicilios', 'bike', '523550', 220),
      ('pago_prestamos', 'egreso', 'Pago de préstamos', 'landmark', '2105', 230),
      ('retiros_socios', 'egreso', 'Retiros de socios', 'log-out', '3105', 240),
      ('devoluciones_clientes', 'egreso', 'Devoluciones a clientes', 'undo-2', '4175', 250),
      ('otros_gastos', 'egreso', 'Otros gastos', 'circle-minus', '5195', 260)
  ) as v(clave, tipo, nombre, icono, cuenta, orden)
  -- 4295 -> 42959501 (ingreso genérico), 2408 -> 24080501, 530515 -> 53051501.
  cross join lateral (select public.fn_cuenta_auxiliar_de_titulo(p_org, null, v.cuenta) as cuenta) r
  left join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = r.cuenta
  where not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org and ya.clave = v.clave
  )
  and not exists (
    select 1 from public.categorias_tesoreria ya
     where ya.organization_id = p_org
       and ya.tipo = v.tipo
       and lower(ya.nombre) = lower(v.nombre)
  )
  on conflict (organization_id, clave) where clave is not null do nothing;

  get diagnostics v_insertadas = row_count;
  perform set_config('app.sembrar_categorias', '', true);
  return v_insertadas;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sobrante_borradores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_entry integer;
  v_posted boolean;
  v_memo text;
  v_branch integer;
  v_old_4250 numeric;
  v_old_3105 numeric;
  v_old_4295 numeric;
  v_residual numeric;
  v_compra numeric;
  v_saldo numeric;
  v_diversos numeric;
  v_nuevo numeric;
  v_d numeric;
  v_c numeric;
  v_centro_d uuid;
  v_centro_c uuid;
  v_centro uuid;
  g record;
  v_n integer;
begin
  drop table if exists pg_temp._sob_neto;
  create temp table _sob_neto as
  with pares as (
    select distinct ia.organization_id, ia.id as ajuste_id, je_sm.id as asiento_stock
    from public.inventory_adjustments ia
    join public.stock_movements sm
      on sm.organization_id = ia.organization_id
     and sm.source = 'adjustment'
     and sm.source_id = ia.id::text
    join public.journal_entries je_sm
      on je_sm.organization_id = sm.organization_id
     and je_sm.source = 'stock_movements'
     and je_sm.source_id = sm.id::text
     and je_sm.posted is true
    join public.journal_entries je_ia
      on je_ia.organization_id = ia.organization_id
     and je_ia.source = 'inventory_adjustment'
     and je_ia.source_id = ia.id::text
     and je_ia.posted is true
    where ia.organization_id <> 149
  )
  select p.organization_id,
         p.ajuste_id,
         round(sum(case when jl.account_code like '1405%' then jl.debit - jl.credit else 0 end), 2) as neto_1405,
         min(jl.account_code) filter (where jl.account_code like '1405%') as c1405,
         max(jl.account_code) filter (where jl.account_code like '1405%') as c1405b,
         min(jl.account_code) filter (where jl.account_code like '6105%') as c6105,
         max(jl.account_code) filter (where jl.account_code like '6105%') as c6105b
  from pares p
  join public.journal_lines jl on jl.journal_entry_id = p.asiento_stock
  group by p.organization_id, p.ajuste_id;

  if exists (
    select 1 from pg_temp._sob_neto
    where c1405 is distinct from c1405b or c6105 is distinct from c6105b
  ) then
    raise exception 'sobrante_cuentas_mixtas';
  end if;

  drop table if exists pg_temp._sob_doble;
  create temp table _sob_doble as
  select organization_id, ajuste_id, neto_1405, c1405, c6105
  from pg_temp._sob_neto
  where neto_1405 > 0;

  select count(*) into v_n from pg_temp._sob_doble;
  if v_n <> 48 then
    raise exception 'sobrante_doble_distinto: %', v_n;
  end if;

  delete from public.sobrante_aviso where origen = 'historico';

  for g in
    select organization_id, c1405, c6105, round(sum(neto_1405), 0) as monto, count(*) as ajustes
    from pg_temp._sob_doble
    group by organization_id, c1405, c6105
  loop
    if g.monto <= 0 or g.c1405 is null or g.c6105 is null or left(g.c1405, 4) <> '1405' or left(g.c6105, 4) <> '6105' then
      raise exception 'sobrante_reversion_incompleta org %', g.organization_id;
    end if;

    select je.id, je.posted, je.memo, je.branch_id
      into v_entry, v_posted, v_memo, v_branch
    from public.journal_entries je
    where je.organization_id = g.organization_id
      and je.fact_key = 'correccion_reversion:' || g.organization_id::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reversion_publicada org %', g.organization_id;
    end if;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    select jl.cost_center_id into v_centro_d
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '6105%'
    order by jl.id
    limit 1;
    select jl.cost_center_id into v_centro_c
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry and jl.account_code like '1405%'
    order by jl.id
    limit 1;

    delete from public.journal_lines where journal_entry_id = v_entry;

    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base, cost_center_id
    ) values
      (v_entry, g.c6105, coalesce(v_memo, 'Reversión del doble de stock'), g.monto, 0, g.organization_id, g.monto, 0, v_centro_d),
      (v_entry, g.c1405, coalesce(v_memo, 'Reversión del doble de stock'), 0, g.monto, g.organization_id, 0, g.monto, v_centro_c);

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values (
      g.organization_id, 'reversion_doble', g.monto,
      jsonb_build_object('ajustes', g.ajustes, 'debito', g.c6105, 'credito', g.c1405, 'asiento', v_entry),
      'historico'
    );
  end loop;

  drop table if exists pg_temp._sob_dest;
  create temp table _sob_dest as
  select ia.organization_id,
         case
           when lower(btrim(coalesce(ia.reason, ''))) in ('initial_setup', 'saldo_inicial') then '3105'
           when lower(btrim(coalesce(ia.reason, ''))) in ('compra_sin_orden', 'compra sin orden') then '2205'
           else '4295'
         end as destino,
         round(sum(jl.credit), 0) as monto
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id and je.posted is true
  join public.inventory_adjustments ia
    on je.source = 'inventory_adjustment'
   and je.source_id = ia.id::text
   and ia.organization_id = je.organization_id
  where je.organization_id <> 149
    and jl.credit > 0
    and (jl.account_code = '4250' or jl.account_code like '4250-%')
    and not exists (
      select 1 from pg_temp._sob_doble d
      where d.organization_id = ia.organization_id
        and d.ajuste_id = ia.id
    )
  group by 1, 2
  having round(sum(jl.credit), 0) <> 0;

  for v_org in
    select distinct x.organization_id
    from (
      select organization_id from pg_temp._sob_dest
      union
      select je.organization_id
      from public.journal_entries je
      join public.journal_lines jl on jl.journal_entry_id = je.id
      where je.posted is false
        and je.fact_key = 'correccion_reclasificacion:' || je.organization_id::text
        and je.organization_id <> 149
        and (jl.account_code = '4250' or jl.account_code like '4250-%')
    ) x
  loop
    select je.id, je.posted, je.memo
      into v_entry, v_posted, v_memo
    from public.journal_entries je
    where je.organization_id = v_org
      and je.fact_key = 'correccion_reclasificacion:' || v_org::text
    limit 1;

    if v_entry is null or v_posted is true then
      raise exception 'sobrante_reclas_publicada org %', v_org;
    end if;

    select coalesce(sum(debit), 0) into v_old_4250
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '4250' or account_code like '4250-%');
    select coalesce(sum(credit), 0) into v_old_3105
    from public.journal_lines
    where journal_entry_id = v_entry and (account_code = '3105' or account_code like '3105-%');
    select coalesce(sum(credit), 0) into v_old_4295
    from public.journal_lines
    -- QA 25-oct (B1): los asientos nuevos acreditan el auxiliar (42959501/42959502); se leen ambos.
    where journal_entry_id = v_entry
      and (account_code in ('4295', '42959501', '42959502') or account_code like '4295-%'
           or account_code = public.fn_cuenta_ingresos_diversos(v_org, null));

    v_residual := round(v_old_4250 - v_old_3105 - v_old_4295, 0);
    select coalesce(sum(monto), 0) into v_compra from pg_temp._sob_dest where organization_id = v_org and destino = '2205';
    select coalesce(sum(monto), 0) into v_saldo from pg_temp._sob_dest where organization_id = v_org and destino = '3105';
    select coalesce(sum(monto), 0) into v_diversos from pg_temp._sob_dest where organization_id = v_org and destino = '4295';

    if v_residual < -1 or abs(v_residual - v_compra) > 1 then
      raise exception 'sobrante_residual_compra org % residual % compra %', v_org, v_residual, v_compra;
    end if;

    v_nuevo := round(v_saldo + v_diversos + v_residual, 0);

    select jl.cost_center_id into v_centro
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and jl.cost_center_id is not null
      and (
        jl.account_code in ('4250', '3105', '4295', '42959501', '42959502')
        or jl.account_code like '4250-%'
        or jl.account_code like '3105-%'
        or jl.account_code like '4295-%'
      )
    order by jl.id
    limit 1;

    insert into public.sobrante_linea_respaldo (
      journal_entry_id, line_id, account_code, description, debit, credit,
      debit_base, credit_base, organization_id, cost_center_id
    )
    select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
           jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
    from public.journal_lines jl
    where jl.journal_entry_id = v_entry
      and not exists (
        select 1 from public.sobrante_linea_respaldo r
        where r.journal_entry_id = v_entry
      );

    delete from public.journal_lines
    where journal_entry_id = v_entry
      and (
        account_code in ('4250', '3105', '4295', '42959501', '42959502')
        or account_code like '4250-%'
        or account_code like '3105-%'
        or account_code like '4295-%'
      );

    if v_nuevo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '4250', coalesce(v_memo, 'Reclasificación de sobrantes'), v_nuevo, 0, v_org, v_nuevo, 0, v_centro
      );
    end if;
    if v_saldo > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, '3105', coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_saldo, v_org, 0, v_saldo, v_centro
      );
    end if;
    if v_diversos > 0 then
      insert into public.journal_lines (
        journal_entry_id, account_code, description, debit, credit,
        organization_id, debit_base, credit_base, cost_center_id
      ) values (
        v_entry, public.fn_cuenta_auxiliar_de_titulo(v_org, null, '4295'), coalesce(v_memo, 'Reclasificación de sobrantes'), 0, v_diversos, v_org, 0, v_diversos, v_centro
      );
    end if;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_d, v_c
    from public.journal_lines
    where journal_entry_id = v_entry;
    if v_d <> v_c then
      raise exception 'sobrante_descuadre org % debito % credito %', v_org, v_d, v_c;
    end if;

    insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
    values
      (v_org, 'reclas_4250', v_nuevo, jsonb_build_object('asiento', v_entry, 'saldo', v_saldo, 'diversos', v_diversos, 'compra', v_residual), 'historico');
  end loop;

  insert into public.sobrante_linea_respaldo (
    journal_entry_id, line_id, account_code, description, debit, credit,
    debit_base, credit_base, organization_id, cost_center_id
  )
  select jl.journal_entry_id, jl.id, jl.account_code, jl.description, jl.debit, jl.credit,
         jl.debit_base, jl.credit_base, jl.organization_id, jl.cost_center_id
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and je.organization_id <> 149
    and jl.account_code like '1405%'
    and jl.debit > 0
    and not exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
    );

  update public.journal_lines jl
     set account_code = aux.cuenta
    from public.journal_entries je
    join lateral (
      select public.fn_inventario_auxiliar_1435(je.organization_id, je.branch_id) as cuenta
    ) aux on true
   where jl.journal_entry_id = je.id
     and je.posted is false
     and je.fact_key like 'carga_inicial_borrador:%'
     and je.organization_id <> 149
     and jl.debit > 0
     and jl.account_code like '1405%'
     and aux.cuenta like '1435%';

  insert into public.sobrante_aviso (organization_id, clase, monto, detalle, origen)
  select je.organization_id, 'carga_1435', round(sum(jl.debit), 0),
         jsonb_build_object('asiento', je.id, 'cuenta', min(jl.account_code)),
         'historico'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.posted is false
    and je.fact_key like 'carga_inicial_borrador:%'
    and jl.debit > 0
    and jl.account_code like '1435%'
    and exists (
      select 1 from public.sobrante_linea_respaldo r
      where r.journal_entry_id = je.id
        and r.account_code like '1405%'
    )
  group by je.organization_id, je.id;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.posted is false
      and je.fact_key like 'carga_inicial_borrador:%'
      and jl.debit > 0
      and jl.account_code like '1405%'
  ) then
    raise exception 'carga_inicial_sigue_en_1405';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.fact_key like 'correccion_reversion:%'
      and je.organization_id in (select distinct organization_id from pg_temp._sob_doble)
      and (
        je.posted is true
        or jl.account_code like '4250%'
        or jl.account_code like '4295%'
        or je.organization_id = 149
      )
  ) then
    raise exception 'sobrante_reversion_invalida';
  end if;

  if exists (
    select 1
    from public.journal_entries je
    where je.posted is false
      and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%' or je.fact_key like 'carga_inicial_borrador:%')
      and je.organization_id <> 149
      and (
        select coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
        from public.journal_lines jl
        where jl.journal_entry_id = je.id
      ) <> 0
  ) then
    raise exception 'sobrante_borrador_descuadrado';
  end if;

  return v_n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cuenta_retencion_compra(p_organization_id integer, p_tax_code text, p_concept text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cuenta text;
  v_codigo text := upper(coalesce(btrim(p_tax_code), ''));
  v_concepto text := upper(coalesce(btrim(p_concept), ''));
begin
  if v_codigo <> '' or v_concepto <> '' then
    select m.account_code into v_cuenta
    from tax_account_mapping m
    left join tax_templates tt on tt.id = m.tax_template_id
    left join organization_taxes ot on ot.id = m.organization_tax_id and ot.organization_id = p_organization_id
    left join tax_templates tt2 on tt2.id = ot.template_id
    where m.organization_id = p_organization_id
      and m.is_active
      and ((v_codigo <> '' and v_codigo in (upper(tt.code), upper(tt2.code)))
           or (v_concepto <> '' and upper(btrim(ot.name)) = v_concepto))
      and exists (select 1 from chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = m.account_code)
    order by coalesce(v_concepto <> '' and upper(btrim(ot.name)) = v_concepto, false) desc,
             (m.organization_tax_id is not null) desc,
             m.created_at, m.id
    limit 1;

    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  return case public.fn_clase_retencion(p_tax_code, p_concept)
    when 'reteica' then '2368'
    when 'reteiva' then '2367'
    else '2365'
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sembrar_configuracion_contable(p_org integer)
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
  -- Restaurantes (type_id 1, contador 25-oct-2026): 249505/24950501 INC y 414015/41401501 alimentos.
  if v_tipo = 1 then
    perform public.fn_restaurantes_asegurar_cuentas(p_org, null);
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
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' when v_tipo = 1 then '41401501' end
            when 'impuesto_consumo' then case when v_tipo = 1 then '24950501' end
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
            when 'ventas_productos' then case when v_tipo = 2 then '41400501' when v_tipo = 1 then '41401501' end
            when 'impuesto_consumo' then case when v_tipo = 1 then '24950501' end
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_asegurar_cuentas_comision_ota(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '2335'
  ) then
    v_parent := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '23'
    ) then
      v_parent := '23';
    end if;
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description, naturaleza, requiere_tercero
    ) values (
      p_organization_id, '2335', 'Costos y gastos por pagar', 'liability', v_parent, true,
      'Obligaciones por costos y gastos, entre ellas la comisión por pagar a los canales de venta',
      'credito', true
    )
    on conflict (organization_id, account_code) do nothing;
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '5235'
  ) then
    v_parent := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '52'
    ) then
      v_parent := '52';
    end if;
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description,
      naturaleza, requiere_centro_costo
    ) values (
      p_organization_id, '5235', 'Comisiones', 'expense', v_parent, true,
      'Gasto por comisiones, entre ellas las de los canales de venta',
      'debito', true
    )
    on conflict (organization_id, account_code) do nothing;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_asegurar_cuentas_retencion(p_organization_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent text;
begin
  if exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2365')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2367')
     and exists (select 1 from public.chart_of_accounts where organization_id = p_organization_id and account_code = '2368') then
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = '23'
  ) then
    v_parent := '23';
  end if;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active, description, naturaleza, requiere_tercero
  ) values
    (p_organization_id, '2365', 'Retención en la fuente', 'liability', v_parent, true,
     'Retenciones en la fuente practicadas a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2367', 'Impuesto a las ventas retenido', 'liability', v_parent, true,
     'ReteIVA practicado a proveedores, por pagar', 'credito', true),
    (p_organization_id, '2368', 'Impuesto de industria y comercio retenido', 'liability', v_parent, true,
     'ReteICA practicado a proveedores, por pagar', 'credito', true)
  on conflict (organization_id, account_code) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_journal_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_branch_id integer;
    v_event_type text;
    v_memo text;
    v_source_id text;
    v_credit text;
    v_je RECORD;
    v_vinculo text;
    v_debit text;
    v_tax text;
    v_ret numeric := 0;
    v_amount numeric;
    v_cand RECORD;
BEGIN
    IF NEW.status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Cancelar (rechazo, clawback, anulación de la venta): contra-asiento de lo
    -- contabilizado. Nunca se borra ni se edita un asiento.
    IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled'
       AND OLD.status IN ('accrued', 'paid') THEN
        FOR v_je IN
            SELECT je.id
              FROM journal_entries je
             WHERE je.organization_id = NEW.organization_id
               AND je.source = 'commissions'
               AND je.source_id IN (NEW.id::text || ':accrued', NEW.id::text || ':paid')
               AND COALESCE(je.posted, false)
               AND NOT EXISTS (SELECT 1 FROM journal_entries r
                                WHERE r.organization_id = je.organization_id
                                  AND r.fact_key = 'reversal:' || je.id)
             ORDER BY je.id
        LOOP
            PERFORM fn_revertir_asiento_en_fecha(
                v_je.id, 'anulacion_comision', 'comision:' || NEW.id::text, now(), auth.uid());
        END LOOP;
        RETURN NEW;
    END IF;

    IF NEW.status = 'accrued' AND (OLD.status IS DISTINCT FROM NEW.status OR TG_OP = 'INSERT') THEN
        v_event_type := 'accrued';
    ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event_type := 'paid';
    ELSE
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.commission_amount, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- Bug org 113 (jul-2026): las comisiones NO salen de facturas de compra. No se contabilizan; quedan en la cola.
    IF NEW.source_type = 'invoice_purchase' THEN
        PERFORM fn_log_journal_failure(NEW.organization_id, NULL, now(), TG_TABLE_NAME, NEW.id::text, NULL, NULL, NULL,
            NEW.commission_amount, 'comision_factura_compra', 'Las comisiones no se generan desde facturas de compra');
        RETURN NEW;
    END IF;

    IF v_event_type = 'paid' AND NEW.metadata ? 'payroll_slip_id' THEN
        RETURN NEW;
    END IF;

    v_vinculo := fn_comision_vinculo(NEW.organization_id, NEW.payee_type, NEW.payee_id);
    v_rule := NULL;
    FOR v_cand IN
        SELECT * FROM accounting_rules
         WHERE organization_id = NEW.organization_id
           AND source_type = 'commission'
           AND event_type = v_event_type
           AND is_active = true
           AND (conditions->>'vinculo' IS NULL OR conditions->>'vinculo' = v_vinculo)
         ORDER BY (conditions->>'vinculo' = v_vinculo) DESC NULLS LAST, priority
    LOOP
        v_debit := fn_comision_cuenta(NEW.organization_id, v_cand.debit_account_code);
        v_credit := fn_comision_cuenta(NEW.organization_id, v_cand.credit_account_code);
        IF v_debit IS NOT NULL AND v_credit IS NOT NULL THEN
            v_rule := v_cand;
            EXIT;
        END IF;
    END LOOP;

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
    END IF;

    -- La sucursal del asiento tiene que ser de la MISMA organizacion que la
    -- comision. Antes se copiaba NEW.branch_id sin comprobarlo.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_auto_journal_commission: la comision % apunta a la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- journal_entries.branch_id es NOT NULL: sin sucursal no hay asiento, pero
    -- tampoco se inventa una. Se deja registrado igual que el caso 'no_rule'.
    IF v_branch_id IS NULL THEN
        PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_branch', 'La organizacion no tiene ninguna sucursal propia y journal_entries.branch_id es NOT NULL');
        RETURN NEW;
    END IF;

    v_memo := CASE NEW.commission_type
        WHEN 'salesperson' THEN 'Comisión Vendedor - ' || COALESCE(NEW.payee_name, NEW.payee_id::text, 'N/A')
        WHEN 'intermediation_sale' THEN 'Comisión Intermediación Venta - ' || COALESCE(NEW.payee_name, NEW.source_id)
        WHEN 'intermediation_purchase' THEN 'Comisión Intermediación Compra - ' || COALESCE(NEW.payee_name, NEW.source_id)
        ELSE 'Comisión - ' || COALESCE(NEW.payee_name, 'N/A')
    END;

    -- El pago sale de la cuenta de dinero elegida (misma resolución que payments);
    -- sin elección, la cuenta de la regla, como antes.
    -- Retención (externo): tarifa% sobre el monto si alcanza el umbral, solo si la cuenta existe.
    IF v_rule.conditions ? 'retencion_tarifa' AND v_rule.tax_account_code IS NOT NULL THEN
        v_tax := fn_comision_cuenta(NEW.organization_id, v_rule.tax_account_code);
        IF v_tax IS NOT NULL AND NEW.commission_amount >= COALESCE((v_rule.conditions->>'retencion_umbral')::numeric, 0) THEN
            v_ret := round(NEW.commission_amount * (v_rule.conditions->>'retencion_tarifa')::numeric / 100.0, 2);
        END IF;
    END IF;

    -- El pago debita el pasivo que acreditó la causación de ESTA comisión (aunque se haya causado con la regla
    -- vieja 2370) y, si hubo retención en la causación, paga el neto.
    v_amount := NEW.commission_amount;
    IF v_event_type = 'paid' THEN
        SELECT l.account_code INTO v_debit
          FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id
         WHERE je.organization_id = NEW.organization_id AND je.source = 'commissions'
           AND je.source_id = NEW.id::text || ':accrued' AND l.credit > 0
         ORDER BY je.id LIMIT 1;
        v_debit := COALESCE(v_debit, fn_comision_cuenta(NEW.organization_id, v_rule.debit_account_code));
        v_amount := NEW.commission_amount - COALESCE((
            SELECT sum(l.credit) FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id
             WHERE je.organization_id = NEW.organization_id AND je.source = 'commissions'
               AND je.source_id = NEW.id::text || ':accrued:retencion' AND l.credit > 0), 0);
        v_ret := 0;
    END IF;

    IF v_event_type = 'paid'
       AND (COALESCE(NEW.metadata->>'bank_account_id', '') <> '' OR COALESCE(NEW.metadata->>'payment_method', '') <> '') THEN
        v_credit := COALESCE(
            fn_money_account_code_pago(
                NEW.organization_id, v_branch_id,
                NULLIF(NEW.metadata->>'payment_method', ''),
                CASE WHEN COALESCE(NEW.metadata->>'bank_account_id', '') ~ '^[0-9]+$'
                     THEN (NEW.metadata->>'bank_account_id')::integer END),
            v_credit);
    END IF;

    v_source_id := NEW.id::text || ':' || v_event_type;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := v_branch_id,
        p_entry_date := CASE v_event_type
            WHEN 'accrued' THEN COALESCE(NEW.accrued_at, NEW.created_at, now())
            WHEN 'paid' THEN COALESCE(NEW.paid_at, NEW.updated_at, now())
        END,
        p_memo := v_memo,
        p_source := 'commissions',
        p_source_id := v_source_id,
        p_debit_account := v_debit,
        p_credit_account := v_credit,
        p_amount := v_amount
    );

    IF v_ret > 0 AND v_entry_id IS NOT NULL THEN
        PERFORM fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := v_branch_id,
            p_entry_date := COALESCE(NEW.accrued_at, NEW.created_at, now()),
            p_memo := 'Retención en la fuente - ' || v_memo,
            p_source := 'commissions',
            p_source_id := v_source_id || ':retencion',
            p_debit_account := v_credit,
            p_credit_account := v_tax,
            p_amount := v_ret
        );
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_comision_cuenta(p_org integer, p_cuenta text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.account_code from public.chart_of_accounts c
   where c.organization_id = p_org and c.es_movimiento is not false
     and c.account_code in (p_cuenta, left(p_cuenta, 4))
   order by (c.account_code = p_cuenta) desc
   limit 1
$function$
;

drop function if exists public.fn_comision_retencion(integer, uuid, uuid, numeric, timestamptz, numeric);
drop function if exists public.fn_retencion_art383(numeric, numeric);
drop view if exists public.v_comision_retencion_acumulado;
drop function if exists public.fn_comision_datos_tributarios(integer, uuid, timestamptz);
drop function if exists public.fn_uvt(integer, text);
drop table if exists public.comision_tercero_tributario;
alter table public.vendor_commission_rates drop constraint if exists vendor_commission_rates_tipo_persona_check;
alter table public.vendor_commission_rates drop constraint if exists vendor_commission_rates_retencion_tarifa_check;
alter table public.vendor_commission_rates drop column if exists tipo_persona;
alter table public.vendor_commission_rates drop column if exists retencion_tarifa;
alter table public.vendor_commission_rates drop column if exists aplica_art383;
-- QA ROJO MEDIO 3: auxiliares de ventas del sector sin uso.
delete from public.chart_of_accounts a
 where a.description = 'Auxiliar de ventas del sector (QA 25-oct-2026)' and length(a.account_code) = 8
   and not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where e.organization_id = a.organization_id and l.account_code = a.account_code)
   and not exists (select 1 from public.accounting_rules r where r.organization_id = a.organization_id
                    and a.account_code in (r.debit_account_code, r.credit_account_code));
delete from public.chart_of_accounts a
 where a.description = 'Auxiliar de ventas del sector (QA 25-oct-2026)' and length(a.account_code) = 6
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = a.organization_id
                    and h.parent_code = a.account_code);
delete from public.chart_of_accounts a
 where a.description = 'Auxiliar de ventas del sector (QA 25-oct-2026)' and length(a.account_code) = 4
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = a.organization_id
                    and h.parent_code = a.account_code)
   and not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where e.organization_id = a.organization_id and l.account_code = a.account_code);
delete from public.chart_of_accounts a
 where a.description = 'Auxiliar de ventas del sector (QA 25-oct-2026)' and length(a.account_code) = 2
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = a.organization_id
                    and h.parent_code = a.account_code)
   and not exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                    where e.organization_id = a.organization_id and l.account_code = a.account_code);
drop function if exists public.fn_asegurar_cuenta_venta_sector(integer, integer);
delete from supabase_migrations.schema_migrations where version = '20261025134130';
