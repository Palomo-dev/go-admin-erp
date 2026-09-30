-- Asiento de compra con retenciones (FACTURAS-COMPRA-CXP-PLAN, decisión D4 fase 2).
--
-- Hasta hoy el devengo de la factura de compra (fn_auto_journal_purchase,
-- ADR-CC-006/009) acreditaba al proveedor el TOTAL, aunque la cuenta por pagar
-- y el pago usan el NETO (fn_invoice_purchase_neto = total − retenciones). Con
-- una sola retención, el pago deja un saldo fantasma en la cuenta del proveedor
-- y el pasivo con la DIAN no aparece en ninguna cuenta.
--
-- Ahora, cuando la factura tiene retenciones:
--   D 1405 Inventarios (base)          C 2365 / 2367 / 2368 (una línea por retención)
--   D 24xx IVA descontable             C 2105 Proveedores (neto a pagar)
--
-- · fn_asegurar_cuentas_retencion(org): 2365 «Retención en la fuente», 2367
--   «Impuesto a las ventas retenido», 2368 «Impuesto de industria y comercio
--   retenido». Mismo criterio de padre que 2805 (21, o el de la cuenta por pagar).
--   Al aplicar: 2365 existía en 1 organización de 89; 2367 y 2368 en ninguna.
-- · Plantilla RETEIVA_15 (Retención de IVA 15 %), que faltaba en el catálogo.
-- · fn_cuenta_retencion_compra(org, tax_code, concept): tax_account_mapping de
--   la plantilla o del impuesto de la organización; si no hay, por clase
--   (IVA → 2367, ICA → 2368, resto → 2365).
-- · fn_asiento_compra_aplicar_retenciones(asiento, factura, cuenta proveedor):
--   completa el asiento recién creado por fn_create_journal_entry (misma
--   transacción) — baja la línea del proveedor al neto y acredita cada
--   retención. Solo toca un asiento creado en esta transacción; los publicados
--   antes siguen inmutables. Verifica que el asiento cuadre.
-- · fn_auto_journal_purchase y fn_retro_journal_purchases la llaman.
-- · La anulación (fn_void_purchase_invoice) espeja todas las líneas del
--   original, así que revierte también las retenciones sin cambios.
--
-- Al aplicar: 0 filas en invoice_purchase_withholdings, así que no hay asientos
-- históricos que corregir.

-- 1. Cuentas de retención en todos los planes.
create or replace function public.fn_asegurar_cuentas_retencion(p_organization_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_parent text;
begin
  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2365')
     and exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2367')
     and exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '2368') then
    return;
  end if;

  if exists (select 1 from chart_of_accounts where organization_id = p_organization_id and account_code = '21') then
    v_parent := '21';
  else
    select parent_code into v_parent
    from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in ('2105', '2101', '2205', '2102')
      and parent_code is not null
    order by account_code
    limit 1;
  end if;

  insert into chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, description)
  values
    (p_organization_id, '2365', 'Retención en la fuente', 'liability', v_parent, true,
     'Retenciones en la fuente practicadas a proveedores, por pagar a la DIAN'),
    (p_organization_id, '2367', 'Impuesto a las ventas retenido', 'liability', v_parent, true,
     'ReteIVA practicado a proveedores, por pagar a la DIAN'),
    (p_organization_id, '2368', 'Impuesto de industria y comercio retenido', 'liability', v_parent, true,
     'ReteICA practicado a proveedores, por pagar al municipio')
  on conflict (organization_id, account_code) do nothing;
end;
$$;

revoke all on function public.fn_asegurar_cuentas_retencion(integer) from public, anon, authenticated;
grant execute on function public.fn_asegurar_cuentas_retencion(integer) to service_role;

create or replace function public.trg_fn_asegurar_cuentas_retencion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform fn_asegurar_cuentas_retencion(NEW.id);
  return NEW;
exception when others then
  -- Nunca bloquear el alta de una organización por estas cuentas.
  raise warning 'No se pudieron crear las cuentas de retención para la organización %: %', NEW.id, SQLERRM;
  return NEW;
end;
$$;

revoke all on function public.trg_fn_asegurar_cuentas_retencion() from public, anon, authenticated;

drop trigger if exists tr_auto_create_chart_of_accounts_zz_retenciones on public.organizations;
create trigger tr_auto_create_chart_of_accounts_zz_retenciones
  after insert on public.organizations
  for each row execute function public.trg_fn_asegurar_cuentas_retencion();

select fn_asegurar_cuentas_retencion(o.id) from organizations o;

-- 2. ReteIVA 15 % en el catálogo de plantillas (la organización la activa en
--    su configuración de impuestos, como las demás retenciones).
insert into public.tax_templates (country, code, name, rate, description, valid_from, kind)
values ('COL', 'RETEIVA_15', 'Retención de IVA 15%', 15,
        'Retención del 15 % sobre el IVA facturado por el proveedor', '2017-01-01T00:00:00+00:00', 'withholding')
on conflict (code) do nothing;

-- 3. Cuenta de cada retención.
create or replace function public.fn_cuenta_retencion_compra(p_organization_id integer, p_tax_code text, p_concept text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cuenta text;
  v_codigo text := upper(coalesce(btrim(p_tax_code), ''));
  v_concepto text := upper(coalesce(btrim(p_concept), ''));
  v_iva constant text := '(^|[^A-Z])(RETE)?IVA([^A-Z]|$)|RETEIVA';
  v_ica constant text := '(^|[^A-Z])(RETE)?ICA([^A-Z]|$)|RETEICA|INDUSTRIA Y COMERCIO';
begin
  if v_codigo <> '' then
    select m.account_code into v_cuenta
    from tax_account_mapping m
    left join tax_templates tt on tt.id = m.tax_template_id
    left join organization_taxes ot on ot.id = m.organization_tax_id and ot.organization_id = p_organization_id
    left join tax_templates tt2 on tt2.id = ot.template_id
    where m.organization_id = p_organization_id
      and m.is_active
      and v_codigo in (upper(tt.code), upper(tt2.code))
      and exists (select 1 from chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = m.account_code)
    order by (m.organization_tax_id is not null) desc
    limit 1;

    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  -- El código manda sobre el concepto: «ReteICA sobre base sin IVA» es ICA.
  if v_codigo ~ v_iva then return '2367'; end if;
  if v_codigo ~ v_ica then return '2368'; end if;
  if v_concepto ~ v_iva then return '2367'; end if;
  if v_concepto ~ v_ica then return '2368'; end if;
  return '2365';
end;
$$;

revoke all on function public.fn_cuenta_retencion_compra(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_retencion_compra(integer, text, text) to service_role;

-- 4. Completa el devengo con las retenciones.
create or replace function public.fn_asiento_compra_aplicar_retenciones(
  p_entry_id integer, p_invoice_id uuid, p_credit_account text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_inv record;
  v_ret numeric;
  v_linea integer;
  v_memo text;
  v_prev text;
  v_w record;
  v_descuadre numeric;
begin
  if p_entry_id is null then
    return;
  end if;

  select id, organization_id, branch_id, issue_date, total into v_inv
  from invoice_purchase where id = p_invoice_id;

  select coalesce(sum(w.amount), 0) into v_ret
  from invoice_purchase_withholdings w
  where w.invoice_id = p_invoice_id and w.amount > 0;

  if v_inv.id is null or v_ret <= 0 then
    return;
  end if;

  -- Solo el asiento que fn_create_journal_entry acaba de crear en esta
  -- transacción, con el crédito al proveedor todavía por el total. Un asiento
  -- publicado antes no se toca (se corrige con contra-asiento).
  select jl.id, e.memo into v_linea, v_memo
  from journal_entries e
  join journal_lines jl on jl.journal_entry_id = e.id
  where e.id = p_entry_id
    and e.organization_id = v_inv.organization_id
    and e.source = 'invoice_purchase'
    and e.source_id = p_invoice_id::text
    and e.created_at = now()
    and jl.account_code = p_credit_account
    and jl.debit = 0
    and jl.credit = v_inv.total
  order by jl.id
  limit 1;

  if v_linea is null then
    return;
  end if;

  if v_ret >= v_inv.total then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id, null, p_credit_account, v_ret,
      'withholding_exceeds_total', 'Las retenciones igualan o superan el total de la factura; el asiento queda por el total');
    return;
  end if;

  perform fn_asegurar_cuentas_retencion(v_inv.organization_id);

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  update journal_lines
     set credit = v_inv.total - v_ret, updated_at = now()
   where id = v_linea;
  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (p_entry_id, v_w.cuenta, v_w.concept || ' - ' || v_memo, 0, v_w.amount);
  end loop;

  select round(coalesce(sum(debit), 0) - coalesce(sum(credit), 0), 2) into v_descuadre
  from journal_lines where journal_entry_id = p_entry_id;
  if v_descuadre <> 0 then
    raise exception 'ASIENTO_DESCUADRADO: el asiento % de la compra % queda descuadrado en %', p_entry_id, p_invoice_id, v_descuadre
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) to service_role;

-- 5. Devengo de la factura: mismo cuerpo que antes, más las retenciones.
create or replace function public.fn_auto_journal_purchase()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_fact_key text;
BEGIN
    IF NEW.status IS DISTINCT FROM 'received' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:purchase:' || NEW.id::text;

    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE organization_id = NEW.organization_id
          AND source = 'invoice_purchase'
          AND source_id = NEW.id::text
          AND memo LIKE 'Compra %'
    ) THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule FROM fn_regla_devengo_compra(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_purchase', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de compra');
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Compra ' || COALESCE(NEW.number_ext, NEW.id::text),
        p_source := 'invoice_purchase',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := false,
        p_fact_key := v_fact_key
    );

    PERFORM fn_asiento_compra_aplicar_retenciones(v_entry_id, NEW.id, v_rule.credit_account_code);

    RETURN NEW;
END;
$function$;

-- 6. Contabilización retroactiva: mismo cuerpo, más las retenciones.
create or replace function public.fn_retro_journal_purchases()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_purchase RECORD;
    v_rule RECORD;
    v_entry_id integer;
    v_count integer := 0;
BEGIN
    FOR v_purchase IN
        SELECT inv.id, inv.organization_id, inv.branch_id, inv.number_ext,
               inv.issue_date, inv.subtotal, inv.tax_total, inv.total,
               inv.created_at
        FROM invoice_purchase inv
        WHERE inv.status IN ('received', 'partial', 'paid')
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source = 'invoice_purchase'
              AND je.source_id = inv.id::text
              AND je.organization_id = inv.organization_id
        )
    LOOP
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_purchase.organization_id
          AND source_type = 'purchase'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            CONTINUE;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := v_purchase.organization_id,
            p_branch_id := v_purchase.branch_id,
            p_entry_date := COALESCE(v_purchase.issue_date, v_purchase.created_at),
            p_memo := 'Compra ' || COALESCE(v_purchase.number_ext, v_purchase.id::text),
            p_source := 'invoice_purchase',
            p_source_id := v_purchase.id::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := v_purchase.total,
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN v_purchase.tax_total ELSE 0 END
        );

        PERFORM fn_asiento_compra_aplicar_retenciones(v_entry_id, v_purchase.id, v_rule.credit_account_code);

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Facturas de compra contabilizadas: %', v_count;
END;
$function$;
